<template>
  <a-modal
    :open="open"
    :ok-text="okText"
    cancel-text="取消"
    :width="920"
    wrap-class-name="case-selection-modal"
    :z-index="IMMERSIVE_OVERLAY_Z_INDEX"
    :confirm-loading="confirmLoading"
    :ok-button-props="{ disabled: !selectedRowKeys.length }"
    destroy-on-close
    @update:open="onOpenChange"
    @ok="handleOk"
    @cancel="handleCancel"
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
    <p class="case-select-hint">{{ hintText }}</p>
    <div class="case-select-toolbar">
      <a-space>
        <a-button size="small" :disabled="!caseRows.length" @click="selectAll">全选</a-button>
        <a-button size="small" :disabled="!caseRows.length" @click="clearSelection">清空</a-button>
        <span class="case-select-count">已选 {{ selectedRowKeys.length }} / {{ caseRows.length }} 条</span>
      </a-space>
    </div>
    <a-table
      size="small"
      row-key="caseNodeId"
      :columns="columns"
      :data-source="caseRows"
      :pagination="caseRows.length > 8 ? { pageSize: 8, showSizeChanger: false } : false"
      :scroll="{ y: 360 }"
      :row-selection="rowSelection"
      :custom-row="customRow"
    >
      <template #bodyCell="{ column, text }">
        <a-tooltip v-if="isLongTextColumn(column.dataIndex) && text" :title="text">
          <div class="case-select-cell">{{ text }}</div>
        </a-tooltip>
        <span v-else>{{ text }}</span>
      </template>
    </a-table>
    <a-empty v-if="!caseRows.length" :description="emptyText" />
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

const columns: TableColumnType<CaseSelectionRow>[] = [
  {
    title: '测试要点',
    dataIndex: 'requirement',
    width: 420,
  },
  {
    title: '案例',
    dataIndex: 'caseTitle',
  },
];

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
  },
);

watch(caseRows, (rows) => {
  if (!props.open) {
    return;
  }
  const available = new Set(rows.map((row) => row.caseNodeId));
  selectedRowKeys.value = selectedRowKeys.value.filter((id) => available.has(id));
});

function selectAll() {
  selectedRowKeys.value = caseRows.value.map((row) => row.caseNodeId);
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
.case-select-hint {
  margin: 0 0 12px;
  color: rgba(0, 0, 0, 0.55);
  font-size: 13px;
}

.case-modal-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-right: 28px;
  width: 100%;
}

.case-modal-title-text {
  flex-shrink: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
}

.case-template-link {
  margin-right: 8px;
  font-size: 13px;
  font-weight: 400;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #8c1f3d;
  cursor: pointer;
}

.case-template-link:hover {
  color: #a62b49;
}

.case-select-toolbar {
  margin-bottom: 12px;
}

.case-select-count {
  color: rgba(0, 0, 0, 0.45);
  font-size: 13px;
}

.case-select-cell {
  display: -webkit-box;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}
</style>

<style>
.case-selection-modal .ant-table-tbody > tr > td {
  vertical-align: top;
}

.case-selection-modal .ant-table-tbody > tr {
  cursor: pointer;
}

.case-selection-modal .ant-modal-title {
  flex: 1;
  margin: 0;
}
</style>
