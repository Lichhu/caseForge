<template>
  <div class="kv-rows-editor">
    <div class="kv-rows-head">
      <span class="kv-col kv-col--index">#</span>
      <span class="kv-col kv-col--key">名称</span>
      <span class="kv-col kv-col--value">值</span>
      <span class="kv-col kv-col--action" />
    </div>
    <div v-for="(row, index) in rows" :key="row.id" class="kv-row">
      <span class="kv-col kv-col--index">{{ index + 1 }}</span>
      <a-input
        :value="row.key"
        class="kv-col kv-col--key"
        placeholder="名称"
        @update:value="(v) => updateRow(index, 'key', v)"
      />
      <a-input
        :value="row.value"
        class="kv-col kv-col--value"
        placeholder="值"
        @update:value="(v) => updateRow(index, 'value', v)"
      />
      <a-button
        type="text"
        class="kv-col kv-col--action"
        @click="removeRow(index)"
      >
        <MinusOutlined />
      </a-button>
    </div>
    <div v-if="!rows.length" class="kv-empty-hint">暂无配置，点击下方添加</div>
    <a-button type="dashed" block class="kv-add-btn" @click="addRow">
      <PlusOutlined />
      添加
    </a-button>
  </div>
</template>

<script setup lang="ts">
import { MinusOutlined, PlusOutlined } from '@ant-design/icons-vue';
import {
  createEmptyKeyValueRow,
  type KeyValueRow,
} from '@/utils/casePayloadFormat.util';

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
}

.kv-rows-head,
.kv-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) minmax(0, 1fr) 28px;
  align-items: center;
  gap: 8px;
}

.kv-rows-head {
  font-size: 12px;
  color: #667085;
}

.kv-col--index {
  text-align: center;
}

.kv-col--action {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.kv-add-btn {
  margin-top: 4px;
}

.kv-empty-hint {
  padding: 12px 0;
  font-size: 12px;
  color: #98a2b3;
  text-align: center;
}
</style>
