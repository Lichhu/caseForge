<template>
  <a-modal
    :open="open"
    title="同步至测管平台"
    ok-text="同步选中"
    cancel-text="取消"
    :width="920"
    wrap-class-name="test-platform-sync-modal"
    :z-index="IMMERSIVE_OVERLAY_Z_INDEX"
    :confirm-loading="confirmLoading"
    :ok-button-props="{ disabled: !selectedRowKeys.length }"
    destroy-on-close
    @update:open="onOpenChange"
    @ok="handleOk"
    @cancel="handleCancel"
  >
    <p class="sync-hint">
      勾选需要写入测管平台的案例；按当前编辑内容同步，不会自动保存案例树。已同步过的案例（相同节点 ID）将执行更新。
    </p>
    <div class="sync-toolbar">
      <a-space>
        <a-button size="small" :disabled="!caseRows.length" @click="selectAll">全选</a-button>
        <a-button size="small" :disabled="!caseRows.length" @click="clearSelection">清空</a-button>
        <span class="sync-count">已选 {{ selectedRowKeys.length }} / {{ caseRows.length }} 条</span>
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
    />
    <a-empty v-if="!caseRows.length" description="当前案例树中没有可同步的案例" />
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TableColumnType } from 'ant-design-vue';
import type { CaseTreeNode } from '@case-forge/shared';
import { flattenCaseTreeToExcel } from '@case-forge/shared';
import { IMMERSIVE_OVERLAY_Z_INDEX } from '@/constants/overlay-z-index';

export interface TestPlatformSyncCaseRow {
  caseNodeId: string;
  system: string;
  module: string;
  requirement: string;
  caseTitle: string;
}

const props = defineProps<{
  open: boolean;
  tree: CaseTreeNode | null;
  confirmLoading?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  confirm: [caseNodeIds: string[]];
}>();

const selectedRowKeys = ref<string[]>([]);

function onOpenChange(value: boolean) {
  emit('update:open', value);
}
const caseRows = computed<TestPlatformSyncCaseRow[]>(() => {
  if (!props.tree) {
    return [];
  }
  const { rows } = flattenCaseTreeToExcel(props.tree);
  return rows.map((row) => ({
    caseNodeId: row.caseNodeId,
    system: row.system,
    module: row.module,
    requirement: row.requirement,
    caseTitle: row.caseTitle || row.caseName,
  }));
});

const columns: TableColumnType<TestPlatformSyncCaseRow>[] = [
  { title: '系统', dataIndex: 'system', width: 120, ellipsis: true },
  { title: '功能模块', dataIndex: 'module', width: 120, ellipsis: true },
  { title: '测试要点', dataIndex: 'requirement', width: 180, ellipsis: true },
  { title: '案例', dataIndex: 'caseTitle', ellipsis: true },
];

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: (string | number)[]) => {
    selectedRowKeys.value = keys.map(String);
  },
}));

watch(
  () => props.open,
  (visible) => {
    if (!visible) {
      return;
    }
    selectedRowKeys.value = caseRows.value.map((row) => row.caseNodeId);
  },
);

watch(caseRows, (rows) => {
  if (!props.open) {
    return;
  }
  const available = new Set(rows.map((row) => row.caseNodeId));
  selectedRowKeys.value = selectedRowKeys.value.filter((id) => available.has(id));
  if (!selectedRowKeys.value.length && rows.length) {
    selectedRowKeys.value = rows.map((row) => row.caseNodeId);
  }
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
}</script>

<style scoped>
.sync-hint {
  margin: 0 0 12px;
  color: rgba(0, 0, 0, 0.55);
  font-size: 13px;
}

.sync-toolbar {
  margin-bottom: 12px;
}

.sync-count {
  color: rgba(0, 0, 0, 0.45);
  font-size: 13px;
}
</style>
