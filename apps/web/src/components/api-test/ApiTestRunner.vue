<template>
  <section class="panel constraint-panel dynamic-instruction-panel api-runner-panel">
    <div class="panel-header dynamic-panel-header">
      <div class="dynamic-panel-intro">
        <div>
          <h2>执行平台</h2>
          <p>管理执行案例，按列表顺序串行执行并查看结果</p>
        </div>
      </div>
      <div class="toolbar dynamic-panel-toolbar action-toolbar">
        <a-button
          type="primary"
          :loading="apiStore.running"
          :disabled="!runnerCaseCount || apiStore.running"
          @click="openRunModal"
        >
          <template #icon><PlayCircleOutlined /></template>
          {{ apiStore.running ? '执行中…' : '执行' }}
        </a-button>
        <a-button @click="openManageCases">
          <template #icon><SettingOutlined /></template>
          管理案例
        </a-button>
      </div>
    </div>

    <div class="runner-main-layout">
      <div class="instruction-editor instruction-editor-panel">
        <div class="instruction-editor-shell">
          <div class="instruction-editor-body">
            <a-alert
              v-if="apiStore.running"
              type="info"
              show-icon
              class="exec-run-progress-alert"
              message="正在后台执行案例，完成后将自动刷新结果，可继续浏览页面"
            />

            <div class="runner-toolbar">
              <div class="runner-toolbar-summary">
                <span class="runner-summary-item">
                  共 <strong>{{ runnerCaseCount }}</strong> 条案例
                </span>
                <span class="runner-summary-divider">·</span>
                <template v-if="latestRun">
                  <span class="runner-summary-item">
                    最近执行
                    <strong class="runner-summary-version">
                      {{ latestRun.versionCode || formatHistoryTime(latestRun.createdAt) }}
                    </strong>
                  </span>
                  <span
                    class="exec-run-status-pill exec-run-status-pill--sm"
                    :class="`exec-run-status-pill--${latestRunTone}`"
                  >
                    {{ latestRunLabel }}
                  </span>
                </template>
                <span v-else class="runner-summary-item runner-summary-item--muted">尚未执行</span>
              </div>
              <a-segmented v-model:value="detailTab" :options="detailTabOptions" />
            </div>

            <div v-if="detailTab === 'cases'" class="exec-linked-case-detail">
              <a-alert
                v-if="hiddenLinkedCaseCount > 0"
                type="warning"
                :show-icon="false"
                :message="`当前版本过滤下，执行列表中有 ${hiddenLinkedCaseCount} 条案例不可见（非当前版本）`"
                class="exec-set-hidden-alert"
              />
              <template v-if="linkedSetCases.length">
                <a-table
                class="run-detail-table exec-linked-table"
                size="small"
                row-key="id"
                :data-source="linkedSetCases"
                :columns="linkedCaseColumns"
                :pagination="false"
                :expanded-row-keys="linkedExpandedKeys"
                @expand="onLinkedExpand"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'title'">
                    <span class="linked-case-title" :title="record.title">{{ record.title || '未命名案例' }}</span>
                    <a-tag v-if="record.steps?.length" class="linked-case-steps-tag">
                      {{ record.steps.length }} 步骤
                    </a-tag>
                  </template>
                  <template v-if="column.key === 'caseNo'">
                    <span
                      class="linked-case-no"
                      :title="record.caseNo || record.transactionCode || '—'"
                    >{{ record.caseNo || record.transactionCode || '—' }}</span>
                  </template>
                  <template v-if="column.key === 'version'">
                    <a-tag
                      v-if="record.metadata?.versionCode"
                      size="small"
                    >
                      {{ record.metadata.versionCode }}
                    </a-tag>
                    <span v-else>—</span>
                  </template>
                  <template v-if="column.key === 'polarity'">
                    <span class="polarity-pill polarity-pill--sm" :class="record.polarity">
                      {{ record.polarity === 'negative' ? '反' : '正' }}
                    </span>
                  </template>
                  <template v-else-if="column.key === 'actions'">
                    <div class="linked-case-actions">
                      <a-button
                        size="small"
                        type="text"
                        :disabled="linkedSetCases[0]?.id === record.id"
                        title="上移"
                        @click="moveLinkedCase(record.id, -1)"
                      >
                        <ArrowUpOutlined />
                      </a-button>
                      <a-button
                        size="small"
                        type="text"
                        :disabled="linkedSetCases[linkedSetCases.length - 1]?.id === record.id"
                        title="下移"
                        @click="moveLinkedCase(record.id, 1)"
                      >
                        <ArrowDownOutlined />
                      </a-button>
                      <a-tooltip title="移除">
                        <a-button
                          size="small"
                          type="text"
                          danger
                          @click="removeLinkedCase(record.id)"
                        >
                          <DeleteOutlined />
                        </a-button>
                      </a-tooltip>
                    </div>
                  </template>
                </template>
                <template #expandedRowRender="{ record }">
                  <div class="linked-case-steps">
                    <div v-if="record.steps?.length" class="linked-case-step-list">
                      <div
                        v-for="(step, index) in record.steps"
                        :key="step.id"
                        class="linked-case-step-item"
                      >
                        <span class="linked-case-step-index">{{ index + 1 }}</span>
                        <strong class="linked-case-step-name">{{ step.name }}</strong>
                        <span class="linked-case-step-target" :title="stepTargetLabel(step)">
                          {{ stepTargetLabel(step) }}
                        </span>
                      </div>
                    </div>
                    <div v-else class="linked-case-steps-empty">单步骤案例，无独立步骤列表</div>
                  </div>
                </template>
              </a-table>
              </template>
              <div v-else class="exec-set-empty-detail">
                <InboxOutlined class="exec-set-empty-icon" />
                <p class="exec-set-empty-text">{{ emptyLinkedCasesMessage }}</p>
              </div>
            </div>

            <div v-else-if="apiStore.transactionRuns.length" class="exec-run-detail">
              <div class="exec-run-history-panel">
                <div class="exec-run-history-head">
                  <span class="exec-run-history-title">执行历史</span>
                  <span class="exec-run-history-count">共 {{ apiStore.transactionRuns.length }} 次</span>
                </div>
                <div class="exec-run-history-track">
                  <div
                    v-for="item in apiStore.transactionRuns"
                    :key="item.id"
                    class="exec-run-history-entry"
                    :class="[
                      `exec-run-history-entry--${runHistoryChipClass(item)}`,
                      { expanded: expandedRunId === item.id },
                    ]"
                  >
                    <div
                      class="exec-run-history-item"
                      :class="[
                        `exec-run-history-item--${runHistoryChipClass(item)}`,
                        { active: expandedRunId === item.id },
                      ]"
                    >
                      <div class="exec-run-history-item-main" @click="toggleRunDetail(item.id)">
                        <span class="exec-run-history-item-stats">
                          <span class="exec-run-history-stat">
                            总数 <strong>{{ item.totalCount }}</strong>
                          </span>
                          <span class="exec-run-history-stat exec-run-history-stat--pass">
                            通过 <strong>{{ item.passedCount }}</strong>
                          </span>
                          <span class="exec-run-history-stat exec-run-history-stat--fail">
                            失败 <strong>{{ runHistoryFailedCount(item) }}</strong>
                          </span>
                          <span class="exec-run-history-stat exec-run-history-stat--rate">
                            通过率 <strong>{{ runHistoryPassRate(item) }}%</strong>
                          </span>
                        </span>
                        <span class="exec-run-history-item-outcome">{{ runHistoryOutcomeLabel(item) }}</span>
                        <span class="exec-run-history-item-trailing">
                          <span v-if="item.versionCode" class="exec-run-history-version" :title="`执行版本 ${item.versionCode}`">
                            {{ item.versionCode }}
                          </span>
                          <span class="exec-run-history-item-time">{{ formatHistoryTime(item.createdAt) }}</span>
                          <a-tooltip title="重新执行">
                            <a-button
                              type="text"
                              size="small"
                              class="exec-run-history-rerun"
                              :loading="rerunningRunId === item.id"
                              :disabled="apiStore.running && rerunningRunId !== item.id"
                              @click.stop="onRerunHistory(item.id)"
                            >
                              <template #icon><RedoOutlined /></template>
                            </a-button>
                          </a-tooltip>
                          <a-tooltip title="删除">
                            <a-button
                              type="text"
                              size="small"
                              class="exec-run-history-delete"
                              :loading="deletingRunId === item.id"
                              :disabled="apiStore.running || (!!deletingRunId && deletingRunId !== item.id)"
                              @click.stop="onDeleteHistory(item.id)"
                            >
                              <template #icon><DeleteOutlined /></template>
                            </a-button>
                          </a-tooltip>
                          <DownOutlined class="exec-run-history-item-chevron" />
                        </span>
                      </div>
                      <span class="exec-run-history-item-bar" aria-hidden="true">
                        <i :style="{ width: `${runHistoryPassRate(item)}%` }" />
                      </span>
                    </div>
                    <div v-if="expandedRunId === item.id" class="exec-run-history-detail">
                      <a-spin :spinning="runDetailLoading">
                        <div class="exec-run-results-header">
                          <h4 class="exec-run-results-title">案例明细</h4>
                          <span class="exec-run-results-hint">点击案例名称或左侧按钮展开查看请求、响应与断言</span>
                        </div>
                        <a-table
                          v-if="apiStore.activeRun?.id === item.id"
                          class="exec-run-results-table"
                          size="small"
                          row-key="id"
                          :data-source="apiStore.activeRun.items"
                          :columns="itemColumns"
                          :pagination="false"
                          :expanded-row-keys="expandedKeys"
                          @expand="onExpand"
                        >
                          <template #bodyCell="{ column, record }">
                            <template v-if="column.key === 'caseTitle'">
                              <span class="exec-run-case-title" :title="record.caseTitle">
                                {{ record.caseTitle || '未命名案例' }}
                              </span>
                            </template>
                            <template v-else-if="column.key === 'status'">
                              <span
                                class="exec-run-status-pill"
                                :class="`exec-run-status-pill--${record.status}`"
                              >
                                {{ runItemStatusLabel(record.status) }}
                              </span>
                            </template>
                            <template v-else-if="column.key === 'durationMs'">
                              <span class="exec-run-duration">{{ formatDuration(record.durationMs) }}</span>
                            </template>
                            <template v-else-if="column.key === 'actions'">
                              <span class="exec-run-item-actions">
                                <a-tooltip title="重新执行">
                                  <a-button type="text" size="small" :loading="rerunningItemId === record.id" @click.stop="onRerunItem(item.id, record.caseId)">
                                    <template #icon><RedoOutlined /></template>
                                  </a-button>
                                </a-tooltip>
                                <a-tooltip title="打开案例编辑">
                                  <a-button type="text" size="small" @click.stop="openRunCase(record.caseId)">
                                    <template #icon><EditOutlined /></template>
                                  </a-button>
                                </a-tooltip>
                              </span>
                            </template>
                          </template>
                          <template #expandedRowRender="{ record }">
                            <div class="exec-run-expand">
                              <div v-if="runItemSteps(record).length" class="exec-run-step-list">
                                <div
                                  v-for="(step, index) in runItemSteps(record)"
                                  :key="String(step.stepId ?? index)"
                                  class="exec-run-step-block"
                                >
                                  <div class="exec-run-step-head">
                                    <span class="exec-run-step-index">步骤 {{ index + 1 }}</span>
                                    <strong class="exec-run-step-name">{{ step.stepName || '未命名步骤' }}</strong>
                                    <span
                                      class="exec-run-status-pill exec-run-status-pill--sm"
                                      :class="`exec-run-status-pill--${step.status}`"
                                    >
                                      {{ runItemStatusLabel(step.status || '') }}
                                    </span>
                                    <span class="exec-run-duration">{{ formatDuration(step.durationMs) }}</span>
                                  </div>
                                  <ApiRunSnapshotTabs
                                    :request-snapshot="step.request"
                                    :response-snapshot="step.response"
                                    :assertions="step.assertions ?? []"
                                  />
                                </div>
                              </div>
                              <ApiRunSnapshotTabs
                                v-else
                                :request-snapshot="record.requestSnapshot"
                                :response-snapshot="record.responseSnapshot"
                                :assertions="record.assertions ?? []"
                              />
                            </div>
                          </template>
                        </a-table>
                      </a-spin>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="exec-set-empty-detail exec-run-empty">
              <a-empty description="尚未执行，添加案例后点击「执行」" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <ApiEnvironmentMaintainModal v-model:open="envModalOpen" />

    <a-modal
      v-model:open="manageCasesOpen"
      title="管理案例"
      width="800px"
      centered
      :confirm-loading="manageCasesSaving"
      @ok="onSaveCases"
    >
      <div class="manage-hint">
        <InfoCircleOutlined />
        <span>勾选案例加入执行列表，执行时按列表顺序串行执行。</span>
      </div>
      <div class="manage-cases-toolbar">
        <div class="manage-cases-toolbar-main">
          <a-checkbox
            :checked="allManageCasesSelected"
            :indeterminate="manageCasesSelectionIndeterminate"
            @change="toggleSelectAllManageCases"
          >
            全选当前页
          </a-checkbox>
          <a-select
            v-if="manageCasesVersionOptions.length > 1"
            v-model:value="manageCasesVersionFilter"
            :options="manageCasesVersionOptions"
            size="small"
            class="manage-cases-version-filter"
            :popup-match-select-width="false"
            :dropdown-style="{ minWidth: '180px' }"
            @change="onManageCasesVersionChange"
          />
          <a-select
            v-if="manageCasesChannelOptions.length > 1"
            v-model:value="manageCasesChannelFilter"
            :options="manageCasesChannelOptions"
            size="small"
            class="manage-cases-channel-filter"
            @change="onManageCasesChannelChange"
          />
        </div>
        <span class="manage-cases-selection">
          已选 <strong>{{ selectedCaseIds.length }}</strong> 条
        </span>
      </div>
      <a-spin :spinning="manageCasesLoading">
        <div v-if="manageCasesList.length" class="manage-case-list">
          <label
            v-for="item in manageCasesList"
            :key="item.id"
            class="manage-case-row"
            :class="{ 'manage-case-row--selected': selectedCaseIds.includes(item.id) }"
          >
            <a-checkbox
              :checked="selectedCaseIds.includes(item.id)"
              @change="(e: unknown) => onToggleManageCase(item.id, readCheckboxChecked(e))"
            />
            <div class="manage-case-main">
              <div class="manage-case-title-row">
                <strong :title="item.title">{{ item.title || '未命名案例' }}</strong>
                <a-tag
                  v-if="item.metadata?.versionCode"
                  size="small"
                  class="manage-case-version-tag"
                >
                  {{ item.metadata.versionCode }}
                </a-tag>
              </div>
              <small>{{ item.caseNo || item.transactionCode || '待分配编号' }}</small>
            </div>
            <span class="case-profile-badge" :class="`profile-${caseProfileColor(item.request)}`">
              {{ caseProfileLabel(item.request) }}
            </span>
            <span class="polarity-pill polarity-pill--sm" :class="item.polarity">
              {{ item.polarity === 'negative' ? '反' : '正' }}
            </span>
          </label>
        </div>
        <div v-else class="manage-case-empty">
          <InboxOutlined class="manage-case-empty-icon" />
          <p>{{ manageCasesEmptyHint }}</p>
        </div>
      </a-spin>
      <div v-if="manageCasesTotal > 0" class="manage-cases-pagination">
        <a-pagination
          size="small"
          :current="manageCasesPage"
          :page-size="manageCasesPageSize"
          :total="manageCasesTotal"
          :show-size-changer="true"
          :page-size-options="pageSizeOptions"
          @change="onManageCasesPageChange"
          @showSizeChange="onManageCasesPageChange"
        />
      </div>
    </a-modal>

    <a-modal
      v-model:open="runModalOpen"
      title="执行"
      centered
      ok-text="开始执行"
      cancel-text="取消"
      :mask-closable="!apiStore.running"
      @ok="onConfirmRun"
    >
      每条案例将使用案例中已指定的环境、地址和编码执行。
    </a-modal>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  SettingOutlined,
} from '@ant-design/icons-vue';
import {
  caseForgePageSizeOptionLabels,
  executionProfileBadgeColor,
  normalizeCaseForgePageSize,
  resolveExecutionProfile,
} from '@case-forge/shared';
import type { ApiCaseRequest, ApiCaseStep } from '@case-forge/shared';
import ApiEnvironmentMaintainModal from '@/components/api-test/ApiEnvironmentMaintainModal.vue';
import ApiRunSnapshotTabs from '@/components/api-test/ApiRunSnapshotTabs.vue';
import { useApiTestStore } from '@/stores/apiTest';
import type { ApiTestCaseRow } from '@/api/apiTestClient';
import { listAllApiCases, listApiCases } from '@/api/apiTestClient';

