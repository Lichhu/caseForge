<script setup lang="ts">
import { computed, markRaw, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Empty, message } from 'ant-design-vue';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  InboxOutlined,
  SendOutlined,
  SyncOutlined,
} from '@ant-design/icons-vue';
import type { RequirementClaimCandidate, RequirementPlatformItem, RequirementStatus } from '@case-forge/shared';
import { REQUIREMENT_STATUS_LABELS } from '@case-forge/shared';
import {
  claimRequirement,
  dispatchRequirement,
  fetchClaimCandidates,
  fetchRequirementList,
  refuseRequirement,
  syncRequirements,
} from '@/api/requirementPlatform';
import { getUserName } from '@/utils/userContext';

const router = useRouter();
const currentUser = getUserName();

const loading = ref(false);
const rows = ref<RequirementPlatformItem[]>([]);
const isDispatcher = ref(false);
const syncing = ref(false);

const statusFilter = ref<'all' | RequirementStatus>('all');
const keyword = ref('');

/** 状态概览卡片元信息（兼作状态筛选器） */
const STAT_META: {
  key: 'all' | RequirementStatus;
  label: string;
  color: string;
  foot: string;
  icon: ReturnType<typeof markRaw>;
}[] = [
  { key: 'all', label: '全部需求', color: '#b60f2d', foot: '数据来源：测管平台', icon: markRaw(InboxOutlined) },
  { key: 'pending_dispatch', label: '待分发', color: '#fa8c16', foot: '等待分发人指派', icon: markRaw(SendOutlined) },
  { key: 'pending_claim', label: '待认领', color: '#1677ff', foot: '等待认领人确认', icon: markRaw(ClockCircleOutlined) },
  { key: 'claimed', label: '已认领', color: '#52c41a', foot: '已自动创建项目', icon: markRaw(CheckCircleOutlined) },
];

const statCards = computed(() => {
  const total = rows.value.length;
  const counts: Record<'all' | RequirementStatus, number> = {
    all: total,
    pending_dispatch: 0,
    pending_claim: 0,
    claimed: 0,
  };
  for (const row of rows.value) counts[row.status] += 1;
  return STAT_META.map((meta) => ({
    ...meta,
    count: counts[meta.key],
    pct: meta.key === 'all' ? (total ? 100 : 0) : total ? Math.round((counts[meta.key] / total) * 100) : 0,
  }));
});

function toggleFilter(key: 'all' | RequirementStatus) {
  if (key === 'all') {
    statusFilter.value = 'all';
    return;
  }
  statusFilter.value = statusFilter.value === key ? 'all' : key;
}

const hasActiveFilter = computed(
  () => statusFilter.value !== 'all' || keyword.value.trim() !== '',
);

function clearFilters() {
  statusFilter.value = 'all';
  keyword.value = '';
}

const filteredRows = computed(() => {
  const input = keyword.value.trim().toLowerCase();
  return rows.value.filter((row) => {
    if (statusFilter.value !== 'all' && row.status !== statusFilter.value) {
      return false;
    }
    if (!input) return true;
    return (
      row.projectCode.toLowerCase().includes(input) ||
      row.projectName.toLowerCase().includes(input)
    );
  });
});

const columns = [
  { title: '需求编号', dataIndex: 'projectCode', key: 'projectCode', width: 170 },
  { title: '需求名', dataIndex: 'projectName', key: 'projectName', ellipsis: true },
  { title: '需求状态', dataIndex: 'status', key: 'status', width: 96 },
  { title: '分发信息', key: 'dispatch', width: 230 },
  { title: '认领信息', key: 'claim', width: 230 },
  { title: '操作', key: 'action', width: 150 },
];

const STATUS_COLORS: Record<RequirementStatus, string> = {
  pending_dispatch: 'orange',
  pending_claim: 'blue',
  claimed: 'green',
};

function statusColor(status: RequirementStatus) {
  return STATUS_COLORS[status];
}

function formatTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function personLabel(name?: string | null, account?: string | null) {
  if (!account) return '';
  return name ? `${name}（${account}）` : account;
}

function canDispatch(row: RequirementPlatformItem) {
  return isDispatcher.value && row.status !== 'claimed';
}

function canActClaim(row: RequirementPlatformItem) {
  return row.status === 'pending_claim' && row.dispatchedTo === currentUser;
}

/** 空态流程引导 */
const flowSteps = [
  { title: '同步需求', desc: '分发人从测管平台拉取「SIT 测试中」的需求' },
  { title: '分发到人', desc: '分发人将需求指派给测试认领人' },
  { title: '认领启动', desc: '认领人确认后自动创建接口测试项目' },
];

async function loadList() {
  loading.value = true;
  try {
    const result = await fetchRequirementList();
    rows.value = result.rows;
    isDispatcher.value = result.isDispatcher;
    syncing.value = result.syncing;
  } catch (error) {
    message.error(error instanceof Error ? error.message : '加载需求列表失败');
  } finally {
    loading.value = false;
  }
}

async function handleSync() {
  syncing.value = true;
  try {
    const result = await syncRequirements();
    message.success(
      `同步完成：候选 ${result.candidates} 条，新增 ${result.added} 条，跳过 ${result.skipped} 条`,
    );
    await loadList();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '同步失败');
  } finally {
    syncing.value = false;
  }
}

// ---------------- 分发 ----------------
const dispatchVisible = ref(false);
const dispatchSubmitting = ref(false);
const dispatchTarget = ref<string>();
const candidates = ref<RequirementClaimCandidate[]>([]);
const candidatesLoading = ref(false);
const activeRecord = ref<RequirementPlatformItem | null>(null);

/** 每次打开分发弹窗都刷新，保证候选人随 sys_user 人员变动即时生效；失败时保留旧列表兜底 */
async function loadCandidates() {
  candidatesLoading.value = true;
  try {
    candidates.value = await fetchClaimCandidates();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '加载认领候选人失败');
  } finally {
    candidatesLoading.value = false;
  }
}

async function openDispatch(row: RequirementPlatformItem) {
  activeRecord.value = row;
  dispatchTarget.value = row.dispatchedTo ?? undefined;
  dispatchVisible.value = true;
  await loadCandidates();
}

function candidateFilter(input: string, option: { label?: string }) {
  return (option.label ?? '').toLowerCase().includes(input.toLowerCase());
}

async function confirmDispatch() {
  const record = activeRecord.value;
  if (!record) return;
  if (!dispatchTarget.value) {
    message.warning('请选择认领人');
    return;
  }
  dispatchSubmitting.value = true;
  try {
    await dispatchRequirement(record.id, dispatchTarget.value);
    message.success('分发成功，需求进入待认领');
    dispatchVisible.value = false;
    await loadList();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '分发失败');
  } finally {
    dispatchSubmitting.value = false;
  }
}

// ---------------- 认领 / 拒绝 ----------------
const claimSubmittingId = ref('');

async function handleClaim(row: RequirementPlatformItem) {
  claimSubmittingId.value = row.id;
  try {
    await claimRequirement(row.id);
    message.success('认领成功，已自动创建接口测试项目');
    await loadList();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '认领失败');
  } finally {
    claimSubmittingId.value = '';
  }
}

const refuseVisible = ref(false);
const refuseSubmitting = ref(false);
const refuseReason = ref('');

function openRefuse(row: RequirementPlatformItem) {
  activeRecord.value = row;
  refuseReason.value = '';
  refuseVisible.value = true;
}

async function confirmRefuse() {
  const record = activeRecord.value;
  if (!record) return;
  refuseSubmitting.value = true;
  try {
    await refuseRequirement(record.id, refuseReason.value.trim() || undefined);
    message.success('已拒绝认领，需求回到待分发');
    refuseVisible.value = false;
    await loadList();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '操作失败');
  } finally {
    refuseSubmitting.value = false;
  }
}

