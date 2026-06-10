<template>
  <section class="panel workbench-panel">
    <div class="panel-header">
      <div>
        <h2>案例编辑台</h2>
        <p>{{ store.activeRun ? store.activeRun.tree.title : '在线编辑案例树并导出' }}</p>
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

    <div v-if="store.activeRun" class="workbench-grid mind-workbench-grid" :class="{ 'excel-mode': viewMode === 'excel' }">
      <CaseTreeExcel
        v-if="viewMode === 'excel'"
        :tree="store.activeRun.tree"
        @change="handleExcelTreeChange"
      />
      <div v-else class="mind-canvas-wrap">
        <div class="mind-toolbar">
          <a-tooltip title="居中">
            <button class="mind-tool-button" @click="centerMap"><AimOutlined /></button>
          </a-tooltip>
          <a-tooltip title="适应画布">
            <button class="mind-tool-button" @click="fitMap"><FullscreenOutlined /></button>
          </a-tooltip>
          <a-tooltip title="放大">
            <button class="mind-tool-button" @click="zoom(0.12)"><ZoomInOutlined /></button>
          </a-tooltip>
          <a-tooltip title="缩小">
            <button class="mind-tool-button" @click="zoom(-0.12)"><ZoomOutOutlined /></button>
          </a-tooltip>
          <span class="mind-toolbar-divider" />
          <a-tooltip
            :title="canAddChildToSelected ? '添加子主题' : '该案例下四种子节点已全部添加'"
          >
            <button class="mind-tool-button" :disabled="!canAddChildToSelected" @click="addChild">
              <PlusOutlined />
            </button>
          </a-tooltip>
          <a-tooltip title="添加同级主题">
            <button class="mind-tool-button" @click="addSibling"><NodeIndexOutlined /></button>
          </a-tooltip>
          <a-tooltip title="编辑节点">
            <button class="mind-tool-button" @click="editSelected"><EditOutlined /></button>
          </a-tooltip>
          <a-tooltip title="删除节点">
            <button class="mind-tool-button danger" @click="removeSelected"><DeleteOutlined /></button>
          </a-tooltip>
          <span class="mind-toolbar-divider" />
          <a-tooltip title="撤销">
            <button class="mind-tool-button" @click="undoMap"><UndoOutlined /></button>
          </a-tooltip>
          <a-tooltip title="重做">
            <button class="mind-tool-button" @click="redoMap"><RedoOutlined /></button>
          </a-tooltip>
        </div>
        <div ref="mindContainer" class="mind-map" />
      </div>

      <aside v-if="viewMode === 'xmind'" class="inspector">
        <h3 class="inspector-title">节点属性</h3>
        <div class="inspector-body">
          <template v-if="selectedNode">
            <label>标题</label>
            <a-input v-model:value="selectedTitle" @press-enter="applySelectedTitle" @blur="applySelectedTitle" />
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
            <template v-if="selectedChildNodes.length">
              <label>子节点（{{ selectedChildNodes.length }}）</label>
              <ul class="inspector-child-list">
                <li
                  v-for="child in selectedChildNodes"
                  :key="child.id"
                  class="inspector-child-item"
                  @click="focusChildNode(child.id)"
                >
                  <span class="inspector-child-kind">{{ child.kindLabel }}</span>
                  <span class="inspector-child-title" :title="child.title">{{ child.title }}</span>
                </li>
              </ul>
            </template>
            <p v-else class="inspector-child-empty">当前节点暂无子节点</p>
            <a-alert
              v-if="dirty"
              type="info"
              show-icon
              message="案例树有本地编辑，保存后导出会使用最新内容。"
            />
          </template>
          <a-empty v-else description="在画布中选择一个节点" />
        </div>
      </aside>
    </div>

    <a-empty v-else class="empty-state workbench-empty">
      <template #description>
        <p class="workbench-empty-title">暂无案例树</p>
        <p class="workbench-empty-steps">
          请先在「02 动态指令」维护测试要点并<strong>生成</strong>案例，生成完成后返回本页进行在线编辑与导出。
        </p>
      </template>
      <div v-if="store.structDoc?.canEnterDynamicInstruct" class="action-toolbar">
        <a-button type="primary" @click="store.setWorkspaceStage('constraints')">
          去动态指令
        </a-button>
      </div>
    </a-empty>

    <CaseSelectionModal
      v-model:open="caseSelectModalOpen"
      :mode="caseSelectModalMode"
      :tree="caseSelectModalTree"
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
  ref,
  shallowRef,
  watch,
} from 'vue';
import MindElixir from 'mind-elixir';
import { zh_CN } from 'mind-elixir/i18n';
import 'mind-elixir/style.css';
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
} from '@ant-design/icons-vue';
import { message, type MenuProps } from 'ant-design-vue';
import type {
  MindElixirData,
  MindElixirInstance,
  NodeObj,
  Topic,
} from 'mind-elixir';
import type { CaseNature, CaseNodeKind, CaseNodeMetadata, CasePriority, CaseTreeNode, MindMapExtras } from '@case-forge/shared';
import { DEFAULT_CASE_NATURE, DEFAULT_CASE_PRIORITY } from '@case-forge/shared';
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
  normalizeCaseNature,
  normalizeCaseTreeForSkill,
  EDITOR_CASE_TREE_NORMALIZE_OPTIONS,
  sanitizeCaseTitleText,
  simplifyRequirementTitleForDisplay,
} from '@case-forge/shared';
import { exportExcelTemplateUrl, exportUrl, syncRunToTestPlatform } from '@/api/client';
import { useCaseForgeStore } from '@/stores/caseForge';
import CaseTreeExcel from '@/components/CaseTreeExcel.vue';
import CaseSelectionModal, { type CaseSelectionMode } from '@/components/CaseSelectionModal.vue';
import { debounce } from '@/utils/debounce';

