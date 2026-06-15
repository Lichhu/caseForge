<template>
  <div class="excel-wrap">
    <div v-if="totalRows > 0" class="excel-toolbar">
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
          <a-select
            v-model:value="priorityFilter"
            class="excel-filter-select excel-filter-select--compact"
            size="small"
            allow-clear
            placeholder="全部优先级"
            :options="priorityFilterOptions"
          />
          <a-select
            v-model:value="caseNatureFilter"
            class="excel-filter-select excel-filter-select--compact"
            size="small"
            allow-clear
            placeholder="全部性质"
            :options="caseNatureFilterOptions"
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
      <a-spin :spinning="listLoading">
      <table v-if="draftRows.length" class="excel-table">
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
              <span class="th-label-row">
                <span>{{ column.label }}</span>
                <EditOutlined v-if="!column.hierarchy" class="th-edit-icon" />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, rowIndex) in draftRows"
            :key="row.caseNodeId"
            :class="{ 'row-alt': rowIndex % 2 === 1 }"
          >
            <td
              v-if="showRowSelection"
              class="td-select sticky-col"
              @click.stop
            >
              <a-checkbox
                :checked="isRowSelected(rowIndex)"
                @click.stop
                @change="(event) => toggleRowSelect(rowIndex, !!event.target?.checked)"
              />
            </td>
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
                  :class="{
                    'cell-readonly--merged': isMergedCell(rowIndex, column.col),
                    'cell-readonly--requirement': column.key === 'requirement',
                  }"
                  :title="cellText(rowIndex, column.key)"
                >
                  {{ cellText(rowIndex, column.key) }}
                </div>
                <select
                  v-else-if="isEnumColumn(column.key)"
                  v-model="draftRows[rowIndex][column.key]"
                  class="cell-input cell-select"
                  @change="emitRowChange(rowIndex)"
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
                  v-model="draftRows[rowIndex][column.key]"
                  class="cell-input cell-textarea"
                  :placeholder="cellPlaceholder(column.key)"
                  @input="onTextareaInput"
                  @blur="emitRowChange(rowIndex)"
                />
                <input
                  v-else
                  v-model="draftRows[rowIndex][column.key]"
                  class="cell-input"
                  type="text"
                  :placeholder="cellPlaceholder(column.key)"
                  @blur="emitRowChange(rowIndex)"
                />
              </td>
            </template>
          </tr>
        </tbody>
      </table>
      <div v-if="showExcelPagination" class="excel-pagination">
        <a-pagination
          size="small"
          :current="listPage"
          :page-size="listPageSize"
          :total="totalFiltered"
          :show-size-changer="true"
          :page-size-options="pageSizeOptions"
          @change="handleExcelPaginationChange"
          @showSizeChange="handleExcelPaginationChange"
        />
      </div>
      <a-empty
        v-else-if="!listLoading && totalRows > 0 && !draftRows.length"
        class="excel-filter-empty"
        description="没有匹配的案例，请调整筛选或搜索条件"
      />
      </a-spin>
    </div>
    <a-empty v-if="!listLoading && !totalRows" class="excel-empty" description="暂无案例数据，请先生成案例树" />

    <CaseAddModal
      v-model:open="addModalOpen"
      :rows="pathRowsForAddModal"
      :initial-path="addModalInitialPath"
      @submit="handleAddCaseSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import {
  DeleteOutlined,
  EditOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
} from '@ant-design/icons-vue';
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
  caseForgePageSizeOptionLabels,
  collectCaseExcelRequirements,
  countCaseTreeLeaves,
  DEFAULT_CASE_FORGE_PAGE_SIZE,
  filterCaseExcelRows,
  findCaseExcelRowPage,
  flattenCaseTreeToExcel,
  normalizeCaseForgePageSize,
  paginateCaseExcelRows,
  pickCaseExcelRowPath,
  removeCaseFromTree,
  shouldShowCaseForgePagination,
  simplifyRequirementTitleForDisplay,
} from '@case-forge/shared';
import { listRunCaseRows } from '@/api/client';
import { debounce } from '@/utils/debounce';
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
const pageSizeOptions = caseForgePageSizeOptionLabels();

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
  listRefreshKey?: number;
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
const priorityFilter = ref<string | undefined>(undefined);
const caseNatureFilter = ref<string | undefined>(undefined);
const caseKeyword = ref('');
const listPage = ref(1);
const listPageSize = ref(DEFAULT_CASE_FORGE_PAGE_SIZE);
const scrollEl = ref<HTMLElement | null>(null);
const selectedCaseNodeIds = ref<Set<string>>(new Set());
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

