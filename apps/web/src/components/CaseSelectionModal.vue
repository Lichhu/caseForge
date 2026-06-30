<template>
  <a-modal
    :open="open"
    :width="960"
    wrap-class-name="case-selection-modal"
    :z-index="IMMERSIVE_OVERLAY_Z_INDEX"
    destroy-on-close
    @update:open="onOpenChange"
  >
    <template #title>
      <div class="case-modal-title">
        <span class="case-modal-title-text">{{ modalTitle }}</span>
        <a
          v-if="mode === 'excel'"
          class="case-template-link"
          @click.prevent="emit('downloadTemplate')"
        >
          <DownloadOutlined />
          点击下载导入模板
        </a>
      </div>
    </template>

    <div class="case-select-panel">
      <section class="case-select-filter-card">
        <div class="case-filter-row">
          <div class="case-filter-item">
            <label class="case-filter-label" for="case-system-filter">系统</label>
            <a-tooltip :title="selectedSystem || undefined">
              <a-select
                id="case-system-filter"
                v-model:value="selectedSystem"
                class="case-filter-control"
                placeholder="全部系统"
                allow-clear
                show-search
                :dropdown-match-select-width="false"
                popup-class-name="case-select-dropdown"
                :disabled="!systemOptions.length"
                :options="systemOptions"
                :filter-option="filterRequirementOption"
              />
            </a-tooltip>
          </div>
          <div class="case-filter-item">
            <label class="case-filter-label" for="case-module-filter">功能模块</label>
            <a-tooltip :title="selectedModule || undefined">
              <a-select
                id="case-module-filter"
                v-model:value="selectedModule"
                class="case-filter-control"
                placeholder="全部功能模块"
                allow-clear
                show-search
                :dropdown-match-select-width="false"
                popup-class-name="case-select-dropdown"
                :disabled="!moduleOptions.length"
                :options="moduleOptions"
                :filter-option="filterRequirementOption"
              />
            </a-tooltip>
          </div>
          <div class="case-filter-item">
            <label class="case-filter-label" for="case-requirement-filter">测试要点</label>
            <a-tooltip :title="selectedRequirement || undefined">
              <a-select
                id="case-requirement-filter"
                v-model:value="selectedRequirement"
                class="case-filter-control"
                placeholder="全部测试要点"
                allow-clear
                show-search
                :dropdown-match-select-width="false"
                popup-class-name="case-select-dropdown"
                :disabled="!requirementOptions.length"
                :options="requirementOptions"
                :filter-option="filterRequirementOption"
              />
            </a-tooltip>
          </div>
        </div>
        <div class="case-filter-row">
          <div class="case-filter-item">
            <label class="case-filter-label" for="case-keyword-filter">案例</label>
            <a-input-search
              id="case-keyword-filter"
              v-model:value="caseKeyword"
              class="case-filter-control"
              placeholder="在当前范围内搜索案例名称"
              allow-clear
              :disabled="!totalRows"
            />
          </div>
          <div class="case-filter-item">
            <label class="case-filter-label" for="case-priority-filter">优先级</label>
            <a-select
              id="case-priority-filter"
              v-model:value="selectedPriority"
              class="case-filter-control"
              placeholder="全部"
              allow-clear
              :dropdown-match-select-width="false"
              popup-class-name="case-select-dropdown"
              :options="priorityOptions"
            />
          </div>
          <div class="case-filter-item">
            <label class="case-filter-label" for="case-nature-filter">案例性质</label>
            <a-select
              id="case-nature-filter"
              v-model:value="selectedCaseNature"
              class="case-filter-control"
              placeholder="全部"
              allow-clear
              :dropdown-match-select-width="false"
              popup-class-name="case-select-dropdown"
              :options="caseNatureOptions"
            />
          </div>
        </div>
        <div v-if="activeFilterSummary" class="case-filter-summary">
          {{ activeFilterSummary }}
        </div>
        <div class="case-select-toolbar">
          <div class="case-select-actions">
            <a-button size="small" :disabled="!totalFiltered || listLoading" @click="selectAllFiltered">
              全选当前结果
            </a-button>
            <a-button size="small" :disabled="!selectedRowKeys.length" @click="clearSelection">
              清空已选
            </a-button>
          </div>
          <div class="case-select-stats">
            <span class="case-stat-pill case-stat-pill--primary">已选 {{ selectedRowKeys.length }}</span>
            <span v-if="totalRows" class="case-stat-pill">
              当前 {{ totalFiltered }} / 共 {{ totalRows }}
            </span>
          </div>
        </div>
      </section>

      <div class="case-select-table-wrap">
        <a-spin :spinning="listLoading">
          <a-table
            size="small"
            row-key="caseNodeId"
            :columns="tableColumns"
            :data-source="tableRows"
            :pagination="tablePagination"
            :scroll="{ y: 340 }"
            :row-selection="rowSelection"
            :custom-row="customRow"
            :locale="{ emptyText: ' ' }"
          >
            <template #bodyCell="{ column, text }">
              <a-tooltip v-if="isLongTextColumn(column.dataIndex) && text" :title="text">
                <div class="case-select-cell">{{ text }}</div>
              </a-tooltip>
              <span v-else>{{ text }}</span>
            </template>
            <template #emptyText>
              <a-empty
                class="case-select-empty"
                :description="tableEmptyText"
              />
            </template>
          </a-table>
        </a-spin>
      </div>
    </div>

    <template #footer>
      <div class="case-modal-footer">
        <div class="case-modal-footer-hint">{{ hintText }}</div>
        <div class="case-modal-footer-actions">
          <a-button @click="handleCancel">取消</a-button>
          <a-button
            type="primary"
            :loading="confirmLoading"
            :disabled="!selectedRowKeys.length"
            @click="handleOk"
          >
            {{ okText }}
          </a-button>
        </div>
      </div>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { DownloadOutlined } from '@ant-design/icons-vue';