interface MindNodeMeta {
  kind: CaseNodeKind;
  caseMetadata?: CaseNodeMetadata;
}

interface InspectorChildSummary {
  id: string;
  kind: CaseNodeKind;
  kindLabel: string;
  title: string;
}

const store = useCaseForgeStore();
const viewMode = ref<'xmind' | 'excel'>('xmind');
const viewModeOptions = [
  { label: 'XMind', value: 'xmind' },
  { label: 'Excel', value: 'excel' },
];
const mindContainer = ref<HTMLDivElement | null>(null);
const mind = shallowRef<MindElixirInstance | null>(null);
const selectedMindNode = shallowRef<NodeObj<MindNodeMeta> | null>(null);
const dirty = ref(false);
const caseSelectModalOpen = ref(false);
const caseSelectModalMode = ref<CaseSelectionMode>('sync');
const caseSelectModalTree = ref<CaseTreeNode | null>(null);
const caseSelectConfirmLoading = ref(false);
const isRefreshing = ref(false);
const selectedTitle = ref('');
const selectedKind = ref<CaseNodeKind>('scenario');
const selectedCaseNature = ref<CaseNature>(DEFAULT_CASE_NATURE);
const selectedPriority = ref<CasePriority>(DEFAULT_CASE_PRIORITY);
const caseNatureOptions = [
  { label: '正', value: '正' as CaseNature },
  { label: '反', value: '反' as CaseNature },
];
const casePriorityOptions = [
  { label: '高', value: '高' as CasePriority },
  { label: '中', value: '中' as CasePriority },
  { label: '低', value: '低' as CasePriority },
];
const isSelectedCaseLike = computed(() => isCaseLikeKind(selectedKind.value));

const canAddChildToSelected = computed(() => {
  const node = selectedMindNode.value;
  if (!node) {
    return false;
  }
  const kind = getActualNodeKind(node);
  if (kind !== 'case' && kind !== 'scenario') {
    return true;
  }
  return countCaseElementChildren(node) < CASE_ELEMENT_KINDS.length;
});

const compactNodeThreshold = 220;

const CASE_ELEMENT_CHILD_LIMIT_MESSAGE =
  '该案例下最多只能添加四个子节点（案例标题、前置条件、测试步骤、预期结果）';

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