const firstEditableColumn = computed(() =>
  visibleColumns.value.find((column) => !column.hierarchy),
);

const tableMinWidthPx = computed(() => {
  const selectWidth = showRowSelection.value ? SELECT_COL_WIDTH : 0;
  const columnsWidth = visibleColumns.value.reduce((sum, item) => sum + item.width, 0);
  return `${selectWidth + columnsWidth}px`;
});

const draftRows = ref<CaseExcelRow[]>([]);
const savedRowFingerprints = ref<Map<string, string>>(new Map());
const listLoading = ref(false);
const totalFiltered = ref(0);
const totalRows = ref(0);
const serverRequirements = ref<string[]>([]);
let fetchSeq = 0;

const projectId = computed(() => store.activeProject?.id);
const runId = computed(() => store.activeRun?.id);

const pathRowsForAddModal = computed(() =>
  props.tree ? flattenCaseTreeToExcel(props.tree).rows : [],
);

const treeCaseCount = computed(() =>
  props.tree ? countCaseTreeLeaves(props.tree) : 0,
);

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

function buildCaseRowFilterQuery() {
  return {
    requirement: requirementFilter.value?.trim() || undefined,
    priority: priorityFilter.value as CasePriority | undefined,
    caseNature: caseNatureFilter.value as CaseNature | undefined,
    keyword: caseKeyword.value.trim() || undefined,
  };
}

function mergeDraftRowsFromItems(items: CaseExcelRow[]) {
  const previousById = new Map(
    draftRows.value.map((row) => [row.caseNodeId, row] as const),
  );
  draftRows.value = items.map((serverRow) => {
    const localRow = previousById.get(serverRow.caseNodeId);
    if (
      localRow
      && rowFingerprint(localRow) !== rowFingerprint(serverRow)
    ) {
      return { ...localRow };
    }
    return { ...serverRow };
  });
  for (const row of draftRows.value) {
    savedRowFingerprints.value.set(row.caseNodeId, rowFingerprint(row));
  }
}

function loadCaseRowsFromLocalTree(options?: {
  focusCaseNodeId?: string;
  tree?: CaseTreeNode;
  page?: number;
}) {
  const tree = options?.tree ?? props.tree ?? store.activeRun?.tree;
  if (!tree) {
    return;
  }
  const { rows } = flattenCaseTreeToExcel(tree);
  const filtered = filterCaseExcelRows(rows, buildCaseRowFilterQuery());
  const focusCaseNodeId = options?.focusCaseNodeId?.trim();
  const focusPage = focusCaseNodeId
    ? findCaseExcelRowPage(filtered, focusCaseNodeId, listPageSize.value)
    : undefined;
  const page = focusPage ?? options?.page ?? listPage.value;
  if (focusPage) {
    listPage.value = focusPage;
  } else if (options?.page) {
    listPage.value = options.page;
  }
  mergeDraftRowsFromItems(paginateCaseExcelRows(filtered, page, listPageSize.value));
  totalFiltered.value = filtered.length;
  totalRows.value = rows.length;
  serverRequirements.value = collectCaseExcelRequirements(rows);
}

async function fetchCaseRows(options?: { focusCaseNodeId?: string }) {
  const pid = projectId.value;
  const rid = runId.value;
  if (!pid || !rid || !props.tree) {
    draftRows.value = [];
    totalFiltered.value = 0;
    totalRows.value = 0;
    serverRequirements.value = [];
    return;
  }
  const seq = ++fetchSeq;
  listLoading.value = true;
  try {
    const result = await listRunCaseRows(pid, rid, {
      page: listPage.value,
      pageSize: listPageSize.value,
      requirement: requirementFilter.value,
      priority: priorityFilter.value as CasePriority | undefined,
      caseNature: caseNatureFilter.value as CaseNature | undefined,
      keyword: caseKeyword.value.trim() || undefined,
      focusCaseNodeId: options?.focusCaseNodeId,
    });
    if (seq !== fetchSeq) {
      return;
    }
    const localTree = props.tree ?? store.activeRun?.tree;
    const localTotal = localTree ? flattenCaseTreeToExcel(localTree).rows.length : 0;
    if (localTotal > result.totalRows) {
      loadCaseRowsFromLocalTree({
        focusCaseNodeId: options?.focusCaseNodeId,
        tree: localTree,
        page: result.focusPage ?? listPage.value,
      });
      return;
    }
    mergeDraftRowsFromItems(result.items);
    totalFiltered.value = result.total;
    totalRows.value = result.totalRows;
    serverRequirements.value = result.requirements;
    if (result.focusPage) {
      listPage.value = result.focusPage;
    } else {
      const maxPage = Math.max(1, Math.ceil(result.total / listPageSize.value));
      if (listPage.value > maxPage) {
        listPage.value = maxPage;
      }
    }
  } finally {
    if (seq === fetchSeq) {
      listLoading.value = false;
    }
  }
}

