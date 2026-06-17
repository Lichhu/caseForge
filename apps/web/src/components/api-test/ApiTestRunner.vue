<template>
  <section class="panel constraint-panel dynamic-instruction-panel api-runner-panel">
    <div class="panel-header dynamic-panel-header">
      <div class="dynamic-panel-intro">
        <div>
          <h2>执行平台</h2>
          <p>维护环境与执行集，查看执行状态与结果</p>
        </div>
      </div>
      <div class="toolbar dynamic-panel-toolbar action-toolbar">
        <a-button @click="envModalOpen = true">
          <template #icon><SettingOutlined /></template>
          环境维护
        </a-button>
        <a-button type="primary" @click="openCreateSet">
          <template #icon><PlusOutlined /></template>
          新建执行集
        </a-button>
        <a-button :type="batchDeleteMode ? 'primary' : 'default'" @click="toggleBatchDeleteMode">
          {{ batchDeleteMode ? '退出批量' : '批量删除' }}
        </a-button>
      </div>
    </div>

    <div v-if="apiStore.executionSetListTotal" class="dynamic-layout">
      <div class="test-point-list test-point-list-panel">
        <div class="test-point-list-head">
          <strong>执行集</strong>
          <span>{{ apiStore.executionSetListTotal }} 个</span>
        </div>
        <div v-if="batchDeleteMode" class="list-toolbar batch-list-toolbar exec-set-list-toolbar">
          <a-checkbox
            :checked="allSetsSelected"
            :indeterminate="setSelectionIndeterminate"
            @change="toggleSelectAllSets"
          >
            全选当前页
          </a-checkbox>
          <span class="exec-set-list-selection">
            已选 {{ selectedSetIds.length }} / {{ apiStore.executionSetListTotal }}
          </span>
        </div>
        <div class="test-point-list-scroll">
          <article
            v-for="set in apiStore.executionSets"
            :key="set.id"
            class="test-point-card browse-card exec-set-card"
            :class="{
              active: isActiveSetCard(set.id),
              'batch-card': batchDeleteMode,
            }"
            @click="handleSetCardClick(set.id)"
          >
            <div class="test-point-card-head">
              <a-checkbox
                v-if="batchDeleteMode"
                :checked="selectedSetIds.includes(set.id)"
                @click.stop
                @change="(e: unknown) => onToggleSetSelect(set.id, readCheckboxChecked(e))"
              />
              <div class="test-point-card-title">
                <strong>{{ set.name }}</strong>
                <small>{{ set.caseCount ?? 0 }} 条案例</small>
              </div>
              <div class="test-point-card-status">
                <a-tag v-if="set.lastRunStatus" :color="runStatusColor(set.lastRunStatus)">
                  {{ runStatusLabel(set) }}
                </a-tag>
                <a-tag v-else>未执行</a-tag>
              </div>
            </div>
          </article>
        </div>
        <div v-if="showExecutionSetPagination" class="exec-set-list-pagination">
          <a-pagination
            size="small"
            :current="apiStore.executionSetListPage"
            :page-size="apiStore.executionSetListPageSize"
            :total="apiStore.executionSetListTotal"
            :show-size-changer="true"
            :page-size-options="pageSizeOptions"
            @change="onExecutionSetPageChange"
            @showSizeChange="onExecutionSetPageChange"
          />
        </div>
      </div>

      <div class="instruction-editor instruction-editor-panel">
        <div
          v-if="batchDeleteMode && selectedSetIds.length"
          class="instruction-editor-shell"
        >
          <div class="instruction-editor-body">
            <div class="editor-hero editor-hero-batch">
              <div>
                <h3>已选 {{ selectedSetIds.length }} 个执行集</h3>
                <p>确认后可批量删除所选执行集</p>
              </div>
              <a-tag color="processing">批量删除</a-tag>
            </div>
            <div class="editor-block">
              <div class="editor-block-title">已选执行集</div>
              <ul class="batch-set-summary-list">
                <li
                  v-for="row in selectedSetRows"
                  :key="row.id"
                  class="batch-set-summary-item"
                >
                  <strong class="batch-set-summary-title" :title="row.name">
                    {{ row.name }}
                  </strong>
                  <span class="batch-set-summary-meta">
                    {{ row.caseCount ?? 0 }} 条案例
                  </span>
                  <span class="batch-set-summary-status">
                    {{ runStatusLabel(row) }}
                  </span>
                </li>
                <li
                  v-if="selectedSetIds.length > selectedSetRows.length"
                  class="batch-set-summary-more"
                >
                  另有 {{ selectedSetIds.length - selectedSetRows.length }} 个在其他分页
                </li>
              </ul>
            </div>
          </div>
          <div class="instruction-editor-footer dynamic-editor-footer action-toolbar">
            <a-button danger :disabled="!selectedSetIds.length" @click="onBatchDeleteSets">
              <template #icon><DeleteOutlined /></template>
              批量删除
            </a-button>
          </div>
        </div>

        <div v-else-if="activeSet && !batchDeleteMode" class="instruction-editor-shell">
          <div class="instruction-editor-body">
            <div class="exec-set-detail-header">
              <div class="exec-set-detail-intro">
                <h3>{{ activeSet.name }}</h3>
                <p>
                  {{ activeSet.caseCount ?? 0 }} 条案例
                  <span class="exec-set-detail-divider">·</span>
                  {{ runStatusLabel(activeSet) }}
                </p>
              </div>
              <div class="exec-set-actions action-toolbar">
                <a-button
                  type="primary"
                  :disabled="!activeSet.caseCount"
                  @click="openRunModal"
                >
                  执行
                </a-button>
                <a-button @click="openManageCases">管理案例</a-button>
              </div>
            </div>

            <div class="exec-set-detail-tabs">
              <a-segmented v-model:value="detailTab" :options="detailTabOptions" />
            </div>

            <div v-if="detailTab === 'cases'" class="exec-linked-case-detail">
              <a-table
                v-if="linkedSetCases.length"
                class="run-detail-table"
                size="small"
                row-key="id"
                :data-source="linkedSetCases"
                :columns="linkedCaseColumns"
                :pagination="false"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'profile'">
                    <a-tag size="small" :color="caseProfileColor(record.request)">
                      {{ caseProfileLabel(record.request) }}
                    </a-tag>
                  </template>
                  <template v-else-if="column.key === 'polarity'">
                    <span class="polarity-pill polarity-pill--sm" :class="record.polarity">
                      {{ record.polarity === 'negative' ? '反' : '正' }}
                    </span>
                  </template>
                  <template v-else-if="column.key === 'actions'">
                    <a-button size="small" danger type="link" @click="removeLinkedCase(record.id)">
                      移除
                    </a-button>
                  </template>
                </template>
              </a-table>
              <div v-else class="exec-set-empty-detail">
                <a-empty
                  :description="
                    (activeSet?.caseCount ?? 0) > 0
                      ? '关联案例加载失败或案例已不可见，请刷新页面后重试'
                      : '请先「管理案例」添加案例后再执行'
                  "
                />
              </div>
            </div>

            <div v-else-if="apiStore.activeRun" class="exec-run-detail">
            <a-descriptions bordered size="small" :column="3">
              <a-descriptions-item label="总数">{{ apiStore.activeRun.totalCount }}</a-descriptions-item>
              <a-descriptions-item label="通过">{{ apiStore.activeRun.passedCount }}</a-descriptions-item>
              <a-descriptions-item label="失败">
                {{ apiStore.activeRun.failedCount + apiStore.activeRun.errorCount }}
              </a-descriptions-item>
            </a-descriptions>
            <h3 class="run-history-title">执行历史</h3>
            <a-list size="small" :data-source="apiStore.transactionRuns" bordered>
              <template #renderItem="{ item }">
                <a-list-item
                  class="run-item"
                  :class="{ active: item.id === apiStore.activeRun?.id }"
                  @click="selectRun(item.id)"
                >
                  <div>
                    <div>{{ formatTime(item.createdAt) }}</div>
                    <small>通过 {{ item.passedCount }}/{{ item.totalCount }}</small>
                  </div>
                </a-list-item>
              </template>
            </a-list>
            <a-table
              class="run-detail-table"
              size="small"
              row-key="id"
              :data-source="apiStore.activeRun.items"
              :columns="itemColumns"
              :pagination="false"
              :expanded-row-keys="expandedKeys"
              @expand="onExpand"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'status'">
                  <a-tag :color="runItemStatusColor(record.status)">
                    {{ runItemStatusLabel(record.status) }}
                  </a-tag>
                </template>
              </template>
              <template #expandedRowRender="{ record }">
                <a-tabs size="small">
                  <a-tab-pane key="req" tab="请求">
                    <pre>{{ JSON.stringify(record.requestSnapshot, null, 2) }}</pre>
                  </a-tab-pane>
                  <a-tab-pane key="res" tab="响应">
                    <pre>{{ JSON.stringify(record.responseSnapshot, null, 2) }}</pre>
                  </a-tab-pane>
                  <a-tab-pane key="assert" tab="断言比对">
                    <a-table
                      size="small"
                      :pagination="false"
                      :data-source="record.assertions"
                      :columns="assertionColumns"
                      row-key="name"
                    >
                      <template #bodyCell="{ column, record: assertion }">
                        <template v-if="column.key === 'passed'">
                          <a-tag :color="assertion.passed ? 'success' : 'error'">
                            {{ assertion.passed ? '通过' : '失败' }}
                          </a-tag>
                        </template>
                      </template>
                    </a-table>
                  </a-tab-pane>
                </a-tabs>
              </template>
            </a-table>
            </div>
            <div v-else class="exec-set-empty-detail">
              <a-empty
                :description="
                  apiStore.transactionRuns.length
                    ? '请从下方执行历史选择一次执行记录'
                    : '尚未执行，添加案例后点击「执行」'
                "
              />
              <a-list
                v-if="apiStore.transactionRuns.length"
                size="small"
                class="run-history-fallback"
                :data-source="apiStore.transactionRuns"
                bordered
              >
                <template #renderItem="{ item }">
                  <a-list-item class="run-item" @click="selectRun(item.id)">
                    <div>
                      <div>{{ formatTime(item.createdAt) }}</div>
                      <small>通过 {{ item.passedCount }}/{{ item.totalCount }}</small>
                    </div>
                  </a-list-item>
                </template>
              </a-list>
            </div>
          </div>
          <div class="instruction-editor-footer dynamic-editor-footer action-toolbar">
            <a-button danger @click="onDeleteSet">
              <template #icon><DeleteOutlined /></template>
              删除
            </a-button>
          </div>
        </div>
        <div v-else class="instruction-editor-placeholder">
          <a-empty
            :description="
              batchDeleteMode
                ? '请从左侧勾选要删除的执行集'
                : '请选择左侧执行集'
            "
          />
        </div>
      </div>
    </div>

    <a-empty v-else class="empty-state" description="暂无执行集，请先新建并引入案例" />

    <ApiEnvironmentMaintainModal v-model:open="envModalOpen" />

    <a-modal v-model:open="createSetOpen" title="新建执行集" @ok="onCreateSet">
      <a-form layout="vertical">
        <a-form-item label="执行集名称" required>
          <a-input v-model:value="newSetName" placeholder="如 冒烟测试集" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="manageCasesOpen"
      title="管理执行集案例"
      width="760px"
      :confirm-loading="manageCasesSaving"
      @ok="onSaveCases"
    >
      <p class="manage-hint">同一执行集内案例不可重复；同一案例可被多个执行集引用。</p>
      <div class="manage-cases-toolbar">
        <a-checkbox
          :checked="allManageCasesSelected"
          :indeterminate="manageCasesSelectionIndeterminate"
          @change="toggleSelectAllManageCases"
        >
          全选当前页
        </a-checkbox>
        <span class="manage-cases-selection">已选 {{ selectedCaseIds.length }} 条</span>
      </div>
      <a-spin :spinning="manageCasesLoading">
        <div v-if="manageCasesList.length" class="manage-case-list">
          <label
            v-for="item in manageCasesList"
            :key="item.id"
            class="manage-case-row"
          >
            <a-checkbox
              :checked="selectedCaseIds.includes(item.id)"
              @change="(e: unknown) => onToggleManageCase(item.id, readCheckboxChecked(e))"
            />
            <div class="manage-case-main">
              <strong :title="item.title">{{ item.title || '未命名案例' }}</strong>
              <small>{{ item.caseNo || item.transactionCode || '待分配编号' }}</small>
            </div>
            <a-tag size="small" :color="caseProfileColor(item.request)">
              {{ caseProfileLabel(item.request) }}
            </a-tag>
            <span class="polarity-pill polarity-pill--sm" :class="item.polarity">
              {{ item.polarity === 'negative' ? '反' : '正' }}
            </span>
          </label>
        </div>
        <a-empty v-else class="manage-case-empty" description="暂无案例，请先在案例编辑中创建" />
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
      ok-text="开始执行"
      cancel-text="取消"
      :confirm-loading="apiStore.running"
      @ok="onConfirmRun"
    >
      <a-form layout="vertical" class="run-modal-form">
        <a-form-item label="环境" required>
          <a-select
            v-model:value="runForm.environmentId"
            placeholder="选择执行环境"
            :options="envOptions"
            @change="onRunEnvChange"
          />
        </a-form-item>
        <a-form-item v-if="runServiceOptions.length" label="优先环境服务（可选）">
          <a-select
            v-model:value="runForm.environmentServiceId"
            placeholder="不选则按案例协议自动匹配 HTTP/TCP 服务"
            allow-clear
            :options="runServiceOptions"
          />
        </a-form-item>
        <a-form-item label="传输给接口的编码格式" required>
          <a-select
            v-model:value="runForm.encoding"
            placeholder="选择编码"
            :options="encodingOptions"
          />
        </a-form-item>
        <p class="run-form-hint">
          不选择服务时会按案例协议自动匹配当前环境下的 HTTP/TCP 服务；TCP 报文按所选编码和服务长度前缀发送。
        </p>
      </a-form>
    </a-modal>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { DeleteOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons-vue';
import {
  caseForgePageSizeOptionLabels,
  executionProfileBadgeColor,
  normalizeCaseForgePageSize,
  resolveExecutionProfile,
} from '@case-forge/shared';
import type { ApiCaseRequest } from '@case-forge/shared';
import ApiEnvironmentMaintainModal from '@/components/api-test/ApiEnvironmentMaintainModal.vue';
import { useApiTestStore } from '@/stores/apiTest';
import type { ApiExecutionSetRow, ApiTestCaseRow } from '@/api/apiTestClient';
import { listApiCases } from '@/api/apiTestClient';

const apiStore = useApiTestStore();
const pageSizeOptions = caseForgePageSizeOptionLabels();
const envModalOpen = ref(false);
const createSetOpen = ref(false);
const manageCasesOpen = ref(false);
const runModalOpen = ref(false);
const batchDeleteMode = ref(false);
const newSetName = ref('');
const selectedCaseIds = ref<string[]>([]);
const selectedSetIds = ref<string[]>([]);
const expandedKeys = ref<string[]>([]);
const manageCasesList = ref<ApiTestCaseRow[]>([]);
const manageCasesPage = ref(1);
const manageCasesPageSize = ref(normalizeCaseForgePageSize(10));
const manageCasesTotal = ref(0);
const manageCasesLoading = ref(false);
const manageCasesSaving = ref(false);
const detailTab = ref<'cases' | 'result'>('cases');
const detailTabOptions = [
  { label: '关联案例', value: 'cases' },
  { label: '执行结果', value: 'result' },
];

const encodingOptions = [
  { label: 'GBK', value: 'GBK' },
  { label: 'UTF-8', value: 'UTF-8' },
];

const runForm = reactive({
  environmentId: '',
  environmentServiceId: '',
  encoding: 'GBK',
});

const activeSet = computed(() => apiStore.activeExecutionSet);

const setLookup = computed(() => {
  const map = new Map<string, ApiExecutionSetRow>();
  for (const row of apiStore.executionSets) {
    map.set(row.id, row);
  }
  if (apiStore.activeExecutionSet) {
    map.set(apiStore.activeExecutionSet.id, apiStore.activeExecutionSet);
  }
  return map;
});

const selectedSetRows = computed(() =>
  selectedSetIds.value
    .map((id) => setLookup.value.get(id))
    .filter((row): row is ApiExecutionSetRow => Boolean(row)),
);

const allSetsSelected = computed(
  () =>
    apiStore.executionSets.length > 0 &&
    apiStore.executionSets.every((item) => selectedSetIds.value.includes(item.id)),
);

const setSelectionIndeterminate = computed(() => {
  const pageIds = apiStore.executionSets.map((item) => item.id);
  const selectedOnPage = pageIds.filter((id) => selectedSetIds.value.includes(id));
  return selectedOnPage.length > 0 && selectedOnPage.length < pageIds.length;
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

const showExecutionSetPagination = computed(() => apiStore.executionSetListTotal > 0);

const linkedSetCases = computed(() => {
  const ids = activeSet.value?.caseIds ?? [];
  if (!ids.length) return [];
  const caseMap = new Map(apiStore.runnerCases.map((item) => [item.id, item]));
  return ids.map((id) => caseMap.get(id)).filter((item): item is ApiTestCaseRow => Boolean(item));
});

function caseProfileLabel(request: ApiCaseRequest) {
  return resolveExecutionProfile(request).label;
}

function caseProfileColor(request: ApiCaseRequest) {
  return executionProfileBadgeColor(resolveExecutionProfile(request).transport);
}

const envOptions = computed(() =>
  apiStore.environments.map((e) => ({ label: e.name, value: e.id })),
);

const runServiceOptions = computed(() => {
  const services = apiStore.environmentServices[runForm.environmentId] ?? [];
  return services.map((item) => ({
    label: item.pathPrefix ? `${item.name} (${item.pathPrefix})` : item.name,
    value: item.id,
  }));
});

watch(
  () => runForm.environmentId,
  async (environmentId) => {
    const projectId = apiStore.activeProjectId;
    if (projectId && environmentId) {
      await apiStore.refreshEnvironmentServices(projectId, environmentId);
    }
    runForm.environmentServiceId = '';
  },
);

const itemColumns = [
  { title: '案例', dataIndex: 'caseTitle', key: 'caseTitle' },
  { title: '状态', dataIndex: 'status', key: 'status', width: 88 },
  { title: '耗时(ms)', dataIndex: 'durationMs', width: 96 },
];

const linkedCaseColumns = [
  { title: '案例', dataIndex: 'title', key: 'title', ellipsis: true },
  { title: '编号', dataIndex: 'caseNo', key: 'caseNo', width: 220 },
  { title: '协议', key: 'profile', width: 110 },
  { title: '方向', key: 'polarity', width: 72 },
  { title: '操作', key: 'actions', width: 72 },
];

const assertionColumns = [
  { title: '断言', dataIndex: 'name', key: 'name' },
  { title: '结果', key: 'passed', width: 72 },
  { title: '期望', dataIndex: 'expected', key: 'expected', ellipsis: true },
  { title: '实际', dataIndex: 'actual', key: 'actual', ellipsis: true },
];

function runStatusColor(status: string) {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'error';
  return 'processing';
}

function runItemStatusColor(status: string) {
  if (status === 'passed') return 'success';
  if (status === 'failed' || status === 'error') return 'error';
  return 'processing';
}

function runItemStatusLabel(status: string) {
  if (status === 'passed') return '通过';
  if (status === 'failed') return '失败';
  if (status === 'error') return '异常';
  if (status === 'running') return '执行中';
  return status || '未执行';
}

function runStatusLabel(set: ApiExecutionSetRow) {
  if (!set.lastRunStatus) return '未执行';
  if (set.lastRunStatus === 'running') return '执行中';
  return `通过 ${set.lastPassedCount ?? 0}/${set.lastTotalCount ?? 0}`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

function toggleBatchDeleteMode() {
  batchDeleteMode.value = !batchDeleteMode.value;
  if (batchDeleteMode.value) {
    selectedSetIds.value = [];
    return;
  }
  if (apiStore.activeExecutionSetId) {
    selectedSetIds.value = [apiStore.activeExecutionSetId];
  }
}

function isActiveSetCard(setId: string) {
  if (batchDeleteMode.value) {
    return selectedSetIds.value.includes(setId);
  }
  return setId === apiStore.activeExecutionSetId;
}

function handleSetCardClick(setId: string) {
  if (batchDeleteMode.value) {
    const checked = !selectedSetIds.value.includes(setId);
    onToggleSetSelect(setId, checked);
    return;
  }
  selectSet(setId);
}

function onToggleSetSelect(setId: string, checked: boolean) {
  if (checked) {
    if (!selectedSetIds.value.includes(setId)) {
      selectedSetIds.value = [...selectedSetIds.value, setId];
    }
  } else {
    selectedSetIds.value = selectedSetIds.value.filter((id) => id !== setId);
  }
}

function toggleSelectAllSets(event: { target: { checked: boolean } }) {
  const checked = event.target.checked;
  if (checked) {
    const pageIds = apiStore.executionSets.map((item) => item.id);
    selectedSetIds.value = [...new Set([...selectedSetIds.value, ...pageIds])];
    return;
  }
  const pageIdSet = new Set(apiStore.executionSets.map((item) => item.id));
  selectedSetIds.value = selectedSetIds.value.filter((id) => !pageIdSet.has(id));
}

function readCheckboxChecked(event: unknown) {
  const target = (event as { target?: { checked?: boolean } })?.target;
  return Boolean(target?.checked);
}

async function ensureLinkedCasesLoaded() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  const caseIds = activeSet.value?.caseIds ?? [];
  if (!projectId || !transactionId || !caseIds.length) {
    return;
  }
  const loadedIds = new Set(apiStore.runnerCases.map((item) => item.id));
  if (!apiStore.runnerCases.length || caseIds.some((id) => !loadedIds.has(id))) {
    await apiStore.refreshRunnerCases(projectId, transactionId);
  }
}

function selectSet(setId: string) {
  detailTab.value = 'cases';
  apiStore.selectExecutionSet(setId);
  const set = apiStore.activeExecutionSet;
  if (set?.lastRunId) {
    void loadRun(set.lastRunId);
  } else {
    apiStore.activeRun = null;
  }
  void ensureLinkedCasesLoaded();
}

function onExecutionSetPageChange(page: number, pageSize: number) {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) return;
  const size = normalizeCaseForgePageSize(pageSize);
  const sizeChanged = size !== apiStore.executionSetListPageSize;
  void apiStore.refreshExecutionSets(projectId, transactionId, {
    page: sizeChanged ? 1 : page,
    pageSize: size,
  });
}

function openCreateSet() {
  newSetName.value = `${apiStore.activeTransaction?.code ?? '交易码'}-执行集`;
  createSetOpen.value = true;
}

async function onCreateSet() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId || !newSetName.value.trim()) return;
  await apiStore.createExecutionSet(projectId, transactionId, {
    name: newSetName.value.trim(),
  });
  createSetOpen.value = false;
}