function getAllowedKindsByParent(parent: NodeObj<MindNodeMeta> | null): CaseNodeKind[] {
  if (!parent) {
    return ['root'];
  }
  const parentKind = parent.metadata?.kind || inferKind(parent);
  switch (parentKind) {
    case 'root':
      return ['system'];
    case 'system':
      return ['module'];
    case 'module':
      return ['requirement'];
    case 'requirement':
      return ['case'];
    case 'case':
    case 'scenario':
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
  return parentKind === 'case' || parentKind === 'scenario';
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
  ): { parent: NodeObj<MindNodeMeta> | null; node: NodeObj<MindNodeMeta> } | null => {
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
    condition: 'case_condition',
    step: 'case_step',
    expectation: 'case_expected',
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

function countCaseElementChildren(parent: NodeObj<MindNodeMeta>): number {
  return (parent.children || []).filter((child) => {
    const childNode = child as NodeObj<MindNodeMeta>;
    if (isMindAutoCaseTitleNode(childNode)) {
      return false;
    }
    const kind = childNode.metadata?.kind || inferKind(childNode);
    return Boolean(normalizeElementKind(kind));
  }).length;
}

/** 按插入顺序依次为：案例标题 → 前置条件 → 测试步骤 → 预期结果 */
function nextCaseElementKindForInsert(parent: NodeObj<MindNodeMeta>): CaseNodeKind | null {
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

function nextChildKindForParent(parent: NodeObj<MindNodeMeta>): CaseNodeKind | null {
  const parentKind = getActualNodeKind(parent);
  switch (parentKind) {
    case 'root':
      return 'system';
    case 'system':
      return 'module';
    case 'module':
      return 'requirement';
    case 'requirement':
      return 'case';
    case 'case':
    case 'scenario':
      return nextCaseElementKindForInsert(parent);
    default:
      return null;
  }
}

function defaultTopicForNewChild(kind: CaseNodeKind): string {
  if (isCaseElementKind(kind)) {
    return '';
  }
  if (kind === 'case') {
    return '新测试节点';
  }
  return '新子主题';
}

function isStructuredHierarchyParent(parent: NodeObj<MindNodeMeta>): boolean {
  const parentKind = getActualNodeKind(parent);
  return (
    parentKind === 'root'
    || parentKind === 'system'
    || parentKind === 'module'
    || parentKind === 'requirement'
    || parentKind === 'case'
    || parentKind === 'scenario'
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

  const parentNode = topic.nodeObj as NodeObj<MindNodeMeta>;
  if (!isStructuredHierarchyParent(parentNode)) {
    return true;
  }

  const nextKind = nextChildKindForParent(parentNode);
  if (!nextKind) {
    const parentKind = getActualNodeKind(parentNode);
    if (parentKind === 'case' || parentKind === 'scenario') {
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
    await this.addChild(topic, newMindNode(defaultTopicForNewChild(nextKind), nextKind));
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
    const currentElementKind = normalizeElementKind(node.metadata?.kind || inferKind(node));
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

const selectedChildNodes = computed<InspectorChildSummary[]>(() => {
  const node = selectedMindNode.value;
  if (!node?.children?.length) {
    return [];
  }
  return node.children.map((child) => summarizeMindChild(child as NodeObj<MindNodeMeta>));
});

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
    children: selectedChildNodes.value,
  };
});

function setSelectedMindNode(node: NodeObj<MindNodeMeta> | null) {
  selectedMindNode.value = node;
  syncSelectedNodeToStore(node?.id || '');
  selectedTitle.value = node?.topic || '';
  if (node) {
    selectedKind.value = getActualNodeKind(node);
    void nextTick(() => maybeAutoApplySingleKindOption(node));
  } else {
    selectedKind.value = 'scenario';
  }
  selectedCaseNature.value = normalizeCaseNature(node?.metadata?.caseMetadata?.caseNature);
  selectedPriority.value = node?.metadata?.caseMetadata?.priority || DEFAULT_CASE_PRIORITY;
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
  () => {
    dirty.value = false;
    needsMindRemount.value = true;
    if (store.workspaceStage === 'workbench' && viewMode.value === 'xmind') {
      void scheduleMindMapPaint();
    }
  },
  { immediate: true },
);

watch(
  () => store.workspaceStage,
  (stage) => {
    if (stage === 'workbench' && viewMode.value === 'xmind' && store.activeRun) {
      void scheduleMindMapPaint();
    }
  },
);

watch(viewMode, async (mode) => {
  if (mode === 'xmind') {
    needsMindRemount.value = true;
    await scheduleMindMapPaint();
  } else {
    syncTreeFromMind();
  }
});

onActivated(() => {
  if (viewMode.value === 'xmind' && store.activeRun) {
    void scheduleMindMapPaint();
  }
});

onBeforeUnmount(() => {
  mindResizeObserver?.disconnect();
  mindResizeObserver = undefined;
  mind.value?.destroy();
  mind.value = null;
});

let mindResizeObserver: ResizeObserver | undefined;
let suppressSelectionSync = false;

function bindMindResizeObserver() {
  mindResizeObserver?.disconnect();
  const el = mindContainer.value;
  if (!el) return;
  mindResizeObserver = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (!rect || rect.width < 8 || rect.height < 8) return;
    if (!mind.value) {
      void scheduleMindMapPaint();
      return;
    }
    void repaintMindLinks();
  });
  mindResizeObserver.observe(el);
}

/** 等容器可见并完成布局后再画连线（避免 keep-alive / 后台更新时线条缺失） */
async function scheduleMindMapPaint() {
  await nextTick();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  if (viewMode.value !== 'xmind' || !store.activeRun || !mindContainer.value) {
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
  mind.value.linkDiv();
  resetInitialViewport(shouldCompactTree(store.activeRun.tree));
}

async function mountMindMap() {
  await nextTick();
  if (!mindContainer.value || !store.activeRun) return;

  mind.value?.destroy();
  mind.value = markRaw(new MindElixir({
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
    overflowHidden: false,
    alignment: 'nodes',
    scaleMin: 0.35,
    scaleMax: 2.4,
    newTopicName: '新测试节点',
    before: {
      addChild: handleBeforeAddChild,
    },
    theme: {
      name: 'CaseForge',
      palette: ['#2563eb', '#0f766e', '#ea580c', '#7c3aed', '#ca8a04', '#dc2626'],
      cssVar: {
        '--node-gap-x': '42px',
        '--node-gap-y': '16px',
        '--main-gap-x': '72px',
        '--main-gap-y': '24px',
        '--main-color': '#172033',
        '--main-bgcolor': '#ffffff',
        '--main-bgcolor-transparent': 'rgba(255,255,255,0.82)',
        '--color': '#172033',
        '--bgcolor': '#ffffff',
        '--selected': '#1677ff',
        '--accent-color': '#1677ff',
        '--root-color': '#ffffff',
        '--root-bgcolor': '#2563eb',
        '--root-border-color': '#1d4ed8',
        '--root-radius': '8px',
        '--main-radius': '8px',
        '--topic-padding': '8px 12px',
        '--panel-color': '#334155',
        '--panel-bgcolor': '#ffffff',
        '--panel-border-color': '#d8e0ea',
        '--map-padding': '120px 220px',
      },
    },
  }));

  mind.value.init(caseTreeToMindData(store.activeRun.tree, store.activeRun.mindMapExtras));
  mind.value.bus.addListener('operation', (operation: { name?: string }) => {
    if (operation.name === 'beginEdit' || suppressSelectionSync) return;
    markTreeDirty();
    syncSelectedDraftFromCurrentTopic();
  });
  mind.value.bus.addListener('selectNodes', (nodes: NodeObj[]) => {
    const node = nodes[0] as NodeObj<MindNodeMeta> | undefined;
    setSelectedMindNode(node || null);
  });
  setSelectedMindNode(mind.value.nodeData as NodeObj<MindNodeMeta>);
  bindMindResizeObserver();
  await repaintMindLinks();
}

function refreshMindMap() {
  if (!mind.value || !store.activeRun || isRefreshing.value) return;
  isRefreshing.value = true;
  mind.value.refresh(caseTreeToMindData(store.activeRun.tree, store.activeRun.mindMapExtras));
  mind.value.clearHistory?.();
  if (store.selectedNodeId) {
    const topic = getTopic(store.selectedNodeId);
    if (topic) mind.value.selectNode(topic);
  }
  void repaintMindLinks().finally(() => {
    isRefreshing.value = false;
  });
}

function syncTreeFromMind() {
  if (!mind.value || !store.activeRun || isRefreshing.value) return;
  const data = mind.value.getData();
  store.activeRun.tree = normalizeCaseTreeForSkill(
    mindNodeToCaseTree(data.nodeData),
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

function caseTreeToMindData(tree: CaseTreeNode, extras?: MindMapExtras): MindElixirData {
  const compact = shouldCompactTree(tree);
  return {
    direction: MindElixir.RIGHT,
    nodeData: caseNodeToMindNode(tree, compact),
    summaries: extras?.summaries?.length ? extras.summaries : undefined,
  };
}

function pickMindMapExtras(data: MindElixirData): MindMapExtras {
  return {
    summaries: data.summaries ?? [],
  };
}

function shouldCompactTree(tree: CaseTreeNode) {
  return countCaseNodes(tree) > compactNodeThreshold;
}

function resetInitialViewport(compact: boolean) {
  if (!mind.value) return;
  if (compact) {
    mind.value.scale(0.85);
    mind.value.toCenter();
    return;
  }
  mind.value.scaleFit();
}

function caseNodeToMindNode(
  node: CaseTreeNode,
  compact = false,
  requirementTitle?: string,
  parentCase?: CaseTreeNode,
): NodeObj<MindNodeMeta> {
  const nextRequirement =
    node.kind === 'requirement'
      ? simplifyRequirementTitleForDisplay(node.title)
      : requirementTitle;
  const parentForChildren = node.kind === 'case' ? node : parentCase;
  const topic =
    node.kind === 'requirement'
      ? simplifyRequirementTitleForDisplay(node.title)
      : node.kind === 'case'
        ? getCaseDisplayTitle(node, nextRequirement)
        : node.kind === 'case_title' && parentCase
          ? getCaseTitleOnly(parentCase, nextRequirement)
          : isPlaceholderCaseTitle(node.title)
            ? '详情'
            : sanitizeCaseTitleText(node.title);
  return {
    id: node.id,
    topic,
    expanded: resolveMindNodeExpanded(node),
    tags: [kindLabel(node.kind)],
    style: nodeStyle(node.kind),
    metadata: {
      kind: node.kind,
      caseMetadata: node.metadata,
    },
    children: node.children?.map((child) =>
      caseNodeToMindNode(child, compact, nextRequirement, parentForChildren),
    ),
  };
}

function countCaseNodes(node: CaseTreeNode): number {
  return 1 + (node.children || []).reduce((total, child) => total + countCaseNodes(child), 0);
}

/** 进入编辑台默认展开到：根 → 系统 → 功能模块 → 测试要点（案例节点可见，其子级默认收起） */
function shouldExpandToTestPointLevel(kind: CaseNodeKind) {
  return (
    kind === 'root' ||
    kind === 'system' ||
    kind === 'module' ||
    kind === 'requirement'
  );
}

function resolveMindNodeExpanded(node: CaseTreeNode) {
  if (shouldExpandToTestPointLevel(node.kind)) {
    return node.collapsed !== true;
  }
  return false;
}

function mindNodeToCaseTree(node: NodeObj): CaseTreeNode {
  const metadata = node.metadata as MindNodeMeta | undefined;
  return {
    id: node.id,
    title: node.topic,
    kind: metadata?.kind || inferKind(node),
    collapsed: node.expanded === false,
    metadata: metadata?.caseMetadata,
    children: (node.children || []).map((child) => mindNodeToCaseTree(child)),
  };
}

function inferKind(node: NodeObj): CaseNodeKind {
  const metadataKind = (node.metadata as MindNodeMeta | undefined)?.kind;
  if (metadataKind) {
    return metadataKind;
  }
  const tag = typeof node.tags?.[0] === 'string' ? node.tags[0] : '';
  if (!tag) {
    return 'scenario';
  }
  const matched = Object.entries(CASE_NODE_KIND_LABELS)
    .filter(([, label]) => label === tag)
    .map(([kind]) => kind as CaseNodeKind);
  const preferred = matched.find((kind) => kind.startsWith('case_'));
  return preferred || matched[0] || 'scenario';
}

function kindLabel(kind: CaseNodeKind) {
  return CASE_NODE_KIND_LABELS[kind] || kind;
}

function nodeStyle(kind: CaseNodeKind) {
  const styles: Partial<Record<CaseNodeKind, NodeObj['style']>> = {
    root: { background: '#2563eb', color: '#ffffff', fontWeight: '700' },
    system: { background: '#e6f7f1', color: '#0f5132', border: '1px solid #9ddfc6' },
    module: { background: '#fff7e6', color: '#7c3f00', border: '1px solid #ffd591' },
    requirement: { background: '#eef2ff', color: '#3730a3', border: '1px solid #c7d2fe' },
    case: { background: '#f8fafc', color: '#172033', border: '1px solid #cbd5e1' },
    case_title: { background: '#ffffff', color: '#172033', border: '1px solid #d8e0ea' },
    case_condition: { background: '#ffffff', color: '#172033', border: '1px solid #d8e0ea' },
    case_step: { background: '#ffffff', color: '#172033', border: '1px solid #d8e0ea' },
    case_expected: { background: '#ffffff', color: '#172033', border: '1px solid #d8e0ea' },
    scenario: { background: '#f8fafc', color: '#172033', border: '1px solid #cbd5e1' },
    section: { background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' },
    condition: { background: '#ffffff', color: '#172033', border: '1px solid #d8e0ea' },
    step: { background: '#ffffff', color: '#172033', border: '1px solid #d8e0ea' },
    expectation: { background: '#ffffff', color: '#172033', border: '1px solid #d8e0ea' },
    metadata: { background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' },
  };
  return styles[kind];
}

function summarizeMindChild(node: NodeObj<MindNodeMeta>): InspectorChildSummary {
  const metadata = node.metadata as MindNodeMeta | undefined;
  const kind = metadata?.kind || inferKind(node);
  const rawTitle = node.topic?.trim() || '（无标题）';
  const preserveFullText =
    kind === 'case_condition'
    || kind === 'case_step'
    || kind === 'case_expected'
    || kind === 'condition'
    || kind === 'step'
    || kind === 'expectation';
  const title = preserveFullText
    ? rawTitle
    : kind === 'requirement'
      ? simplifyRequirementTitleForDisplay(rawTitle)
      : kind === 'case_title'
        ? isPlaceholderCaseTitle(rawTitle)
          ? '详情'
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
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

function focusChildNode(nodeId: string) {
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
  mind.value?.toCenter();
}

function fitMap() {
  mind.value?.scaleFit();
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
  const topic = selectedTopic();
  if (!mind.value || !topic) return;
  const parent = topic.nodeObj as NodeObj<MindNodeMeta>;
  const nextKind = nextChildKindForParent(parent);
  if (!nextKind) {
    const parentKind = getActualNodeKind(parent);
    if (parentKind === 'case' || parentKind === 'scenario') {
      message.warning(CASE_ELEMENT_CHILD_LIMIT_MESSAGE);
    }
    return;
  }
  prepareParentForChildInsert(parent);
  await mind.value.addChild(topic, newMindNode(defaultTopicForNewChild(nextKind), nextKind));
  syncSelectedDraftFromCurrentTopic();
  markTreeDirty();
}

async function addSibling() {
  const topic = selectedTopic();
  if (!mind.value || !topic || topicKind(topic) === 'root') return;
  const context = findMindNodeContext(topic.nodeObj.id);
  const options = buildAvailableKindOptionsForNewSibling(context.parent);
  if (!options.length) {
    message.warning('当前层级没有可添加的类型');
    return;
  }
  await mind.value.insertSibling('after', topic, newMindNode('新同级主题', options[0].value));
  syncSelectedDraftFromCurrentTopic();
  markTreeDirty();
}

async function removeSelected() {
  const topic = selectedTopic();
  if (!mind.value || !topic || topicKind(topic) === 'root') return;
  await mind.value.removeNodes([topic]);
  const rootTopic = getTopic(mind.value.nodeData.id);
  setSelectedMindNode((rootTopic?.nodeObj || mind.value.nodeData) as NodeObj<MindNodeMeta>);
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
  store.activeRun.tree = normalizeCaseTreeForSkill(tree, EDITOR_CASE_TREE_NORMALIZE_OPTIONS);
  dirty.value = true;
  scheduleExcelAutoSave();
}

const scheduleExcelAutoSave = debounce(async () => {
  if (!store.activeRun || viewMode.value !== 'excel') return;
  try {
    await store.saveTree({ successMessage: '已自动保存' });
    dirty.value = false;
  } catch {
    dirty.value = true;
  }
}, 500);

async function applySelectedTitle() {
  const topic = selectedTopic();
  if (!mind.value || !topic || selectedTitle.value === topic.nodeObj.topic) return;
  await mind.value.setNodeTopic(topic, selectedTitle.value || '未命名节点');
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
      kind === 'case_title' && isCaseElementParent(context.parent)
        ? '该案例下已存在案例标题，请选择其他类型'
        : '当前层级不允许选择该类型',
    );
    selectedKind.value = getActualNodeKind(topic.nodeObj as NodeObj<MindNodeMeta>);
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
      kind === 'case_title'
      && context.parent
      && !isMindAutoCaseTitleNode(topic.nodeObj as NodeObj<MindNodeMeta>)
    ) {
      await removeAutoGeneratedCaseTitleSiblings(topic.nodeObj.id, context.parent);
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
  if (viewMode.value === 'xmind') {
    syncTreeFromMind();
  }
  try {
    await store.saveTree();
    dirty.value = false;
    if (viewMode.value === 'xmind') {
      refreshMindMap();
    }
  } catch {
    // 错误提示由 store.saveTree 处理
  }
}

function getCurrentEditorTree(): CaseTreeNode | null {
  if (!store.activeRun) return null;
  if (viewMode.value === 'xmind') {
    syncTreeFromMind();
  }
  return cloneCaseTree(store.activeRun.tree);
}

async function prepareTreeForAction() {
  if (!store.activeProject || !store.activeRun) return null;
  if (viewMode.value === 'xmind') {
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
    caseSelectModalTree.value = tree;
    caseSelectModalOpen.value = true;
  } catch (error) {
    message.error((error as Error)?.message || '无法读取当前案例树');
  }
}

async function handleSyncToTestPlatform() {
  await openCaseSelectModal('sync');
}

function handleDownloadExcelTemplate() {
  if (!store.activeProject || !store.activeRun) return;
  window.open(
    exportExcelTemplateUrl(store.activeProject.id, store.activeRun.id),
  );
}

async function handleCaseSelectConfirm(caseNodeIds: string[]) {
  if (caseSelectModalMode.value === 'excel') {
    if (!store.activeProject || !store.activeRun) return;
    window.open(
      exportUrl(store.activeProject.id, store.activeRun.id, 'excel', caseNodeIds),
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
    message.error((error as Error)?.message || '同步测管平台失败');
  } finally {
    caseSelectConfirmLoading.value = false;
  }
}

const download: MenuProps['onClick'] = async ({ key }) => {
  if (!store.activeProject || !store.activeRun) return;
  if (key === 'excel') {
    await openCaseSelectModal('excel');
    return;
  }
  if (viewMode.value === 'xmind') {
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
  window.open(exportUrl(store.activeProject.id, store.activeRun.id, 'xmind'));
};
</script>

<style scoped>
.mind-workbench-grid.excel-mode {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  grid-template-columns: 1fr;
  min-height: 0;
  height: 0;
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

.inspector-child-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
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
</style>
