<template>
  <section class="panel workbench-panel">
    <div class="panel-header">
      <div>
        <h2>案例编辑台</h2>
        <p>{{ store.workbenchTitle }}</p>
      </div>
      <div class="toolbar action-toolbar">
        <a-segmented v-model:value="viewMode" :options="viewModeOptions" />
        <a-button
          type="primary"
          :disabled="!store.activeRun"
          :loading="store.treeSaving"
          @click="handleSaveTree"
        >
          <template #icon><SaveOutlined /></template>
          保存
        </a-button>
        <a-button
          :disabled="!store.activeRun"
          :loading="caseSelectConfirmLoading"
          @click="handleSyncToTestPlatform"
        >
          <template #icon><CloudUploadOutlined /></template>
          同步测管
        </a-button>
        <a-dropdown :disabled="!store.activeRun">
          <a-button>
            <template #icon><DownloadOutlined /></template>
            导出
          </a-button>
          <template #overlay>
            <a-menu @click="download">
              <a-menu-item key="xmind">XMind</a-menu-item>
              <a-menu-item key="excel">Excel</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </div>

    <div class="workbench-body">
      <a-spin :spinning="store.activeRunLoading">
        <div
          v-if="store.activeRun"
          class="workbench-grid mind-workbench-grid"
          :class="{ 'excel-mode': viewMode === 'excel' }"
        >
          <CaseTreeExcel
            v-if="viewMode === 'excel'"
            :tree="store.activeRun.tree"
            :list-refresh-key="excelListRefreshKey"
            @change="handleExcelTreeChange"
          />
          <div v-else ref="mindCanvasWrap" class="mind-canvas-wrap">
            <a-alert
              v-if="xmindLargeTree"
              class="mind-large-tree-alert"
              type="info"
              show-icon
              banner
              message="案例较多时建议在 Excel 视图编辑；导图展示到案例节点，标题/前置条件/步骤/预期结果仅在右侧属性面板查看。"
            />
            <div class="mind-toolbar">
          <a-tooltip title="居中（重置为测试要点层级）">
            <button class="mind-tool-button" @click="centerMap">
              <AimOutlined />
            </button>
          </a-tooltip>
          <a-tooltip title="适应画布（重置为测试要点层级）">
            <button class="mind-tool-button" @click="fitMap">
                  <FullscreenOutlined />
                </button>
              </a-tooltip>
              <a-tooltip title="放大">
                <button class="mind-tool-button" @click="zoom(0.12)">
                  <ZoomInOutlined />
                </button>
              </a-tooltip>
              <a-tooltip title="缩小">
                <button class="mind-tool-button" @click="zoom(-0.12)">
                  <ZoomOutOutlined />
                </button>
              </a-tooltip>
              <span class="mind-toolbar-divider" />
              <a-tooltip
                :title="
                  canAddChildToSelected
                    ? '添加子主题'
                    : '该案例下四种子节点已全部添加'
                "
              >
                <button
                  class="mind-tool-button"
                  :disabled="!canAddChildToSelected"
                  @click="addChild"
                >
                  <PlusOutlined />
                </button>
              </a-tooltip>
              <a-tooltip title="添加同级主题">
                <button class="mind-tool-button" @click="addSibling">
                  <NodeIndexOutlined />
                </button>
              </a-tooltip>
              <a-tooltip title="编辑节点">
                <button class="mind-tool-button" @click="editSelected">
                  <EditOutlined />
                </button>
              </a-tooltip>
              <a-tooltip title="删除节点">
                <button class="mind-tool-button danger" @click="removeSelected">
                  <DeleteOutlined />
                </button>
              </a-tooltip>
              <span class="mind-toolbar-divider" />
              <a-tooltip title="撤销">
                <button class="mind-tool-button" @click="undoMap">
                  <UndoOutlined />
                </button>
              </a-tooltip>
              <a-tooltip title="重做">
                <button class="mind-tool-button" @click="redoMap">
                  <RedoOutlined />
                </button>
              </a-tooltip>
            </div>
            <div ref="mindContainer" class="mind-map" />
          </div>

          <aside v-if="viewMode === 'xmind'" class="inspector">
            <h3 class="inspector-title">节点属性</h3>
            <div class="inspector-body">
              <template v-if="selectedNode">
                <div class="inspector-fields">
                  <label>标题</label>
                  <a-input
                    v-model:value="selectedTitle"
                    @press-enter="applySelectedTitle"
                    @blur="applySelectedTitle"
                  />
                  <label>类型</label>
                  <a-select
                    v-model:value="selectedKind"
                    :options="availableKindOptions"
                    placeholder="请选择类型"
                    @change="(value: CaseNodeKind) => applySelectedKind(value)"
                  />
                  <template v-if="isSelectedCaseLike">
                    <label>案例性质</label>
                    <a-select
                      v-model:value="selectedCaseNature"
                      :options="caseNatureOptions"
                      @change="applySelectedCaseMetadata"
                    />
                    <label>优先级</label>
                    <a-select
                      v-model:value="selectedPriority"
                      :options="casePriorityOptions"
                      @change="applySelectedCaseMetadata"
                    />
                  </template>
                </div>
                <div class="inspector-children-scroll">
                  <template v-if="inspectorChildrenLoading">
                    <label>子节点</label>
                    <a-spin size="small" />
                  </template>
                  <template v-else-if="inspectorChildSummaries.length">
                    <label
                      >{{ inspectorChildrenLabel }}（{{
                        inspectorChildSummaries.length
                      }}）</label
                    >
                    <ul class="inspector-child-list">
                      <li
                        v-for="child in inspectorChildSummaries"
                        :key="child.id"
                        class="inspector-child-item"
                        :class="{ 'is-readonly': isCaseDetailKind(child.kind) }"
                        @click="focusInspectorChild(child)"
                      >
                        <span class="inspector-child-kind">{{
                          child.kindLabel
                        }}</span>
                        <span
                          class="inspector-child-title"
                          :title="child.title"
                          >{{ child.title }}</span
                        >
                      </li>
                    </ul>
                  </template>
                  <p v-else class="inspector-child-empty">当前节点暂无子节点</p>
                </div>
                <a-alert
                  v-if="dirty"
                  class="inspector-dirty-alert"
                  type="info"
                  show-icon
                  message="案例树有本地编辑，保存后导出会使用最新内容。"
                />
              </template>
              <a-empty v-else description="在画布中选择一个节点" />
            </div>
          </aside>
        </div>

        <a-empty
          v-else-if="store.activeRunLoading && store.hasProjectRuns"
          class="empty-state workbench-empty"
          description="正在加载案例树…"
        />
        <a-empty
          v-else-if="!store.hasProjectRuns"
          class="empty-state workbench-empty"
        >
          <template #description>
            <p class="workbench-empty-title">暂无案例树</p>
            <p class="workbench-empty-steps">
              请先在「02
              动态指令」维护测试要点并<strong>生成</strong>案例，生成完成后返回本页进行在线编辑与导出。
            </p>
          </template>
          <div
            v-if="store.structDoc?.canEnterDynamicInstruct"
            class="action-toolbar"
          >
            <a-button type="primary" @click="goToConstraints">
              去动态指令
            </a-button>
          </div>
        </a-empty>
        <a-empty v-else class="empty-state workbench-empty">
          <template #description>
            <p class="workbench-empty-title">案例树加载失败</p>
            <p class="workbench-empty-steps">
              请重试加载，或返回动态指令确认案例已生成。
            </p>
          </template>
          <div class="action-toolbar">
            <a-button
              type="primary"
              :loading="store.activeRunLoading"
              @click="retryLoadRun"
            >
              重新加载
            </a-button>
          </div>
        </a-empty>
      </a-spin>
    </div>

    <CaseSelectionModal
      v-model:open="caseSelectModalOpen"
      :mode="caseSelectModalMode"
      :project-id="store.activeProject?.id"
      :run-id="store.activeRun?.id ?? store.primaryRunSummary?.id"
      :confirm-loading="caseSelectConfirmLoading"
      @confirm="handleCaseSelectConfirm"
      @download-template="handleDownloadExcelTemplate"
    />
  </section>
</template>