import type { TableColumnType, TablePaginationConfig } from 'ant-design-vue';
import type { CaseNature, CasePriority, CaseTreeNode } from '@case-forge/shared';
import {
  caseForgePageSizeOptionLabels,
  collectCaseExcelRequirements,
  collectCaseExcelSystems,
  collectCaseExcelModules,
  DEFAULT_CASE_FORGE_PAGE_SIZE,
  flattenCaseTreeToExcel,
  normalizeCaseForgePageSize,
  shouldShowCaseForgePagination,
} from '@case-forge/shared';
import { listRunCaseRows } from '@/api/client';
import { debounce } from '@/utils/debounce';
import { IMMERSIVE_OVERLAY_Z_INDEX } from '@/constants/overlay-z-index';

export type CaseSelectionMode = 'sync' | 'excel';

export interface CaseSelectionRow {
  caseNodeId: string;
  requirement: string;
  caseTitle: string;
  caseNature: string;
  priority: string;
}

const pageSizeOptions = caseForgePageSizeOptionLabels();

const props = defineProps<{
  open: boolean;
  projectId?: string;
  runId?: string;
  tree?: CaseTreeNode;
  mode?: CaseSelectionMode;
  confirmLoading?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  confirm: [caseNodeIds: string[]];
  downloadTemplate: [];
}>();

const selectedRowKeys = ref<string[]>([]);
const selectedSystem = ref<string>();
const selectedModule = ref<string>();
const selectedRequirement = ref<string>();
const selectedPriority = ref<string>();
const selectedCaseNature = ref<string>();
const caseKeyword = ref('');
const listPage = ref(1);
const listPageSize = ref(DEFAULT_CASE_FORGE_PAGE_SIZE);
const listLoading = ref(false);
const tableRows = ref<CaseSelectionRow[]>([]);
const totalFiltered = ref(0);
const totalRows = ref(0);
let fetchSeq = 0;
let isCascading = false;

const priorityOptions = [
  { label: '高', value: '高' },
  { label: '中', value: '中' },
  { label: '低', value: '低' },
];

const caseNatureOptions = [
  { label: '正', value: '正' },
  { label: '反', value: '反' },
];

const modalTitle = computed(() =>
  props.mode === 'excel' ? '导出 Excel' : '同步至测管平台',
);

const okText = computed(() => (props.mode === 'excel' ? '导出选中' : '同步选中'));

const hintText = computed(() =>
  props.mode === 'excel'
    ? '勾选需要导出的案例；导出内容与当前勾选内容一致，不会自动保存案例树。'
    : '勾选需要写入测管平台的案例；按当前编辑内容同步，不会自动保存案例树。已同步过的案例（相同节点 ID）将执行更新。',
);