const debouncedFetchCaseRows = debounce(() => {
  void fetchCaseRows();
}, 300);

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

const requirementOptions = computed(() =>
  serverRequirements.value.map((requirement) => ({
    label: requirementSelectLabel(requirement),
    value: requirement,
  })),
);

const selectedRequirementPreview = computed(() => {
  const full = requirementFilter.value?.trim();
  if (!full || !isLongRequirementText(full)) {
    return '';
  }
  return full;
});

const isFiltering = computed(
  () =>
    Boolean(requirementFilter.value) ||
    Boolean(priorityFilter.value) ||
    Boolean(caseNatureFilter.value) ||
    Boolean(caseKeyword.value.trim()),
);

const priorityFilterOptions = [
  { label: '高', value: '高' },
  { label: '中', value: '中' },
  { label: '低', value: '低' },
];

const caseNatureFilterOptions = [
  { label: '正', value: '正' },
  { label: '反', value: '反' },
];

const rowCountLabel = computed(() => {
  if (isFiltering.value) {
    if (totalFiltered.value > listPageSize.value) {
      return `共 ${totalFiltered.value} / ${totalRows.value} 条 · 第 ${listPage.value}/${excelTotalPages.value} 页`;
    }
    return `共 ${totalFiltered.value} / ${totalRows.value} 条案例`;
  }
  if (totalRows.value > listPageSize.value) {
    return `共 ${totalRows.value} 条案例 · 第 ${listPage.value}/${excelTotalPages.value} 页`;
  }
  return `共 ${totalRows.value} 条案例`;
});

const excelTotalPages = computed(() =>
  Math.max(1, Math.ceil(totalFiltered.value / listPageSize.value)),
);

const showExcelPagination = computed(() =>
  shouldShowCaseForgePagination(totalFiltered.value),
);

const currentPageCaseNodeIds = computed(() =>
  draftRows.value.map((row) => row.caseNodeId),
);

const allFilteredSelected = computed(
  () =>
    currentPageCaseNodeIds.value.length > 0
    && currentPageCaseNodeIds.value.every((id) => selectedCaseNodeIds.value.has(id)),
);

const someFilteredSelected = computed(() =>
  currentPageCaseNodeIds.value.some((id) => selectedCaseNodeIds.value.has(id)),
);

const canDeleteSelected = computed(
  () => showRowSelection.value && selectedCaseNodeIds.value.size > 0,
);

const selectedCount = computed(() => selectedCaseNodeIds.value.size);

const searchPlaceholder = computed(() =>
  requirementFilter.value
    ? '搜索当前要点下的案例'
    : '搜索案例',
);

const displayMerges = computed(() => buildDisplayMerges(draftRows.value));

onMounted(() => {
  void fetchCaseRows();
});

watch(
  () => [projectId.value, runId.value, props.tree?.id] as const,
  () => {
    requirementFilter.value = undefined;
    priorityFilter.value = undefined;
    caseNatureFilter.value = undefined;
    caseKeyword.value = '';
    listPage.value = 1;
    selectedCaseNodeIds.value = new Set();
    void fetchCaseRows();
  },
);

watch(
  () => props.listRefreshKey,
  () => {
    void fetchCaseRows();
  },
);

watch(treeCaseCount, (next, prev) => {
  if (prev !== undefined && next !== prev) {
    void fetchCaseRows();
  }
});

function resetExcelListPage() {
  listPage.value = 1;
}

watch(requirementFilter, () => {
  resetExcelListPage();
  selectedCaseNodeIds.value = new Set();
  void fetchCaseRows();
});

watch(priorityFilter, () => {
  resetExcelListPage();
  selectedCaseNodeIds.value = new Set();
  void fetchCaseRows();
});

watch(caseNatureFilter, () => {
  resetExcelListPage();
  selectedCaseNodeIds.value = new Set();
  void fetchCaseRows();
});