<script setup lang="ts">
import {
  computed,
  markRaw,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import MindElixir from "mind-elixir";
import { zh_CN } from "mind-elixir/i18n";
import "mind-elixir/style.css";
import {
  AimOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FullscreenOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  RedoOutlined,
  SaveOutlined,
  UndoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@ant-design/icons-vue";
import { message, type MenuProps } from "ant-design-vue";
import type {
  MindElixirData,
  MindElixirInstance,
  NodeObj,
  Topic,
} from "mind-elixir";
import type {
  CaseNature,
  CaseNodeKind,
  CaseNodeMetadata,
  CasePriority,
  CaseTreeNode,
  MindMapExtras,
} from "@case-forge/shared";
import { DEFAULT_CASE_NATURE, DEFAULT_CASE_PRIORITY } from "@case-forge/shared";
import {
  CASE_ELEMENT_KINDS,
  CASE_NODE_KIND_LABELS,
  getCaseDisplayTitle,
  getCaseTitleOnly,
  isCaseElementKind,
  isAutoGeneratedCaseTitleNode,
  isCaseLikeKind,
  isPlaceholderCaseTitle,
  cloneCaseTree,
  countCaseTreeLeaves,
  countDirectCaseChildren,
  findCaseTreeNodeById,
  normalizeCaseNature,
  normalizeCaseTreeForSkill,
  EDITOR_CASE_TREE_NORMALIZE_OPTIONS,
  sanitizeCaseTitleText,
  simplifyRequirementTitleForDisplay,
} from "@case-forge/shared";
import {
  exportExcelTemplateUrl,
  exportUrl,
  listRunNodeChildren,
  syncRunToTestPlatform,
} from "@/api/client";
import { useCaseForgeStore } from "@/stores/caseForge";
import CaseTreeExcel from "@/components/CaseTreeExcel.vue";
import CaseSelectionModal, {
  type CaseSelectionMode,
} from "@/components/CaseSelectionModal.vue";
import { debounce } from "@/utils/debounce";

interface MindNodeMeta {
  kind: CaseNodeKind;
  caseMetadata?: CaseNodeMetadata;
  casesLoaded?: boolean;
  caseCount?: number;
  lazyPlaceholder?: boolean;
  parentRequirementId?: string;
}

interface CaseNodeMindOptions {
  lazyCases: boolean;
  fetchedRequirementIds: Set<string>;
}

interface InspectorChildSummary {
  id: string;
  kind: CaseNodeKind;
  kindLabel: string;
  title: string;
}

const store = useCaseForgeStore();

async function goToConstraints() {
  await store.setWorkspaceStage("constraints", { refresh: true });
}

const viewMode = ref<"xmind" | "excel">("excel");
const excelListRefreshKey = ref(0);
const viewModeOptions = [
  { label: "Excel", value: "excel" },
  { label: "XMind", value: "xmind" },
];
const mindCanvasWrap = ref<HTMLDivElement | null>(null);
const mindContainer = ref<HTMLDivElement | null>(null);
const mind = shallowRef<MindElixirInstance | null>(null);
const selectedMindNode = shallowRef<NodeObj<MindNodeMeta> | null>(null);
const dirty = ref(false);
const caseSelectModalOpen = ref(false);
const caseSelectModalMode = ref<CaseSelectionMode>("sync");
const caseSelectConfirmLoading = ref(false);
const isRefreshing = ref(false);
const selectedTitle = ref("");
const selectedKind = ref<CaseNodeKind>("scenario");
const selectedCaseNature = ref<CaseNature>(DEFAULT_CASE_NATURE);
const selectedPriority = ref<CasePriority>(DEFAULT_CASE_PRIORITY);
const caseNatureOptions = [
  { label: "正", value: "正" as CaseNature },
  { label: "反", value: "反" as CaseNature },
];
const casePriorityOptions = [
  { label: "高", value: "高" as CasePriority },
  { label: "中", value: "中" as CasePriority },
  { label: "低", value: "低" as CasePriority },
];
const isSelectedCaseLike = computed(() => isCaseLikeKind(selectedKind.value));

const canAddChildToSelected = computed(() => {
  const node = selectedMindNode.value;
  if (!node) {
    return false;
  }
  const kind = getActualNodeKind(node);
  if (kind !== "case" && kind !== "scenario") {
    return true;
  }
  return countCaseElementChildren(node) < CASE_ELEMENT_KINDS.length;
});

const inspectorChildrenLabel = computed(() => {
  const node = selectedMindNode.value;
  if (!node) {
    return "子节点";
  }
  return getActualNodeKind(node) === "case" ? "案例明细" : "子节点";
});

const XMIND_MAX_CASES = 500;
const XMIND_WARN_CASES = 200;

const activeCaseCount = computed(() =>
  store.activeRun ? countCaseTreeLeaves(store.activeRun.tree) : 0,
);

const xmindLargeTree = computed(
  () => viewMode.value === "xmind" && activeCaseCount.value > XMIND_WARN_CASES,
);

const CASE_ELEMENT_CHILD_LIMIT_MESSAGE =
  "该案例下最多只能添加四个子节点（案例标题、前置条件、测试步骤、预期结果）";

function buildKindOption(kind: CaseNodeKind) {
  return {
    label: CASE_NODE_KIND_LABELS[kind] || kind,
    value: kind,
  };
}

function isMindAutoCaseTitleNode(node: NodeObj<MindNodeMeta>): boolean {
  const kind = node.metadata?.kind || inferKind(node);
  return isAutoGeneratedCaseTitleNode({ id: node.id, kind });
}

function getAllowedKindsByParent(
  parent: NodeObj<MindNodeMeta> | null,
): CaseNodeKind[] {
  if (!parent) {
    return ["root"];
  }
  const parentKind = parent.metadata?.kind || inferKind(parent);
  switch (parentKind) {
    case "root":
      return ["system"];
    case "system":
      return ["module"];
    case "module":
      return ["requirement"];
    case "requirement":
      return ["case"];
    case "case":
    case "scenario":
      return [...CASE_ELEMENT_KINDS];
    default:
      return [];
  }
}

function isCaseElementParent(parent: NodeObj<MindNodeMeta> | null) {
  if (!parent) {
    return false;
  }
  const parentKind = parent.metadata?.kind || inferKind(parent);
  return parentKind === "case" || parentKind === "scenario";
}

function findMindNodeContext(nodeId: string): {
  parent: NodeObj<MindNodeMeta> | null;
  node: NodeObj<MindNodeMeta> | null;
} {
  const root = mind.value?.nodeData as NodeObj<MindNodeMeta> | undefined;
  if (!root) {
    return { parent: null, node: null };
  }

  const walk = (
    node: NodeObj<MindNodeMeta>,
    parent: NodeObj<MindNodeMeta> | null,
  ): {
    parent: NodeObj<MindNodeMeta> | null;
    node: NodeObj<MindNodeMeta>;
  } | null => {
    if (node.id === nodeId) {
      return { parent, node };
    }
    for (const child of node.children || []) {
      const found = walk(child as NodeObj<MindNodeMeta>, node);
      if (found) {
        return found;
      }
    }
    return null;
  };

  return walk(root, null) || { parent: null, node: null };
}

function normalizeElementKind(kind: CaseNodeKind): CaseNodeKind | null {
  if (isCaseElementKind(kind)) {
    return kind;
  }
  const legacyMap: Partial<Record<CaseNodeKind, CaseNodeKind>> = {
    condition: "case_condition",
    step: "case_step",
    expectation: "case_expected",
  };
  const mapped = legacyMap[kind];
  return mapped && isCaseElementKind(mapped) ? mapped : null;
}

function getSiblingUsedElementKinds(
  node: NodeObj<MindNodeMeta>,
  parent: NodeObj<MindNodeMeta> | null,
): Set<CaseNodeKind> {
  if (!parent) {
    return new Set();
  }
  return collectUsedElementKindsFromParent(parent, node.id);
}

function collectUsedElementKindsFromParent(
  parent: NodeObj<MindNodeMeta>,
  excludeNodeId?: string,
): Set<CaseNodeKind> {
  const used = new Set<CaseNodeKind>();
  if (getActualNodeKind(parent) === "case") {
    for (const child of listCaseElementStoreChildren(parent.id)) {
      if (excludeNodeId && child.id === excludeNodeId) {
        continue;
      }
      const normalized = normalizeElementKind(child.kind);
      if (normalized) {
        used.add(normalized);
      }
    }
    return used;
  }
  for (const child of parent.children || []) {
    const childNode = child as NodeObj<MindNodeMeta>;
    if (excludeNodeId && childNode.id === excludeNodeId) {
      continue;
    }
    if (isMindAutoCaseTitleNode(childNode)) {
      continue;
    }
    const kind = childNode.metadata?.kind || inferKind(childNode);
    const normalized = normalizeElementKind(kind);
    if (normalized) {
      used.add(normalized);
    }
  }
  return used;
}

function getStoreCaseTreeNode(nodeId: string): CaseTreeNode | null {
  if (!store.activeRun?.tree) {
    return null;
  }
  return findCaseTreeNodeById(store.activeRun.tree, nodeId);
}

function listCaseElementStoreChildren(caseNodeId: string): CaseTreeNode[] {
  const storeNode = getStoreCaseTreeNode(caseNodeId);
  if (!storeNode) {
    return [];
  }
  return (storeNode.children || []).filter((child) => {
    if (isAutoGeneratedCaseTitleNode(child)) {
      return false;
    }
    return Boolean(normalizeElementKind(child.kind) || isCaseElementKind(child.kind));
  });
}

function countCaseElementChildren(parent: NodeObj<MindNodeMeta>): number {
  if (getActualNodeKind(parent) === "case") {
    return listCaseElementStoreChildren(parent.id).length;
  }
  return (parent.children || []).filter((child) => {
    const childNode = child as NodeObj<MindNodeMeta>;
    if (isMindAutoCaseTitleNode(childNode)) {
      return false;
    }
    const kind = childNode.metadata?.kind || inferKind(childNode);
    return Boolean(normalizeElementKind(kind));
  }).length;
}

function addCaseElementToStore(caseNodeId: string, kind: CaseNodeKind) {
  const storeNode = getStoreCaseTreeNode(caseNodeId);
  if (!storeNode) {
    return;
  }
  storeNode.children ||= [];
  storeNode.children.push({
    id: crypto.randomUUID(),
    title: defaultTopicForNewChild(kind),
    kind,
    children: [],
  });
  dirty.value = true;
}

/** 按插入顺序依次为：案例标题 → 前置条件 → 测试步骤 → 预期结果 */
function nextCaseElementKindForInsert(
  parent: NodeObj<MindNodeMeta>,
): CaseNodeKind | null {
  const count = countCaseElementChildren(parent);
  if (count >= CASE_ELEMENT_KINDS.length) {
    return null;
  }
  return CASE_ELEMENT_KINDS[count];
}

/** 案例节点默认收起且无子节点时，Mind Elixir 缺少 me-epd，addChild 内 expandNode 会报错 */
function prepareParentForChildInsert(parentNode: NodeObj<MindNodeMeta>) {
  parentNode.expanded = true;
  parentNode.children ||= [];
}

function nextChildKindForParent(
  parent: NodeObj<MindNodeMeta>,
): CaseNodeKind | null {
  const parentKind = getActualNodeKind(parent);
  switch (parentKind) {
    case "root":
      return "system";
    case "system":
      return "module";
    case "module":
      return "requirement";
    case "requirement":
      return "case";
    case "case":
    case "scenario":
      return nextCaseElementKindForInsert(parent);
    default:
      return null;
  }
}

function defaultTopicForNewChild(kind: CaseNodeKind): string {
  if (isCaseElementKind(kind)) {
    return "";
  }
  if (kind === "case") {
    return "新测试节点";
  }
  return "新子主题";
}

function isStructuredHierarchyParent(parent: NodeObj<MindNodeMeta>): boolean {
  const parentKind = getActualNodeKind(parent);
  return (
    parentKind === "root" ||
    parentKind === "system" ||
    parentKind === "module" ||
    parentKind === "requirement" ||
    parentKind === "case" ||
    parentKind === "scenario"
  );
}

async function handleBeforeAddChild(
  this: MindElixirInstance,
  el?: Topic,
  obj?: NodeObj,
): Promise<boolean> {
  const topic = el ?? this.currentNode;
  if (!topic?.nodeObj) {
    return true;
  }

  let parentNode = topic.nodeObj as NodeObj<MindNodeMeta>;
  if (!isStructuredHierarchyParent(parentNode)) {
    return true;
  }

  const parentKind = getActualNodeKind(parentNode);
  if (parentKind === "case") {
    const nextKind = nextChildKindForParent(parentNode);
    if (!nextKind) {
      message.warning(CASE_ELEMENT_CHILD_LIMIT_MESSAGE);
      return false;
    }
    addCaseElementToStore(parentNode.id, nextKind);
    void refreshInspectorChildren(parentNode);
    markTreeDirty();
    return false;
  }
  if (parentKind === "requirement" && !parentNode.metadata?.casesLoaded) {
    await loadRequirementCases(parentNode.id);
    const refreshedTopic = getTopic(parentNode.id);
    if (!refreshedTopic) {
      return false;
    }
    parentNode = refreshedTopic.nodeObj as NodeObj<MindNodeMeta>;
  } else if (
    parentKind === "requirement" &&
    !expandedRequirementIds.value.has(parentNode.id)
  ) {
    await expandRequirementInMind(parentNode.id);
    const refreshedTopic = getTopic(parentNode.id);
    if (!refreshedTopic) {
      return false;
    }
    parentNode = refreshedTopic.nodeObj as NodeObj<MindNodeMeta>;
  }

  const nextKind = nextChildKindForParent(parentNode);
  if (!nextKind) {
    const parentKind = getActualNodeKind(parentNode);
    if (parentKind === "case" || parentKind === "scenario") {
      message.warning(CASE_ELEMENT_CHILD_LIMIT_MESSAGE);
    }
    return false;
  }

  const objKind = (obj?.metadata as MindNodeMeta | undefined)?.kind;
  if (objKind === nextKind) {
    prepareParentForChildInsert(parentNode);
    return true;
  }

  prepareParentForChildInsert(parentNode);
  suppressSelectionSync = true;
  try {
    await this.addChild(
      topic,
      newMindNode(defaultTopicForNewChild(nextKind), nextKind),
    );
    markTreeDirty();
  } finally {
    suppressSelectionSync = false;
  }
  return false;
}

function buildAvailableKindOptions(
  node: NodeObj<MindNodeMeta>,
  parent: NodeObj<MindNodeMeta> | null,
) {
  const allowedKinds = getAllowedKindsByParent(parent);
  if (!allowedKinds.length) {
    const current = node.metadata?.kind || inferKind(node);
    return current ? [buildKindOption(current)] : [];
  }

  let kinds = allowedKinds;
  if (isCaseElementParent(parent)) {
    const currentElementKind = normalizeElementKind(
      node.metadata?.kind || inferKind(node),
    );
    const usedBySiblings = getSiblingUsedElementKinds(node, parent);
    kinds = allowedKinds.filter(
      (kind) => !usedBySiblings.has(kind) || kind === currentElementKind,
    );
  }

  return kinds.map(buildKindOption);
}

function getActualNodeKind(node: NodeObj<MindNodeMeta>): CaseNodeKind {
  return node.metadata?.kind || inferKind(node);
}

function isActualKindInOptions(
  node: NodeObj<MindNodeMeta>,
  optionValues: CaseNodeKind[],
): boolean {
  const actual = getActualNodeKind(node);
  if (optionValues.includes(actual)) {
    return true;
  }
  const normalized = normalizeElementKind(actual);
  return normalized ? optionValues.includes(normalized) : false;
}

const availableKindOptions = computed(() => {
  const node = selectedMindNode.value;
  if (!node) {
    return [];
  }
  const { parent } = findMindNodeContext(node.id);
  return buildAvailableKindOptions(node, parent);
});

const fetchedRequirementIds = ref(new Set<string>());
const expandedRequirementIds = ref(new Set<string>());
const loadingRequirementIds = new Set<string>();
const inspectorChildSummaries = ref<InspectorChildSummary[]>([]);
const inspectorChildrenLoading = ref(false);

const selectedNode = computed(() => {
  const node = selectedMindNode.value;
  if (!node) return null;
  const metadata = node.metadata as MindNodeMeta | undefined;
  return {
    id: node.id,
    title: node.topic,
    kind: metadata?.kind || inferKind(node),
    collapsed: node.expanded === false,
    metadata: metadata?.caseMetadata,
    children: inspectorChildSummaries.value,
  };
});

function setSelectedMindNode(node: NodeObj<MindNodeMeta> | null) {
  selectedMindNode.value = node;
  syncSelectedNodeToStore(node?.id || "");
  selectedTitle.value = node?.topic || "";
  if (node) {
    selectedKind.value = getActualNodeKind(node);
    void nextTick(() => maybeAutoApplySingleKindOption(node));
    void refreshInspectorChildren(node);
  } else {
    selectedKind.value = "scenario";
    inspectorChildSummaries.value = [];
    inspectorChildrenLoading.value = false;
  }
  selectedCaseNature.value = normalizeCaseNature(
    node?.metadata?.caseMetadata?.caseNature,
  );
  selectedPriority.value =
    node?.metadata?.caseMetadata?.priority || DEFAULT_CASE_PRIORITY;
}

async function maybeAutoApplySingleKindOption(node: NodeObj<MindNodeMeta>) {
  if (!mind.value || suppressSelectionSync) {
    return;
  }
  const { parent } = findMindNodeContext(node.id);
  const options = buildAvailableKindOptions(node, parent);
  if (options.length !== 1) {
    return;
  }
  const optionValues = options.map((item) => item.value);
  if (isActualKindInOptions(node, optionValues)) {
    return;
  }
  await applySelectedKind(options[0].value);
}

const needsMindRemount = ref(true);

watch(
  () => store.activeRun?.id,
  (runId) => {
    dirty.value = false;
    fetchedRequirementIds.value = new Set();
    expandedRequirementIds.value = new Set();
    inspectorChildSummaries.value = [];
    inspectorChildrenLoading.value = false;
    needsMindRemount.value = true;
    if (!runId) {
      return;
    }
    excelListRefreshKey.value += 1;
    if (store.workspaceStage === "workbench" && viewMode.value === "xmind") {
      void scheduleMindMapPaint();
    }
  },
  { immediate: true },
);

watch(
  () => store.workspaceStage,
  (stage) => {
    if (stage !== "workbench") {
      return;
    }
    void ensureActiveRunLoaded();
    if (viewMode.value === "xmind" && store.activeRun) {
      needsMindRemount.value = true;
      void scheduleMindMapPaint();
    }
  },
);

watch(
  () => store.activeRunLoading,
  (loading, wasLoading) => {
    if (
      wasLoading &&
      !loading &&
      viewMode.value === "xmind" &&
      store.activeRun
    ) {
      needsMindRemount.value = true;
      void scheduleMindMapPaint();
    }
  },
);

watch(viewMode, async (mode) => {
  if (mode === "xmind") {
    if (activeCaseCount.value > XMIND_MAX_CASES) {
      message.warning(
        `当前 ${activeCaseCount.value} 条案例，请使用 Excel 视图编辑`,
      );
      viewMode.value = "excel";
      return;
    }
    needsMindRemount.value = true;
    await scheduleMindMapPaint();
    if (mind.value) {
      await refocusMindViewport("fit");
      window.setTimeout(() => {
        void refocusMindViewport("fit");
      }, 150);
    }
  } else {
    syncTreeFromMind();
    excelListRefreshKey.value += 1;
  }
});

async function ensureActiveRunLoaded() {
  if (!store.hasProjectRuns || store.activeRun || store.activeRunLoading) {
    return;
  }
  try {
    await store.loadActiveRun();
  } catch (error) {
    message.error((error as Error)?.message || "案例树加载失败");
  }
}

function retryLoadRun() {
  void store.loadActiveRun({ force: true }).catch((error) => {
    message.error((error as Error)?.message || "案例树加载失败");
  });
}

onMounted(() => {
  void ensureActiveRunLoaded();
});

onActivated(() => {
  void ensureActiveRunLoaded();
  if (viewMode.value === "xmind" && store.activeRun) {
    void scheduleMindMapPaint();
  }
});

onBeforeUnmount(() => {
  mindViewportRetryToken += 1;
  mindResizeObserver?.disconnect();
  mindResizeObserver = undefined;
  disposeMindCanvasInteractions?.();
  disposeMindCanvasInteractions = undefined;
  mind.value?.destroy();
  mind.value = null;
});

let mindResizeObserver: ResizeObserver | undefined;
let disposeMindCanvasInteractions: (() => void) | undefined;
let suppressSelectionSync = false;
let mindViewportRetryToken = 0;
const mindLayoutMinSize = 48;
const blankPanThresholdPx = 4;

interface BlankPanGesture {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  active: boolean;
}

let blankPanGesture: BlankPanGesture | null = null;

function resolveMindTopicFromTarget(target: EventTarget | null): Topic | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const direct = target.closest("me-tpc") as Topic | null;
  if (direct) {
    return direct;
  }
  const parent = target.closest("me-parent");
  if (parent) {
    return parent.querySelector("me-tpc") as Topic | null;
  }
  const root = target.closest("me-root");
  if (root) {
    return root.querySelector("me-tpc") as Topic | null;
  }
  return null;
}

function resolveMindTopicFromExpandButton(
  target: EventTarget | null,
): Topic | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const epd = target.closest("me-epd");
  if (!epd) {
    return null;
  }
  const parent = epd.closest("me-parent");
  if (!parent) {
    return null;
  }
  return parent.querySelector("me-tpc") as Topic | null;
}

function isMindExpandButtonTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("me-epd"));
}

function hideMindContextMenu(instance: MindElixirInstance) {
  const menu = (instance.container as HTMLElement | undefined)?.querySelector(
    ".context-menu",
  ) as HTMLElement | null;
  if (menu) {
    menu.hidden = true;
  }
}

function showMindContextMenu(
  instance: MindElixirInstance,
  topic: Topic,
  event: MouseEvent,
) {
  const menuEvent = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: event.clientX,
    clientY: event.clientY,
    button: 2,
  });
  Object.defineProperty(menuEvent, "target", {
    value: topic,
    configurable: true,
  });
  instance.bus.fire("showContextMenu", menuEvent);
}

function isMindInteractivePointerTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(
    target.closest("me-tpc") ||
    target.closest("me-parent") ||
    target.closest("me-root") ||
    target.closest("me-epd") ||
    target.closest(".menu-list") ||
    target.closest(".mind-toolbar"),
  );
}

function syncSelectionFromTopic(topic: Topic) {
  const instance = mind.value;
  if (!instance) {
    return;
  }
  const nodeObj = topic.nodeObj as NodeObj<MindNodeMeta>;
  suppressSelectionSync = true;
  try {
    instance.selectNode(topic);
  } finally {
    suppressSelectionSync = false;
  }
  setSelectedMindNode(nodeObj);
}