/** 管理模块下拉：案例管理待后续开发 */
const moduleOptions = [
  { value: 'requirement', label: '需求管理' },
  { value: 'project', label: '项目管理' },
  { value: 'case', label: '案例管理（待开发）', disabled: true },
];

function handleModuleChange(value: string) {
  if (value === 'project') {
    router.push({ path: '/api-test' });
  }
  // 需求管理即当前页，无需跳转
}

onMounted(() => {
  void loadList();
});
</script>

<template>
  <main class="app-frame app-frame--nested">
    <section class="requirement-workspace">
      <header class="topbar">
        <div>
          <a-select
            class="module-select"
            value="requirement"
            :bordered="false"
            :options="moduleOptions"
            aria-label="管理模块"
            @change="handleModuleChange"
          />
          <p>接口测试需求分发与认领 · 数据来源：测管平台（SIT 测试中）+ 服管校验</p>
        </div>
        <div v-if="isDispatcher" class="topbar-actions action-toolbar action-toolbar--compact">
          <a-button type="primary" :loading="syncing" @click="handleSync">
            <template #icon><SyncOutlined /></template>
            {{ syncing ? '同步中…' : '同步需求' }}
          </a-button>
        </div>
      </header>

      <div class="requirement-stats">
        <button
          v-for="card in statCards"
          :key="card.key"
          type="button"
          class="stat-card"
          :class="{ active: statusFilter === card.key }"
          :aria-pressed="statusFilter === card.key"
          @click="toggleFilter(card.key)"
        >
          <span class="stat-card-head">
            <span class="stat-dot" :style="{ background: card.color }" />
            <span class="stat-label">{{ card.label }}</span>
            <component :is="card.icon" class="stat-icon" :style="{ color: card.color }" />
          </span>
          <span class="stat-value">{{ card.count }}</span>
          <span class="stat-bar">
            <i :style="{ width: `${card.pct}%`, background: card.color }" />
          </span>
          <span class="stat-foot">
            {{ card.foot }}<template v-if="card.key !== 'all'"> · 占比 {{ card.pct }}%</template>
          </span>
        </button>
      </div>

      <div class="requirement-list-card">
        <div class="list-card-head">
          <div class="list-card-title">
            <strong>需求列表</strong>
            <span class="list-card-count">{{ filteredRows.length }} 条</span>
            <a-button
              v-if="hasActiveFilter"
              type="link"
              size="small"
              class="list-card-clear"
              @click="clearFilters"
            >
              清除筛选
            </a-button>
          </div>
          <div class="list-card-tools">
            <span v-if="!isDispatcher" class="requirement-hint">
              仅展示分发给你与已认领的需求
            </span>
            <a-input-search
              v-model:value="keyword"
              class="requirement-search"
              placeholder="搜索需求编号 / 需求名"
              allow-clear
            />
          </div>
        </div>

        <div v-if="!rows.length && !loading" class="requirement-empty">
          <a-empty :image="Empty.PRESENTED_IMAGE_SIMPLE" description="暂无需求数据">
            <a-button
              v-if="isDispatcher"
              type="primary"
              :loading="syncing"
              @click="handleSync"
            >
              <template #icon><SyncOutlined /></template>
              立即同步需求
            </a-button>
            <span v-else class="empty-sub">需求将由分发人同步并分发后展示</span>
          </a-empty>
          <ol class="flow-guide">
            <li v-for="(step, index) in flowSteps" :key="step.title" class="flow-step">
              <span class="flow-index">{{ index + 1 }}</span>
              <div>
                <strong>{{ step.title }}</strong>
                <small>{{ step.desc }}</small>
              </div>
            </li>
          </ol>
        </div>

        <div v-else-if="!filteredRows.length && !loading" class="requirement-empty">
          <a-empty description="没有符合筛选条件的需求">
            <a-button @click="clearFilters">清除筛选</a-button>
          </a-empty>
        </div>

        <div v-else class="list-card-body">
          <a-table
            :columns="columns"
            :data-source="filteredRows"
            :loading="loading"
            row-key="id"
            size="middle"
            :pagination="{ pageSize: 15, showSizeChanger: false, showTotal: (total: number) => `共 ${total} 条` }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'projectCode'">
                <span class="cell-code">{{ record.projectCode }}</span>
              </template>
              <template v-else-if="column.key === 'status'">
                <a-tag :color="statusColor(record.status as RequirementStatus)">
                  {{ REQUIREMENT_STATUS_LABELS[record.status as RequirementStatus] }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'dispatch'">
                <div v-if="record.dispatchedTo" class="cell-stack">
                  <span class="cell-main">
                    {{ personLabel(record.dispatchedToName, record.dispatchedTo) }}
                  </span>
                  <span class="cell-muted">
                    {{ formatTime(record.dispatchedAt) }} · {{ record.dispatchedBy || 'system' }} 分发
                  </span>
                </div>
                <span v-else class="cell-muted">
                  {{ record.status === 'pending_dispatch' && record.refuseReason ? `曾拒绝：${record.refuseReason}` : '待分发' }}
                </span>
              </template>
              <template v-else-if="column.key === 'claim'">
                <div v-if="record.status === 'claimed' && record.claimedBy" class="cell-stack">
                  <span class="cell-main">
                    {{ personLabel(record.claimedByName, record.claimedBy) }}
                  </span>
                  <span class="cell-muted">{{ formatTime(record.claimedAt) }} 认领</span>
                </div>
                <span v-else class="cell-muted">-</span>
              </template>
              <template v-else-if="column.key === 'action'">
                <div class="action-cell">
                  <a-button
                    v-if="canDispatch(record as RequirementPlatformItem)"
                    size="small"
                    type="primary"
                    @click="openDispatch(record as RequirementPlatformItem)"
                  >
                    {{ record.status === 'pending_claim' ? '改派' : '分发' }}
                  </a-button>
                  <a-button
                    v-if="canActClaim(record as RequirementPlatformItem)"
                    size="small"
                    type="primary"
                    :loading="claimSubmittingId === record.id"
                    @click="handleClaim(record as RequirementPlatformItem)"
                  >
                    认领
                  </a-button>
                  <a-button
                    v-if="canActClaim(record as RequirementPlatformItem)"
                    size="small"
                    danger
                    @click="openRefuse(record as RequirementPlatformItem)"
                  >
                    拒绝
                  </a-button>
                  <span
                    v-if="!canDispatch(record as RequirementPlatformItem) && !canActClaim(record as RequirementPlatformItem)"
                    class="cell-muted"
                  >
                    -
                  </span>
                </div>
              </template>
            </template>
          </a-table>
        </div>
      </div>
    </section>

    <a-modal
      v-model:open="dispatchVisible"
      title="分发需求"
      ok-text="确认分发"
      cancel-text="取消"
      :confirm-loading="dispatchSubmitting"
      @ok="confirmDispatch"
    >
      <p class="modal-desc">
        需求：{{ activeRecord?.projectCode }} · {{ activeRecord?.projectName }}
      </p>
      <a-select
        v-model:value="dispatchTarget"
        style="width: 100%"
        placeholder="选择认领人"
        show-search
        :loading="candidatesLoading"
        :filter-option="candidateFilter"
        :options="candidates.map((item) => ({
          value: item.userName,
          label: `${item.nickName}（${item.userName}）`,
        }))"
      />
    </a-modal>

    <a-modal
      v-model:open="refuseVisible"
      title="拒绝认领"
      ok-text="确认拒绝"
      cancel-text="取消"
      :confirm-loading="refuseSubmitting"
      @ok="confirmRefuse"
    >
      <p class="modal-desc">
        确定拒绝认领需求 {{ activeRecord?.projectCode }} · {{ activeRecord?.projectName }} 吗？
        拒绝后需求将回到待分发状态。
      </p>
      <a-textarea
        v-model:value="refuseReason"
        placeholder="拒绝原因（选填）"
        :rows="3"
        :maxlength="500"
      />
    </a-modal>
  </main>