function openManageCases() {
  void openManageCasesAsync();
}

async function openManageCasesAsync() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (projectId && transactionId) {
    await Promise.all([
      apiStore.refreshRunnerCases(projectId, transactionId),
      apiStore.refreshExecutionSets(projectId, transactionId),
    ]);
  }
  const validCaseIdSet = new Set(apiStore.runnerCases.map((item) => item.id));
  const executionCaseIds = activeSet.value?.caseIds ?? [];
  const staleCount = executionCaseIds.filter((id) => !validCaseIdSet.has(id)).length;
  selectedCaseIds.value = executionCaseIds.filter((id) => validCaseIdSet.has(id));
  if (staleCount > 0) {
    message.warning(`已忽略 ${staleCount} 条已删除或不可见的案例`);
  }
  manageCasesPage.value = 1;
  manageCasesOpen.value = true;
  await loadManageCasesList();
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
    });
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
  const setId = apiStore.activeExecutionSetId || activeSet.value?.id;
  if (!projectId || !transactionId || !setId) {
    message.warning('缺少项目、交易码或执行集信息，请重新选择执行集');
    return;
  }
  manageCasesSaving.value = true;
  try {
    await apiStore.refreshRunnerCases(projectId, transactionId);
    const validIdSet = new Set(apiStore.runnerCases.map((item) => item.id));
    const caseIds = selectedCaseIds.value.filter((id) => validIdSet.has(id));
    const dropped = selectedCaseIds.value.length - caseIds.length;
    if (!caseIds.length) {
      message.warning('请至少选择一条有效案例');
      return;
    }
    if (dropped > 0) {
      message.warning(`已自动移除 ${dropped} 条无效或已删除的案例`);
    }
    await apiStore.replaceExecutionSetCases(
      projectId,
      transactionId,
      setId,
      caseIds,
    );
    detailTab.value = 'cases';
    manageCasesOpen.value = false;
  } catch (error) {
    const responseMessage = (error as { response?: { data?: { message?: string } } })
      ?.response?.data?.message;
    message.error(responseMessage || (error as Error)?.message || '保存执行集案例失败');
  } finally {
    manageCasesSaving.value = false;
  }
}

