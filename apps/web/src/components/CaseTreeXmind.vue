<template>
  <div class="xmind-wrap">
    <div class="xmind-toolbar">
      <div class="xmind-toolbar-actions">
        <a-button size="small" @click="expandAll(true)">展开全部</a-button>
        <a-button size="small" @click="expandAll(false)">折叠全部</a-button>
        <a-button size="small" @click="recenter">居中</a-button>
      </div>
      <span class="xmind-hint">
        六级结构：根 → 系统 → 功能模块 → 测试要点 → 案例 → 案例标题/前置条件/步骤/预期
      </span>
    </div>
    <div class="xmind-body">
      <div ref="containerRef" class="xmind-canvas"></div>
      <aside class="xmind-child-panel">
        <div v-if="selectedNode" class="xmind-child-panel-inner">
          <header class="xmind-child-panel-header">
            <span class="xmind-child-panel-kind">{{
              selectedKindLabel
            }}</span>
            <h3 class="xmind-child-panel-title" :title="selectedNode.topic">
              {{ selectedNode.topic || "未命名节点" }}
            </h3>
            <p class="xmind-child-panel-meta">
              子节点 {{ childItems.length }} 个
            </p>
          </header>
          <div v-if="childItems.length" class="xmind-child-list">
            <button
              v-for="item in childItems"
              :key="item.id"
              type="button"
              class="xmind-child-item"
              @click="focusChild(item.id)"
            >
              <span class="xmind-child-item-kind">{{ item.kindLabel }}</span>
              <span class="xmind-child-item-title" :title="item.topic">
                {{ item.topic || "未命名" }}
              </span>
              <span v-if="item.extraTags.length" class="xmind-child-item-tags">
                <span
                  v-for="tag in item.extraTags"
                  :key="tag"
                  class="xmind-child-item-tag"
                >
                  {{ tag }}
                </span>
              </span>
            </button>
          </div>
          <a-empty
            v-else
            class="xmind-child-empty"
            description="该节点暂无子节点"
          />
        </div>
        <div v-else class="xmind-child-panel-placeholder">
          <p>点击脑图节点</p>
          <p class="xmind-child-panel-placeholder-sub">查看其子节点列表</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import MindElixir, { type MindElixirInstance, type NodeObj } from "mind-elixir";
import { zh_CN } from "mind-elixir/i18n";
import "mind-elixir/style";
import type { CaseNodeKind, CaseTreeNode, MindMapExtras } from "@case-forge/shared";
import { CASE_NODE_KIND_LABELS } from "@case-forge/shared";
import {
  caseTreeToMindData,
  mindDataToCaseTree,
  type CaseMindMeta,
} from "@/utils/caseTreeMindMap";
import { debounce } from "@/utils/debounce";

type CaseNodeObj = NodeObj<CaseMindMeta>;

const props = defineProps<{
  tree: CaseTreeNode;
  extras?: MindMapExtras | null;
}>();

