<template>
  <a-drawer
    v-model:open="open"
    title="生成历史"
    placement="right"
    :width="640"
    destroy-on-close
  >
    <a-spin :spinning="loading">
      <a-empty v-if="!history.length && !loading" description="暂无生成历史" />
      <a-timeline v-else class="history-timeline">
        <a-timeline-item
          v-for="item in history"
          :key="item.jobId"
          :color="statusColor(item.status)"
        >
          <div class="history-item">
            <div class="history-item-header">
              <a-tag v-if="item.versionCode" color="blue">
                {{ item.versionCode }}
              </a-tag>
              <a-tag :color="statusColor(item.status)">
                {{ statusLabel(item.status) }}
              </a-tag>
              <span class="history-item-count" v-if="item.resultCount != null">
                {{ item.resultCount }} 条案例
              </span>
            </div>
            <div class="history-item-prompts">
              <span class="history-item-label">场景：</span>
              <span>成功 {{ item.scenarioSummary.completed }}</span>
              <span>不适用 {{ item.scenarioSummary.notApplicable }}</span>
              <span>失败 {{ item.scenarioSummary.failed }}</span>
            </div>
            <div class="history-item-meta">
              <span>{{ formatTime(item.queuedAt) }}</span>
              <span v-if="item.createdBy" class="history-item-user">
                · {{ item.createdBy }}
              </span>
            </div>
            <div v-if="item.errorMessage" class="history-item-error">
              {{ item.errorMessage }}
            </div>
            <div class="history-item-actions">
              <a-button type="link" size="small" @click="toggleDetail(item.jobId)">
                {{ expandedJobId === item.jobId ? '收起详情' : '场景详情' }}
              </a-button>
              <a-button
                v-if="!['queued', 'running'].includes(item.status)"
                type="link"
                danger
                size="small"
                @click="confirmDelete(item)"
              >
                删除版本
              </a-button>
            </div>
            <a-spin v-if="expandedJobId === item.jobId" :spinning="detailLoading" size="small">
              <div class="scenario-list">
                <div v-for="scenario in versionDetail?.scenarios ?? []" :key="scenario.id" class="scenario-row">
                  <div class="scenario-main">
                    <span>{{ scenario.scenarioName }}</span>
                    <a-tag :color="scenarioColor(scenario.status)">{{ scenarioLabel(scenario.status) }}</a-tag>
                    <span v-if="scenario.resultCount" class="scenario-count">{{ scenario.resultCount }} 条</span>
                  </div>
                  <div v-if="scenario.applicableReason" class="scenario-reason">{{ scenario.applicableReason }}</div>
                  <div v-if="scenario.errorMessage" class="scenario-error">{{ scenario.errorMessage }}</div>
                  <a-button
                    v-if="scenario.status === 'failed'"
                    type="link"
                    size="small"
                    :loading="retryingScenarioId === scenario.id"
                    @click="retryScenario(item.jobId, scenario.id)"
                  >
                    重试
                  </a-button>
                </div>
              </div>
            </a-spin>
          </div>
        </a-timeline-item>
      </a-timeline>
    </a-spin>
  </a-drawer>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount, computed } from 'vue';
import { Modal, message } from 'ant-design-vue';
import { useApiTestStore } from '@/stores/apiTest';
import {
  deleteApiCaseGenerateVersion,
  getApiCaseGenerateVersion,
  retryApiCaseGenerateScenario,
  type ApiCaseGenerateHistoryItem,
  type ApiCaseGenerateVersionDetail,
} from '@/api/apiTestClient';

const props = defineProps<{
  projectId: string;
  transactionId: string;
}>();

const open = defineModel<boolean>('open', { default: false });

const apiStore = useApiTestStore();
const loading = ref(false);
const history = ref<ApiCaseGenerateHistoryItem[]>([]);
const expandedJobId = ref('');
const detailLoading = ref(false);
const retryingScenarioId = ref('');
const versionDetail = ref<ApiCaseGenerateVersionDetail | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const hasActiveJob = computed(() =>
  history.value.some((h) => h.status === 'queued' || h.status === 'running'),
);

async function loadHistory(silent = false) {
  if (!silent) loading.value = true;
  try {
    history.value = await apiStore.fetchGenerateHistory(
      props.projectId,
      props.transactionId,
    );
  } finally {
    if (!silent) loading.value = false;
  }
}