</template>

<style scoped>
.app-frame--nested {
  flex: 1;
  min-height: 0;
}

.requirement-workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 14px;
  padding: 20px 24px;
  overflow: hidden;
}

/* 管理模块下拉：替代原标题文本，保持标题字号与字重 */
.module-select {
  width: 160px;
  margin-left: -8px;
}

.module-select :deep(.ant-select-selector) {
  padding-inline: 8px !important;
  border-radius: 6px;
  transition: background-color 0.12s ease;
}

.module-select :deep(.ant-select-selector:hover) {
  background: #f5f6f8;
}

.module-select :deep(.ant-select-selection-item) {
  color: #1d2939;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
}

/* ---------------- 状态概览卡片 ---------------- */
.requirement-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--cf-border);
  border-radius: 10px;
  background: #fff;
  box-shadow: var(--cf-shadow-sm);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.stat-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgb(16 24 40 / 8%);
}

.stat-card.active {
  border-color: var(--cf-brand);
  box-shadow: var(--cf-shadow-focus);
}

.stat-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--cf-text-secondary);
  font-size: 12px;
}

.stat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.stat-icon {
  margin-left: auto;
  font-size: 15px;
  opacity: 0.85;
}

.stat-value {
  color: var(--cf-text);
  font-size: 24px;
  font-weight: 600;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.stat-bar {
  height: 4px;
  border-radius: 2px;
  background: #eef0f3;
  overflow: hidden;
}

.stat-bar i {
  display: block;
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.stat-foot {
  color: var(--cf-text-muted);
  font-size: 12px;
}

/* ---------------- 列表卡片 ---------------- */
.requirement-list-card {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.list-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--cf-border);
}

.list-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.list-card-title strong {
  color: var(--cf-text);
  font-size: 14px;
}

.list-card-count {
  padding: 0 8px;
  border-radius: 10px;
  background: var(--cf-brand-soft);
  color: var(--cf-brand);
  font-size: 12px;
  line-height: 20px;
}

.list-card-clear {
  padding-inline: 4px;
}

.list-card-tools {
  display: flex;
  align-items: center;
  gap: 12px;
}

.requirement-search {
  width: 260px;
}

.requirement-hint {
  color: rgba(60, 60, 67, 0.6);
  font-size: 12px;
}

.list-card-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 16px 12px;
}

