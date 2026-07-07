<template>
  <div class="kv-rows-editor">
    <div class="kv-rows-toolbar">
      <span v-if="hint" class="kv-rows-hint">{{ hint }}</span>
      <a-button type="text" size="small" class="kv-add-btn" title="添加" @click="addRow">
        <PlusOutlined />
      </a-button>
    </div>
    <div class="kv-rows-body">
      <div v-if="!rows.length" class="kv-empty-hint">暂无配置</div>
      <div v-for="(row, index) in rows" :key="row.id" class="kv-row">
        <span class="kv-col kv-col--index">{{ index + 1 }}</span>
        <a-input
          :value="row.key"
          size="small"
          class="kv-col kv-col--key"
          placeholder="名称"
          @update:value="(v: string) => updateRow(index, 'key', v)"
        />
        <a-input
          :value="row.value"
          size="small"
          class="kv-col kv-col--value"
          placeholder="值"
          @update:value="(v: string) => updateRow(index, 'value', v)"
        />
        <a-button
          type="text"
          size="small"
          danger
          class="kv-col kv-col--action"
          title="删除"
          @click="removeRow(index)"
        >
          <MinusOutlined />
        </a-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MinusOutlined, PlusOutlined } from '@ant-design/icons-vue';
import {
  createEmptyKeyValueRow,
  type KeyValueRow,
} from '@/utils/casePayloadFormat.util';

defineProps<{
  hint?: string;
}>();

const rows = defineModel<KeyValueRow[]>('rows', { required: true });

function updateRow(index: number, field: 'key' | 'value', value: string) {
  const next = [...rows.value];
  next[index] = { ...next[index], [field]: value };
  rows.value = next;
}

function addRow() {
  rows.value = [...rows.value, createEmptyKeyValueRow()];
}

function removeRow(index: number) {
  rows.value = rows.value.filter((_, i) => i !== index);
}
</script>

<style scoped>
.kv-rows-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-height: 0;
}

.kv-rows-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 24px;
  flex-shrink: 0;
}

.kv-rows-hint {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #98a2b3;
}

.kv-add-btn {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  color: #667085;
}

.kv-add-btn:hover {
  color: #7f1d1d;
  background: #fef2f2;
}

.kv-rows-body {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid #eaecf0;
  background: #fff;
  -webkit-overflow-scrolling: touch;
}

.kv-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) minmax(0, 1fr) 32px;
  align-items: center;
  gap: 0;
  border-bottom: 1px solid #f2f4f7;
}

.kv-row:last-child {
  border-bottom: none;
}

.kv-col--index {
  text-align: center;
  font-size: 11px;
  color: #98a2b3;
  user-select: none;
}

.kv-col--action {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.kv-row :deep(.ant-input) {
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}

.kv-row :deep(.ant-input:hover),
.kv-row :deep(.ant-input:focus) {
  background: #f9fafb;
}

.kv-col--key :deep(.ant-input) {
  border-right: 1px solid #f2f4f7;
}

.kv-empty-hint {
  padding: 20px 12px;
  font-size: 12px;
  color: #98a2b3;
  text-align: center;
}
</style>