const emptyText = computed(() =>
  props.mode === 'excel' ? '当前案例树中没有可导出的案例' : '当前案例树中没有可同步的案例',
);

function onOpenChange(value: boolean) {
  emit('update:open', value);
}

function buildListParams(options?: { idsOnly?: boolean }) {
  return {
    page: listPage.value,
    pageSize: listPageSize.value,
    requirement: selectedRequirement.value,
    system: selectedSystem.value,
    module: selectedModule.value,
    priority: selectedPriority.value as CasePriority | undefined,
    caseNature: selectedCaseNature.value as CaseNature | undefined,
    keyword: caseKeyword.value.trim() || undefined,
    idsOnly: options?.idsOnly,
  };
}

async function fetchRows() {
  const projectId = props.projectId;
  const runId = props.runId;
  if (!props.open || !projectId || !runId) {
    tableRows.value = [];
    totalFiltered.value = 0;
    totalRows.value = 0;
    return;
  }
  const seq = ++fetchSeq;
  listLoading.value = true;
  try {
    const result = await listRunCaseRows(projectId, runId, buildListParams());
    if (seq !== fetchSeq) {
      return;
    }
    tableRows.value = result.items.map((row) => ({
      caseNodeId: row.caseNodeId,
      requirement: row.requirement,
      caseTitle: row.caseTitle || row.caseName,
      caseNature: row.caseNature,
      priority: row.priority,
    }));
    totalFiltered.value = result.total;
    totalRows.value = result.totalRows;
    const maxPage = Math.max(1, Math.ceil(result.total / listPageSize.value));
    if (listPage.value > maxPage) {
      listPage.value = maxPage;
      if (maxPage !== result.page) {
        await fetchRows();
      }
    }
  } finally {
    if (seq === fetchSeq) {
      listLoading.value = false;
    }
  }
}

const debouncedFetchRows = debounce(() => {
  void fetchRows();
}, 300);

const allRows = computed(() =>
  props.tree ? flattenCaseTreeToExcel(props.tree).rows : [],
);

const systemOptions = computed(() =>
  collectCaseExcelSystems(allRows.value).map((value) => ({ value, label: value })),
);

const moduleOptions = computed(() => {
  const rows = selectedSystem.value
    ? allRows.value.filter((row) => row.system === selectedSystem.value)
    : allRows.value;
  return collectCaseExcelModules(rows).map((value) => ({ value, label: value }));
});

const requirementOptions = computed(() => {
  let rows = allRows.value;
  if (selectedSystem.value) {
    rows = rows.filter((row) => row.system === selectedSystem.value);
  }
  if (selectedModule.value) {
    rows = rows.filter((row) => row.module === selectedModule.value);
  }
  return collectCaseExcelRequirements(rows).map((value) => ({ value, label: value }));
});

const activeFilterSummary = computed(() => {
  const parts: string[] = [];
  if (selectedSystem.value) {
    parts.push(`系统：${selectedSystem.value}`);
  }
  if (selectedModule.value) {
    parts.push(`功能模块：${selectedModule.value}`);
  }
  if (selectedRequirement.value) {
    parts.push(`测试要点：${selectedRequirement.value}`);
  }
  if (caseKeyword.value.trim()) {
    parts.push(`案例关键词：${caseKeyword.value.trim()}`);
  }
  if (selectedPriority.value) {
    parts.push(`优先级：${selectedPriority.value}`);
  }
  if (selectedCaseNature.value) {
    parts.push(`案例性质：${selectedCaseNature.value}`);
  }
  if (!parts.length) {
    return '';
  }
  return `当前筛选 · ${parts.join(' · ')}`;
});

const tableColumns = computed<TableColumnType<CaseSelectionRow>[]>(() => {
  const columns: TableColumnType<CaseSelectionRow>[] = [
    {
      title: '测试要点',
      dataIndex: 'requirement',
      width: 380,
      ellipsis: true,
    },
    {
      title: '案例',
      dataIndex: 'caseTitle',
      ellipsis: true,
    },
  ];
  if (selectedRequirement.value) {
    return columns.filter((column) => column.dataIndex !== 'requirement');
  }
  return columns;
});

