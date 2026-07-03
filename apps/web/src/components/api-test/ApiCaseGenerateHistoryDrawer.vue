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
              <a-tag v-if="item.version != null" color="blue">
                v{{ item.version }}
              </a-tag>
              <a-tag :color="statusColor(item.status)">
                {{ statusLabel(item.status) }}
              </a-tag>
              <span class="history-item-count" v-if="item.resultCount != null">
                {{ item.resultCount }} 条案例
              </span>
            </div>
            <div class="history-item-prompts" v-if="item.promptSummaries.length">
              <span class="history-item-label">场景提示词：</span>
              <a-tag
                v-for="p in item.promptSummaries"
                :key="p.id"
                size="small"
              >
                {{ p.scenarioName ? `${p.scenarioName} / ` : '' }}{{ p.name || p.id }}
              </a-tag>
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
          </div>
        </a-timeline-item>
      </a-timeline>
    </a-spin>
  </a-drawer>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount, computed } from 'vue';
import { useApiTestStore } from '@/stores/apiTest';
import type { ApiCaseGenerateHistoryItem } from '@/api/apiTestClient';

const props = defineProps<{
  projectId: string;
  transactionId: string;
}>();

const open = defineModel<boolean>('open', { default: false });

const apiStore = useApiTestStore();
const loading = ref(false);
const history = ref<ApiCaseGenerateHistoryItem[]>([]);
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
</style>