function addTopicToMindSelection(topic: Topic) {
  const instance = mind.value;
  if (!instance) {
    return;
  }
  suppressSelectionSync = true;
  try {
    instance.selectNodes([topic]);
  } finally {
    suppressSelectionSync = false;
  }
  setSelectedMindNode(topic.nodeObj as NodeObj<MindNodeMeta>);
}

function isBlankCanvasPointerTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (isMindInteractivePointerTarget(target)) {
    return false;
  }
  return Boolean(
    target.closest(".map-container") || target.closest(".mind-map"),
  );
}

// 不再禁用右键平移，改为在右键菜单处理中区分节点和空白区域
function disableRightButtonCanvasPan(instance: MindElixirInstance) {
  // 保留此函数但不执行任何操作，保持向后兼容
  return;
}

function setCanvasPanCursor(container: HTMLElement, grabbing: boolean) {
  container.classList.toggle("mind-canvas-grabbing", grabbing);
  container.classList.toggle("mind-canvas-grab", !grabbing);
}

/**
 * XMind 风格画布交互：
 * - 左键拖空白：平移画布
 * - 滚轮：上下/左右平移画布（含节点上方）
 * - Shift+滚轮：水平平移
 * - Ctrl/Cmd+滚轮：缩放
 * - 右键节点：单选并弹出操作菜单；Ctrl/Cmd+右键：追加多选
 * - 右键拖空白：平移画布
 * - 左键拖节点：移动/排序（Mind Elixir 默认）
 * - 双击节点：编辑节点
 */
function bindMindCanvasInteractions() {
  disposeMindCanvasInteractions?.();
  const instance = mind.value;
  const container = instance?.container as HTMLElement | undefined;
  const wrap =
    mindCanvasWrap.value ?? mindContainer.value?.parentElement ?? null;
  if (!instance || !container || !(wrap instanceof HTMLElement)) {
    return;
  }

  // 不再禁用右键平移，允许右键拖动画布
  setCanvasPanCursor(container, false);

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    if (!instance.editable) {
      return;
    }
    const topic = resolveMindTopicFromTarget(event.target);
    // 只有在节点上右键才显示菜单，空白区域允许右键平移
    if (!topic) {
      return;
    }
    event.stopImmediatePropagation();
    if (event.ctrlKey || event.metaKey) {
      if (!topic.classList.contains("selected")) {
        addTopicToMindSelection(topic);
      } else {
        setSelectedMindNode(topic.nodeObj as NodeObj<MindNodeMeta>);
      }
    } else {
      syncSelectionFromTopic(topic);
    }
    showMindContextMenu(instance, topic, event);
  };

  const onPointerDown = (event: PointerEvent) => {
    const menu = container.querySelector(".context-menu") as HTMLElement | null;
    if (menu && !menu.hidden) {
      const target = event.target;
      if (!(target instanceof HTMLElement && target.closest(".menu-list"))) {
        hideMindContextMenu(instance);
      }
    }

    if (event.button === 0 && instance.editable) {
      // +/- 由独立 click 处理，pointerdown 里选中会干扰 Mind Elixir 的展开/收起
      if (isMindExpandButtonTarget(event.target)) {
        return;
      }
      const topic = resolveMindTopicFromTarget(event.target);
      if (topic) {
        if (!(event.ctrlKey || event.metaKey)) {
          syncSelectionFromTopic(topic);
        }
        return;
      }
    }

    // 左键拖空白区域平移
    if (
      event.button === 0 &&
      instance.editable &&
      isBlankCanvasPointerTarget(event.target)
    ) {
      blankPanGesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        active: false,
      };
      event.stopImmediatePropagation();
      try {
        container.setPointerCapture(event.pointerId);
      } catch {
        // 忽略 capture 失败
      }
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!blankPanGesture || blankPanGesture.pointerId !== event.pointerId) {
      return;
    }
    const dxFromStart = event.clientX - blankPanGesture.startX;
    const dyFromStart = event.clientY - blankPanGesture.startY;
    if (
      !blankPanGesture.active &&
      Math.hypot(dxFromStart, dyFromStart) < blankPanThresholdPx
    ) {
      return;
    }
    if (!blankPanGesture.active) {
      blankPanGesture.active = true;
      setCanvasPanCursor(container, true);
    }
    const dx = event.clientX - blankPanGesture.lastX;
    const dy = event.clientY - blankPanGesture.lastY;
    blankPanGesture.lastX = event.clientX;
    blankPanGesture.lastY = event.clientY;
    instance.move(dx, dy);
    event.preventDefault();
  };

  const endBlankPan = (event: PointerEvent) => {
    if (!blankPanGesture || blankPanGesture.pointerId !== event.pointerId) {
      return;
    }
    if (!blankPanGesture.active) {
      instance.clearSelection();
    }
    blankPanGesture = null;
    setCanvasPanCursor(container, false);
    try {
      container.releasePointerCapture(event.pointerId);
    } catch {
      // 忽略 release 失败
    }
  };

  // 双击节点编辑
  const onExpandButtonClick = (event: MouseEvent) => {
    if (!instance.editable || event.button !== 0) {
      return;
    }
    const topic = resolveMindTopicFromExpandButton(event.target);
    if (!topic) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    syncSelectionFromTopic(topic);
    const nodeObj = topic.nodeObj as NodeObj<MindNodeMeta>;
    const metadata = nodeObj.metadata;
    if (metadata?.lazyPlaceholder && metadata.parentRequirementId) {
      void loadRequirementCases(metadata.parentRequirementId, { expand: true });
      return;
    }
    runMindExpandKeepingViewport(instance, topic, nodeObj.expanded === false);
  };

  const onDoubleClick = (event: MouseEvent) => {
    if (!instance.editable) {
      return;
    }
    if (isMindExpandButtonTarget(event.target)) {
      return;
    }
    const topic = resolveMindTopicFromTarget(event.target);
    if (topic) {
      event.preventDefault();
      event.stopImmediatePropagation();
      instance.beginEdit(topic);
    }
  };

  const onWheel = (event: WheelEvent) => {
    if (!instance.editable) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.ctrlKey || event.metaKey) {
      const delta = event.deltaY > 0 ? -0.05 : 0.05;
      zoom(delta);
      return;
    }

    if (event.shiftKey) {
      instance.move(-event.deltaY, 0);
      return;
    }

    instance.move(-event.deltaX, -event.deltaY);
  };

  wrap.addEventListener("contextmenu", onContextMenu, true);
  wrap.addEventListener("wheel", onWheel, { passive: false, capture: true });
  container.addEventListener("click", onExpandButtonClick, true);
  container.addEventListener("pointerdown", onPointerDown, true);
  container.addEventListener("pointermove", onPointerMove, true);
  container.addEventListener("pointerup", endBlankPan, true);
  container.addEventListener("pointercancel", endBlankPan, true);
  container.addEventListener("dblclick", onDoubleClick, true);
  disposeMindCanvasInteractions = () => {
    blankPanGesture = null;
    wrap.removeEventListener("contextmenu", onContextMenu, true);
    wrap.removeEventListener("wheel", onWheel, true);
    container.removeEventListener("click", onExpandButtonClick, true);
    container.removeEventListener("pointerdown", onPointerDown, true);
    container.removeEventListener("pointermove", onPointerMove, true);
    container.removeEventListener("pointerup", endBlankPan, true);
    container.removeEventListener("pointercancel", endBlankPan, true);
    container.removeEventListener("dblclick", onDoubleClick, true);
    container.classList.remove("mind-canvas-grabbing", "mind-canvas-grab");
  };
}

function bindMindResizeObserver() {
  mindResizeObserver?.disconnect();
  const el = mindContainer.value;
  if (!el) return;
  mindResizeObserver = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (
      !rect ||
      rect.width < mindLayoutMinSize ||
      rect.height < mindLayoutMinSize
    )
      return;
    if (!mind.value) {
      void scheduleMindMapPaint();
      return;
    }
    void repaintMindLinks();
  });
  mindResizeObserver.observe(el);
}

function isMindLayoutReady(instance: MindElixirInstance, host: HTMLElement) {
  const container = instance.container as HTMLElement;
  const nodes = instance.nodes as HTMLElement;
  const hostRect = host.getBoundingClientRect();
  return (
    hostRect.width >= mindLayoutMinSize &&
    hostRect.height >= mindLayoutMinSize &&
    container.offsetWidth >= mindLayoutMinSize &&
    container.offsetHeight >= mindLayoutMinSize &&
    nodes.offsetWidth > 0 &&
    nodes.offsetHeight > 0
  );
}

/** 切换到 XMind 后等 DOM 挂载且容器有尺寸（v-if 切换常晚于单次 nextTick） */
async function waitForMindContainer(maxAttempts = 32) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await nextTick();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    const el = mindContainer.value;
    const instance = mind.value;
    if (!el) {
      continue;
    }
    if (instance?.container && isMindLayoutReady(instance, el)) {
      return true;
    }
    const { width, height } = el.getBoundingClientRect();
    if (width >= mindLayoutMinSize && height >= mindLayoutMinSize) {
      return true;
    }
    if (attempt === Math.floor(maxAttempts / 2)) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });
    }
  }
  return Boolean(mindContainer.value);
}

/** 等容器可见并完成布局后再画连线（避免 keep-alive / 后台更新时线条缺失） */
async function scheduleMindMapPaint() {
  if (viewMode.value !== "xmind" || !store.activeRun) {
    return;
  }
  const ready = await waitForMindContainer();
  if (!ready || !mindContainer.value) {
    return;
  }
  if (needsMindRemount.value || !mind.value) {
    needsMindRemount.value = false;
    await mountMindMap();
    return;
  }
  refreshMindMap();
}