/* 滚动时固定表头（滚动容器为 .list-card-body） */
.list-card-body :deep(.ant-table-thead > tr > th) {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f7f8fa;
}

/* ---------------- 空态与流程引导 ---------------- */
.requirement-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 40px 24px;
  overflow: auto;
}

.empty-sub {
  color: var(--cf-text-muted);
  font-size: 12px;
}

.flow-guide {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
  max-width: 780px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.flow-step {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  border: 1px dashed var(--cf-border);
  border-radius: 10px;
  background: #fafbfc;
}

.flow-index {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--cf-brand-soft);
  color: var(--cf-brand);
  font-size: 12px;
  font-weight: 600;
}

.flow-step strong {
  display: block;
  color: var(--cf-text);
  font-size: 13px;
}

.flow-step small {
  display: block;
  margin-top: 2px;
  color: var(--cf-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

/* ---------------- 表格单元格 ---------------- */
.cell-code {
  color: var(--cf-text-body);
  font-family: "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 12.5px;
}

.cell-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cell-main {
  color: var(--cf-text-body);
  font-size: 13px;
}

.cell-muted {
  color: rgba(60, 60, 67, 0.6);
  font-size: 12px;
}

.action-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 操作列按钮紧凑化：覆盖主题 controlHeightSM=32 */
.action-cell :deep(.ant-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
  line-height: 1;
  border-radius: 4px;
}

.modal-desc {
  margin-bottom: 12px;
  color: rgba(60, 60, 67, 0.75);
  font-size: 13px;
}

@media (max-width: 960px) {
  .requirement-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .flow-guide {
    grid-template-columns: 1fr;
  }
}
</style>