const apiStore = useApiTestStore();
const pageSizeOptions = caseForgePageSizeOptionLabels();
const envModalOpen = ref(false);

const manageCasesOpen = ref(false);
const runModalOpen = ref(false);
const selectedCaseIds = ref<string[]>([]);
const expandedKeys = ref<string[]>([]);
const linkedExpandedKeys = ref<string[]>([]);
const expandedRunId = ref<string | null>(null);
const rerunningRunId = ref<string | null>(null);
const rerunningItemId = ref<string | null>(null);
const deletingRunId = ref<string | null>(null);
const runDetailLoading = ref(false);
const manageCasesList = ref<ApiTestCaseRow[]>([]);
const manageCasesPage = ref(1);
const manageCasesPageSize = ref(normalizeCaseForgePageSize(10));
const manageCasesTotal = ref(0);
const manageCasesLoading = ref(false);
const manageCasesSaving = ref(false);
const manageCasesVersionFilter = ref<string | null>(null);
const manageCasesVersionOptions = ref<Array<{ value: string | null; label: string }>>([]);
const manageCasesChannelFilter = ref<string | null>(null);
const manageCasesChannelOptions = ref<Array<{ value: string | null; label: string }>>([]);
const manageCasesEmptyHint = computed(() =>
  manageCasesVersionFilter.value != null || manageCasesChannelFilter.value != null
    ? '当前筛选条件下暂无案例'
    : '暂无案例，请先在案例编辑中创建',
);
const detailTab = ref<'cases' | 'result'>('cases');
const detailTabOptions = [
  { label: '关联案例', value: 'cases' },
  { label: '执行结果', value: 'result' },
];