async function repaintMindLinks() {
  if (!mind.value || !store.activeRun) {
    return;
  }
  await nextTick();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  await relayoutMindLinks();
}

async function mountMindMap() {
  await nextTick();
  if (!mindContainer.value || !store.activeRun) return;

  disposeMindCanvasInteractions?.();
  disposeMindCanvasInteractions = undefined;
  mind.value?.destroy();
  mind.value = markRaw(
    new MindElixir({
      el: mindContainer.value,
      direction: MindElixir.RIGHT,
      editable: true,
      toolBar: false,
      keypress: true,
      contextMenu: {
        locale: zh_CN,
        focus: false,
        link: false,
      },
      allowUndo: true,
      mouseSelectionButton: 0,
      overflowHidden: true,
      alignment: "root",
      scaleMin: 0.35,
      scaleMax: 2.4,
      newTopicName: "新测试节点",
      before: {
        addChild: handleBeforeAddChild,
      },
      theme: {
        name: "CaseForge",
        palette: [
          "#2563eb",
          "#0f766e",
          "#ea580c",
          "#7c3aed",
          "#ca8a04",
          "#dc2626",
        ],
        cssVar: {
          "--node-gap-x": "42px",
          "--node-gap-y": "16px",
          "--main-gap-x": "72px",
          "--main-gap-y": "24px",
          "--main-color": "#172033",
          "--main-bgcolor": "#ffffff",
          "--main-bgcolor-transparent": "rgba(255,255,255,0.82)",
          "--color": "#172033",
          "--bgcolor": "#ffffff",
          "--selected": "#1677ff",
          "--accent-color": "#1677ff",
          "--root-color": "#ffffff",
          "--root-bgcolor": "#2563eb",
          "--root-border-color": "#1d4ed8",
          "--root-radius": "8px",
          "--main-radius": "8px",
          "--topic-padding": "8px 12px",
          "--panel-color": "#334155",
          "--panel-bgcolor": "#ffffff",
          "--panel-border-color": "#d8e0ea",
          "--map-padding": "48px 72px",
        },
      },
    }),
  );

  mind.value.init(
    caseTreeToMindData(store.activeRun.tree, store.activeRun.mindMapExtras),
  );
  mind.value.bus.addListener("operation", (operation: { name?: string }) => {
    if (operation.name === "beginEdit" || suppressSelectionSync) return;
    markTreeDirty();
    syncSelectedDraftFromCurrentTopic();
  });
  mind.value.bus.addListener("selectNodes", (nodes: NodeObj[]) => {
    if (suppressSelectionSync) {
      return;
    }
    const node = nodes[0] as NodeObj<MindNodeMeta> | undefined;
    setSelectedMindNode(node || null);
  });
  mind.value.bus.addListener("expandNode", (nodeObj: NodeObj) => {
    void handleMindExpandNode(nodeObj as NodeObj<MindNodeMeta>);
  });
  setSelectedMindNode(mind.value.nodeData as NodeObj<MindNodeMeta>);
  bindMindCanvasInteractions();
  bindMindResizeObserver();
  await refocusMindViewport("fit");
  window.setTimeout(() => {
    void refocusMindViewport("fit");
  }, 150);
}

function refreshMindMap() {
  if (!mind.value || !store.activeRun || isRefreshing.value) return;
  isRefreshing.value = true;
  const selectedId = store.selectedNodeId;
  mind.value.refresh(
    caseTreeToMindData(store.activeRun.tree, store.activeRun.mindMapExtras),
  );
  mind.value.clearHistory?.();
  void repaintMindLinks().finally(() => {
    isRefreshing.value = false;
    if (!selectedId || !mind.value) {
      return;
    }
    const topic = getTopic(selectedId);
    if (topic) {
      suppressSelectionSync = true;
      try {
        mind.value.selectNode(topic);
      } finally {
        suppressSelectionSync = false;
      }
      setSelectedMindNode(topic.nodeObj as NodeObj<MindNodeMeta>);
    }
  });
}

function syncTreeFromMind() {
  if (!mind.value || !store.activeRun || isRefreshing.value) return;
  const data = mind.value.getData();
  store.activeRun.tree = normalizeCaseTreeForSkill(
    patchStoreFromMind(store.activeRun.tree, mindNodeToCaseTree(data.nodeData)),
    EDITOR_CASE_TREE_NORMALIZE_OPTIONS,
  );
  store.activeRun.mindMapExtras = pickMindMapExtras(data);
  dirty.value = true;
}

const markTreeDirty = debounce(() => {
  if (isRefreshing.value) return;
  dirty.value = true;
}, 120);

const syncSelectedNodeToStore = debounce((nodeId: string) => {
  store.selectedNodeId = nodeId;
}, 80);

function syncSelectedDraftFromCurrentTopic() {
  const topic = selectedTopic();
  if (!topic) return;
  setSelectedMindNode(topic.nodeObj as NodeObj<MindNodeMeta>);
}

function getRequirementCaseChildren(
  requirementNode: CaseTreeNode,
): CaseTreeNode[] {
  return (requirementNode.children || []).filter(
    (child) => child.kind === "case" || child.kind === "scenario",
  );
}

function buildMindOptions(): CaseNodeMindOptions {
  return {
    lazyCases: true,
    fetchedRequirementIds: fetchedRequirementIds.value,
  };
}

function caseTreeToMindData(
  tree: CaseTreeNode,
  extras?: MindMapExtras,
): MindElixirData {
  return {
    direction: MindElixir.RIGHT,
    nodeData: caseNodeToMindNode(tree, buildMindOptions()),
    summaries: extras?.summaries?.length ? extras.summaries : undefined,
  };
}

function pickMindMapExtras(data: MindElixirData): MindMapExtras {
  return {
    summaries: data.summaries ?? [],
  };
}

/** 等导图 DOM 与容器有尺寸后再重算连线（不改编放与平移） */
function runMindExpandKeepingViewport(
  instance: MindElixirInstance,
  topic: Topic,
  expanded: boolean,
) {
  const mapEl = instance.map as HTMLElement | undefined;
  const transformBefore = mapEl?.style.transform ?? "";
  instance.expandNode(topic, expanded);
  // expandNode 会按节点位移做 move 补偿；案例展开子树变高时根居中对齐易把整图推下去
  if (mapEl) {
    mapEl.style.transform = transformBefore;
  }
  void relayoutMindLinks();
}

async function relayoutMindLinks() {
  const instance = mind.value;
  const host = mindContainer.value;
  if (!instance?.container || !host) {
    return;
  }
  const token = mindViewportRetryToken + 1;
  mindViewportRetryToken = token;
  instance.linkDiv();
  await nextTick();
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    if (isMindLayoutReady(instance, host)) {
      instance.linkDiv();
      return;
    }
    if (attempt === 11) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });
    }
  }
  if (!isMindLayoutReady(instance, host) && token === mindViewportRetryToken) {
    window.setTimeout(() => {
      void relayoutMindLinks();
    }, 80);
  }
}

/** 等导图 DOM 与容器有尺寸后再重算连线与视口（仅初始化或用户点「适应画布/居中」时调用） */
async function refocusMindViewport(mode: "fit" | "center" = "fit") {
  await relayoutMindLinks();
  const instance = mind.value;
  const host = mindContainer.value;
  if (!instance?.container || !host || !isMindLayoutReady(instance, host)) {
    return;
  }
  if (mode === "center") {
    if (!instance.scaleVal || instance.scaleVal < 0.2) {
      instance.scaleVal = 1;
    }
    instance.toCenter();
    return;
  }
  instance.scaleFit();
  if (!instance.scaleVal || instance.scaleVal < 0.2) {
    instance.scaleVal = 1;
    instance.toCenter();
  }
}

function caseNodeToMindNode(
  node: CaseTreeNode,
  options: CaseNodeMindOptions,
  requirementTitle?: string,
  parentCase?: CaseTreeNode,
): NodeObj<MindNodeMeta> {
  const nextRequirement =
    node.kind === "requirement"
      ? simplifyRequirementTitleForDisplay(node.title)
      : requirementTitle;
  const parentForChildren = node.kind === "case" ? node : parentCase;
  const topic =
    node.kind === "requirement"
      ? simplifyRequirementTitleForDisplay(node.title)
      : node.kind === "case"
        ? getCaseDisplayTitle(node, nextRequirement)
        : node.kind === "case_title" && parentCase
          ? getCaseTitleOnly(parentCase, nextRequirement)
          : isPlaceholderCaseTitle(node.title)
            ? "详情"
            : sanitizeCaseTitleText(node.title);

  // 案例明细节点不在导图中渲染，仅属性面板展示
  if (node.kind === "case") {
    return {
      id: node.id,
      topic,
      expanded: false,
      tags: [kindLabel(node.kind)],
      style: nodeStyle(node.kind),
      metadata: {
        kind: node.kind,
        caseMetadata: node.metadata,
      },
      children: [],
    };
  }

  if (options.lazyCases && node.kind === "requirement") {
    const caseChildren = getRequirementCaseChildren(node);
    const caseCount = caseChildren.length;
    if (options.fetchedRequirementIds.has(node.id)) {
      const isExpanded = expandedRequirementIds.value.has(node.id);
      if (!isExpanded) {
        return {
          id: node.id,
          topic,
          expanded: true,
          tags: [kindLabel(node.kind)],
          style: nodeStyle(node.kind),
          metadata: {
            kind: node.kind,
            caseMetadata: node.metadata,
            casesLoaded: true,
            caseCount,
          },
          children: [],
        };
      }
      return {
        id: node.id,
        topic,
        expanded: true,
        tags: [kindLabel(node.kind)],
        style: nodeStyle(node.kind),
        metadata: {
          kind: node.kind,
          caseMetadata: node.metadata,
          casesLoaded: true,
          caseCount,
        },
        children: caseChildren.map((child) =>
          caseNodeToMindNode(
            child,
            {
              lazyCases: false,
              fetchedRequirementIds: options.fetchedRequirementIds,
            },
            nextRequirement,
            parentForChildren,
          ),
        ),
      };
    }
    return {
      id: node.id,
      topic,
      expanded: true,
      tags: [kindLabel(node.kind)],
      style: nodeStyle(node.kind),
      metadata: {
        kind: node.kind,
        caseMetadata: node.metadata,
        casesLoaded: false,
        caseCount,
      },
      children: [],
    };
  }

  return {
    id: node.id,
    topic,
    expanded: resolveMindNodeExpanded(node, options.lazyCases),
    tags: [kindLabel(node.kind)],
    style: nodeStyle(node.kind),
    metadata: {
      kind: node.kind,
      caseMetadata: node.metadata,
    },
    children: node.children
      ?.filter((child) => !isCaseDetailKind(child.kind))
      .map((child) =>
        caseNodeToMindNode(child, options, nextRequirement, parentForChildren),
      ),
  };
}

