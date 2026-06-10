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
            <label class="case-filter-label" for="case-requirement-filter">测试要点</label>
            <a-select
              id="case-requirement-filter"
              v-model:value="selectedRequirement"
              class="case-filter-control"
              placeholder="全部测试要点，可输入搜索"
              allow-clear
              show-search
              :disabled="!requirementOptions.length"
              :options="requirementOptions"
              :filter-option="filterRequirementOption"
            />
          </div>
          <div class="case-filter-item">
            <label class="case-filter-label" for="case-keyword-filter">案例</label>
            <a-input-search
              id="case-keyword-filter"
              v-model:value="caseKeyword"
              class="case-filter-control"
              placeholder="在当前范围内搜索案例名称"
              allow-clear
              :disabled="!caseRows.length"
            />
          </div>
        </div>
        <div v-if="activeFilterSummary" class="case-filter-summary">
          {{ activeFilterSummary }}
        </div>
        <div class="case-select-toolbar">
          <div class="case-select-actions">
            <a-button size="small" :disabled="!filteredCaseRows.length" @click="selectAllFiltered">
              全选当前结果
            </a-button>
            <a-button size="small" :disabled="!selectedRowKeys.length" @click="clearSelection">
              清空已选
            </a-button>
          </div>
          <div class="case-select-stats">
            <span class="case-stat-pill case-stat-pill--primary">已选 {{ selectedRowKeys.length }}</span>
            <span v-if="caseRows.length" class="case-stat-pill">
              当前 {{ filteredCaseRows.length }} / 共 {{ caseRows.length }}
            </span>
          </div>
        </div>
      </section>

      <div class="case-select-table-wrap">
        <a-table
          size="small"
          row-key="caseNodeId"
          :columns="tableColumns"
          :data-source="filteredCaseRows"
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
import type { TableColumnType } from 'ant-design-vue';
import type { CaseTreeNode } from '@case-forge/shared';
import { flattenCaseTreeToExcel } from '@case-forge/shared';
import { IMMERSIVE_OVERLAY_Z_INDEX } from '@/constants/overlay-z-index';

export type CaseSelectionMode = 'sync' | 'excel';

export interface CaseSelectionRow {
  caseNodeId: string;
  requirement: string;
  caseTitle: string;
}

const props = defineProps<{
  open: boolean;
  tree: CaseTreeNode | null;
  mode?: CaseSelectionMode;
  confirmLoading?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  confirm: [caseNodeIds: string[]];
  downloadTemplate: [];
}>();

const selectedRowKeys = ref<string[]>([]);
const selectedRequirement = ref<string>();
const caseKeyword = ref('');

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

const caseRows = computed<CaseSelectionRow[]>(() => {
  if (!props.tree) {
    return [];
  }
  const { rows } = flattenCaseTreeToExcel(props.tree);
  return rows.map((row) => ({
    caseNodeId: row.caseNodeId,
    requirement: row.requirement,
    caseTitle: row.caseTitle || row.caseName,
  }));
});

const requirementOptions = computed(() => {
  const unique = new Set<string>();
  for (const row of caseRows.value) {
    const requirement = row.requirement?.trim();
    if (requirement) {
      unique.add(requirement);
    }
  }
  return [...unique]
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    .map((value) => ({ value, label: value }));
});

const filteredCaseRows = computed(() => {
  const keyword = caseKeyword.value.trim().toLowerCase();
  return caseRows.value.filter((row) => {
    if (selectedRequirement.value && row.requirement !== selectedRequirement.value) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    return row.caseTitle.toLowerCase().includes(keyword);
  });
});

const activeFilterSummary = computed(() => {
  const parts: string[] = [];
  if (selectedRequirement.value) {
    parts.push(`测试要点：${selectedRequirement.value}`);
  }
  if (caseKeyword.value.trim()) {
    parts.push(`案例关键词：${caseKeyword.value.trim()}`);
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

const tablePagination = computed(() => (
  filteredCaseRows.value.length > 10
    ? { pageSize: 10, showSizeChanger: false, size: 'small' as const }
    : false
));

const tableEmptyText = computed(() => {
  if (!caseRows.value.length) {
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

watch(
  () => props.open,
  (visible) => {
    if (!visible) {
      return;
    }
    selectedRowKeys.value = [];
    selectedRequirement.value = undefined;
    caseKeyword.value = '';
  },
);

watch(caseRows, (rows) => {
  if (!props.open) {
    return;
  }
  const available = new Set(rows.map((row) => row.caseNodeId));
  selectedRowKeys.value = selectedRowKeys.value.filter((id) => available.has(id));
});

function selectAllFiltered() {
  const keys = new Set(selectedRowKeys.value);
  for (const row of filteredCaseRows.value) {
    keys.add(row.caseNodeId);
  }
  selectedRowKeys.value = [...keys];
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
</style>