watch(caseKeyword, () => {
  resetExcelListPage();
  selectedCaseNodeIds.value = new Set();
  debouncedFetchCaseRows();
});

watch(hierarchyCollapsed, (collapsed) => {
  if (!collapsed) {
    selectedCaseNodeIds.value = new Set();
  }
  resetExcelListPage();
  void fetchCaseRows();
});

watch([draftRows, hierarchyCollapsed], async () => {
  await nextTick();
  resizeAllTextareas();
});

async function handleExcelPaginationChange(page: number, pageSize: number) {
  const sizeChanged = pageSize !== listPageSize.value;
  listPageSize.value = normalizeCaseForgePageSize(pageSize);
  listPage.value = sizeChanged ? 1 : page;
  await fetchCaseRows();
  await nextTick();
  resizeAllTextareas();
  scrollEl.value?.scrollTo({ top: 0, behavior: 'auto' });
}

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
    'th-editable': !column.hierarchy,
    'editable-zone-start': column.key === firstEditableColumn.value?.key,
    'sticky-col': column.sticky,
    'sticky-col-last':
      column.sticky && column.col === lastVisibleStickyCol.value,
  };
}

function tdClass(column: ExcelColumn, displayIndex: number) {
  return {
    'td-hierarchy': column.hierarchy,
    'td-case': !column.hierarchy,
    'td-editable': !column.hierarchy,
    'editable-zone-start': column.key === firstEditableColumn.value?.key,
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

function cellPlaceholder(key: ExcelColumnKey) {
  const placeholders: Partial<Record<ExcelColumnKey, string>> = {
    caseName: '输入案例名称',
    caseTitle: '输入案例标题',
    caseCondition: '输入前置条件',
    caseStep: '输入测试步骤',
    caseExpected: '输入预期结果',
  };
  return placeholders[key] ?? '';
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

function syncRowCellHeights(row: HTMLTableRowElement) {
  const inputs = row.querySelectorAll<HTMLElement>('.cell-input');
  if (!inputs.length) return;

  inputs.forEach((el) => {
    el.style.height = 'auto';
  });

  let maxHeight = 56;
  inputs.forEach((el) => {
    maxHeight = Math.max(maxHeight, el.scrollHeight);
  });

  const height = `${maxHeight}px`;
  inputs.forEach((el) => {
    el.style.height = height;
  });
}

function resizeAllTextareas() {
  const root = scrollEl.value;
  if (!root) return;
  root.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((row) => {
    syncRowCellHeights(row);
  });
}

function onTextareaInput(event: Event) {
  const textarea = event.target as HTMLTextAreaElement;
  const row = textarea.closest('tr');
  if (row) {
    syncRowCellHeights(row);
  }
}

async function emitRowChange(rowIndex: number) {
  await nextTick();
  const tree = store.activeRun?.tree ?? props.tree;
  if (!tree) return;
  const row = draftRows.value[rowIndex];
  if (!row) return;
  if (savedRowFingerprints.value.get(row.caseNodeId) === rowFingerprint(row)) {
    return;
  }
  emit('change', applyExcelRowToTree(tree, row));
  savedRowFingerprints.value.set(row.caseNodeId, rowFingerprint(row));
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
    const matched = pathRowsForAddModal.value.find(
      (row) => row.requirement === requirementFilter.value,
    );
    if (matched) {
      return pickCaseExcelRowPath(matched);
    }
  }
  const last = pathRowsForAddModal.value[pathRowsForAddModal.value.length - 1];
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
  for (const caseNodeId of currentPageCaseNodeIds.value) {
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

function scrollToCaseNodeIdInPage(caseNodeId: string) {
  const rowIndex = draftRows.value.findIndex((row) => row.caseNodeId === caseNodeId);
  if (rowIndex < 0) {
    return;
  }
  void nextTick(() => {
    const root = scrollEl.value;
    if (!root) {
      return;
    }
    const rowEl = root.querySelectorAll<HTMLTableRowElement>('tbody tr')[rowIndex];
    rowEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

function focusCaseRowEditor(caseNodeId: string) {
  const rowIndex = draftRows.value.findIndex((row) => row.caseNodeId === caseNodeId);
  if (rowIndex < 0) {
    return;
  }
  void nextTick(() => {
    const root = scrollEl.value;
    if (!root) {
      return;
    }
    const rowEl = root.querySelectorAll<HTMLTableRowElement>('tbody tr')[rowIndex];
    const input = rowEl?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      '.cell-input:not(.cell-select)',
    );
    input?.focus();
    if (input instanceof HTMLInputElement) {
      input.select();
    }
  });
}

async function scrollToCaseNodeId(caseNodeId: string) {
  const tree = props.tree ?? store.activeRun?.tree;
  if (tree) {
    loadCaseRowsFromLocalTree({ focusCaseNodeId: caseNodeId, tree });
  } else {
    await fetchCaseRows({ focusCaseNodeId: caseNodeId });
  }
  await nextTick();
  scrollToCaseNodeIdInPage(caseNodeId);
  focusCaseRowEditor(caseNodeId);
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
  emit('change', result.tree);
  addModalOpen.value = false;
  void nextTick().then(async () => {
    const tree = store.activeRun?.tree ?? result.tree;
    loadCaseRowsFromLocalTree({ focusCaseNodeId: result.caseNodeId, tree });
    if (hierarchyCollapsed.value) {
      selectedCaseNodeIds.value = new Set([result.caseNodeId]);
    }
    await nextTick();
    scrollToCaseNodeIdInPage(result.caseNodeId);
    focusCaseRowEditor(result.caseNodeId);
  });
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
    onOk: async () => {
      let nextTree = props.tree!;
      for (const caseNodeId of ids) {
        const next = removeCaseFromTree(nextTree, caseNodeId);
        if (next) {
          nextTree = next;
        }
      }
      selectedCaseNodeIds.value = new Set();
      emit('change', nextTree);
      await fetchCaseRows();
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

.excel-edit-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px dashed rgb(182 15 45 / 28%);
  background: #fff9fa;
  color: #9f1239;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.excel-edit-hint :deep(.anticon) {
  font-size: 11px;
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

.excel-filter-select--compact {
  width: 108px;
  min-width: 96px;
  flex: 0 0 108px;
  max-width: 120px;
}

.excel-pagination {
  display: flex;
  justify-content: center;
  padding: 12px 16px 16px;
  border-top: 1px solid #eef2f6;
  background: #fff;
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

/* 全局 spin 默认 height:100% 会撑破滚动区，此处让内容自然增高由外层滚动 */
.excel-scroll :deep(.ant-spin-nested-loading),
.excel-scroll :deep(.ant-spin-container) {
  display: block;
  height: auto;
  min-height: 0;
  overflow: visible;
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
  color: var(--cf-text-secondary, #667085);
}

.excel-table .th-case {
  background: #fff;
}

.excel-table .th-editable {
  background: #fff9fa;
}

.excel-table .editable-zone-start {
  border-left: 2px solid rgb(182 15 45 / 22%);
}

.th-label-row {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.th-edit-icon {
  color: rgb(182 15 45 / 55%);
  font-size: 11px;
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
  background: #f5f6f8;
}

.excel-table .td-hierarchy.td-merged {
  vertical-align: middle;
}

.excel-table .td-case {
  vertical-align: top;
  background: #fff;
}

.excel-table .td-editable {
  padding: 6px 8px;
  vertical-align: top;
}

.excel-table .td-editable .cell-input {
  display: block;
  box-sizing: border-box;
}

.cell-readonly {
  padding: 10px 12px;
  color: var(--cf-text-secondary, #667085);
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
  cursor: default;
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
  border: 1px solid #d0d5dd;
  border-radius: 4px;
  background: #fff;
  box-shadow: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background-color 0.15s ease;
}

.cell-input,
.cell-textarea {
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.55;
  font-family: inherit;
  color: var(--cf-text-body, #344054);
}

.cell-input::placeholder,
.cell-textarea::placeholder {
  color: #98a2b3;
}

.cell-input:not(:focus):placeholder-shown,
.cell-textarea:not(:focus):placeholder-shown {
  border-style: dashed;
  border-color: #d0d5dd;
  background: #fafafa;
}

.cell-input:hover,
.cell-textarea:hover {
  border-color: #98a2b3;
}

.cell-textarea {
  resize: none;
  overflow-y: auto;
  min-height: 56px;
  cursor: text;
}

.cell-select {
  cursor: pointer;
  appearance: none;
  padding-right: 28px;
  min-height: 56px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23667085' d='M2.5 4.5 6 8l3.5-3.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.cell-input:focus,
.cell-textarea:focus,
.cell-select:focus {
  outline: none;
  border-color: rgb(182 15 45 / 50%);
  border-style: solid;
  background: #fff;
  box-shadow: 0 0 0 2px rgb(182 15 45 / 12%);
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