/** 进入编辑台默认展开到：根 → 系统 → 功能模块 → 测试要点；案例及明细需手动 +/- 展开 */
function shouldExpandToTestPointLevel(kind: CaseNodeKind) {
  return (
    kind === "root" ||
    kind === "system" ||
    kind === "module" ||
    kind === "requirement"
  );
}

function isCaseDetailKind(kind: CaseNodeKind): boolean {
  return isCaseElementKind(kind) || normalizeElementKind(kind) !== null;
}

function resolveMindNodeExpanded(node: CaseTreeNode, lazyCases = false) {
  if (lazyCases && node.kind === "requirement") {
    return false;
  }
  if (isCaseDetailKind(node.kind)) {
    return false;
  }
  if (shouldExpandToTestPointLevel(node.kind)) {
    return node.collapsed !== true;
  }
  // 其余节点（场景、章节等）默认收起
  return node.collapsed === false;
}

function applyDefaultHierarchyCollapsedToStore(node: CaseTreeNode) {
  if (shouldExpandToTestPointLevel(node.kind)) {
    node.collapsed = false;
  } else if (node.kind === "case" || isCaseDetailKind(node.kind)) {
    node.collapsed = true;
  }
  for (const child of node.children || []) {
    applyDefaultHierarchyCollapsedToStore(child);
  }
}

/** 重置导图为默认层级：根→系统→功能模块→测试要点展开，案例全部收起 */
function resetMindMapToDefaultHierarchy() {
  if (!mind.value || !store.activeRun?.tree) {
    return;
  }
  expandedRequirementIds.value = new Set();
  applyDefaultHierarchyCollapsedToStore(store.activeRun.tree);
  refreshMindMap();
}

function syncMindNodeExpandedToStore(nodeId: string, expanded: boolean) {
  if (!store.activeRun?.tree) {
    return;
  }
  const node = findCaseTreeNodeById(store.activeRun.tree, nodeId);
  if (!node || isLazyMindNode(node)) {
    return;
  }
  node.collapsed = !expanded;
}

function isLazyMindNode(node: CaseTreeNode): boolean {
  return node.id.startsWith("lazy:") || node.kind === "metadata";
}

function patchStoreFromMind(
  storeNode: CaseTreeNode,
  mindNode: CaseTreeNode,
): CaseTreeNode {
  if (isLazyMindNode(mindNode)) {
    return storeNode;
  }

  const patched: CaseTreeNode = {
    ...storeNode,
    title: mindNode.title,
    collapsed: mindNode.collapsed,
    metadata: mindNode.metadata,
  };

  if (
    mindNode.kind === "requirement" &&
    !fetchedRequirementIds.value.has(mindNode.id)
  ) {
    return patched;
  }

  if (mindNode.kind === "case" || storeNode.kind === "case") {
    return patched;
  }

  const mindChildren = (mindNode.children || []).filter(
    (child) => !isLazyMindNode(child),
  );
  if (!mindChildren.length) {
    return patched;
  }

  const storeChildMap = new Map(
    (storeNode.children || []).map((child) => [child.id, child]),
  );
  patched.children = mindChildren.map((mindChild) => {
    const existing = storeChildMap.get(mindChild.id);
    return existing ? patchStoreFromMind(existing, mindChild) : mindChild;
  });
  return patched;
}

function mindNodeToCaseTree(node: NodeObj): CaseTreeNode {
  const metadata = node.metadata as MindNodeMeta | undefined;
  if (metadata?.lazyPlaceholder) {
    return {
      id: node.id,
      title: node.topic,
      kind: "metadata",
      children: [],
    };
  }
  return {
    id: node.id,
    title: node.topic,
    kind: metadata?.kind || inferKind(node),
    collapsed: node.expanded === false,
    metadata: metadata?.caseMetadata,
    children: (node.children || [])
      .filter(
        (child) =>
          !(child.metadata as MindNodeMeta | undefined)?.lazyPlaceholder,
      )
      .map((child) => mindNodeToCaseTree(child)),
  };
}

function inferKind(node: NodeObj): CaseNodeKind {
  const metadataKind = (node.metadata as MindNodeMeta | undefined)?.kind;
  if (metadataKind) {
    return metadataKind;
  }
  const tag = typeof node.tags?.[0] === "string" ? node.tags[0] : "";
  if (!tag) {
    return "scenario";
  }
  const matched = Object.entries(CASE_NODE_KIND_LABELS)
    .filter(([, label]) => label === tag)
    .map(([kind]) => kind as CaseNodeKind);
  const preferred = matched.find((kind) => kind.startsWith("case_"));
  return preferred || matched[0] || "scenario";
}

function kindLabel(kind: CaseNodeKind) {
  return CASE_NODE_KIND_LABELS[kind] || kind;
}

function nodeStyle(kind: CaseNodeKind) {
  const styles: Partial<Record<CaseNodeKind, NodeObj["style"]>> = {
    root: { background: "#2563eb", color: "#ffffff", fontWeight: "700" },
    system: {
      background: "#e6f7f1",
      color: "#0f5132",
      border: "1px solid #9ddfc6",
    },
    module: {
      background: "#fff7e6",
      color: "#7c3f00",
      border: "1px solid #ffd591",
    },
    requirement: {
      background: "#eef2ff",
      color: "#3730a3",
      border: "1px solid #c7d2fe",
    },
    case: {
      background: "#f8fafc",
      color: "#172033",
      border: "1px solid #cbd5e1",
    },
    case_title: {
      background: "#ffffff",
      color: "#172033",
      border: "1px solid #d8e0ea",
    },
    case_condition: {
      background: "#ffffff",
      color: "#172033",
      border: "1px solid #d8e0ea",
    },
    case_step: {
      background: "#ffffff",
      color: "#172033",
      border: "1px solid #d8e0ea",
    },
    case_expected: {
      background: "#ffffff",
      color: "#172033",
      border: "1px solid #d8e0ea",
    },
    scenario: {
      background: "#f8fafc",
      color: "#172033",
      border: "1px solid #cbd5e1",
    },
    section: {
      background: "#f1f5f9",
      color: "#334155",
      border: "1px solid #cbd5e1",
    },
    condition: {
      background: "#ffffff",
      color: "#172033",
      border: "1px solid #d8e0ea",
    },
    step: {
      background: "#ffffff",
      color: "#172033",
      border: "1px solid #d8e0ea",
    },
    expectation: {
      background: "#ffffff",
      color: "#172033",
      border: "1px solid #d8e0ea",
    },
    metadata: {
      background: "#f8fafc",
      color: "#64748b",
      border: "1px solid #e2e8f0",
    },
  };
  return styles[kind];
}

function summarizeCaseTreeChild(
  node: CaseTreeNode,
  requirementTitle?: string,
  parentCase?: CaseTreeNode,
): InspectorChildSummary {
  const caseParent = node.kind === "case" ? node : parentCase;
  const nextRequirement =
    node.kind === "requirement"
      ? simplifyRequirementTitleForDisplay(node.title)
      : requirementTitle;
  const rawTitle =
    node.kind === "case"
      ? getCaseDisplayTitle(node, nextRequirement)
      : node.kind === "case_title" && caseParent
        ? getCaseTitleOnly(caseParent, nextRequirement)
        : node.kind === "requirement"
          ? simplifyRequirementTitleForDisplay(node.title)
          : isPlaceholderCaseTitle(node.title)
            ? "详情"
            : sanitizeCaseTitleText(node.title);
  const preserveFullText =
    node.kind === "case_condition" ||
    node.kind === "case_step" ||
    node.kind === "case_expected" ||
    node.kind === "condition" ||
    node.kind === "step" ||
    node.kind === "expectation";
  const title = preserveFullText
    ? rawTitle.trim() || "（无标题）"
    : clipInspectorText(rawTitle, 120);
  return {
    id: node.id,
    kind: node.kind,
    kindLabel: kindLabel(node.kind),
    title,
  };
}

function summarizeMindChildren(
  node: NodeObj<MindNodeMeta>,
): InspectorChildSummary[] {
  return (node.children || [])
    .filter(
      (child) => !(child.metadata as MindNodeMeta | undefined)?.lazyPlaceholder,
    )
    .map((child) => summarizeMindChild(child as NodeObj<MindNodeMeta>));
}

async function expandRequirementInMind(requirementNodeId: string) {
  expandedRequirementIds.value = new Set(expandedRequirementIds.value).add(
    requirementNodeId,
  );
  syncMindNodeExpandedToStore(requirementNodeId, true);
  // refresh 已按 expanded:true 渲染案例子节点，不可再 expandNode（会 appendChild 造成重复幽灵节点）
  refreshMindMap();
}

function collapseRequirementInMind(requirementNodeId: string) {
  const next = new Set(expandedRequirementIds.value);
  next.delete(requirementNodeId);
  expandedRequirementIds.value = next;
  syncMindNodeExpandedToStore(requirementNodeId, false);
  refreshMindMap();
}

