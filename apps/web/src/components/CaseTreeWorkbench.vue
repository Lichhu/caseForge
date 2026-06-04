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
          保存树
        </a-button>
        <a-button
          :disabled="!store.activeRun"
          :loading="testPlatformSyncing"
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
              <a-menu-item key="json">JSON</a-menu-item>
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
          <a-tooltip title="添加子主题">
            <button class="mind-tool-button" @click="addChild"><PlusOutlined /></button>
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
        <h3>节点属性</h3>
        <template v-if="selectedNode">
          <label>标题</label>
          <a-input v-model:value="selectedTitle" @press-enter="applySelectedTitle" @blur="applySelectedTitle" />
          <label>类型</label>
          <a-select v-model:value="selectedKind" :options="kindOptions" @change="applySelectedKind" />
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
            message="案例树有本地编辑，保存树后导出会使用最新内容。"
          />
        </template>
        <a-empty v-else description="在画布中选择一个节点" />
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

    <TestPlatformSyncModal
      v-model:open="testPlatformSyncOpen"
      :tree="syncModalTree"
      :confirm-loading="testPlatformSyncing"
      @confirm="submitSyncToTestPlatform"
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
} from 'mind-elixir';
import type { CaseNodeKind, CaseNodeMetadata, CaseTreeNode, MindMapExtras } from '@case-forge/shared';
import {
  CASE_NODE_KIND_LABELS,
  getCaseDisplayTitle,
  getCaseTitleOnly,
  isPlaceholderCaseTitle,
  cloneCaseTree,
  normalizeCaseTreeForSkill,
  nextSixLevelChildKind,
  sanitizeCaseTitleText,
  simplifyRequirementTitleForDisplay,
} from '@case-forge/shared';
import { exportUrl, syncRunToTestPlatform } from '@/api/client';
import { useCaseForgeStore } from '@/stores/caseForge';
import CaseTreeExcel from '@/components/CaseTreeExcel.vue';
import TestPlatformSyncModal from '@/components/TestPlatformSyncModal.vue';
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
const testPlatformSyncing = ref(false);
const testPlatformSyncOpen = ref(false);
const syncModalTree = ref<CaseTreeNode | null>(null);
const isRefreshing = ref(false);
const selectedTitle = ref('');
const selectedKind = ref<CaseNodeKind>('scenario');
const compactNodeThreshold = 220;

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

const kindOptions: Array<{ label: string; value: CaseNodeKind }> = [
  { label: CASE_NODE_KIND_LABELS.root, value: 'root' },
  { label: CASE_NODE_KIND_LABELS.system, value: 'system' },
  { label: CASE_NODE_KIND_LABELS.module, value: 'module' },
  { label: CASE_NODE_KIND_LABELS.requirement, value: 'requirement' },
  { label: CASE_NODE_KIND_LABELS.case, value: 'case' },
  { label: CASE_NODE_KIND_LABELS.case_title, value: 'case_title' },
  { label: CASE_NODE_KIND_LABELS.case_condition, value: 'case_condition' },
  { label: CASE_NODE_KIND_LABELS.case_step, value: 'case_step' },
  { label: CASE_NODE_KIND_LABELS.case_expected, value: 'case_expected' },
  { label: CASE_NODE_KIND_LABELS.scenario, value: 'scenario' },
  { label: CASE_NODE_KIND_LABELS.section, value: 'section' },
  { label: CASE_NODE_KIND_LABELS.condition, value: 'condition' },
  { label: CASE_NODE_KIND_LABELS.step, value: 'step' },
  { label: CASE_NODE_KIND_LABELS.expectation, value: 'expectation' },
  { label: CASE_NODE_KIND_LABELS.metadata, value: 'metadata' },
];

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
  mind.value?.destroy();
  mind.value = null;
});

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
    if (operation.name === 'beginEdit') return;
    markTreeDirty();
    syncSelectedDraftFromCurrentTopic();
  });
  mind.value.bus.addListener('selectNodes', (nodes: NodeObj[]) => {
    const node = nodes[0] as NodeObj<MindNodeMeta> | undefined;
    setSelectedMindNode(node || null);
  });
  setSelectedMindNode(mind.value.nodeData as NodeObj<MindNodeMeta>);
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