function inferDefaultEncoding() {
  const cases = apiStore.runnerCases;
  const tcpCase = cases.find((item) => item.request.transport === 'tcp');
  if (tcpCase?.request.encoding?.toUpperCase().includes('GBK')) {
    return 'GBK';
  }
  if (tcpCase?.request.encoding) {
    return tcpCase.request.encoding.toUpperCase().includes('UTF') ? 'UTF-8' : tcpCase.request.encoding;
  }
  return cases.some((item) => item.request.transport === 'tcp') ? 'GBK' : 'UTF-8';
}

function openRunModal() {
  if (!apiStore.environments.length) {
    message.warning('请先创建执行环境');
    envModalOpen.value = true;
    return;
  }
  runForm.environmentId =
    apiStore.selectedEnvironmentId || apiStore.environments[0]?.id || '';
  runForm.environmentServiceId = apiStore.selectedEnvironmentServiceId || '';
  runForm.encoding = inferDefaultEncoding();
  runModalOpen.value = true;
  const projectId = apiStore.activeProjectId;
  if (projectId && runForm.environmentId) {
    void apiStore.refreshEnvironmentServices(projectId, runForm.environmentId);
  }
}

function onRunEnvChange() {
  runForm.environmentServiceId = '';
}

async function onConfirmRun() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  const setId = apiStore.activeExecutionSetId;
  if (!projectId || !transactionId || !setId) {
    return Promise.reject();
  }
  if (!runForm.environmentId) {
    message.warning('请选择环境');
    return Promise.reject();
  }
  if (!runForm.encoding) {
    message.warning('请选择传输编码');
    return Promise.reject();
  }
  await apiStore.runExecutionSet(projectId, transactionId, setId, {
    environmentId: runForm.environmentId,
    environmentServiceId: runForm.environmentServiceId || undefined,
    encoding: runForm.encoding,
  });
  detailTab.value = 'result';
  runModalOpen.value = false;
}

