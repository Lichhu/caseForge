<template>
  <div class="excel-wrap">
    <div v-if="draftRows.length" class="excel-toolbar">
      <div class="excel-toolbar-row">
        <div class="excel-toolbar-main">
          <span class="excel-stat-pill">{{ rowCountLabel }}</span>
          <span
            v-if="showRowSelection && selectedCount"
            class="excel-stat-pill excel-stat-pill--selected"
          >
            已选 {{ selectedCount }}
          </span>
          <span v-if="store.treeSaving" class="excel-save-status is-saving">保存中…</span>
          <a-button size="small" type="default" @click="toggleHierarchyCollapse">
            <template #icon>
              <MenuUnfoldOutlined v-if="hierarchyCollapsed" />
              <MenuFoldOutlined v-else />
            </template>
            {{ hierarchyCollapsed ? '展开' : '收起' }}
          </a-button>
          <a-tooltip :title="requirementFilter || undefined">
            <a-select
              v-model:value="requirementFilter"
              class="excel-filter-select"
              size="small"
              allow-clear
              show-search
              option-label-prop="label"
              placeholder="全部测试要点"
              :dropdown-match-select-width="false"
              popup-class-name="excel-requirement-dropdown"
              :filter-option="filterRequirementOption"
            >
              <a-select-option
                v-for="option in requirementOptions"
                :key="option.value"
                :value="option.value"
                :label="option.label"
                :title="option.value"
              >
                {{ option.value }}
              </a-select-option>
            </a-select>
          </a-tooltip>
          <a-input
            v-model:value="caseKeyword"
            class="excel-search-input"
            size="small"
            allow-clear
            :placeholder="searchPlaceholder"
          />
        </div>
        <div class="excel-toolbar-actions">
          <a-button size="small" type="primary" @click="openAddModal">
            <template #icon><PlusOutlined /></template>
            添加案例
          </a-button>
          <a-button
            size="small"
            danger
            :disabled="!canDeleteSelected"
            @click="deleteSelectedRows"
          >
            <template #icon><DeleteOutlined /></template>
            删除
          </a-button>
        </div>
      </div>
      <div v-if="selectedRequirementPreview" class="excel-requirement-preview">
        <span class="excel-requirement-preview-label">当前测试要点</span>
        <span class="excel-requirement-preview-text">{{ selectedRequirementPreview }}</span>
      </div>
    </div>
    <div ref="scrollEl" class="excel-scroll">
      <table v-if="filteredIndices.length" class="excel-table">
        <colgroup>
          <col v-if="showRowSelection" class="excel-select-col" />
          <col
            v-for="column in visibleColumns"
            :key="column.key"
            :style="colStyle(column)"
          />
        </colgroup>
        <thead>
          <tr>
            <th v-if="showRowSelection" class="th-select sticky-col">
              <a-checkbox
                :checked="allFilteredSelected"
                :indeterminate="someFilteredSelected && !allFilteredSelected"
                @change="toggleSelectAllFiltered"
              />
            </th>
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
            v-for="(originalIndex, displayIndex) in filteredIndices"
            :key="draftRows[originalIndex].caseNodeId"
            :class="{ 'row-alt': displayIndex % 2 === 1 }"
          >
            <td
              v-if="showRowSelection"
              class="td-select sticky-col"
              @click.stop
            >
              <a-checkbox
                :checked="isRowSelected(originalIndex)"
                @click.stop
                @change="(event) => toggleRowSelect(originalIndex, !!event.target?.checked)"
              />
            </td>
            <template
              v-for="column in visibleColumns"
              :key="`${draftRows[originalIndex].caseNodeId}-${column.key}`"
            >
              <td
                v-if="shouldRenderCell(displayIndex, column.col)"
                :rowspan="getRowSpan(displayIndex, column.col)"
                :class="tdClass(column, displayIndex)"
                :style="stickyStyle(column)"
              >
                <div
                  v-if="column.hierarchy"
                  class="cell-readonly"
                  :class="{
                    'cell-readonly--merged': isMergedCell(displayIndex, column.col),
                    'cell-readonly--requirement': column.key === 'requirement',
                  }"
                  :title="cellText(originalIndex, column.key)"
                >
                  {{ cellText(originalIndex, column.key) }}
                </div>
                <select
                  v-else-if="isEnumColumn(column.key)"
                  v-model="draftRows[originalIndex][column.key]"
                  class="cell-input cell-select"
                  @change="emitRowChange(originalIndex)"
                >
                  <option
                    v-for="option in enumOptions(column.key)"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
                <textarea
                  v-else-if="isMultilineColumn(column.key)"
                  v-model="draftRows[originalIndex][column.key]"
                  class="cell-input cell-textarea"
                  @input="onTextareaInput"
                  @blur="emitRowChange(originalIndex)"
                />
                <input
                  v-else
                  v-model="draftRows[originalIndex][column.key]"
                  class="cell-input"
                  type="text"
                  @blur="emitRowChange(originalIndex)"
                />
              </td>
            </template>
          </tr>
        </tbody>
      </table>
      <a-empty
        v-else-if="draftRows.length"
        class="excel-filter-empty"
        description="没有匹配的案例，请调整筛选或搜索条件"
      />
    </div>
    <a-empty v-if="!draftRows.length" class="excel-empty" description="暂无案例数据，请先生成案例树" />

    <CaseAddModal
      v-model:open="addModalOpen"
      :rows="draftRows"
      :initial-path="addModalInitialPath"
      @submit="handleAddCaseSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { DeleteOutlined, MenuFoldOutlined, MenuUnfoldOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { Modal, message } from 'ant-design-vue';
