<template>
  <div class="tree-node-wrap">
    <div class="tree-node" :class="[node.kind, { selected: selectedId === node.id }]">
      <button class="node-main" @click="$emit('select', node.id)">
        <span class="node-kind">{{ kindLabel }}</span>
        <input v-model="node.title" class="node-title-input" @change="$emit('changed')" />
      </button>
      <div class="node-actions">
        <a-tooltip title="添加子节点">
          <button class="icon-button" @click="addChild"><PlusOutlined /></button>
        </a-tooltip>
        <a-tooltip title="删除节点">
          <button class="icon-button danger" :disabled="node.kind === 'root'" @click="$emit('remove', node.id)">
            <DeleteOutlined />
          </button>
        </a-tooltip>
      </div>
    </div>
    <div v-if="node.children?.length" class="tree-children">
      <TreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :selected-id="selectedId"
        @select="$emit('select', $event)"
        @changed="$emit('changed')"
        @remove="removeChild"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons-vue';
import type { CaseNodeKind, CaseTreeNode } from '@case-forge/shared';
import { CASE_NODE_KIND_LABELS } from '@case-forge/shared';

const props = defineProps<{
  node: CaseTreeNode;
  selectedId: string;
}>();

const emit = defineEmits<{
  select: [id: string];
  changed: [];
  remove: [id: string];
}>();

const kindLabel = computed(() => CASE_NODE_KIND_LABELS[props.node.kind] || props.node.kind);

function addChild() {
  props.node.children ||= [];
  props.node.children.push({
    id: crypto.randomUUID(),
    title: '新节点',
    kind: props.node.kind === 'scenario' ? 'section' : 'scenario',
    children: [],
  });
  emit('changed');
}

function removeChild(id: string) {
  props.node.children = (props.node.children || []).filter((child) => child.id !== id);
  emit('changed');
}
</script>