async function toggleDetail(jobId: string) {
  if (expandedJobId.value === jobId) {
    expandedJobId.value = '';
    versionDetail.value = null;
    return;
  }
  expandedJobId.value = jobId;
  detailLoading.value = true;
  try {
    versionDetail.value = await getApiCaseGenerateVersion(props.projectId, props.transactionId, jobId);
  } finally {
    detailLoading.value = false;
  }
}

async function retryScenario(jobId: string, scenarioId: string) {
  retryingScenarioId.value = scenarioId;
  try {
    versionDetail.value = await retryApiCaseGenerateScenario(
      props.projectId, props.transactionId, jobId, scenarioId,
    );
    message.success('场景已重新排队');
    await loadHistory(true);
    startPoll();
  } catch {
    message.error('场景重试失败');
  } finally {
    retryingScenarioId.value = '';
  }
}

function confirmDelete(item: ApiCaseGenerateHistoryItem) {
  Modal.confirm({
    title: `删除版本 ${item.versionCode ?? ''}？`,
    content: '版本已被执行集引用或已有执行记录时不能删除。',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      await deleteApiCaseGenerateVersion(props.projectId, props.transactionId, item.jobId);
      if (expandedJobId.value === item.jobId) {
        expandedJobId.value = '';
        versionDetail.value = null;
      }
      await loadHistory();
      message.success('版本已删除');
    },
  });
}

function startPoll() {
  stopPoll();
  pollTimer = setInterval(async () => {
    await loadHistory(true);
  }, 5000);
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

const isGenerating = computed(() =>
  apiStore.generatingCaseTransactionIds.includes(props.transactionId),
);

watch(open, async (val) => {
  if (!val) {
    stopPoll();
    return;
  }
  await loadHistory();
  if (hasActiveJob.value || isGenerating.value) {
    startPoll();
  }
});

watch(isGenerating, (val) => {
  if (val && open.value) {
    startPoll();
  }
});

watch(hasActiveJob, (val) => {
  if (!val && !isGenerating.value) {
    stopPoll();
  }
});

onBeforeUnmount(() => stopPoll());

function statusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'green';
    case 'failed':
      return 'red';
    case 'partial':
      return 'orange';
    case 'cancelled':
      return 'default';
    case 'running':
      return 'processing';
    case 'queued':
      return 'orange';
    default:
      return 'default';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return '完成';
    case 'failed':
      return '失败';
    case 'partial':
      return '部分完成';
    case 'cancelled':
      return '已取消';
    case 'running':
      return '生成中';
    case 'queued':
      return '排队中';
    default:
      return status;
  }
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function scenarioColor(status: string) {
  if (status === 'completed') return 'green';
  if (status === 'failed') return 'red';
  if (status === 'not_applicable') return 'default';
  return 'processing';
}

function scenarioLabel(status: string) {
  return ({ completed: '成功', failed: '失败', not_applicable: '不适用', pending: '等待中', running: '生成中', retrying: '重试中' } as Record<string, string>)[status] ?? status;
}
</script>

<style scoped>
.history-timeline {
  padding-top: 8px;
}
.history-item {
  margin-bottom: 4px;
}
.history-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.history-item-count {
  color: rgba(0, 0, 0, 0.45);
  font-size: 13px;
}
.history-item-prompts {
  margin-bottom: 4px;
  font-size: 13px;
}
.history-item-label {
  color: rgba(0, 0, 0, 0.45);
}
.history-item-meta {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
}
.history-item-user {
  margin-left: 4px;
}
.history-item-error {
  margin-top: 4px;
  color: #ff4d4f;
  font-size: 12px;
}
.history-item-actions {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
.scenario-list {
  margin-top: 8px;
  overflow: hidden;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}
.scenario-row {
  padding: 9px 10px;
  border-bottom: 1px solid #f2f4f7;
}
.scenario-row:last-child { border-bottom: 0; }
.scenario-main { display: flex; align-items: center; gap: 8px; }
.scenario-count, .scenario-reason { color: #667085; font-size: 12px; }
.scenario-reason, .scenario-error { margin-top: 4px; }
.scenario-error { color: #d92d20; font-size: 12px; }
</style>