function removeLinkedCase(caseId: string) {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  const setId = apiStore.activeExecutionSetId;
  if (!projectId || !transactionId || !setId || !activeSet.value) return;
  const nextCaseIds = (activeSet.value.caseIds ?? []).filter((id) => id !== caseId);
  Modal.confirm({
    title: '移除该案例？',
    content: '仅从当前执行集中移除，不会删除案例本身。',
    okText: '移除',
    cancelText: '取消',
    okType: 'danger',
    onOk: () =>
      apiStore.replaceExecutionSetCases(
        projectId,
        transactionId,
        setId,
        nextCaseIds,
      ),
  });
}

function onDeleteSet() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  const setId = apiStore.activeExecutionSetId;
  if (!projectId || !transactionId || !setId) return;
  Modal.confirm({
    title: '删除执行集？',
    content: '删除后不影响案例本身，其它执行集仍可引用相同案例。',
    okText: '删除',
    cancelText: '取消',
    okType: 'danger',
    onOk: () => apiStore.removeExecutionSet(projectId, transactionId, setId),
  });
}

function onBatchDeleteSets() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId || !selectedSetIds.value.length) return;
  const count = selectedSetIds.value.length;
  Modal.confirm({
    title: `删除选中的 ${count} 个执行集？`,
    content: '删除后不影响案例本身，其它执行集仍可引用相同案例。',
    okText: '删除',
    cancelText: '取消',
    okType: 'danger',
    onOk: async () => {
      await apiStore.removeExecutionSets(
        projectId,
        transactionId,
        [...selectedSetIds.value],
      );
      selectedSetIds.value = [];
      batchDeleteMode.value = false;
    },
  });
}