const tablePagination = computed<TablePaginationConfig | false>(() => {
  if (!shouldShowCaseForgePagination(totalFiltered.value)) {
    return false;
  }
  return {
    current: listPage.value,
    pageSize: listPageSize.value,
    total: totalFiltered.value,
    showSizeChanger: true,
    pageSizeOptions,
    size: 'small',
    showTotal: (value: number) => `共 ${value} 条`,
    onChange: (page: number, pageSize: number) => {
      void handleTablePaginationChange(page, pageSize);
    },
    onShowSizeChange: (page: number, pageSize: number) => {
      void handleTablePaginationChange(page, pageSize);
    },
  };
});

async function handleTablePaginationChange(page: number, pageSize: number) {
  const sizeChanged = pageSize !== listPageSize.value;
  listPageSize.value = normalizeCaseForgePageSize(pageSize);
  listPage.value = sizeChanged ? 1 : page;
  await fetchRows();
}

const tableEmptyText = computed(() => {
  if (!totalRows.value) {
    return emptyText.value;
  }
  return '没有符合筛选条件的案例';
});

function filterRequirementOption(input: string, option?: { label?: string; value?: string }) {
  const label = (option?.label ?? option?.value ?? '').toString();
  return label.toLowerCase().includes(input.trim().toLowerCase());
}

function isLongTextColumn(dataIndex: unknown) {
  return dataIndex === 'requirement' || dataIndex === 'caseTitle';
}

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: (string | number)[]) => {
    selectedRowKeys.value = keys.map(String);
  },
  preserveSelectedRowKeys: true,
}));

function isSelectionColumnClick(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(
    target.closest('.ant-checkbox-wrapper')
      || target.closest('.ant-table-selection-column'),
  );
}

function toggleRowSelection(caseNodeId: string) {
  const keys = new Set(selectedRowKeys.value);
  if (keys.has(caseNodeId)) {
    keys.delete(caseNodeId);
  } else {
    keys.add(caseNodeId);
  }
  selectedRowKeys.value = [...keys];
}

function customRow(record: CaseSelectionRow) {
  return {
    onClick: (event: MouseEvent) => {
      if (isSelectionColumnClick(event.target)) {
        return;
      }
      toggleRowSelection(record.caseNodeId);
    },
  };
}

function resetFiltersAndFetch() {
  listPage.value = 1;
  void fetchRows();
}

watch(
  () => props.open,
  (visible) => {
    if (!visible) {
      return;
    }
    selectedRowKeys.value = [];
    selectedSystem.value = undefined;
    selectedModule.value = undefined;
    selectedRequirement.value = undefined;
    selectedPriority.value = undefined;
    selectedCaseNature.value = undefined;
    caseKeyword.value = '';
    listPage.value = 1;
    void fetchRows();
  },
);

watch(selectedSystem, () => {
  if (!props.open || isCascading) return;
  isCascading = true;
  selectedModule.value = undefined;
  selectedRequirement.value = undefined;
  isCascading = false;
  resetFiltersAndFetch();
});

watch(selectedModule, () => {
  if (!props.open || isCascading) return;
  isCascading = true;
  selectedRequirement.value = undefined;
  isCascading = false;
  resetFiltersAndFetch();
});

watch(selectedRequirement, () => {
  if (!props.open || isCascading) return;
  resetFiltersAndFetch();
});

watch(selectedPriority, () => {
  if (!props.open) return;
  resetFiltersAndFetch();
});

watch(selectedCaseNature, () => {
  if (!props.open) return;
  resetFiltersAndFetch();
});

watch(caseKeyword, () => {
  if (!props.open) return;
  listPage.value = 1;
  debouncedFetchRows();
});

async function selectAllFiltered() {
  const projectId = props.projectId;
  const runId = props.runId;
  if (!projectId || !runId || !totalFiltered.value) {
    return;
  }
  listLoading.value = true;
  try {
    const result = await listRunCaseRows(projectId, runId, buildListParams({ idsOnly: true }));
    const keys = new Set(selectedRowKeys.value);
    for (const id of result.ids ?? []) {
      keys.add(id);
    }
    selectedRowKeys.value = [...keys];
  } finally {
    listLoading.value = false;
  }
}

function clearSelection() {
  selectedRowKeys.value = [];
}

