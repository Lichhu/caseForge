<template>
  <div class="excel-wrap">
    <div v-if="viewModel.rows.length" class="excel-toolbar">
      <div class="excel-toolbar-left">
        <span class="excel-stat">共 {{ viewModel.rows.length }} 条案例</span>
        <a-button size="small" type="default" @click="toggleHierarchyCollapse">
          <template #icon>
            <MenuUnfoldOutlined v-if="hierarchyCollapsed" />
            <MenuFoldOutlined v-else />
          </template>
          {{ hierarchyCollapsed ? '展开' : '收起' }}
        </a-button>
      </div>
      <span class="excel-hint">收起时隐藏根/系统/模块/测试要点/案例列；详情列可编辑，失焦自动保存</span>
    </div>
    <div ref="scrollEl" class="excel-scroll">
      <table class="excel-table">
        <colgroup>
          <col
            v-for="column in visibleColumns"
            :key="column.key"
            :style="colStyle(column)"
          />
        </colgroup>
        <thead>
          <tr>
            <th
              v-for="column in visibleColumns"
              :key="column.key"
              :class="thClass(column)"
              :style="stickyStyle(column)"
            >
              {{ column.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, rowIndex) in viewModel.rows"
            :key="row.caseNodeId"
            :class="{ 'row-alt': rowIndex % 2 === 1 }"
          >
            <template
              v-for="column in visibleColumns"
              :key="`${row.caseNodeId}-${column.key}`"
            >
              <td
                v-if="shouldRenderCell(rowIndex, column.col)"
                :rowspan="getRowSpan(rowIndex, column.col)"
                :class="tdClass(column, rowIndex)"
                :style="stickyStyle(column)"
              >
                <div
                  v-if="column.hierarchy"
                  class="cell-readonly"
                  :class="{ 'cell-readonly--merged': isMergedCell(rowIndex, column.col) }"
                  :title="cellText(rowIndex, column.key)"
                >
                  {{ cellText(rowIndex, column.key) }}
                </div>
                <textarea
                  v-else-if="isMultilineColumn(column.key)"
                  v-model="draftRows[rowIndex][column.key]"
                  class="cell-input cell-textarea"
                  @input="onTextareaInput"
                  @blur="emitRowChange(rowIndex)"
                />
                <input
                  v-else
                  v-model="draftRows[rowIndex][column.key]"
                  class="cell-input"
                  type="text"
                  @blur="emitRowChange(rowIndex)"
                />
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
    <a-empty v-if="!viewModel.rows.length" class="excel-empty" description="暂无案例数据，请先生成案例树" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons-vue';
import type { CaseExcelRow, CaseTreeNode } from '@case-forge/shared';
import { applyExcelRowToTree, flattenCaseTreeToExcel } from '@case-forge/shared';

const COLLAPSIBLE_HIERARCHY_KEYS = [
  'root',
  'system',
  'module',
  'requirement',
  'caseName',
] as const;

type ExcelColumnKey =
  | 'root'
  | 'system'
  | 'module'
  | 'requirement'
  | 'caseName'
  | 'caseTitle'
  | 'caseCondition'
  | 'caseStep'
  | 'caseExpected';

interface ExcelColumn {
  key: ExcelColumnKey;
  label: string;
  col: number;
  width: number;
  hierarchy?: boolean;
  /** 横向滚动时固定在左侧，避免被 rowspan 层级列遮挡 */
  sticky?: boolean;
  stickyLeft?: number;
}

const props = defineProps<{
  tree: CaseTreeNode | null;
}>();

const emit = defineEmits<{
  change: [tree: CaseTreeNode];
}>();

const columnDefs: Array<Omit<ExcelColumn, 'stickyLeft'>> = [
  { key: 'root', label: '根', col: 0, width: 128, hierarchy: true, sticky: true },
  { key: 'system', label: '系统', col: 1, width: 108, hierarchy: true, sticky: true },
  { key: 'module', label: '功能模块', col: 2, width: 148, hierarchy: true, sticky: true },
  { key: 'requirement', label: '测试要点', col: 3, width: 168, hierarchy: true, sticky: true },
  { key: 'caseName', label: '案例', col: 4, width: 200, sticky: true },
  { key: 'caseTitle', label: '案例标题', col: 5, width: 200 },
  { key: 'caseCondition', label: '前置条件', col: 6, width: 220 },
  { key: 'caseStep', label: '测试步骤', col: 7, width: 260 },
  { key: 'caseExpected', label: '预期结果', col: 8, width: 260 },
];

let stickyOffset = 0;
const columns: ExcelColumn[] = columnDefs.map((column) => {
  if (!column.sticky) {
    return column;
  }
  const withLeft = { ...column, stickyLeft: stickyOffset };
  stickyOffset += column.width;
  return withLeft;
});

const hierarchyCollapsed = ref(true);
const scrollEl = ref<HTMLElement | null>(null);

const visibleColumns = computed(() => {
  const base = hierarchyCollapsed.value
    ? columns.filter(
        (column) =>
          !COLLAPSIBLE_HIERARCHY_KEYS.includes(
            column.key as (typeof COLLAPSIBLE_HIERARCHY_KEYS)[number],
          ),
      )
    : columns;
  let offset = 0;
  return base.map((column) => {
    if (!column.sticky) {
      return column;
    }
    const withLeft = { ...column, stickyLeft: offset };
    offset += column.width;
    return withLeft;
  });
});

const lastVisibleStickyCol = computed(
  () => visibleColumns.value.filter((column) => column.sticky).at(-1)?.col,
);

const tableMinWidthPx = computed(
  () =>
    `${visibleColumns.value.reduce((sum, item) => sum + item.width, 0)}px`,
);

const draftRows = ref<CaseExcelRow[]>([]);
const viewModel = computed(() =>
  props.tree ? flattenCaseTreeToExcel(props.tree) : { rows: [], merges: [] },
);

watch(
  () => props.tree,
  async () => {
    draftRows.value = viewModel.value.rows.map((row) => ({ ...row }));
    await nextTick();
    resizeAllTextareas();
  },
  { immediate: true },
);

watch(hierarchyCollapsed, async () => {
  await nextTick();
  resizeAllTextareas();
});

function colStyle(column: ExcelColumn) {
  return {
    width: `${column.width}px`,
    minWidth: `${column.width}px`,
  };
}

function stickyStyle(column: ExcelColumn) {
  if (column.stickyLeft === undefined) {
    return undefined;
  }
  return { left: `${column.stickyLeft}px` };
}

function thClass(column: ExcelColumn) {
  return {
    'th-hierarchy': column.hierarchy,
    'th-case': !column.hierarchy,
    'sticky-col': column.sticky,
    'sticky-col-last':
      column.sticky && column.col === lastVisibleStickyCol.value,
  };
}

function tdClass(column: ExcelColumn, rowIndex: number) {
  return {
    'td-hierarchy': column.hierarchy,
    'td-case': !column.hierarchy,
    'td-merged': column.hierarchy && isMergedCell(rowIndex, column.col),
    'sticky-col': column.sticky,
    'sticky-col-last':
      column.sticky && column.col === lastVisibleStickyCol.value,
  };
}

function toggleHierarchyCollapse() {
  hierarchyCollapsed.value = !hierarchyCollapsed.value;
}

function cellText(rowIndex: number, key: ExcelColumnKey) {
  return draftRows.value[rowIndex]?.[key] || '';
}

const mergeLookup = computed(() => {
  const map = new Map<string, number>();
  for (const merge of viewModel.value.merges) {
    map.set(`${merge.row}-${merge.col}`, merge.rowSpan);
  }
  return map;
});

function shouldRenderCell(rowIndex: number, col: number) {
  const spans = mergeLookup.value;
  for (const [key, rowSpan] of spans.entries()) {
    const [startRow, startCol] = key.split('-').map(Number);
    if (startCol === col && rowIndex > startRow && rowIndex < startRow + rowSpan) {
      return false;
    }
  }
  return true;
}

function getRowSpan(rowIndex: number, col: number) {
  return mergeLookup.value.get(`${rowIndex}-${col}`) || 1;
}

function isMergedCell(rowIndex: number, col: number) {
  return getRowSpan(rowIndex, col) > 1;
}

function isMultilineColumn(key: ExcelColumnKey) {
  return (
    key === 'caseTitle' ||
    key === 'caseCondition' ||
    key === 'caseStep' ||
    key === 'caseExpected'
  );
}

function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function resizeAllTextareas() {
  const root = scrollEl.value;
  if (!root) return;
  root.querySelectorAll<HTMLTextAreaElement>('textarea.cell-textarea').forEach((el) => {
    autoResizeTextarea(el);
  });
}

function onTextareaInput(event: Event) {
  autoResizeTextarea(event.target as HTMLTextAreaElement);
}

function emitRowChange(rowIndex: number) {
  if (!props.tree) return;
  const row = draftRows.value[rowIndex];
  if (!row) return;
  emit('change', applyExcelRowToTree(props.tree, row));
}
</script>

<style scoped>
.excel-wrap {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  border: 1px solid var(--cf-border, #e4e7ec);
  border-radius: var(--cf-radius, 6px);
  background: var(--cf-surface, #fff);
  overflow: hidden;
}

.excel-toolbar {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding: 10px 14px;
  border-bottom: 1px solid #eaecf0;
  background: #f9fafb;
}

.excel-toolbar-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.excel-stat {
  color: var(--cf-text, #1d2939);
  font-size: 13px;
  font-weight: 600;
}

.excel-hint {
  color: var(--cf-text-secondary, #667085);
  font-size: 12px;
}

.excel-scroll {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-gutter: stable;
}

.excel-table {
  width: max(100%, v-bind(tableMinWidthPx));
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  line-height: 1.55;
}

.excel-table th,
.excel-table td {
  border-right: 1px solid #e4e7ec;
  border-bottom: 1px solid #e4e7ec;
  padding: 0;
  vertical-align: top;
  background: #fff;
}

.excel-table th:first-child,
.excel-table td:first-child {
  border-left: 1px solid #e4e7ec;
}

.excel-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
  padding: 10px 12px;
  background: #f2f4f7;
  color: var(--cf-text-body, #344054);
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
  box-shadow: inset 0 -1px 0 #e4e7ec;
}

.excel-table thead th.sticky-col {
  z-index: 5;
}

.excel-table tbody td.sticky-col {
  position: sticky;
  z-index: 2;
}

.excel-table thead th.sticky-col-last {
  box-shadow:
    inset 0 -1px 0 #e4e7ec,
    4px 0 8px -4px rgb(16 24 40 / 14%);
}

.excel-table tbody td.sticky-col-last {
  box-shadow: 4px 0 8px -4px rgb(16 24 40 / 12%);
}

.excel-table tbody tr:hover td.sticky-col.td-hierarchy {
  background: #f5f7fa;
}

.excel-table tbody tr:hover td.sticky-col.td-case {
  background: #fff9fa;
}

.excel-table tbody tr.row-alt td.sticky-col.td-case {
  background: #fcfcfd;
}

.excel-table .th-hierarchy {
  background: #eef2f6;
}

.excel-table .th-case {
  background: #f9fafb;
}

.excel-table tbody tr.row-alt td.td-case {
  background: #fcfcfd;
}

.excel-table tbody tr:hover td {
  background: #fff9fa;
}

.excel-table tbody tr:hover td.td-hierarchy {
  background: #f5f7fa;
}

.excel-table .td-hierarchy {
  vertical-align: middle;
  background: #f9fafb;
}

.excel-table .td-hierarchy.td-merged {
  vertical-align: middle;
}

.excel-table .td-case {
  vertical-align: top;
  background: #fff;
}

.cell-readonly {
  padding: 10px 12px;
  color: var(--cf-text-body, #344054);
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
}

.cell-readonly--merged {
  display: flex;
  align-items: center;
  min-height: 100%;
  color: var(--cf-text, #1d2939);
  font-weight: 500;
}

.cell-input {
  width: 100%;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.cell-input,
.cell-textarea {
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.55;
  font-family: inherit;
  color: var(--cf-text-body, #344054);
}

.cell-textarea {
  resize: none;
  overflow: hidden;
  min-height: 56px;
  field-sizing: content;
}

.cell-input:focus,
.cell-textarea:focus {
  outline: none;
  background: #fff !important;
  box-shadow: inset 0 0 0 2px rgb(182 15 45 / 18%);
}

.excel-empty {
  margin: 48px auto;
}
</style>