const runnerCaseCount = computed(() => apiStore.runnerCaseIds.length);

const latestRun = computed(() => apiStore.transactionRuns[0] ?? null);

const latestRunLabel = computed(() => {
  const run = latestRun.value;
  if (!run) return '';
  if (run.status === 'running') return '执行中';
  return runHistoryOutcomeLabel(run);
});

const latestRunTone = computed(() => {
  const run = latestRun.value;
  if (!run || run.status === 'running') return 'running';
  if (run.totalCount > 0 && run.passedCount === run.totalCount) return 'passed';
  return 'failed';
});

const allManageCasesSelected = computed(
  () =>
    manageCasesList.value.length > 0 &&
    manageCasesList.value.every((item) => selectedCaseIds.value.includes(item.id)),
);

const manageCasesSelectionIndeterminate = computed(() => {
  const pageIds = manageCasesList.value.map((item) => item.id);
  const selectedOnPage = pageIds.filter((id) => selectedCaseIds.value.includes(id));
  return selectedOnPage.length > 0 && selectedOnPage.length < pageIds.length;
});

const linkedSetCases = computed(() => {
  const ids = apiStore.runnerCaseIds;
  if (!ids.length) return [];
  const caseMap = new Map(apiStore.runnerCases.map((item) => [item.id, item]));
  return ids.map((id) => caseMap.get(id)).filter((item): item is ApiTestCaseRow => Boolean(item));
});

const hiddenLinkedCaseCount = computed(() => {
  const ids = apiStore.runnerCaseIds;
  if (!ids.length) return 0;
  const validIdSet = new Set(apiStore.runnerCases.map((item) => item.id));
  return ids.filter((id) => !validIdSet.has(id)).length;
});

const emptyLinkedCasesMessage = computed(() => {
  const totalCount = runnerCaseCount.value;
  const hiddenCount = hiddenLinkedCaseCount.value;
  if (totalCount === 0) {
    return '请先「管理案例」添加案例后执行';
  }
  if (hiddenCount > 0) {
    return `有 ${hiddenCount} 条案例已删除或不可见，请在「管理案例」中调整`;
  }
  return '案例加载失败或案例已不可见，请刷新页面后重试';
});

function caseProfileLabel(request: ApiCaseRequest) {
  return resolveExecutionProfile(request).label;
}