import type {
  CaseExcelMergeCell,
  CaseExcelRow,
  CaseExcelRowPath,
  CaseNature,
  CasePriority,
  CaseTreeNode,
  NewCaseRowInput,
} from '@case-forge/shared';
import {
  addCaseRowToTree,
  applyExcelRowToTree,
  flattenCaseTreeToExcel,
  pickCaseExcelRowPath,
  removeCaseFromTree,
  simplifyRequirementTitleForDisplay,
} from '@case-forge/shared';
import { useCaseForgeStore } from '@/stores/caseForge';
import CaseAddModal from '@/components/CaseAddModal.vue';

const COLLAPSIBLE_HIERARCHY_KEYS = [
  'root',
  'system',
  'module',
  'requirement',
  'caseName',
] as const;

const SELECT_COL_WIDTH = 28;

type ExcelColumnKey =
  | 'root'
  | 'system'
  | 'module'
  | 'requirement'
  | 'caseName'
  | 'caseNature'
  | 'priority'
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

const store = useCaseForgeStore();

const emit = defineEmits<{
  change: [tree: CaseTreeNode];
}>();

const columnDefs: Array<Omit<ExcelColumn, 'stickyLeft'>> = [
  { key: 'root', label: '根', col: 0, width: 128, hierarchy: true, sticky: true },
  { key: 'system', label: '系统', col: 1, width: 108, hierarchy: true, sticky: true },
  { key: 'module', label: '功能模块', col: 2, width: 148, hierarchy: true, sticky: true },
  { key: 'requirement', label: '测试要点', col: 3, width: 280, hierarchy: true, sticky: true },
  { key: 'caseName', label: '案例', col: 4, width: 200, sticky: true },
  { key: 'caseTitle', label: '案例标题', col: 5, width: 200 },
  { key: 'caseCondition', label: '前置条件', col: 6, width: 220 },
  { key: 'caseStep', label: '测试步骤', col: 7, width: 260 },
  { key: 'caseExpected', label: '预期结果', col: 8, width: 260 },
  { key: 'priority', label: '优先级', col: 9, width: 72 },
  { key: 'caseNature', label: '案例性质', col: 10, width: 80 },
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
const requirementFilter = ref<string | undefined>(undefined);
const caseKeyword = ref('');
const scrollEl = ref<HTMLElement | null>(null);
const selectedCaseNodeIds = ref<Set<string>>(new Set());
const pendingSelectCaseId = ref<string | null>(null);
const addModalOpen = ref(false);
const addModalInitialPath = ref<CaseExcelRowPath | null>(null);

const showRowSelection = computed(() => hierarchyCollapsed.value);

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

const tableMinWidthPx = computed(() => {
  const selectWidth = showRowSelection.value ? SELECT_COL_WIDTH : 0;
  const columnsWidth = visibleColumns.value.reduce((sum, item) => sum + item.width, 0);
  return `${selectWidth + columnsWidth}px`;
});

const draftRows = ref<CaseExcelRow[]>([]);
const savedRowFingerprints = ref<Map<string, string>>(new Map());

function rowFingerprint(row: CaseExcelRow) {
  return JSON.stringify({
    caseName: row.caseName,
    caseTitle: row.caseTitle,
    caseNature: row.caseNature,
    priority: row.priority,
    caseCondition: row.caseCondition,
    caseStep: row.caseStep,
    caseExpected: row.caseExpected,
  });
}

function syncDraftFromTree() {
  draftRows.value = viewModel.value.rows.map((row) => ({ ...row }));
  savedRowFingerprints.value = new Map(
    viewModel.value.rows.map((row) => [row.caseNodeId, rowFingerprint(row)]),
  );
}
const viewModel = computed(() =>
  props.tree ? flattenCaseTreeToExcel(props.tree) : { rows: [], merges: [] },
);

const REQUIREMENT_SELECT_LABEL_MAX = 48;

function requirementSelectLabel(full: string) {
  const trimmed = full.trim();
  const summary = simplifyRequirementTitleForDisplay(trimmed);
  const display = summary.length < trimmed.length ? summary : trimmed;
  if (display.length <= REQUIREMENT_SELECT_LABEL_MAX) {
    return display;
  }
  return `${display.slice(0, REQUIREMENT_SELECT_LABEL_MAX)}…`;
}

function isLongRequirementText(full: string) {
  const trimmed = full.trim();
  return (
    trimmed.includes('\n')
    || trimmed.length > REQUIREMENT_SELECT_LABEL_MAX
    || requirementSelectLabel(trimmed) !== trimmed
  );
}

const requirementOptions = computed(() => {
  const seen = new Set<string>();
  const options: Array<{ label: string; value: string }> = [];
  for (const row of draftRows.value) {
    const requirement = row.requirement.trim();
    if (!requirement || seen.has(requirement)) {
      continue;
    }
    seen.add(requirement);
    options.push({
      label: requirementSelectLabel(requirement),
      value: requirement,
    });
  }
  return options.sort((a, b) => a.value.localeCompare(b.value, 'zh-CN'));
});

const selectedRequirementPreview = computed(() => {
  const full = requirementFilter.value?.trim();
  if (!full || !isLongRequirementText(full)) {
    return '';
  }
  return full;
});

const isFiltering = computed(
  () => Boolean(requirementFilter.value) || Boolean(caseKeyword.value.trim()),
);

const rowCountLabel = computed(() => {
  const total = draftRows.value.length;
  const visible = filteredIndices.value.length;
  if (!isFiltering.value) {
    return `共 ${total} 条案例`;
  }
  return `共 ${visible} / ${total} 条案例`;
});

const searchPlaceholder = computed(() =>
  requirementFilter.value
    ? '搜索当前要点下的案例'
    : '搜索案例',
);

function rowMatchesFilter(row: CaseExcelRow) {
  if (requirementFilter.value && row.requirement !== requirementFilter.value) {
    return false;
  }
  const keyword = caseKeyword.value.trim().toLowerCase();
  if (!keyword) {
    return true;
  }
  const haystack = [
    row.caseName,
    row.caseTitle,
    row.caseNature,
    row.priority,
    row.caseCondition,
    row.caseStep,
    row.caseExpected,
  ]
    .join('\n')
    .toLowerCase();
  return haystack.includes(keyword);
}

const filteredIndices = computed(() =>
  draftRows.value.reduce<number[]>((indices, row, index) => {
    if (rowMatchesFilter(row)) {
      indices.push(index);
    }
    return indices;
  }, []),
);

const filteredCaseNodeIds = computed(() =>
  filteredIndices.value.map((index) => draftRows.value[index].caseNodeId),
);

const allFilteredSelected = computed(
  () =>
    filteredCaseNodeIds.value.length > 0
    && filteredCaseNodeIds.value.every((id) => selectedCaseNodeIds.value.has(id)),
);

const someFilteredSelected = computed(() =>
  filteredCaseNodeIds.value.some((id) => selectedCaseNodeIds.value.has(id)),
);

const canDeleteSelected = computed(
  () => showRowSelection.value && selectedCaseNodeIds.value.size > 0,
);

const selectedCount = computed(() => selectedCaseNodeIds.value.size);

const displayMerges = computed(() =>
  buildDisplayMerges(filteredIndices.value.map((index) => draftRows.value[index])),
);

watch(
  () => props.tree,
  async () => {
    syncDraftFromTree();
    pruneRowSelection();
    if (pendingSelectCaseId.value) {
      const caseNodeId = pendingSelectCaseId.value;
      pendingSelectCaseId.value = null;
      if (hierarchyCollapsed.value) {
        selectedCaseNodeIds.value = new Set([caseNodeId]);
      }
      await nextTick();
      scrollToCaseNodeId(caseNodeId);
    }
    await nextTick();
    resizeAllTextareas();
  },
  { immediate: true },
);

watch(
  () => store.activeRun?.id,
  () => {
    requirementFilter.value = undefined;
    caseKeyword.value = '';
    selectedCaseNodeIds.value = new Set();
  },
);

watch(requirementFilter, () => {
  selectedCaseNodeIds.value = new Set();
});

watch(caseKeyword, () => {
  selectedCaseNodeIds.value = new Set();
});

watch(hierarchyCollapsed, (collapsed) => {
  if (!collapsed) {
    selectedCaseNodeIds.value = new Set();
  }
});

watch([filteredIndices, hierarchyCollapsed], async () => {
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
  const offset = showRowSelection.value ? SELECT_COL_WIDTH : 0;
  return { left: `${column.stickyLeft + offset}px` };
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

function tdClass(column: ExcelColumn, displayIndex: number) {
  return {
    'td-hierarchy': column.hierarchy,
    'td-case': !column.hierarchy,
    'td-merged': column.hierarchy && isMergedCell(displayIndex, column.col),
    'sticky-col': column.sticky,
    'sticky-col-last':
      column.sticky && column.col === lastVisibleStickyCol.value,
  };
}

function toggleHierarchyCollapse() {
  hierarchyCollapsed.value = !hierarchyCollapsed.value;
}

function filterRequirementOption(input: string, option?: { value?: string; label?: string }) {
  const keyword = input.trim().toLowerCase();
  if (!keyword) {
    return true;
  }
  const full = (option?.value || '').toLowerCase();
  const label = (option?.label || '').toLowerCase();
  return full.includes(keyword) || label.includes(keyword);
}

function cellText(originalIndex: number, key: ExcelColumnKey) {
  return draftRows.value[originalIndex]?.[key] || '';
}

const mergeLookup = computed(() => {
  const map = new Map<string, number>();
  for (const merge of displayMerges.value) {
    map.set(`${merge.row}-${merge.col}`, merge.rowSpan);
  }
  return map;
});

function buildDisplayMerges(rows: CaseExcelRow[]): CaseExcelMergeCell[] {
  const merges: CaseExcelMergeCell[] = [];
  const hierarchyKeys: Array<keyof CaseExcelRow> = ['root', 'system', 'module', 'requirement'];
  hierarchyKeys.forEach((column, colIndex) => {
    let start = 0;
    while (start < rows.length) {
      let end = start + 1;
      while (end < rows.length && rows[end][column] === rows[start][column] && rows[end][column]) {
        const sameParents = hierarchyKeys
          .slice(0, colIndex)
          .every((parentKey) => rows[end][parentKey] === rows[start][parentKey]);
        if (!sameParents) {
          break;
        }
        end += 1;
      }
      const span = end - start;
      if (span > 1) {
        merges.push({ row: start, col: colIndex, rowSpan: span });
      }
      start = end;
    }
  });
  return merges;
}

function shouldRenderCell(displayIndex: number, col: number) {
  const spans = mergeLookup.value;
  for (const [key, rowSpan] of spans.entries()) {
    const [startRow, startCol] = key.split('-').map(Number);
    if (startCol === col && displayIndex > startRow && displayIndex < startRow + rowSpan) {
      return false;
    }
  }
  return true;
}

function getRowSpan(displayIndex: number, col: number) {
  return mergeLookup.value.get(`${displayIndex}-${col}`) || 1;
}

function isMergedCell(displayIndex: number, col: number) {
  return getRowSpan(displayIndex, col) > 1;
}

function isMultilineColumn(key: ExcelColumnKey) {
  return (
    key === 'caseTitle' ||
    key === 'caseCondition' ||
    key === 'caseStep' ||
    key === 'caseExpected'
  );
}

function isEnumColumn(key: ExcelColumnKey) {
  return key === 'caseNature' || key === 'priority';
}

function enumOptions(key: ExcelColumnKey): Array<{ label: string; value: CaseNature | CasePriority }> {
  if (key === 'caseNature') {
    return [
      { label: '正', value: '正' },
      { label: '反', value: '反' },
    ];
  }
  return [
    { label: '高', value: '高' },
    { label: '中', value: '中' },
    { label: '低', value: '低' },
  ];
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
  if (savedRowFingerprints.value.get(row.caseNodeId) === rowFingerprint(row)) {
    return;
  }
  emit('change', applyExcelRowToTree(props.tree, row));
}

function resolveAddContext(): CaseExcelRowPath | null {
  if (selectedCaseNodeIds.value.size) {
    const firstId = [...selectedCaseNodeIds.value][0];
    const selected = draftRows.value.find((row) => row.caseNodeId === firstId);
    if (selected?.requirement.trim()) {
      return pickCaseExcelRowPath(selected);
    }
  }
  if (requirementFilter.value) {
    const matched = draftRows.value.find((row) => row.requirement === requirementFilter.value);
    if (matched) {
      return pickCaseExcelRowPath(matched);
    }
  }
  const last = draftRows.value[draftRows.value.length - 1];
  if (last?.requirement.trim()) {
    return pickCaseExcelRowPath(last);
  }
  return null;
}

function isRowSelected(originalIndex: number) {
  const caseNodeId = draftRows.value[originalIndex]?.caseNodeId;
  return Boolean(caseNodeId && selectedCaseNodeIds.value.has(caseNodeId));
}

function toggleRowSelect(originalIndex: number, checked: boolean) {
  const caseNodeId = draftRows.value[originalIndex]?.caseNodeId;
  if (!caseNodeId) {
    return;
  }
  const next = new Set(selectedCaseNodeIds.value);
  if (checked) {
    next.add(caseNodeId);
  } else {
    next.delete(caseNodeId);
  }
  selectedCaseNodeIds.value = next;
}

function toggleSelectAllFiltered(event: { target: { checked: boolean } }) {
  const checked = event.target.checked;
  const next = new Set(selectedCaseNodeIds.value);
  for (const caseNodeId of filteredCaseNodeIds.value) {
    if (checked) {
      next.add(caseNodeId);
    } else {
      next.delete(caseNodeId);
    }
  }
  selectedCaseNodeIds.value = next;
}

function pruneRowSelection() {
  const validIds = new Set(draftRows.value.map((row) => row.caseNodeId));
  selectedCaseNodeIds.value = new Set(
    [...selectedCaseNodeIds.value].filter((id) => validIds.has(id)),
  );
}

function scrollToCaseNodeId(caseNodeId: string) {
  const originalIndex = draftRows.value.findIndex((row) => row.caseNodeId === caseNodeId);
  if (originalIndex < 0) {
    return;
  }
  const root = scrollEl.value;
  if (!root) {
    return;
  }
  const displayIndex = filteredIndices.value.indexOf(originalIndex);
  if (displayIndex < 0) {
    return;
  }
  const rowEl = root.querySelectorAll<HTMLTableRowElement>('tbody tr')[displayIndex];
  rowEl?.scrollIntoView({ block: 'nearest' });
}

function openAddModal() {
  if (!props.tree) {
    return;
  }
  addModalInitialPath.value = resolveAddContext();
  addModalOpen.value = true;
}

function handleAddCaseSubmit(path: CaseExcelRowPath, input: NewCaseRowInput) {
  if (!props.tree) {
    return;
  }
  const result = addCaseRowToTree(props.tree, path, input);
  if (!result) {
    message.error('无法添加案例，请检查归属层级是否完整');
    return;
  }
  pendingSelectCaseId.value = result.caseNodeId;
  emit('change', result.tree);
  addModalOpen.value = false;
}

function deleteSelectedRows() {
  if (!props.tree || !canDeleteSelected.value) {
    message.warning('请先勾选要删除的案例');
    return;
  }
  const ids = [...selectedCaseNodeIds.value];
  const labels = ids.map((id) => {
    const row = draftRows.value.find((item) => item.caseNodeId === id);
    return row?.caseName || row?.caseTitle || '未命名案例';
  });
  const content =
    ids.length === 1
      ? `确定删除「${labels[0]}」吗？此操作不可撤销。`
      : `确定删除已选 ${ids.length} 条案例吗？此操作不可撤销。`;
  Modal.confirm({
    title: '删除案例？',
    content,
    okText: '删除',
    cancelText: '取消',
    okType: 'danger',
    centered: true,
    onOk: () => {
      let nextTree = props.tree!;
      for (const caseNodeId of ids) {
        const next = removeCaseFromTree(nextTree, caseNodeId);
        if (next) {
          nextTree = next;
        }
      }
      selectedCaseNodeIds.value = new Set();
      emit('change', nextTree);
    },
  });
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
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #eaecf0;
  background: #f9fafb;
}

.excel-toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.excel-toolbar-main {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.excel-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.excel-stat-pill {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #e4e7ec;
  color: var(--cf-text, #1d2939);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.excel-stat-pill--selected {
  border-color: rgb(182 15 45 / 22%);
  background: #fff4f6;
  color: #b60f2d;
}

.excel-save-status {
  font-size: 12px;
  line-height: 24px;
  white-space: nowrap;
}

.excel-save-status.is-saving {
  color: #b60f2d;
}

.excel-filter-select {
  width: 200px;
  min-width: 140px;
  flex: 1 1 160px;
  max-width: 240px;
}

.excel-filter-select :deep(.ant-select-selection-item) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 22px;
}

.excel-filter-select :deep(.ant-select-selector) {
  align-items: center;
}

.excel-search-input {
  width: 168px;
  min-width: 120px;
  flex: 0 0 168px;
  max-width: 200px;
}

.excel-requirement-preview {
  display: flex;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #e4e7ec;
  border-radius: 6px;
  background: #fff;
}

.excel-requirement-preview-label {
  flex-shrink: 0;
  color: var(--cf-text-secondary, #667085);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
}

.excel-requirement-preview-text {
  flex: 1;
  min-width: 0;
  color: var(--cf-text-body, #344054);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.excel-filter-empty {
  margin: 48px auto;
}

@media (max-width: 960px) {
  .excel-toolbar-row {
    flex-direction: column;
    align-items: stretch;
  }

  .excel-toolbar-actions {
    width: 100%;
    justify-content: flex-end;
  }
}

.excel-scroll {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  height: 0;
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

.excel-select-col {
  width: 28px;
  min-width: 28px;
}

.excel-table .th-select,
.excel-table .td-select {
  width: 28px;
  min-width: 28px;
  max-width: 28px;
  left: 0;
  padding: 0;
  text-align: center;
  vertical-align: middle;
}

.excel-table .th-select :deep(.ant-checkbox-wrapper),
.excel-table .td-select :deep(.ant-checkbox-wrapper) {
  margin: 0;
  padding: 0;
  line-height: 1;
}

.excel-table .th-select :deep(.ant-checkbox),
.excel-table .td-select :deep(.ant-checkbox) {
  top: 0;
  margin: 0;
}

.excel-table thead th.th-select {
  background: #eef2f6;
}

.excel-table tbody td.td-select {
  background: #fff;
}

.excel-table tbody tr.row-alt td.td-select {
  background: #fcfcfd;
}

.excel-table tbody tr:hover td.td-select {
  background: #fff9fa;
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

.cell-readonly--requirement {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}

.cell-readonly--merged.cell-readonly--requirement {
  align-items: flex-start;
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

<style>
.excel-requirement-dropdown {
  min-width: 360px;
  max-width: min(720px, 92vw);
}

.excel-requirement-dropdown .ant-select-item-option-content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}
</style>