const emit = defineEmits<{
  change: [tree: CaseTreeNode];
  "extras-change": [extras: MindMapExtras];
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const selectedNodeId = ref<string | null>(null);
const selectedNode = ref<CaseNodeObj | null>(null);
let mind: MindElixirInstance | null = null;

const selectedKindLabel = computed(() =>
  resolveKindLabel(selectedNode.value),
);

const childItems = computed(() => {
  const children = (selectedNode.value?.children ?? []) as CaseNodeObj[];
  return children.map((child) => {
    const kind = child.metadata?.kind;
    const kindLabel = kind
      ? CASE_NODE_KIND_LABELS[kind] ?? kind
      : "节点";
    const extraTags = (child.tags ?? [])
      .map((tag) => (typeof tag === "string" ? tag : tag.text))
      .filter((tag) => tag !== kindLabel && !tag.startsWith("优先级·"));
    return {
      id: child.id,
      topic: child.topic ?? "",
      kindLabel,
      extraTags,
    };
  });
});

function resolveKindLabel(node: CaseNodeObj | null): string {
  const kind = node?.metadata?.kind as CaseNodeKind | undefined;
  if (kind) {
    return CASE_NODE_KIND_LABELS[kind] ?? kind;
  }
  return "节点";
}

function refreshSelectedNode() {
  if (!mind || !selectedNodeId.value) {
    selectedNode.value = null;
    return;
  }
  const obj = mind.getObjById(selectedNodeId.value, mind.nodeData);
  selectedNode.value = (obj as CaseNodeObj | null) ?? null;
}

function handleSelectNodes(nodes: NodeObj<unknown>[]) {
  if (!nodes.length) {
    selectedNodeId.value = null;
    selectedNode.value = null;
    return;
  }
  selectedNodeId.value = nodes[0].id;
  refreshSelectedNode();
}

function handleUnselectNodes() {
  selectedNodeId.value = null;
  selectedNode.value = null;
}

function focusChild(childId: string) {
  if (!mind) {
    return;
  }
  const el = mind.findEle(childId);
  if (!el) {
    return;
  }
  mind.selectNode(el);
  mind.scrollIntoView(el, true);
  selectedNodeId.value = childId;
  refreshSelectedNode();
}

const syncToTree = debounce(() => {
  if (!mind) {
    return;
  }
  const { tree, extras } = mindDataToCaseTree(mind.getData());
  emit("change", tree);
  emit("extras-change", extras);
  refreshSelectedNode();
}, 400);

function handleMutation() {
  syncToTree();
}

onMounted(() => {
  if (!containerRef.value) {
    return;
  }
  mind = new MindElixir({
    el: containerRef.value,
    direction: MindElixir.RIGHT,
    editable: true,
    contextMenu: {
      locale: zh_CN,
      focus: true,
      link: true,
    },
    toolBar: false,
    keypress: true,
    overflowHidden: false,
  });
  mind.init(caseTreeToMindData(props.tree, props.extras));
  mind.clearHistory?.();
  mind.bus.addListener("operation", handleMutation);
  mind.bus.addListener("expandNode", handleMutation);
  mind.bus.addListener("selectNodes", handleSelectNodes);
  mind.bus.addListener("unselectNodes", handleUnselectNodes);
});

onBeforeUnmount(() => {
  if (mind) {
    mind.bus.removeListener("operation", handleMutation);
    mind.bus.removeListener("expandNode", handleMutation);
    mind.bus.removeListener("selectNodes", handleSelectNodes);
    mind.bus.removeListener("unselectNodes", handleUnselectNodes);
    mind.disposable?.forEach((dispose) => dispose());
    mind = null;
  }
  if (containerRef.value) {
    containerRef.value.innerHTML = "";
  }
});

function expandAll(expand: boolean) {
  if (!mind) {
    return;
  }
  const rootEl = mind.findEle(mind.nodeData.id);
  if (rootEl) {
    mind.expandNodeAll(rootEl, expand);
  }
}

function recenter() {
  mind?.toCenter();
}
</script>

<style scoped>
.xmind-wrap {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.xmind-toolbar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid #eaecf0;
  background: #fbfbfc;
}

.xmind-toolbar-actions {
  display: flex;
  gap: 8px;
}

.xmind-hint {
  color: #98a2b3;
  font-size: 12px;
}

.xmind-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.xmind-canvas {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  background: #f8fafc;
}

.xmind-child-panel {
  flex: 0 0 300px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid #eaecf0;
  background: #fff;
}

.xmind-child-panel-inner {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.xmind-child-panel-header {
  flex: 0 0 auto;
  padding: 14px 14px 10px;
  border-bottom: 1px solid #f0f2f5;
}

.xmind-child-panel-kind {
  display: inline-block;
  margin-bottom: 6px;
  padding: 1px 8px;
  border-radius: 4px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 11px;
  line-height: 1.6;
}

.xmind-child-panel-title {
  margin: 0;
  color: #101828;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
  word-break: break-word;
}

.xmind-child-panel-meta {
  margin: 6px 0 0;
  color: #98a2b3;
  font-size: 12px;
}

.xmind-child-list {
  flex: 1 1 auto;
  min-height: 0;
  padding: 8px 10px 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.xmind-child-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  margin-bottom: 8px;
  padding: 10px 12px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fafbfc;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.xmind-child-item:hover {
  border-color: #c7d2fe;
  background: #f8faff;
  box-shadow: 0 1px 2px rgb(16 24 40 / 6%);
}

.xmind-child-item-kind {
  padding: 1px 6px;
  border-radius: 4px;
  background: #f2f4f7;
  color: #475467;
  font-size: 11px;
  line-height: 1.5;
}

.xmind-child-item-title {
  color: #344054;
  font-size: 13px;
  line-height: 1.45;
  word-break: break-word;
}

.xmind-child-item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.xmind-child-item-tag {
  padding: 0 5px;
  border-radius: 4px;
  background: #ecfdf3;
  color: #027a48;
  font-size: 10px;
  line-height: 1.6;
}

.xmind-child-empty {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 12px;
}

.xmind-child-panel-placeholder {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  color: #98a2b3;
  font-size: 13px;
  text-align: center;
}

.xmind-child-panel-placeholder-sub {
  margin-top: 4px;
  font-size: 12px;
}

/* mind-elixir 画布需要显式高度 */
.xmind-canvas :deep(.map-container) {
  height: 100%;
}

/* 节点类型标签（根/系统/功能模块/测试要点等） */
.xmind-canvas :deep(.tags) {
  margin-top: 4px;
}

.xmind-canvas :deep(.tags span) {
  display: inline-block;
  margin: 2px 3px 0 0;
  padding: 1px 6px;
  border-radius: 4px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 11px;
  line-height: 1.4;
}
</style>