function caseProfileColor(request: ApiCaseRequest) {
  return executionProfileBadgeColor(resolveExecutionProfile(request).transport);
}

watch(detailTab, async (tab) => {
  if (tab !== 'result') return;
  const projectId = apiStore.activeProjectId;
  if (!projectId) return;
  await apiStore.ensureRunnerRunsLoaded(projectId);
});

function toggleRunItemExpand(recordId: string) {
  expandedKeys.value = expandedKeys.value.includes(recordId) ? [] : [recordId];
}

const itemColumns = [
  {
    title: '案例',
    dataIndex: 'caseTitle',
    key: 'caseTitle',
    ellipsis: true,
    customCell: (record: { id: string }) => ({
      class: 'exec-run-case-cell',
      onClick: () => toggleRunItemExpand(record.id),
    }),
  },
  { title: '状态', dataIndex: 'status', key: 'status', width: 96 },
  { title: '耗时', dataIndex: 'durationMs', key: 'durationMs', width: 88, align: 'right' as const },
  { title: '操作', key: 'actions', width: 96, align: 'center' as const },
];

const linkedCaseColumns = [
  {
    title: '编号',
    dataIndex: 'caseNo',
    key: 'caseNo',
    width: 148,
    customCell: () => ({ class: 'exec-linked-caseno-cell' }),
  },
  { title: '案例', dataIndex: 'title', key: 'title', ellipsis: true },
  { title: '版本', key: 'version', width: 160, align: 'center' as const, customCell: () => ({ class: 'exec-linked-version-cell' }) },
  { title: '方向', key: 'polarity', width: 64, align: 'center' as const },
  {
    title: '操作',
    key: 'actions',
    width: 104,
    align: 'center' as const,
    customCell: () => ({ class: 'exec-linked-actions-cell' }),
  },
];

interface RunStepSnapshot {
  stepId?: string;
  stepName?: string;
  status?: string;
  durationMs?: number;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  assertions?: Array<{ name: string; passed: boolean; expected?: unknown; actual?: unknown }>;
}

function runItemSteps(record: { requestSnapshot?: unknown }): RunStepSnapshot[] {
  const snapshot = record.requestSnapshot as { steps?: unknown } | null | undefined;
  const steps = snapshot?.steps;
  return Array.isArray(steps) ? (steps as RunStepSnapshot[]) : [];
}

function onLinkedExpand(expanded: boolean, record: { id: string }) {
  linkedExpandedKeys.value = expanded ? [record.id] : [];
}

function stepTargetLabel(step: ApiCaseStep) {
  return step.target?.address?.trim() || '未指定环境地址';
}

function runHistoryChipClass(item: { passedCount: number; totalCount: number }) {
  if (item.totalCount > 0 && item.passedCount === item.totalCount) return 'is-pass';
  if (item.passedCount === 0) return 'is-fail';
  return 'is-partial';
}

function runHistoryOutcomeLabel(item: {
  passedCount: number;
  totalCount: number;
  status?: string;
}) {
  if (item.status === 'running') return '执行中';
  if (item.totalCount > 0 && item.passedCount === item.totalCount) return '全部通过';
  if (item.passedCount === 0) return '全部未通过';
  return '部分通过';
}

function runHistoryPassRate(item: { passedCount: number; totalCount: number }) {
  if (!item.totalCount) return 0;
  return Math.round((item.passedCount / item.totalCount) * 100);
}

function runHistoryFailedCount(item: {
  passedCount: number;
  totalCount: number;
  failedCount?: number;
  errorCount?: number;
}) {
  if (item.failedCount != null || item.errorCount != null) {
    return (item.failedCount ?? 0) + (item.errorCount ?? 0);
  }
  return Math.max(0, item.totalCount - item.passedCount);
}

function formatHistoryTime(value: string) {
  const date = new Date(value);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatDuration(ms?: number) {
  if (ms == null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function runItemStatusLabel(status: string) {
  if (status === 'passed') return '通过';
  if (status === 'failed') return '失败';
  if (status === 'error') return '异常';
  if (status === 'running') return '执行中';
  return status || '未执行';
}

function readCheckboxChecked(event: unknown) {
  const target = (event as { target?: { checked?: boolean } })?.target;
  return Boolean(target?.checked);
}

async function ensureLinkedCasesLoaded() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  const caseIds = apiStore.runnerCaseIds;
  if (!projectId || !transactionId || !caseIds.length) {
    return;
  }
  const loadedIds = new Set(apiStore.runnerCases.map((item) => item.id));
  if (!apiStore.runnerCases.length || caseIds.some((id) => !loadedIds.has(id))) {
    await apiStore.refreshRunnerCases(projectId, transactionId);
  }
}

function openManageCases() {
  void openManageCasesAsync();
}

async function openManageCasesAsync() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (projectId && transactionId) {
    await apiStore.refreshRunnerCaseIds(projectId, transactionId);
  }
  selectedCaseIds.value = [...apiStore.runnerCaseIds];
  manageCasesPage.value = 1;
  manageCasesVersionFilter.value = null;
  manageCasesChannelFilter.value = null;
  manageCasesOpen.value = true;
  await loadManageCasesVersions();
  await loadManageCasesList();
}

async function loadManageCasesVersions() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) return;
  const rows = await listAllApiCases(projectId, transactionId).catch(
    () => [] as ApiTestCaseRow[],
  );
  const versions = new Set<string>();
  const channels = new Map<string, string>();
  const currentChannelNames = new Map(
    (apiStore.apiDoc?.generationProfile?.channels ?? []).map((channel) => [channel.id, channel.name]),
  );
  for (const row of rows) {
    const code = row.metadata?.versionCode;
    if (code != null) {
      versions.add(code);
    }
    const channelId = row.metadata?.channelId;
    if (channelId != null) {
      channels.set(
        channelId,
        currentChannelNames.get(channelId) || row.metadata?.channelName || channelId,
      );
    }
  }
  const sorted = Array.from(versions).sort();
  manageCasesVersionOptions.value = [
    { value: null, label: '全部版本' },
    ...sorted.map((code) => ({ value: code, label: code })),
  ];
  manageCasesChannelOptions.value = [
    { value: null, label: '全部渠道' },
    ...Array.from(channels, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
  ];
  if (manageCasesChannelFilter.value != null && !channels.has(manageCasesChannelFilter.value)) {
    manageCasesChannelFilter.value = null;
  }

  const current = manageCasesVersionFilter.value;
  if (current != null && !versions.has(current)) {
    manageCasesVersionFilter.value = sorted.length
      ? sorted[sorted.length - 1] ?? null
      : null;
  } else if (current == null && sorted.length > 0) {
    manageCasesVersionFilter.value = sorted[sorted.length - 1] ?? null;
  }
}

function onManageCasesVersionChange() {
  manageCasesPage.value = 1;
  void loadManageCasesList();
}

function onManageCasesChannelChange() {
  manageCasesPage.value = 1;
  void loadManageCasesList();
}