async function loadRequirementCases(
  requirementNodeId: string,
  options?: { expand?: boolean },
) {
  const shouldExpand = options?.expand !== false;
  if (loadingRequirementIds.has(requirementNodeId)) {
    return;
  }
  const projectId = store.activeProject?.id;
  const runId = store.activeRun?.id;
  if (!projectId || !runId) {
    return;
  }

  const alreadyFetched = fetchedRequirementIds.value.has(requirementNodeId);
  if (alreadyFetched) {
    if (shouldExpand && !expandedRequirementIds.value.has(requirementNodeId)) {
      await expandRequirementInMind(requirementNodeId);
    }
    return;
  }

  const storeNode = store.activeRun?.tree
    ? findCaseTreeNodeById(store.activeRun.tree, requirementNodeId)
    : null;
  const localCaseCount = storeNode
    ? getRequirementCaseChildren(storeNode).length
    : 0;
  // getRun 已带回完整树时无需再请求，直接标记已加载并在导图中展开
  if (localCaseCount > 0) {
    fetchedRequirementIds.value = new Set(fetchedRequirementIds.value).add(
      requirementNodeId,
    );
    if (shouldExpand) {
      await expandRequirementInMind(requirementNodeId);
    }
    return;
  }

  loadingRequirementIds.add(requirementNodeId);
  try {
    await listRunNodeChildren(projectId, runId, requirementNodeId);
    fetchedRequirementIds.value = new Set(fetchedRequirementIds.value).add(
      requirementNodeId,
    );
    if (shouldExpand) {
      await expandRequirementInMind(requirementNodeId);
    }
    const selectedId = selectedMindNode.value?.id;
    if (selectedId === requirementNodeId) {
      const selected = getTopic(requirementNodeId);
      if (selected) {
        setSelectedMindNode(selected.nodeObj as NodeObj<MindNodeMeta>);
      }
    }
  } catch (error) {
    message.error((error as Error)?.message || "加载案例失败");
  } finally {
    loadingRequirementIds.delete(requirementNodeId);
  }
}

async function handleMindExpandNode(nodeObj: NodeObj<MindNodeMeta>) {
  const expanded = nodeObj.expanded !== false;
  const metadata = nodeObj.metadata;

  if (metadata?.lazyPlaceholder && metadata.parentRequirementId) {
    if (expanded) {
      await loadRequirementCases(metadata.parentRequirementId, { expand: true });
    }
    return;
  }

  const kind = getActualNodeKind(nodeObj);
  const nodeId = nodeObj.id;

  if (kind === "requirement") {
    if (!expanded) {
      collapseRequirementInMind(nodeId);
      return;
    }
    if (!fetchedRequirementIds.value.has(nodeId)) {
      await loadRequirementCases(nodeId, { expand: true });
      return;
    }
    if (!expandedRequirementIds.value.has(nodeId)) {
      await expandRequirementInMind(nodeId);
      return;
    }
    syncMindNodeExpandedToStore(nodeId, true);
    return;
  }

  syncMindNodeExpandedToStore(nodeId, expanded);
}

async function refreshInspectorChildren(node: NodeObj<MindNodeMeta>) {
  const kind = getActualNodeKind(node);
  if (kind === "requirement") {
    const storeNode = store.activeRun?.tree
      ? findCaseTreeNodeById(store.activeRun.tree, node.id)
      : null;
    const caseCount = storeNode
      ? countDirectCaseChildren(storeNode)
      : node.metadata?.caseCount || 0;
    if (caseCount <= 0) {
      inspectorChildSummaries.value = [];
      inspectorChildrenLoading.value = false;
      return;
    }
    inspectorChildrenLoading.value = true;
    try {
      // 属性面板与导图保持一致：有案例数据时在导图中展开渲染
      await loadRequirementCases(node.id, { expand: true });
      const refreshed = store.activeRun?.tree
        ? findCaseTreeNodeById(store.activeRun.tree, node.id)
        : null;
      inspectorChildSummaries.value = refreshed
        ? getRequirementCaseChildren(refreshed).map((child) =>
            summarizeCaseTreeChild(child),
          )
        : [];
    } finally {
      inspectorChildrenLoading.value = false;
    }
    return;
  }
  inspectorChildrenLoading.value = false;
  inspectorChildSummaries.value = getInspectorChildrenForNode(node);
}

function getInspectorChildrenForNode(
  node: NodeObj<MindNodeMeta>,
): InspectorChildSummary[] {
  const kind = getActualNodeKind(node);
  if (kind === "case") {
    const storeNode = getStoreCaseTreeNode(node.id);
    if (!storeNode) {
      return [];
    }
    return listCaseElementStoreChildren(node.id).map((child) =>
      summarizeCaseTreeChild(child, undefined, storeNode),
    );
  }
  const mindChildren = summarizeMindChildren(node);
  if (mindChildren.length > 0) {
    return mindChildren;
  }
  const storeNode = store.activeRun?.tree
    ? findCaseTreeNodeById(store.activeRun.tree, node.id)
    : null;
  if (!storeNode?.children?.length) {
    return [];
  }
  return storeNode.children.map((child) => summarizeCaseTreeChild(child));
}

function summarizeMindChild(
  node: NodeObj<MindNodeMeta>,
): InspectorChildSummary {
  const metadata = node.metadata as MindNodeMeta | undefined;
  const kind = metadata?.kind || inferKind(node);
  const rawTitle = node.topic?.trim() || "（无标题）";
  const preserveFullText =
    kind === "case_condition" ||
    kind === "case_step" ||
    kind === "case_expected" ||
    kind === "condition" ||
    kind === "step" ||
    kind === "expectation";
  const title = preserveFullText
    ? rawTitle
    : kind === "requirement"
      ? simplifyRequirementTitleForDisplay(rawTitle)
      : kind === "case_title"
        ? isPlaceholderCaseTitle(rawTitle)
          ? "详情"
          : sanitizeCaseTitleText(rawTitle)
        : clipInspectorText(sanitizeCaseTitleText(rawTitle), 120);
  return {
    id: node.id,
    kind,
    kindLabel: kindLabel(kind),
    title,
  };
}