async function selectRun(runId: string) {
  detailTab.value = 'result';
  await loadRun(runId);
}

watch(
  () => apiStore.activeExecutionSetId,
  () => {
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

.exec-set-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #eaecf0;
}

.exec-set-detail-intro h3 {
  margin: 0 0 4px;
  font-size: 16px;
  line-height: 1.4;
}

.exec-set-detail-intro p {
  margin: 0;
  color: #667085;
  font-size: 13px;
}

.exec-set-detail-divider {
  margin: 0 4px;
}

.exec-set-actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
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
  min-height: 0;
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
  .exec-set-detail-header {
    flex-direction: column;
  }

  .exec-set-actions {
    justify-content: flex-start;
  }
}

.run-history-title {
  margin: 16px 0 8px;
  font-size: 14px;
}
.run-item {
  cursor: pointer;
}
.run-item.active {
  background: var(--cf-brand-soft, #fff5f6);
}
.run-detail-table {
  margin-top: 12px;
}
.manage-hint {
  margin-bottom: 12px;
  color: #64748b;
  font-size: 13px;
}

.manage-cases-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 12px;
}

.manage-cases-selection {
  color: #667085;
}

.manage-case-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow: auto;
}

.manage-case-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 108px 40px;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

.manage-case-row:hover {
  border-color: #d0d5dd;
  background: #fcfcfd;
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
  line-height: 1.45;
}

.manage-case-main small {
  display: block;
  margin-top: 2px;
  color: #667085;
  font-size: 12px;
}

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
  border: 1px solid #fedf89;
  background: #fffaeb;
  color: #b54708;
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
  margin: 24px 0;
}

.manage-cases-pagination {
  display: flex;
  justify-content: center;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eaecf0;
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
pre {
  font-size: 12px;
  max-height: 240px;
  overflow: auto;
  background: #f8fafc;
  padding: 8px;
  border-radius: 6px;
}
</style>