async function loadManageCasesList() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) return;
  manageCasesLoading.value = true;
  try {
    const result = await listApiCases(projectId, transactionId, {
      page: manageCasesPage.value,
      pageSize: manageCasesPageSize.value,
      versionCode: manageCasesVersionFilter.value ?? undefined,
      channelId: manageCasesChannelFilter.value ?? undefined,
    });
    if (
      result.count === 0 &&
      manageCasesVersionFilter.value != null &&
      manageCasesChannelFilter.value == null &&
      manageCasesVersionOptions.value.some(
        (item) =>
          item.value != null && item.value !== manageCasesVersionFilter.value,
      )
    ) {
      await loadManageCasesVersions();
      if (manageCasesVersionFilter.value != null) {
        await loadManageCasesList();
        return;
      }
    }
    const maxPage = Math.max(1, Math.ceil(result.count / result.pageSize) || 1);
    if (result.count > 0 && result.page > maxPage) {
      manageCasesPage.value = maxPage;
      await loadManageCasesList();
      return;
    }
    manageCasesList.value = result.rows;
    manageCasesTotal.value = result.count;
    manageCasesPage.value = result.page;
    manageCasesPageSize.value = normalizeCaseForgePageSize(result.pageSize);
  } finally {
    manageCasesLoading.value = false;
  }
}

function onManageCasesPageChange(page: number, pageSize: number) {
  const size = normalizeCaseForgePageSize(pageSize);
  const sizeChanged = size !== manageCasesPageSize.value;
  manageCasesPageSize.value = size;
  manageCasesPage.value = sizeChanged ? 1 : page;
  void loadManageCasesList();
}

function onToggleManageCase(caseId: string, checked: boolean) {
  if (checked) {
    if (!selectedCaseIds.value.includes(caseId)) {
      selectedCaseIds.value = [...selectedCaseIds.value, caseId];
    }
    return;
  }
  selectedCaseIds.value = selectedCaseIds.value.filter((id) => id !== caseId);
}

function toggleSelectAllManageCases(event: { target: { checked: boolean } }) {
  const checked = event.target.checked;
  const pageIds = manageCasesList.value.map((item) => item.id);
  if (checked) {
    selectedCaseIds.value = [...new Set([...selectedCaseIds.value, ...pageIds])];
    return;
  }
  const pageIdSet = new Set(pageIds);
  selectedCaseIds.value = selectedCaseIds.value.filter((id) => !pageIdSet.has(id));
}

async function onSaveCases() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) {
    message.warning('缺少项目或交易码信息');
    return;
  }
  manageCasesSaving.value = true;
  try {
    const caseIds = [...selectedCaseIds.value];
    await apiStore.replaceRunnerCases(projectId, transactionId, caseIds);
    detailTab.value = 'cases';
    manageCasesOpen.value = false;
    await apiStore.refreshRunnerCases(projectId, transactionId);
  } catch (error) {
    const responseMessage = (error as { response?: { data?: { message?: string } } })
      ?.response?.data?.message;
    message.error(responseMessage || (error as Error)?.message || '保存案例列表失败');
  } finally {
    manageCasesSaving.value = false;
  }
}

function openRunModal() {
  runModalOpen.value = true;
}

async function onConfirmRun() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) {
    return Promise.reject();
  }
  if (apiStore.running) {
    message.warning('当前已有执行任务进行中');
    return Promise.reject();
  }

  runModalOpen.value = false;
  detailTab.value = 'result';
  message.info('已开始后台执行，完成后将自动刷新结果');

  void apiStore
    .runRunnerCases(projectId, transactionId, {})
    .catch((error: unknown) => {
      const responseMessage = (error as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      message.error(responseMessage || (error as Error)?.message || '执行失败');
    });
}

async function removeLinkedCase(caseId: string) {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) return;
  const linkedCases = linkedSetCases.value;
  const removedIds = collectDependentCaseIds(caseId, linkedCases);
  const nextCaseIds = apiStore.runnerCaseIds.filter((id) => !removedIds.has(id));
  try {
    await apiStore.replaceRunnerCases(projectId, transactionId, nextCaseIds);
    await apiStore.refreshRunnerCases(projectId, transactionId);
    message.success('案例已移除');
  } catch (error) {
    const responseMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    message.error(responseMessage || (error as Error)?.message || '移除案例失败');
  }
}

function collectDependentCaseIds(caseId: string, cases: ApiTestCaseRow[]) {
  const removed = new Set([caseId]);
  const caseNoById = new Map(cases.map((item) => [item.id, item.caseNo]));
  let changed = true;
  while (changed) {
    changed = false;
    const removedCaseNumbers = new Set(
      [...removed].map((id) => caseNoById.get(id)).filter(Boolean),
    );
    for (const item of cases) {
      if (removed.has(item.id)) continue;
      const request = JSON.stringify(item.request);
      if ([...removedCaseNumbers].some((caseNo) => request.includes(`\${${caseNo}.`))) {
        removed.add(item.id);
        changed = true;
      }
    }
  }
  return removed;
}

async function moveLinkedCase(caseId: string, offset: -1 | 1) {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  const caseIds = [...apiStore.runnerCaseIds];
  const index = caseIds.indexOf(caseId);
  const target = index + offset;
  if (!projectId || !transactionId || index < 0 || target < 0 || target >= caseIds.length) return;
  [caseIds[index], caseIds[target]] = [caseIds[target], caseIds[index]];
  try {
    const savedCaseIds = await apiStore.replaceRunnerCases(projectId, transactionId, caseIds);
    if (savedCaseIds[index] === caseId) {
      message.warning('该案例顺序受共享变量依赖约束，不能移动到此位置');
    } else {
      message.success('案例顺序已更新');
    }
  } catch (error) {
    const responseMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    message.error(responseMessage || '该排序不满足案例变量依赖');
  }
}

function onRerunHistory(runId: string) {
  void onRerunHistoryAsync(runId);
}

async function onRerunHistoryAsync(runId: string) {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) {
    message.warning('缺少项目或交易码信息');
    return;
  }
  if (apiStore.running) {
    message.warning('当前已有执行任务进行中');
    return;
  }
  if (!apiStore.environments.length) {
    message.warning('请先创建执行环境');
    envModalOpen.value = true;
    return;
  }

  rerunningRunId.value = runId;
  detailTab.value = 'result';
  message.info('已开始重新执行，完成后将自动刷新结果');

  try {
    const run = await apiStore.rerunHistoricalRun(projectId, transactionId, runId, {});
    if (run) {
      expandedRunId.value = run.id;
      expandedKeys.value = [];
    }
  } catch (error) {
    const responseMessage = (error as { response?: { data?: { message?: string } } })
      ?.response?.data?.message;
    message.error(responseMessage || (error as Error)?.message || '重新执行失败');
  } finally {
    rerunningRunId.value = null;
  }
}

async function onRerunItem(runId: string, caseId: string) {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) return message.warning('缺少项目或交易码信息');
  if (apiStore.running) return message.warning('当前已有执行任务进行中');
  rerunningItemId.value = caseId;
  try {
    await apiStore.rerunHistoricalRun(projectId, transactionId, runId, {
      caseIds: [caseId],
    });
  } finally {
    rerunningItemId.value = null;
  }
}

