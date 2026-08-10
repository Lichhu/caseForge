<template>
  <div class="assertion-rows-editor">
    <div class="assertion-rows-head">
      <span class="assertion-col assertion-col--desc">描述</span>
      <span class="assertion-col assertion-col--type">类型</span>
      <span class="assertion-col assertion-col--operator">比较</span>
      <span class="assertion-col assertion-col--expression">表达式</span>
      <span class="assertion-col assertion-col--expected">期望值</span>
      <span class="assertion-col assertion-col--action">
        <a-button type="text" size="small" class="assertion-add-btn" title="添加断言" @click="addRow">
          <PlusOutlined />
        </a-button>
      </span>
    </div>
    <div class="assertion-rows-body">
      <div v-if="!rows.length" class="assertion-empty-hint">暂无断言，可使用 AI 生成或点击操作列加号添加</div>
      <div v-for="(row, index) in rows" :key="row.id" class="assertion-row">
        <a-input
          :value="row.description"
          size="small"
          class="assertion-col assertion-col--desc"
          placeholder="断言说明"
          @update:value="(v: string) => updateRow(index, 'description', v)"
        />
        <a-select
          :value="row.type || undefined"
          size="small"
          class="assertion-col assertion-col--type"
          placeholder="类型"
          :options="typeOptions"
          :get-popup-container="popupContainer"
          :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 1 }"
          @update:value="(v: AssertionType) => onTypeChange(index, v)"
        />
        <a-select
          :value="row.operator || undefined"
          size="small"
          class="assertion-col assertion-col--operator"
          placeholder="比较"
          :options="ASSERTION_OPERATOR_OPTIONS"
          :get-popup-container="popupContainer"
          :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 1 }"
          @update:value="(v: AssertionOperator) => updateRow(index, 'operator', v)"
        />
        <a-input
          :value="row.expression"
          size="small"
          class="assertion-col assertion-col--expression"
          :placeholder="expressionPlaceholder(row.type)"
          @update:value="(v: string) => updateRow(index, 'expression', v)"
        />
        <a-input
          :value="row.expected"
          size="small"
          class="assertion-col assertion-col--expected"
          :placeholder="expectedPlaceholder(row.type)"
          :disabled="!showsExpectedField(row.type)"
          @update:value="(v: string) => updateRow(index, 'expected', v)"
        />
        <a-button
          type="text"
          size="small"
          danger
          class="assertion-col assertion-col--action"
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
import { computed } from 'vue';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { NESTED_OVERLAY_Z_INDEX } from '@/constants/overlay-z-index';
import type { AssertionOperator, AssertionType } from '@case-forge/shared';
import type { CaseProtocol } from '@/utils/casePayloadFormat.util';
import {
  ASSERTION_OPERATOR_OPTIONS,
  createEmptyAssertionRow,
  expressionPlaceholder,
  expectedPlaceholder,
  filterAssertionTypeOptions,
  showsExpectedField,
  type AssertionRow,
} from '@/utils/assertionRows.util';

const popupContainer = () => document.body;

const props = defineProps<{
  protocol: CaseProtocol;
  hint?: string;
}>();

const rows = defineModel<AssertionRow[]>('rows', { required: true });

const typeOptions = computed(() => filterAssertionTypeOptions(props.protocol));

function updateRow<K extends keyof AssertionRow>(
  index: number,
  field: K,
  value: AssertionRow[K],
) {
  const next = [...rows.value];
  next[index] = { ...next[index], [field]: value };
  rows.value = next;
}

function onTypeChange(index: number, type: AssertionType) {
  const next = [...rows.value];
  const row = { ...next[index], type };
  if (!showsExpectedField(type)) {
    row.expected = '';
  }
  if (type === 'status_code' && !row.expected.trim()) {
    row.expected = '200';
  }
  next[index] = row;
  rows.value = next;
}

function addRow() {
  rows.value = [...rows.value, createEmptyAssertionRow(props.protocol)];
}

function removeRow(index: number) {
  rows.value = rows.value.filter((_, i) => i !== index);
}
</script>

<style scoped>
.assertion-rows-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-height: 0;
  height: 100%;
}

.assertion-add-btn {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  color: #667085;
}

.assertion-add-btn:hover {
  color: #7f1d1d;
  background: #fef2f2;
}

.assertion-rows-head,
.assertion-row {
  display: grid;
  grid-template-columns: minmax(88px, 1fr) 118px 78px minmax(96px, 1.1fr) minmax(72px, 0.9fr) 64px;
  align-items: center;
  gap: 0;
}

.assertion-rows-head {
  flex-shrink: 0;
  border: 1px solid #eaecf0;
  border-bottom: none;
  background: #fafbfc;
  font-size: 11px;
  font-weight: 600;
  color: #667085;
}

.assertion-rows-head .assertion-col {
  padding: 6px 8px;
  border-right: 1px solid #f2f4f7;
}

.assertion-rows-head .assertion-col:last-child {
  border-right: none;
}

.assertion-rows-body {
  flex: 1;
  min-height: 0;
  overflow-x: auto;
  overflow-y: auto;
  border: 1px solid #eaecf0;
  background: #fff;
  -webkit-overflow-scrolling: touch;
}

.assertion-row {
  border-bottom: 1px solid #f2f4f7;
  min-width: 720px;
}

.assertion-row:last-child {
  border-bottom: none;
}

.assertion-col--action {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.assertion-row :deep(.ant-input),
.assertion-row :deep(.ant-select-selector) {
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
}

.assertion-row :deep(.ant-input:hover),
.assertion-row :deep(.ant-input:focus),
.assertion-row :deep(.ant-select:hover .ant-select-selector),
.assertion-row :deep(.ant-select-focused .ant-select-selector) {
  background: #f9fafb !important;
}

.assertion-row .assertion-col--desc :deep(.ant-input),
.assertion-row .assertion-col--type :deep(.ant-select),
.assertion-row .assertion-col--operator :deep(.ant-select),
.assertion-row .assertion-col--expression :deep(.ant-input) {
  border-right: 1px solid #f2f4f7 !important;
}

.assertion-row :deep(.ant-select) {
  width: 100%;
}

.assertion-empty-hint {
  padding: 24px 12px;
  font-size: 12px;
  color: #98a2b3;
  text-align: center;
}
</style>