function setSelectedMindNode(node: NodeObj<MindNodeMeta> | null) {
  selectedMindNode.value = node;
  syncSelectedNodeToStore(node?.id || '');
  selectedTitle.value = node?.topic || '';
  selectedKind.value = node ? node.metadata?.kind || inferKind(node) : 'scenario';
}

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
  const tag = typeof node.tags?.[0] === 'string' ? node.tags[0] : '';
  return (kindOptions.find((item) => item.label === tag)?.value || 'scenario') as CaseNodeKind;
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
  const title =
    kind === 'requirement'
      ? simplifyRequirementTitleForDisplay(rawTitle)
      : kind === 'case_title'
        ? isPlaceholderCaseTitle(rawTitle)
          ? '详情'
          : sanitizeCaseTitleText(rawTitle)
        : sanitizeCaseTitleText(rawTitle);
  return {
    id: node.id,
    kind,
    kindLabel: kindLabel(kind),
    title: clipInspectorText(title, 120),
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
  await mind.value.addChild(topic, newMindNode('新子主题', nextChildKind()));
  syncSelectedDraftFromCurrentTopic();
  markTreeDirty();
}

async function addSibling() {
  const topic = selectedTopic();
  if (!mind.value || !topic || topicKind(topic) === 'root') return;
  await mind.value.insertSibling('after', topic, newMindNode('新同级主题', selectedKind.value));
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
  return {
    id: crypto.randomUUID(),
    topic,
    expanded: true,
    tags: [kindLabel(kind)],
    style: nodeStyle(kind),
    metadata: { kind },
    children: [],
  };
}

function nextChildKind(): CaseNodeKind {
  return nextSixLevelChildKind(selectedKind.value);
}

function handleExcelTreeChange(tree: CaseTreeNode) {
  if (!store.activeRun) return;
  store.activeRun.tree = normalizeCaseTreeForSkill(tree);
  dirty.value = true;
}

async function applySelectedTitle() {
  const topic = selectedTopic();
  if (!mind.value || !topic || selectedTitle.value === topic.nodeObj.topic) return;
  await mind.value.setNodeTopic(topic, selectedTitle.value || '未命名节点');
  setSelectedMindNode(topic.nodeObj as NodeObj<MindNodeMeta>);
  markTreeDirty();
}

async function applySelectedKind() {
  const topic = selectedTopic();
  if (!mind.value || !topic) return;
  const metadata = topic.nodeObj.metadata as MindNodeMeta | undefined;
  await mind.value.reshapeNode(topic, {
    tags: [kindLabel(selectedKind.value)],
    style: nodeStyle(selectedKind.value),
    metadata: {
      ...metadata,
      kind: selectedKind.value,
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

async function handleSyncToTestPlatform() {
  if (!store.activeProject || !store.activeRun) return;
  try {
    const tree = getCurrentEditorTree();
    if (!tree) return;
    syncModalTree.value = tree;
    testPlatformSyncOpen.value = true;
  } catch (error) {
    message.error((error as Error)?.message || '无法读取当前案例树');
  }
}

async function submitSyncToTestPlatform(caseNodeIds: string[]) {
  if (!store.activeProject || !store.activeRun) return;
  const tree = getCurrentEditorTree();
  if (!tree) return;
  testPlatformSyncing.value = true;
  try {
    const result = await syncRunToTestPlatform(
      store.activeProject.id,
      store.activeRun.id,
      tree,
      caseNodeIds,
    );
    testPlatformSyncOpen.value = false;
    message.success(
      `已同步至测管平台（${result.projectCode}）：新增 ${result.inserted}，更新 ${result.updated}，跳过 ${result.skipped}`,
    );
  } catch (error) {
    message.error((error as Error)?.message || '同步测管平台失败');
  } finally {
    testPlatformSyncing.value = false;
  }
}

const download: MenuProps['onClick'] = async ({ key }) => {
  if (!store.activeProject || !store.activeRun) return;
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
  window.open(exportUrl(store.activeProject.id, store.activeRun.id, key as 'json' | 'excel' | 'xmind'));
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
  max-height: 100%;
}

.inspector-child-list {
  display: grid;
  gap: 8px;
  max-height: min(420px, 42vh);
  margin: 0;
  padding: 0;
  overflow: auto;
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
  word-break: break-word;
}

.inspector-child-empty {
  margin: 0;
  color: #98a2b3;
  font-size: 12px;
}
</style>
