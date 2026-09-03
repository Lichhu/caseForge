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
        <div class="assertion-col assertion-col--expected assertion-expected-cell">
          <a-input
            :value="row.expected"
            size="small"
            class="assertion-expected-input"
            :placeholder="expectedPlaceholder(row.type)"
            :disabled="!showsExpectedField(row.type)"
            @update:value="(v: string) => updateRow(index, 'expected', v)"
            @focus="rememberExpectedCursor(index, $event)"
            @click="rememberExpectedCursor(index, $event)"
            @keyup="rememberExpectedCursor(index, $event)"
          />
          <a-button
            v-if="showsExpectedField(row.type) && projectId"
            type="text"
            size="small"
            class="assertion-expected-fn-btn"
            title="插入数据函数（如取数据库值作比较基准）"
            @click="openFunctionInsert(index)"
          >
            <CodeOutlined />
          </a-button>
        </div>
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
  <a-modal
    v-model:open="functionInsertOpen"
    title="插入数据函数"
    :width="680"
    :z-index="NESTED_OVERLAY_Z_INDEX + 10"
    ok-text="插入"
    @ok="insertFunctionExpression"
  >
    <a-form layout="vertical">
      <a-form-item label="函数" required>
        <a-select
          v-model:value="insertFunctionName"
          :get-popup-container="popupContainer"
          :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 11 }"
          show-search
          :filter-option="filterInsertFunctionOption"
        >
          <a-select-option v-for="item in insertFunctions" :key="item.name" :value="item.name" :label="item.name">
            <span class="function-option-name">{{ item.name }}</span>
            <span v-if="item.description" class="function-option-desc">{{ item.description }}</span>
          </a-select-option>
        </a-select>
      </a-form-item>
      <p v-if="selectedInsertFunction?.description" class="function-description-hint">{{ selectedInsertFunction.description }}</p>
      <div v-if="selectedInsertFunction?.params.length" class="function-argument-list">
        <label v-for="(param, index) in selectedInsertFunction.params" :key="`${param}-${index}`" class="function-argument-row">
          <span :title="param">{{ index + 1 }}. {{ param }}</span>
          <a-input v-model:value="insertFunctionArgs[index]" placeholder="常量加引号如 '00'；$. 开头引用请求报文字段" />
        </label>
      </div>
      <a-form-item v-if="selectedInsertFunction?.type === 'sql'" label="结果字段" required>
        <a-auto-complete
          v-model:value="insertFunctionField"
          :options="insertFieldOptions"
          :get-popup-container="popupContainer"
          :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 11 }"
          placeholder="选择或输入查询结果字段"
        />
      </a-form-item>
      <div class="function-expression-preview"><span>调用预览</span><code>{{ functionInsertPreview }}</code></div>
      <p class="function-usage-hint">执行与调试时先解析函数调用（如 SQL 函数取数据库值），再与响应实际值比较。</p>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { CodeOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import { NESTED_OVERLAY_Z_INDEX } from '@/constants/overlay-z-index';
import { listDataFunctions, type ApiDataFunctionRow } from '@/api/apiTestClient';
import { dataFunctionFieldOptions } from '@/utils/sqlSelectColumns.util';
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
  /** 提供后期望值列显示「插入数据函数」入口 */
  projectId?: string;
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

const functionInsertOpen = ref(false);
const insertFunctions = ref<ApiDataFunctionRow[]>([]);
const insertFunctionName = ref('');
const insertFunctionArgs = ref<string[]>([]);
const insertRowIndex = ref(-1);
const insertFunctionField = ref('');
const expectedCursor = reactive({ index: -1, start: 0, end: 0 });
const selectedInsertFunction = computed(() =>
  insertFunctions.value.find((item) => item.name === insertFunctionName.value),
);
const insertFieldOptions = computed(() =>
  dataFunctionFieldOptions(selectedInsertFunction.value?.config).map(
    (value) => ({ value }),
  ),
);
const functionInsertPreview = computed(() => {
  const call = `\${${insertFunctionName.value || '函数名'}(${insertFunctionArgs.value.join(', ')})`;
  if (selectedInsertFunction.value?.type !== 'sql') return `${call}}`;
  const field = insertFunctionField.value.trim();
  return `${call}.${field || '字段'}}`;
});
watch(selectedInsertFunction, (fn) => {
  insertFunctionArgs.value = (fn?.params ?? []).map(
    (_, index) => insertFunctionArgs.value[index] ?? '',
  );
  insertFunctionField.value = '';
});

function rememberExpectedCursor(index: number, event: Event) {
  const input = event.target as HTMLInputElement;
  expectedCursor.index = index;
  expectedCursor.start = input.selectionStart ?? 0;
  expectedCursor.end = input.selectionEnd ?? 0;
}

async function openFunctionInsert(index: number) {
  insertRowIndex.value = index;
  if (props.projectId) {
    insertFunctions.value = await listDataFunctions(props.projectId);
    insertFunctionName.value ||= insertFunctions.value[0]?.name ?? '';
  }
  functionInsertOpen.value = true;
}

function filterInsertFunctionOption(input: string, option: { value?: unknown }) {
  const keyword = input.trim().toLowerCase();
  if (!keyword) return true;
  const item = insertFunctions.value.find((row) => row.name === option.value);
  if (!item) return false;
  return (
    item.name.toLowerCase().includes(keyword) ||
    (item.description ?? '').toLowerCase().includes(keyword)
  );
}

function insertFunctionExpression() {
  if (!insertFunctionName.value) return message.warning('请选择函数');
  if (
    selectedInsertFunction.value?.type === 'sql' &&
    !insertFunctionField.value.trim()
  )
    return message.warning('请选择结果字段');
  const index = insertRowIndex.value;
  const row = rows.value[index];
  if (!row) return;
  const expression = functionInsertPreview.value;
  const current = row.expected ?? '';
  const at =
    expectedCursor.index === index
      ? { start: expectedCursor.start, end: expectedCursor.end }
      : { start: current.length, end: current.length };
  updateRow(
    index,
    'expected',
    `${current.slice(0, at.start)}${expression}${current.slice(at.end)}`,
  );
  expectedCursor.index = -1;
  functionInsertOpen.value = false;
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

.assertion-expected-cell {
  display: flex;
  align-items: center;
  min-width: 0;
  padding-right: 4px;
}

.assertion-expected-cell .assertion-expected-input {
  flex: 1;
  min-width: 0;
}

.assertion-expected-fn-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  padding: 0;
  color: #667085;
}

.assertion-expected-fn-btn:hover {
  color: #7f1d1d;
  background: #fef2f2;
}

.function-option-name { font-weight: 500; }
.function-option-desc { margin-left: 8px; overflow: hidden; color: #98a2b3; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.function-description-hint { margin: -8px 0 12px; color: #667085; font-size: 12px; }
.function-argument-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; max-height: 300px; margin-bottom: 16px; padding-right: 4px; overflow-y: auto; }
.function-argument-row { display: grid; gap: 5px; min-width: 0; }
.function-argument-row > span { overflow: hidden; color: #667085; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.function-expression-preview { display: grid; gap: 5px; padding: 10px 12px; border-radius: 6px; background: #f8f9fb; }
.function-expression-preview > span { color: #98a2b3; font-size: 11px; }
.function-expression-preview code { overflow-wrap: anywhere; }
.function-usage-hint { margin: 12px 0 0; color: #98a2b3; font-size: 12px; }
@media (max-width: 640px) { .function-argument-list { grid-template-columns: 1fr; } }
</style>