async function openRunCase(caseId: string) {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) return;
  const target = apiStore.runnerCases.find((item) => item.id === caseId);
  const versionCode = target?.metadata?.versionCode ?? null;
  const channelId = target?.metadata?.channelId ?? null;
  const cases = await listAllApiCases(projectId, transactionId, {
    versionCode: versionCode ?? undefined,
    channelId: channelId ?? undefined,
  });
  const index = cases.findIndex((item) => item.id === caseId);
  apiStore.caseListVersionFilter = versionCode;
  apiStore.caseListChannelFilter = channelId;
  apiStore.setWorkspaceStage(projectId, transactionId, 'api-cases');
  await apiStore.refreshCases(projectId, transactionId, {
    page: index < 0 ? 1 : Math.floor(index / apiStore.caseListPageSize) + 1,
    versionCode: versionCode ?? undefined,
    channelId: channelId ?? undefined,
  });
  apiStore.activeCaseId = caseId;
}

async function onDeleteHistory(runId: string) {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) {
    message.warning('缺少项目或交易码信息');
    return;
  }
  if (apiStore.running) {
    message.warning('执行进行中，请稍后再删除');
    return;
  }
  deletingRunId.value = runId;
  try {
    await apiStore.deleteRun(projectId, transactionId, runId);
    if (expandedRunId.value === runId) {
      expandedRunId.value = null;
      expandedKeys.value = [];
    }
  } catch (error) {
    const responseMessage = (error as { response?: { data?: { message?: string } } })
      ?.response?.data?.message;
    message.error(responseMessage || (error as Error)?.message || '删除执行历史失败');
  } finally {
    deletingRunId.value = null;
  }
}

async function toggleRunDetail(runId: string) {
  detailTab.value = 'result';
  if (expandedRunId.value === runId) {
    expandedRunId.value = null;
    expandedKeys.value = [];
    return;
  }
  expandedRunId.value = runId;
  expandedKeys.value = [];
  const projectId = apiStore.activeProjectId;
  if (!projectId) return;
  if (apiStore.activeRun?.id === runId && apiStore.activeRun.items?.length) {
    return;
  }
  runDetailLoading.value = true;
  try {
    await loadRun(runId);
  } finally {
    runDetailLoading.value = false;
  }
}

watch(
  () => apiStore.runnerCaseIds,
  () => {
    expandedRunId.value = null;
    expandedKeys.value = [];
    void ensureLinkedCasesLoaded();
  },
  { immediate: true },
);

async function loadRun(runId: string) {
  const projectId = apiStore.activeProjectId;
  if (!projectId) return;
  await apiStore.loadRun(projectId, runId);
}

function onExpand(expanded: boolean, record: { id: string }) {
  expandedKeys.value = expanded ? [record.id] : [];
}
</script>

<style scoped>
.api-runner-panel {
  min-height: 0;
}

.runner-main-layout {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  padding: 16px 20px 20px;
}

.runner-main-layout > .instruction-editor-panel {
  width: 100%;
  min-height: 0;
}

.exec-run-history-version {
  padding: 1px 6px;
  border: 1px solid #e4e7ec;
  border-radius: 6px;
  background: #f7f8fa;
  color: #475467;
  font-size: 11px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.exec-set-hidden-alert {
  margin-bottom: 12px;
}

.manage-case-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.manage-case-title-row strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manage-case-version-tag {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1.4;
}

.exec-run-progress-alert {
  margin-bottom: 12px;
}

.runner-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.runner-toolbar-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--cf-text-secondary, #667085);
  font-size: 13px;
}