function handleOk() {
  if (!selectedRowKeys.value.length) {
    return Promise.reject();
  }
  emit('confirm', [...selectedRowKeys.value]);
}

function handleCancel() {
  emit('update:open', false);
}
</script>

<style scoped>
.case-select-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.case-modal-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}

.case-modal-title-text {
  flex-shrink: 0;
  color: #1d2939;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
}

.case-template-link {
  font-size: 13px;
  font-weight: 400;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #8c1f3d;
  cursor: pointer;
  white-space: nowrap;
}

.case-template-link:hover {
  color: #a62b49;
}

.case-select-filter-card {
  padding: 12px 14px 10px;
  border: 1px solid #e4e7ec;
  border-radius: 10px;
  background: #f8fafc;
}

.case-filter-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 20px;
}

.case-filter-item {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.case-filter-item:first-child {
  flex: 1.1 1 0;
}

.case-filter-label {
  flex-shrink: 0;
  width: 56px;
  color: #344054;
  font-size: 13px;
  font-weight: 500;
  text-align: right;
  white-space: nowrap;
}

.case-filter-control {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
}

.case-filter-summary {
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: #fff;
  color: #8c1f3d;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

.case-select-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #eaecf0;
}

.case-select-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.case-select-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: auto;
}

.case-stat-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #eaecf0;
  color: #667085;
  font-size: 12px;
  line-height: 1.5;
}

.case-stat-pill--primary {
  border-color: #f0b4bf;
  background: #fff5f6;
  color: #8c1f3d;
  font-weight: 600;
}

.case-select-table-wrap {
  overflow: hidden;
  border: 1px solid #e4e7ec;
  border-radius: 10px;
  background: #fff;
}

.case-select-cell {
  display: -webkit-box;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.case-select-empty {
  margin: 24px 0 16px;
}

.case-modal-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.case-modal-footer-hint {
  min-width: 0;
  color: #667085;
  font-size: 12px;
  line-height: 1.55;
  text-align: left;
}

.case-modal-footer-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}
</style>

<style>
.case-selection-modal .ant-modal-content {
  overflow: hidden;
  border-radius: 12px;
}

.case-selection-modal .case-filter-item .ant-select,
.case-selection-modal .case-filter-item .ant-input-search {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
}

.case-selection-modal .case-select-filter-card .ant-select-selector,
.case-selection-modal .case-select-filter-card .ant-input-affix-wrapper {
  border-color: #d0d5dd;
  background: #fff;
}

.case-selection-modal .ant-modal-body {
  padding: 10px 24px 12px;
}

.case-selection-modal .ant-modal-footer {
  margin: 0;
  padding: 0;
  border-top: 1px solid #eaecf0;
  text-align: left;
}

.case-selection-modal .case-modal-footer {
  padding: 12px 24px 16px;
}

.case-selection-modal .ant-modal-header {
  margin-bottom: 0;
  padding: 16px 24px 14px;
  border-bottom: 1px solid #eaecf0;
}

.case-selection-modal .ant-modal-title {
  flex: 1;
  margin: 0;
}

.case-selection-modal .ant-modal-close {
  top: 14px;
  inset-inline-end: 18px;
}

.case-selection-modal .ant-table-tbody > tr > td {
  padding-top: 10px;
  padding-bottom: 10px;
  vertical-align: top;
}

.case-selection-modal .ant-table-tbody > tr {
  cursor: pointer;
}

.case-selection-modal .ant-table-tbody > tr:hover > td {
  background: #fff5f6;
}

.case-selection-modal .case-select-table-wrap .ant-table-wrapper {
  margin: 0;
}

.case-selection-modal .case-select-table-wrap .ant-table {
  border-radius: 0;
}

.case-selection-modal .case-select-table-wrap .ant-table-container {
  border-inline: 0 !important;
}

.case-selection-modal .case-select-table-wrap .ant-table-thead > tr > th {
  padding-top: 10px;
  padding-bottom: 10px;
  background: #f9fafb;
  color: #667085;
  font-size: 13px;
  font-weight: 500;
}

.case-selection-modal .case-select-table-wrap .ant-pagination {
  margin: 10px 16px 8px !important;
}

.case-select-dropdown {
  min-width: 220px;
  max-width: min(480px, 92vw);
}

.case-select-dropdown .ant-select-item-option-content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}
</style>