function clipInspectorText(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

function findAncestorRequirementId(
  node: CaseTreeNode,
  targetId: string,
  currentRequirementId: string | null = null,
): string | null {
  const requirementId =
    node.kind === "requirement" ? node.id : currentRequirementId;
  if (node.id === targetId) {
    return requirementId;
  }
  for (const child of node.children || []) {
    const found = findAncestorRequirementId(child, targetId, requirementId);
    if (found) {
      return found;
    }
  }
  return null;
}

async function focusInspectorChild(child: InspectorChildSummary) {
  if (isCaseDetailKind(child.kind)) {
    return;
  }
  await focusChildNode(child.id);
}

async function focusChildNode(nodeId: string) {
  const storeTree = store.activeRun?.tree;
  if (storeTree) {
    const requirementId = findAncestorRequirementId(storeTree, nodeId);
    if (requirementId) {
      await loadRequirementCases(requirementId, { expand: true });
    }
  }
  await nextTick();
  const topic = getTopic(nodeId);
  if (!topic || !mind.value) {
    return;
  }
  mind.value.selectNode(topic);
  setSelectedMindNode(topic.nodeObj as NodeObj<MindNodeMeta>);
}

function getTopic(id = store.selectedNodeId) {
  if (!mind.value || !id) return null;
  try {
    return mind.value.findEle(id);
  } catch {
    return null;
  }
}

function selectedTopic() {
  return getTopic() || mind.value?.currentNode || null;
}

function zoom(delta: number) {
  if (!mind.value) return;
  mind.value.scale(Math.min(2.4, Math.max(0.35, mind.value.scaleVal + delta)));
}

function centerMap() {
  resetMindMapToDefaultHierarchy();
  void refocusMindViewport("center");
}

function fitMap() {
  resetMindMapToDefaultHierarchy();
  void refocusMindViewport("fit");
}

function undoMap() {
  mind.value?.undo?.();
  syncSelectedDraftFromCurrentTopic();
  markTreeDirty();
}

function redoMap() {
  mind.value?.redo?.();
  syncSelectedDraftFromCurrentTopic();
  markTreeDirty();
}

async function addChild() {
  let topic = selectedTopic();
  if (!mind.value || !topic) return;
  let parent = topic.nodeObj as NodeObj<MindNodeMeta>;
  const parentKind = getActualNodeKind(parent);
  if (parentKind === "case") {
    const nextKind = nextChildKindForParent(parent);
    if (!nextKind) {
      message.warning(CASE_ELEMENT_CHILD_LIMIT_MESSAGE);
      return;
    }
    addCaseElementToStore(parent.id, nextKind);
    await refreshInspectorChildren(parent);
    markTreeDirty();
    return;
  }
  if (parentKind === "requirement" && !parent.metadata?.casesLoaded) {
    await loadRequirementCases(parent.id);
    topic = getTopic(parent.id);
    if (!topic) return;
    parent = topic.nodeObj as NodeObj<MindNodeMeta>;
  } else if (
    parentKind === "requirement" &&
    !expandedRequirementIds.value.has(parent.id)
  ) {
    await expandRequirementInMind(parent.id);
    topic = getTopic(parent.id);
    if (!topic) return;
    parent = topic.nodeObj as NodeObj<MindNodeMeta>;
  }
  const nextKind = nextChildKindForParent(parent);
  if (!nextKind) {
    const parentKind = getActualNodeKind(parent);
    if (parentKind === "case" || parentKind === "scenario") {
      message.warning(CASE_ELEMENT_CHILD_LIMIT_MESSAGE);
    }
    return;
  }
  prepareParentForChildInsert(parent);
  await mind.value.addChild(
    topic,
    newMindNode(defaultTopicForNewChild(nextKind), nextKind),
  );
  syncSelectedDraftFromCurrentTopic();
  markTreeDirty();
}

async function addSibling() {
  const topic = selectedTopic();
  if (!mind.value || !topic || topicKind(topic) === "root") return;
  const context = findMindNodeContext(topic.nodeObj.id);
  const options = buildAvailableKindOptionsForNewSibling(context.parent);
  if (!options.length) {
    message.warning("当前层级没有可添加的类型");
    return;
  }
  await mind.value.insertSibling(
    "after",
    topic,
    newMindNode("新同级主题", options[0].value),
  );
  syncSelectedDraftFromCurrentTopic();
  markTreeDirty();
}

async function removeSelected() {
  const topic = selectedTopic();
  if (!mind.value || !topic || topicKind(topic) === "root") return;
  await mind.value.removeNodes([topic]);
  const rootTopic = getTopic(mind.value.nodeData.id);
  setSelectedMindNode(
    (rootTopic?.nodeObj || mind.value.nodeData) as NodeObj<MindNodeMeta>,
  );
  markTreeDirty();
}

function editSelected() {
  const topic = selectedTopic();
  if (!mind.value || !topic) return;
  mind.value.beginEdit(topic);
}

function topicKind(topic: { nodeObj: NodeObj }) {
  return (topic.nodeObj.metadata as MindNodeMeta | undefined)?.kind;
}

function newMindNode(topic: string, kind: CaseNodeKind): NodeObj<MindNodeMeta> {
  const caseMetadata: CaseNodeMetadata | undefined = isCaseLikeKind(kind)
    ? { caseNature: DEFAULT_CASE_NATURE, priority: DEFAULT_CASE_PRIORITY }
    : undefined;
  return {
    id: crypto.randomUUID(),
    topic,
    expanded: true,
    tags: [kindLabel(kind)],
    style: nodeStyle(kind),
    metadata: { kind, caseMetadata },
    children: [],
  };
}

function buildAvailableKindOptionsForNewSibling(
  parent: NodeObj<MindNodeMeta> | null,
) {
  const allowedKinds = getAllowedKindsByParent(parent);
  if (!allowedKinds.length) {
    return [];
  }
  if (isCaseElementParent(parent) && parent) {
    const used = collectUsedElementKindsFromParent(parent);
    return allowedKinds.filter((kind) => !used.has(kind)).map(buildKindOption);
  }
  return allowedKinds.map(buildKindOption);
}

async function removeAutoGeneratedCaseTitleSiblings(
  currentNodeId: string,
  parent: NodeObj<MindNodeMeta>,
) {
  if (!mind.value) {
    return;
  }
  for (const child of parent.children || []) {
    const childNode = child as NodeObj<MindNodeMeta>;
    if (childNode.id === currentNodeId || !isMindAutoCaseTitleNode(childNode)) {
      continue;
    }
    const childTopic = getTopic(childNode.id);
    if (childTopic) {
      await mind.value.removeNodes([childTopic]);
    }
  }
}

function handleExcelTreeChange(tree: CaseTreeNode) {
  if (!store.activeRun) return;
  store.activeRun.tree = normalizeCaseTreeForSkill(
    tree,
    EDITOR_CASE_TREE_NORMALIZE_OPTIONS,
  );
  dirty.value = true;
  scheduleExcelAutoSave();
}

const scheduleExcelAutoSave = debounce(async () => {
  if (!store.activeRun || viewMode.value !== "excel") return;
  try {
    await store.saveTree({ successMessage: "已自动保存" });
    dirty.value = false;
  } catch {
    dirty.value = true;
  }
}, 500);

async function applySelectedTitle() {
  const topic = selectedTopic();
  if (!mind.value || !topic || selectedTitle.value === topic.nodeObj.topic)
    return;
  await mind.value.setNodeTopic(topic, selectedTitle.value || "未命名节点");
  setSelectedMindNode(topic.nodeObj as NodeObj<MindNodeMeta>);
  markTreeDirty();
}

async function applySelectedKind(nextKind?: CaseNodeKind) {
  const kind = nextKind ?? selectedKind.value;
  const topic = selectedTopic();
  if (!mind.value || !topic) return;
  const context = findMindNodeContext(topic.nodeObj.id);
  const allowed = buildAvailableKindOptions(
    topic.nodeObj as NodeObj<MindNodeMeta>,
    context.parent,
  ).map((item) => item.value);
  if (!allowed.includes(kind)) {
    message.warning(
      kind === "case_title" && isCaseElementParent(context.parent)
        ? "该案例下已存在案例标题，请选择其他类型"
        : "当前层级不允许选择该类型",
    );
    selectedKind.value = getActualNodeKind(
      topic.nodeObj as NodeObj<MindNodeMeta>,
    );
    return;
  }
  const metadata = topic.nodeObj.metadata as MindNodeMeta | undefined;
  const nextCaseMetadata = isCaseLikeKind(kind)
    ? {
        caseNature: selectedCaseNature.value,
        priority: selectedPriority.value,
        ...metadata?.caseMetadata,
      }
    : metadata?.caseMetadata;
  selectedKind.value = kind;
  suppressSelectionSync = true;
  try {
    if (
      kind === "case_title" &&
      context.parent &&
      !isMindAutoCaseTitleNode(topic.nodeObj as NodeObj<MindNodeMeta>)
    ) {
      await removeAutoGeneratedCaseTitleSiblings(
        topic.nodeObj.id,
        context.parent,
      );
    }
    await mind.value.reshapeNode(topic, {
      tags: [kindLabel(kind)],
      style: nodeStyle(kind),
      metadata: {
        ...metadata,
        kind,
        caseMetadata: nextCaseMetadata,
      },
    });
    setSelectedMindNode(topic.nodeObj as NodeObj<MindNodeMeta>);
    markTreeDirty();
  } finally {
    suppressSelectionSync = false;
  }
}

async function applySelectedCaseMetadata() {
  const topic = selectedTopic();
  if (!mind.value || !topic || !isCaseLikeKind(selectedKind.value)) return;
  const metadata = topic.nodeObj.metadata as MindNodeMeta | undefined;
  await mind.value.reshapeNode(topic, {
    metadata: {
      ...metadata,
      kind: selectedKind.value,
      caseMetadata: {
        ...metadata?.caseMetadata,
        caseNature: selectedCaseNature.value,
        priority: selectedPriority.value,
      },
    },
  });
  setSelectedMindNode(topic.nodeObj as NodeObj<MindNodeMeta>);
  markTreeDirty();
}

async function handleSaveTree() {
  if (!store.activeRun) return;
  if (viewMode.value === "xmind") {
    syncTreeFromMind();
  }
  try {
    await store.saveTree();
    dirty.value = false;
    if (viewMode.value === "xmind") {
      refreshMindMap();
    }
  } catch {
    // 错误提示由 store.saveTree 处理
  }
}

function getCurrentEditorTree(): CaseTreeNode | null {
  if (!store.activeRun) return null;
  if (viewMode.value === "xmind") {
    syncTreeFromMind();
  }
  return cloneCaseTree(store.activeRun.tree);
}

async function prepareTreeForAction() {
  if (!store.activeProject || !store.activeRun) return null;
  if (viewMode.value === "xmind") {
    syncTreeFromMind();
  }
  if (dirty.value) {
    try {
      await store.saveTree();
      dirty.value = false;
    } catch {
      return null;
    }
  }
  return getCurrentEditorTree();
}

async function openCaseSelectModal(mode: CaseSelectionMode) {
  try {
    const tree = await prepareTreeForAction();
    if (!tree) return;
    caseSelectModalMode.value = mode;
    caseSelectModalOpen.value = true;
  } catch (error) {
    message.error((error as Error)?.message || "无法读取当前案例树");
  }
}

async function handleSyncToTestPlatform() {
  await openCaseSelectModal("sync");
}

function handleDownloadExcelTemplate() {
  if (!store.activeProject || !store.activeRun) return;
  window.open(
    exportExcelTemplateUrl(store.activeProject.id, store.activeRun.id),
  );
}

async function handleCaseSelectConfirm(caseNodeIds: string[]) {
  if (caseSelectModalMode.value === "excel") {
    if (!store.activeProject || !store.activeRun) return;
    window.open(
      exportUrl(
        store.activeProject.id,
        store.activeRun.id,
        "excel",
        caseNodeIds,
      ),
    );
    caseSelectModalOpen.value = false;
    return;
  }
  await submitSyncToTestPlatform(caseNodeIds);
}

async function submitSyncToTestPlatform(caseNodeIds: string[]) {
  if (!store.activeProject || !store.activeRun) return;
  const tree = getCurrentEditorTree();
  if (!tree) return;
  caseSelectConfirmLoading.value = true;
  try {
    const result = await syncRunToTestPlatform(
      store.activeProject.id,
      store.activeRun.id,
      tree,
      caseNodeIds,
    );
    caseSelectModalOpen.value = false;
    message.success(
      `已同步至测管平台（${result.projectCode}）：新增 ${result.inserted}，更新 ${result.updated}，跳过 ${result.skipped}`,
    );
  } catch (error) {
    message.error((error as Error)?.message || "同步测管平台失败");
  } finally {
    caseSelectConfirmLoading.value = false;
  }
}

const download: MenuProps["onClick"] = async ({ key }) => {
  if (!store.activeProject || !store.activeRun) return;
  if (key === "excel") {
    await openCaseSelectModal("excel");
    return;
  }
  if (viewMode.value === "xmind") {
    syncTreeFromMind();
  }
  if (dirty.value) {
    try {
      await store.saveTree();
      dirty.value = false;
    } catch {
      return;
    }
  }
  window.open(exportUrl(store.activeProject.id, store.activeRun.id, "xmind"));
};
</script>

<style scoped>
.mind-workbench-grid.excel-mode {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  grid-template-columns: 1fr;
  min-height: 0;
  overflow: hidden;
}

.mind-workbench-grid.excel-mode :deep(.excel-wrap) {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
}

.mind-workbench-grid.excel-mode :deep(.excel-scroll) {
  flex: 1 1 auto;
  min-height: 0;
  height: 0;
  overflow: auto;
}

.inspector-children-scroll {
  flex: 1 1 0;
  min-height: 0;
  height: 0;
  overflow-y: auto;
}

.inspector-children-scroll > label {
  flex: 0 0 auto;
}

.inspector-child-list {
  display: grid;
  flex: 0 0 auto;
  gap: 8px;
  margin: 0;
  padding: 0 2px 8px 0;
  list-style: none;
}

.inspector-child-item {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #f9fafb;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.inspector-child-item:hover {
  border-color: #d0d5dd;
  background: #fff;
}

.inspector-child-item.is-readonly {
  cursor: default;
}

.inspector-child-item.is-readonly:hover {
  border-color: #eaecf0;
  background: #f9fafb;
}

.inspector-child-kind {
  color: #667085;
  font-size: 11px;
  font-weight: 600;
}

.inspector-child-title {
  color: #101828;
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.inspector-child-empty {
  margin: 0;
  color: #98a2b3;
  font-size: 12px;
}

.mind-large-tree-alert {
  flex-shrink: 0;
}
</style>