.runner-toolbar-summary strong {
  color: var(--cf-text, #1d2939);
  font-weight: 600;
}

.runner-summary-version {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  letter-spacing: 0.02em;
}

.runner-summary-divider {
  color: var(--cf-text-muted, #98a2b3);
}

.runner-summary-item--muted {
  color: var(--cf-text-muted, #98a2b3);
}

.exec-linked-hint {
  margin-top: 10px;
  color: var(--cf-text-muted, #98a2b3);
  font-size: 12px;
}

/* ===== 关联案例表格 ===== */
.exec-linked-table :deep(.ant-table-thead > tr > th) {
  background: #f7f8fa;
  font-size: 12px;
  font-weight: 600;
  color: var(--cf-text-body, #344054);
}
.exec-linked-table :deep(.ant-table-content) {
  overflow-x: auto;
}
.exec-linked-table :deep(.ant-table table) {
  min-width: 720px;
  table-layout: fixed;
}
.exec-linked-table :deep(.ant-table-tbody > tr > td) {
  font-size: 13px;
}
.exec-linked-table :deep(.exec-linked-caseno-cell),
.exec-linked-table :deep(.exec-linked-version-cell) {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.exec-linked-table :deep(.exec-linked-version-cell .ant-tag) {
  max-width: 100%;
  margin-inline-end: 0;
  padding: 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.exec-linked-table :deep(.exec-linked-actions-cell) {
  white-space: nowrap;
}
.linked-case-actions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  white-space: nowrap;
}
.exec-linked-table :deep(.ant-table-tbody > tr:hover > td) {
  background: #fafbfc;
}
.linked-case-title {
  font-weight: 500;
  color: var(--cf-text, #1d2939);
}
.linked-case-no {
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  color: var(--cf-text-secondary, #667085);
  letter-spacing: 0.02em;
}

/* ===== 空状态 ===== */
.exec-set-empty-detail {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 280px;
}
.exec-set-empty-icon {
  font-size: 44px;
  color: var(--cf-text-muted, #98a2b3);
  opacity: 0.3;
}
.exec-set-empty-text {
  margin: 0;
  font-size: 13px;
  color: var(--cf-text-muted, #98a2b3);
}

.exec-set-card.batch-card .test-point-card-head {
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.exec-set-list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #eaecf0;
  font-size: 12px;
}

.exec-set-list-selection {
  color: #667085;
}

.batch-set-summary-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.batch-set-summary-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 88px 96px;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #eaecf0;
  font-size: 13px;
}

.batch-set-summary-list li:last-child {
  border-bottom: none;
}

.batch-set-summary-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-set-summary-meta,
.batch-set-summary-status {
  color: #667085;
  font-size: 12px;
  white-space: nowrap;
}

.batch-set-summary-status {
  text-align: right;
}

.batch-set-summary-more {
  color: #667085;
  font-size: 12px;
}

.instruction-editor-footer.dynamic-editor-footer {
  justify-content: flex-end;
}

.exec-run-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.exec-run-history-panel {
  padding: 10px 12px;
  border: 1px solid #eaecf0;
  border-radius: 10px;
  background: linear-gradient(180deg, #fff 0%, #fafbfc 100%);
}

.exec-run-history-panel--fallback {
  width: 100%;
  max-width: 640px;
}

.exec-run-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.exec-run-history-title {
  color: #344054;
  font-size: 13px;
  font-weight: 600;
}

.exec-run-history-count {
  color: #98a2b3;
  font-size: 12px;
}

.exec-run-history-track {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.exec-run-history-entry {
  border-radius: 10px;
}

.exec-run-history-entry.expanded .exec-run-history-item {
  border-bottom: none;
  border-radius: 10px 10px 0 0;
}

.exec-run-history-entry.expanded .exec-run-history-item.active {
  box-shadow: none;
}

.exec-run-history-detail {
  padding: 12px 14px 14px;
  border: 1px solid #e4b4bc;
  border-top: 1px solid #f2f4f7;
  border-radius: 0 0 10px 10px;
  background: #fff;
}

.exec-run-history-entry.expanded.exec-run-history-entry--is-pass .exec-run-history-detail {
  border-color: #abefc6;
  border-top-color: #ecfdf3;
}

.exec-run-history-entry.expanded.exec-run-history-entry--is-fail .exec-run-history-detail {
  border-color: #fecdca;
  border-top-color: #fef3f2;
}

.exec-run-history-entry.expanded.exec-run-history-entry--is-partial .exec-run-history-detail {
  border-color: #fedf89;
  border-top-color: #fffaeb;
}

.exec-run-history-entry .exec-run-results-header {
  margin-bottom: 10px;
}

.exec-run-history-item-trailing {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto;
}

.exec-run-history-item-chevron {
  color: #98a2b3;
  font-size: 11px;
  transition: transform 0.2s ease;
}

.exec-run-history-entry.expanded .exec-run-history-item-chevron {
  transform: rotate(180deg);
  color: #667085;
}

.exec-run-history-item-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  cursor: pointer;
}

.exec-run-history-rerun {
  flex-shrink: 0;
  width: 24px;
  min-width: 24px;
  height: 24px;
  padding: 0;
  color: #667085;
}

.exec-run-history-rerun:hover:not(:disabled) {
  color: #b42318;
  background: #fef3f2;
}

.exec-run-history-delete {
  flex-shrink: 0;
  width: 24px;
  min-width: 24px;
  height: 24px;
  padding: 0;
  color: #667085;
}

.exec-run-history-delete:hover:not(:disabled) {
  color: #b42318;
  background: #fef3f2;
}

.exec-run-history-item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #eef2f6;
  border-left: 3px solid #d0d5dd;
  border-radius: 8px;
  background: #fff;
  text-align: left;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
}

.exec-run-history-item:hover {
  border-color: #d0d5dd;
  background: #fcfcfd;
}

.exec-run-history-item.active {
  border-color: #e4b4bc;
  border-left-color: #8c1f3d;
  background: #fffafb;
  box-shadow: 0 1px 4px rgba(140, 31, 61, 0.06);
}

.exec-run-history-item--is-pass {
  border-left-color: #16a34a;
}

.exec-run-history-item--is-fail {
  border-left-color: #dc2626;
}

.exec-run-history-item--is-partial {
  border-left-color: #d97706;
}

.exec-run-history-item.active.exec-run-history-item--is-pass {
  border-color: #abefc6;
  background: #f6fef9;
}

.exec-run-history-item.active.exec-run-history-item--is-fail {
  border-color: #fecdca;
  background: #fffafb;
}

.exec-run-history-item.active.exec-run-history-item--is-partial {
  border-color: #fedf89;
  background: #fffaeb;
}

.exec-run-history-item-time {
  flex-shrink: 0;
  color: #667085;
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
  white-space: nowrap;
}

.exec-run-history-item-outcome {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  background: #f2f4f7;
  color: #667085;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}

.exec-run-history-item--is-pass .exec-run-history-item-outcome {
  background: #ecfdf3;
  color: #027a48;
}

.exec-run-history-item--is-fail .exec-run-history-item-outcome {
  background: #fef3f2;
  color: #b42318;
}

.exec-run-history-item--is-partial .exec-run-history-item-outcome {
  background: #fffaeb;
  color: #b54708;
}

.exec-run-history-item-stats {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 4px 10px;
  flex-wrap: wrap;
}

.exec-run-history-stat {
  color: #667085;
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
}

.exec-run-history-stat strong {
  margin-left: 2px;
  color: #344054;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.exec-run-history-stat--pass strong {
  color: #16a34a;
}

.exec-run-history-stat--fail strong {
  color: #dc2626;
}

.exec-run-history-stat--rate strong {
  color: #8c1f3d;
}

.exec-run-history-item-bar {
  display: block;
  height: 3px;
  border-radius: 999px;
  background: #f2f4f7;
  overflow: hidden;
}

.exec-run-history-item-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #16a34a;
  transition: width 0.2s ease;
}

.exec-run-history-item--is-fail .exec-run-history-item-bar i {
  background: #dc2626;
}

.exec-run-history-item--is-partial .exec-run-history-item-bar i {
  background: #d97706;
}

.exec-run-results {
  min-height: 0;
}

.exec-run-results-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.exec-run-results-title {
  margin: 0;
  color: #1d2939;
  font-size: 14px;
  font-weight: 600;
}

.exec-run-results-hint {
  color: #98a2b3;
  font-size: 12px;
  white-space: nowrap;
}

.exec-run-results-table :deep(.ant-table) {
  border: 1px solid #eaecf0;
  border-radius: 12px;
  overflow: visible;
}

.exec-run-results-table :deep(.ant-table-container),
.exec-run-results-table :deep(.ant-table-content),
.exec-run-results-table :deep(.ant-table-body) {
  overflow: visible !important;
}

.exec-run-results-table :deep(tr.ant-table-expanded-row > td.ant-table-cell) {
  padding: 12px 16px !important;
  overflow: visible;
  background: #fafbfc;
  border-bottom: 1px solid #eaecf0;
}

.exec-run-results-table :deep(.ant-table-expanded-row-fixed) {
  overflow: visible;
  margin: 0 !important;
  padding: 0 !important;
}

.exec-run-results-table :deep(.ant-table-thead > tr > th) {
  background: #f9fafb !important;
  color: #667085;
  font-size: 12px;
  font-weight: 500;
}

.exec-run-results-table :deep(.ant-table-tbody > tr > td) {
  font-size: 13px;
}

.exec-run-results-table :deep(.ant-table-tbody > tr:hover > td) {
  background: #fcfcfd !important;
}

.exec-run-results-table :deep(.exec-run-case-cell) {
  cursor: pointer;
}

.exec-run-case-title {
  color: #344054;
  font-weight: 500;
}

.exec-run-duration {
  color: #667085;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}

.exec-run-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
}

.exec-run-status-pill--sm {
  padding: 1px 8px;
  font-size: 11px;
}

.exec-run-status-pill--passed {
  background: #ecfdf3;
  color: #027a48;
}

.exec-run-status-pill--failed,
.exec-run-status-pill--error {
  background: #fef3f2;
  color: #b42318;
}

.exec-run-status-pill--running {
  background: #eff6ff;
  color: #175cd3;
}

.exec-run-expand {
  padding: 4px 0 8px;
  overflow: visible;
}

.linked-case-steps-tag {
  margin-inline-start: 6px;
  font-size: 11px;
  color: #475467;
}

.linked-case-steps {
  padding: 4px 0 8px;
}

.linked-case-step-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.linked-case-step-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border: 1px solid #eef2f6;
  border-radius: 8px;
  background: #fafbfc;
}

.linked-case-step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #8c1f3d;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}

.linked-case-step-name {
  min-width: 0;
  color: #1d2939;
  font-size: 13px;
  font-weight: 500;
}

.linked-case-step-target {
  margin-left: auto;
  max-width: 45%;
  overflow: hidden;
  color: #667085;
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.linked-case-steps-empty {
  color: #98a2b3;
  font-size: 12px;
}

.exec-run-step-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.exec-run-step-block {
  padding: 10px 12px;
  border: 1px solid #eaecf0;
  border-radius: 10px;
  background: #fcfcfd;
}

.exec-run-step-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.exec-run-step-index {
  padding: 1px 8px;
  border-radius: 999px;
  background: #8c1f3d;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}

.exec-run-step-name {
  min-width: 0;
  color: #1d2939;
  font-size: 13px;
}

.exec-run-empty {
  flex-direction: column;
  gap: 20px;
  padding: 24px 16px 32px;
}

.exec-set-empty-detail {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280px;
}

.exec-set-list-pagination {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 6px 8px 8px;
  border-top: 1px solid #eaecf0;
}

.exec-set-list-pagination :deep(.ant-pagination) {
  margin: 0;
  font-size: 12px;
}

.exec-set-list-pagination :deep(.ant-pagination-item),
.exec-set-list-pagination :deep(.ant-pagination-prev),
.exec-set-list-pagination :deep(.ant-pagination-next),
.exec-set-list-pagination :deep(.ant-pagination-jump-prev),
.exec-set-list-pagination :deep(.ant-pagination-jump-next) {
  min-width: 24px;
  height: 24px;
  line-height: 22px;
}

.exec-set-list-pagination :deep(.ant-pagination-item a) {
  padding: 0 4px;
}

.exec-set-list-pagination :deep(.ant-pagination-options) {
  margin-inline-start: 4px;
}

.exec-set-list-pagination :deep(.ant-pagination-options-size-changer.ant-select) {
  font-size: 12px;
}

.exec-set-list-pagination :deep(.ant-select-single .ant-select-selector) {
  height: 24px !important;
  padding: 0 8px !important;
}

.exec-set-list-pagination :deep(.ant-select-single .ant-select-selection-item) {
  line-height: 22px !important;
}

@media (max-width: 1100px) {
  .exec-run-history-item-main {
    flex-wrap: wrap;
    row-gap: 4px;
  }

  .exec-run-history-item-outcome {
    order: 0;
  }

  .exec-run-history-item-trailing {
    order: 1;
  }

  .exec-run-history-item-stats {
    order: 2;
    flex-basis: 100%;
  }

  .exec-run-results-header {
    flex-direction: column;
    align-items: flex-start;
  }
}

.run-detail-table {
  margin-top: 12px;
}
.manage-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #f0f5ff;
  color: #1d2939;
  font-size: 12px;
  line-height: 1.5;
}
.manage-hint :deep(.anticon) {
  color: #3b82f6;
  font-size: 14px;
  flex-shrink: 0;
}

.manage-cases-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 4px;
  font-size: 12px;
}

.manage-cases-toolbar-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.manage-cases-version-filter {
  width: 112px;
}

.manage-cases-channel-filter {
  width: 112px;
}

.manage-cases-selection {
  color: var(--cf-text-secondary, #667085);
  font-size: 12px;
}
.manage-cases-selection strong {
  color: var(--cf-brand, #b60f2d);
  font-weight: 600;
}

.manage-case-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 380px;
  overflow: auto;
  padding: 2px;
}

.manage-case-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto 36px;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--cf-border, #eaecf0);
  border-radius: 8px;
  background: var(--cf-surface, #fff);
  cursor: pointer;
  transition: all 0.15s ease;
}

.manage-case-row:hover {
  border-color: var(--cf-border-input, #d0d5dd);
  background: #fafbfc;
  box-shadow: 0 1px 3px rgb(16 24 40 / 6%);
}

.manage-case-row--selected {
  border-color: var(--cf-brand-border, #e7b8c0);
  background: var(--cf-brand-soft, #fff5f6);
}

.manage-case-main {
  min-width: 0;
}

.manage-case-main strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.45;
  color: var(--cf-text, #1d2939);
}

.manage-case-main small {
  display: block;
  margin-top: 2px;
  color: var(--cf-text-muted, #98a2b3);
  font-size: 11px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  letter-spacing: 0.02em;
}

/* ===== 执行协议徽标 ===== */
.case-profile-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  letter-spacing: 0.03em;
  white-space: nowrap;
  line-height: 1.4;
}
.case-profile-badge::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}
.case-profile-badge.profile-blue {
  background: #eff6ff;
  color: #2563eb;
}
.case-profile-badge.profile-blue::before { background: #3b82f6; }
.case-profile-badge.profile-orange {
  background: #fff7ed;
  color: #c2410c;
}
.case-profile-badge.profile-orange::before { background: #f97316; }
.case-profile-badge.profile-purple {
  background: #faf5ff;
  color: #7c3aed;
}
.case-profile-badge.profile-purple::before { background: #a855f7; }
.case-profile-badge.profile-green {
  background: #f0fdf4;
  color: #16a34a;
}
.case-profile-badge.profile-green::before { background: #22c55e; }
.case-profile-badge.profile-default {
  background: #f4f4f5;
  color: #52525b;
}
.case-profile-badge.profile-default::before { background: #a1a1aa; }

.polarity-pill--sm {
  min-width: 28px;
  padding: 2px 8px;
  font-size: 12px;
}

.polarity-pill.positive {
  border: 1px solid #abefc6;
  background: #ecfdf3;
  color: #067647;
}

.polarity-pill.negative {
  border: 1px solid #fca5a5;
  background: #fef2f2;
  color: #b91c1c;
}

.polarity-pill {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-weight: 600;
}

.manage-case-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 0;
}
.manage-case-empty-icon {
  font-size: 40px;
  color: var(--cf-text-muted, #98a2b3);
  opacity: 0.35;
}
.manage-case-empty p {
  margin: 0;
  font-size: 13px;
  color: var(--cf-text-muted, #98a2b3);
}

.manage-cases-pagination {
  display: flex;
  justify-content: center;
  margin-top: 12px;
  padding-top: 14px;
  border-top: 1px solid var(--cf-border, #eaecf0);
}

.manage-cases-pagination :deep(.ant-pagination) {
  margin: 0;
  font-size: 12px;
}

.run-modal-form {
  margin-top: 4px;
}

.run-form-hint {
  margin: 0;
  color: #667085;
  font-size: 12px;
  line-height: 1.5;
}

.empty-state {
  margin: 48px 0;
}
</style>
