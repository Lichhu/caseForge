<template>
  <a-modal
    v-model:open="open"
    width="1120px"
    :footer="null"
    :z-index="IMMERSIVE_OVERLAY_Z_INDEX"
    wrap-class-name="data-function-modal-wrap"
    class="data-function-modal"
    :closable="true"
  >
    <template #title>数据函数</template>

    <div class="data-function-layout">
      <aside class="data-function-sidebar">
        <div class="data-function-sidebar-head">
          <strong>函数</strong>
          <a-button type="primary" size="small" @click="createFunction">
            <template #icon><PlusOutlined /></template>
            新建
          </a-button>
        </div>

        <div class="data-function-list">
          <button
            v-for="item in functions"
            :key="item.id"
            type="button"
            class="data-function-item"
            :class="{ active: item.id === activeId }"
            @click="selectFunction(item.id)"
          >
            <span class="data-function-item-icon" :class="`type-${item.type}`">
              <CodeOutlined v-if="item.type === 'template'" />
              <DatabaseOutlined v-else />
            </span>
            <span class="data-function-item-main">
              <strong>{{ item.name || '未命名函数' }}</strong>
              <small>{{ typeLabel(item.type) }}</small>
            </span>
          </button>
        </div>
      </aside>

      <section class="data-function-editor">
        <div class="data-function-meta" :class="{ 'builtin-locked': isBuiltin }">
          <label class="data-function-field">
            <span class="data-function-field-label">函数名称</span>
            <a-input
              v-model:value="form.name"
              class="data-function-name-input"
              placeholder="如 MSG_ID"
            />
          </label>
          <label class="data-function-field data-function-field-wide">
            <span class="data-function-field-label">函数类型</span>
            <a-segmented v-model:value="form.type" :options="typeOptions" block class="data-function-type-segment" />
          </label>
          <label class="data-function-field">
            <span class="data-function-field-label">调用方式</span>
            <a-tooltip :title="usageExpression">
              <a-button class="data-function-call" @click="copyUsage">
                <template #icon><CopyOutlined /></template>
                <span class="data-function-call-text">{{ usageExpression }}</span>
              </a-button>
            </a-tooltip>
          </label>
          <div class="data-function-field data-function-params-field">
            <span class="data-function-field-label">输入参数</span>
            <div class="parameter-rows">
              <div v-for="(name, index) in parameterNames" :key="`${name}-${index}`" class="parameter-row">
                <span class="parameter-index">{{ index + 1 }}</span>
                <a-input :value="name" size="small" placeholder="参数名" @input="renameParameter(index, $event)" />
                <div class="parameter-actions">
                  <a-button type="text" size="small" :disabled="index === 0" title="上移" @click="moveParameter(index, -1)"><ArrowUpOutlined /></a-button>
                  <a-button type="text" size="small" :disabled="index === parameterNames.length - 1" title="下移" @click="moveParameter(index, 1)"><ArrowDownOutlined /></a-button>
                  <a-button type="text" size="small" title="复制" @click="copyParameter(index)"><CopyOutlined /></a-button>
                  <a-button type="text" size="small" title="在下方插入" @click="insertParameter(index)"><PlusOutlined /></a-button>
                  <a-button type="text" size="small" danger title="删除" @click="removeParameter(index)"><DeleteOutlined /></a-button>
                </div>
              </div>
              <a-button type="dashed" size="small" block @click="addParameter"><PlusOutlined /> 添加参数</a-button>
            </div>
          </div>
        </div>

        <div class="data-function-body" :class="{ 'builtin-locked': isBuiltin }">
          <a-form layout="vertical" class="data-function-form">
            <template v-if="form.type === 'template'">
              <a-segmented v-model:value="form.templateMode" :options="templateModeOptions" block class="template-mode" />
              <section v-if="form.templateMode === 'builder'" class="formula-panel">
                <div class="formula-panel-head">
                  <strong>公式</strong>
                </div>

                <div class="formula-table-head" aria-hidden="true">
                  <span>#</span><span>运算</span><span>数据类型</span><span>配置</span><span>操作</span>
                </div>
                <div class="formula-rows">
                  <div
                    v-for="(part, index) in form.parts"
                    :key="part.id"
                    class="formula-row"
                    :class="{ selected: selectedPartId === part.id }"
                    @click="selectedPartId = part.id"
                  >
                    <span class="formula-index">{{ index + 1 }}</span>
                    <a-select v-if="index" v-model:value="part.operator" :options="operatorOptions" size="small" />
                    <span v-else class="formula-result-start">结果</span>
                    <a-select v-model:value="part.kind" size="small" :options="partTypeOptions" />
                    <a-input v-if="part.kind === 'text' || part.kind === 'number'" v-model:value="part.value" size="small" :placeholder="part.kind === 'number' ? '数字' : '固定文本'" />
                    <a-select v-else-if="part.kind === 'param'" v-model:value="part.value" size="small" :options="parameterOptions" placeholder="选择参数" />
                    <a-select v-else-if="part.kind === 'time'" v-model:value="part.value" size="small" :options="formulaTimeOptions" />
                    <a-input-number v-else-if="part.kind === 'random'" v-model:value="part.length" size="small" :min="1" :max="32" addon-after="位" style="width: 100%" />
                    <span v-else class="formula-auto">自动生成 UUID v4</span>
                    <div class="formula-actions">
                      <a-button type="text" size="small" :disabled="index === 0" title="上移" @click.stop="movePart(index, -1)"><ArrowUpOutlined /></a-button>
                      <a-button type="text" size="small" :disabled="index === form.parts.length - 1" title="下移" @click.stop="movePart(index, 1)"><ArrowDownOutlined /></a-button>
                      <a-button type="text" size="small" title="复制" @click.stop="copyPart(index)"><CopyOutlined /></a-button>
                      <a-button type="text" size="small" title="在下方插入" @click.stop="insertPart(index)"><PlusOutlined /></a-button>
                      <a-button type="text" size="small" danger :disabled="form.parts.length === 1" title="删除" @click.stop="removePart(index)"><DeleteOutlined /></a-button>
                    </div>
                  </div>
                </div>
                <a-button type="dashed" block size="small" @click="addPart"><PlusOutlined /> 添加一行</a-button>
              </section>
              <a-form-item v-else :extra="scriptHint">
                <template #label>
                  <span class="script-editor-label"><span>{{ form.templateMode === 'javascript' ? 'JavaScript 函数' : 'Python 函数' }}</span><a-button type="link" size="small" @click="aiScriptOpen = true">AI 生成</a-button></span>
                </template>
                <textarea v-model="activeScript" class="data-function-code-input script-editor" spellcheck="false" @keydown="handleScriptKeydown" />
              </a-form-item>
            </template>

            <template v-else-if="form.type === 'sql'">
              <section class="config-panel">
                <div class="data-function-basic-grid">
                  <a-form-item label="数据库连接" required>
                    <a-select v-model:value="form.connection" :options="connectionOptions" />
                  </a-form-item>
                  <a-form-item label="配置方式">
                    <a-segmented v-model:value="sqlMode" :options="sqlModeOptions" block />
                  </a-form-item>
                </div>
                <template v-if="sqlMode === 'builder'">
                  <div class="data-function-basic-grid">
                    <a-form-item label="数据表" required>
                      <a-select v-model:value="sqlTable" :options="sqlTableOptions" />
                    </a-form-item>
                    <a-form-item label="返回字段" required>
                      <a-select v-model:value="sqlReturnFields" mode="multiple" :max-tag-count="'responsive'" :options="sqlFieldOptions" placeholder="选择一个或多个字段" />
                    </a-form-item>
                  </div>
                  <div class="sql-condition-head"><strong>查询条件</strong><a-button type="link" size="small" @click="addSqlCondition"><PlusOutlined /> 添加条件</a-button></div>
                  <div class="sql-condition-rows">
                    <div v-for="(condition, index) in sqlConditions" :key="condition.id" class="sql-condition-row">
                      <span>{{ index + 1 }}</span>
                      <a-select v-model:value="condition.field" size="small" :options="sqlFieldOptions" />
                      <a-select v-model:value="condition.operator" size="small" :options="sqlOperatorOptions" />
                      <a-segmented v-model:value="condition.source" size="small" :options="conditionSourceOptions" />
                      <a-select v-if="condition.source === 'param'" v-model:value="condition.value" size="small" :options="parameterOptions" placeholder="选择输入参数" />
                      <a-input v-else v-model:value="condition.value" size="small" placeholder="输入查询值" />
                      <a-button type="text" size="small" danger @click="sqlConditions.splice(index, 1)"><DeleteOutlined /></a-button>
                    </div>
                  </div>
                  <pre class="sql-generated-preview"><code>{{ generatedSql }}</code></pre>
                </template>
                <a-form-item v-else label="查询 SQL" required extra="仅允许 SELECT；入参使用 :参数名 绑定">
                  <a-textarea v-model:value="form.sql" :rows="6" class="data-function-code-input" />
                </a-form-item>
              </section>
            </template>

          </a-form>
        </div>

        <section class="data-function-preview-card">
          <div class="data-function-preview-head">
            <strong>试运行</strong>
            <a-button type="primary" size="small" :loading="previewing" @click="runPreview">
              运行一次
            </a-button>
          </div>

          <div v-if="parameterNames.length" class="data-function-preview-params">
            <label
              v-for="name in parameterNames"
              :key="name"
              class="data-function-preview-param"
            >
              <span>{{ name }}</span>
              <a-input v-model:value="previewParams[name]" :placeholder="`输入 ${name}`" size="small" />
            </label>
          </div>
          <div v-else class="data-function-no-params">此函数无需输入参数</div>

          <div class="data-function-result" :class="{ empty: !previewResult && !previewError && !generatorExample, error: previewError }">
            <span class="data-function-result-label">输出结果</span>
            <code>{{ previewError || previewResult || generatorExample || '点击「运行一次」查看结果' }}</code>
          </div>
        </section>

        <footer class="data-function-footer">
          <a-button danger :disabled="!activeId || isBuiltin" @click="removeFunction">
            <template #icon><DeleteOutlined /></template>
            删除函数
          </a-button>
          <a-space :size="8">
            <a-button @click="open = false">取消</a-button>
            <a-button type="primary" :disabled="isBuiltin" @click="saveFunction">保存函数</a-button>
          </a-space>
        </footer>
      </section>
    </div>
  </a-modal>
  <a-modal v-model:open="aiScriptOpen" title="AI 生成函数" :confirm-loading="generatingScript" @ok="generateScript">
    <a-form layout="vertical">
      <a-form-item label="生成要求" extra="说明每个参数如何处理，并给出期望结果或示例">
        <a-textarea v-model:value="scriptRequirement" :rows="6" placeholder="例如：参数一作为前缀 00003，拼接当前时间 yyyyMMddHHmmss，再拼接四位随机数，结果类似 00003202607171719404179" />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { randomUuid } from '@/utils/randomUuid';
import { copyText } from '@/utils/copyText';
import { computed, reactive, ref, watch } from 'vue';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CodeOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import { IMMERSIVE_OVERLAY_Z_INDEX } from '@/constants/overlay-z-index';
import { createDataFunction, deleteDataFunction, generateDataFunctionScript, getDatabaseMetadata, listDataFunctions, listDatabaseConnections, previewDataFunction, updateDataFunction } from '@/api/apiTestClient';

type FunctionType = 'template' | 'sql';

interface DataFunctionDraft {
  id: string;
  name: string;
  params: string;
  type: FunctionType;
  parts: FormulaPart[];
  template: string;
  templateMode: 'builder' | 'javascript' | 'python';
  javascriptScript: string;
  pythonScript: string;
  connection: string;
  sql: string;
  extract: string;
  sqlTable: string;
  sqlReturnFields: string[];
  sqlConditions: SqlCondition[];
  description: string;
  builtin?: boolean;
}

type FormulaOperator = 'concat' | 'add' | 'subtract' | 'multiply' | 'divide';
type FormulaPartKind = 'text' | 'param' | 'time' | 'random' | 'uuid' | 'number';

interface FormulaPart {
  id: string;
  operator: FormulaOperator;
  kind: FormulaPartKind;
  value: string;
  length: number;
}

interface SqlCondition {
  id: string;
  field: string;
  operator: string;
  source: 'param' | 'literal';
  value: string;
}

const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{ projectId: string }>();
const functions = ref<DataFunctionDraft[]>([]);
const activeId = ref('');
const form = reactive<DataFunctionDraft>(makeFunction());
const previewParams = reactive<Record<string, string>>({ base: '0003' });
const previewResult = ref('');
const previewError = ref('');
const previewing = ref(false);
const aiScriptOpen = ref(false);
const generatingScript = ref(false);
const scriptRequirement = ref('');
const selectedPartId = ref('');
const sqlMode = ref<'builder' | 'raw'>('builder');
const sqlTable = ref('');
const sqlReturnFields = ref<string[]>([]);
const sqlConditions = reactive<SqlCondition[]>([]);


const connectionOptions = ref<Array<{ label: string; value: string }>>([]);
const sqlModeOptions = [{ label: '条件构建', value: 'builder' }, { label: 'SQL 编辑', value: 'raw' }];
const sqlTableOptions = ref<Array<{ label: string; value: string }>>([]);
const sqlFieldsByTable = ref<Record<string, string[]>>({});
const sqlFieldOptions = computed(() => (sqlFieldsByTable.value[sqlTable.value] ?? []).map((value) => ({ label: value, value })));
const sqlOperatorOptions = ['=', '!=', '>', '>=', '<', '<=', 'LIKE'].map((value) => ({ label: value, value }));
const conditionSourceOptions = [{ label: '输入参数', value: 'param' }, { label: '手动输入', value: 'literal' }];
const generatedSql = computed(() => {
  const where = sqlConditions
    .filter((item) => item.field && item.operator && item.value)
    .map((item, index) => `${item.field} ${item.operator} :${item.source === 'param' ? item.value : `__condition_${index}`}`)
    .join(' AND ');
  return `SELECT ${sqlReturnFields.value.join(', ') || '*'} FROM ${sqlTable.value}${where ? ` WHERE ${where}` : ''} LIMIT 20`;
});
const typeOptions = [
  { label: '规则生成', value: 'template' },
];
const templateModeOptions = [{ label: '可视化', value: 'builder' }, { label: 'JavaScript', value: 'javascript' }, { label: 'Python', value: 'python' }];
const scriptHint = computed(() => form.templateMode === 'javascript'
  ? '必须是 function(参数) { ... }，参数顺序与上方一致'
  : '必须是 def function(参数):，参数顺序与上方一致');
const activeScript = computed({
  get: () => form.templateMode === 'python' ? form.pythonScript : form.javascriptScript,
  set: (value: string) => { if (form.templateMode === 'python') form.pythonScript = value; else form.javascriptScript = value; },
});
const parameterNames = computed({
  get: () => form.params.split(',').map((item) => item.trim()).filter(Boolean),
  set: (value: string[]) => {
    form.params = value.join(',');
    syncPreviewParams();
  },
});
const parameterOptions = computed(() => parameterNames.value.map((value) => ({ label: value, value })));
const formulaTimeOptions = [
  { label: '年月日时分秒', value: 'yyyyMMddHHmmss' },
  { label: '毫秒时间戳', value: 'ms' },
  { label: '年月日', value: 'yyyyMMdd' },
];
const operatorOptions = [
  { label: '拼接', value: 'concat' },
  { label: '加', value: 'add' },
  { label: '减', value: 'subtract' },
  { label: '乘', value: 'multiply' },
  { label: '除', value: 'divide' },
];
const partTypeOptions = [
  { label: '文本', value: 'text' },
  { label: '参数', value: 'param' },
  { label: '时间', value: 'time' },
  { label: '随机数', value: 'random' },
  { label: 'UUID', value: 'uuid' },
  { label: '数字', value: 'number' },
];
const generatedTemplate = computed(() => {
  return form.parts.map((part, index) => `${index ? operatorSymbol(part.operator) : ''}${partExpression(part)}`).join('');
});
const generatorExample = computed(() => form.type === 'template' && form.templateMode === 'builder' ? buildGeneratedValue(['0003', 'APP']) : '');
const usageExpression = computed(() => {
  const name = form.name.trim().toUpperCase() || '函数名';
  const values = previewValues.value.map((value) => `'${value}'`).join(', ');
  const field = form.type === 'sql' && sqlReturnFields.value[0] ? `.${sqlReturnFields.value[0]}` : '';
  return values ? `\${${name}(${values})${field}}` : `\${${name}()${field}}`;
});
const previewValues = computed(() => parameterNames.value.map((name) => previewParams[name] ?? ''));
const isBuiltin = computed(() => Boolean((functions.value.find((item) => item.id === activeId.value) as any)?.builtin));

watch(open, (value) => { if (value) void loadAll(); });
watch(() => form.connection, () => { if (form.type === 'sql') void loadSqlMetadata(); });
watch(() => form.templateMode, (mode, previous) => {
  if (mode === 'builder') return;
  if (!activeScript.value.trim()) activeScript.value = scriptTemplate(mode, parameterNames.value);
});

async function loadAll() {
  const [rows, connections] = await Promise.all([listDataFunctions(props.projectId), listDatabaseConnections(props.projectId)]);
  connectionOptions.value = connections.map((item) => ({ label: item.name, value: item.id }));
  functions.value = rows.filter((row) => row.type === 'template').map((row) => fromApi(row));
  const current = functions.value.find((item) => item.id === activeId.value) ?? functions.value[0];
  if (current) selectFunction(current.id); else createFunction();
}

function fromApi(row: any): DataFunctionDraft {
  const config = row.config ?? {};
  return { id: row.id, name: row.name, params: (row.params ?? []).join(','), type: row.type, parts: config.parts ?? [], template: config.template ?? '', templateMode: config.mode ?? 'builder', javascriptScript: config.javascriptScript ?? (config.mode === 'javascript' ? config.script : ''), pythonScript: config.pythonScript ?? (config.mode === 'python' ? config.script : ''), connection: config.connectionId ?? '', sql: config.sql ?? '', extract: config.returnField ?? '', sqlTable: config.table ?? '', sqlReturnFields: config.returnFields ?? (config.returnField ? [config.returnField] : []), sqlConditions: config.conditions ?? [], description: row.description ?? '', builtin: Boolean(config.builtin) };
}

async function loadSqlMetadata() {
  if (!form.connection) return;
  const result = await getDatabaseMetadata(props.projectId, form.connection);
  sqlTableOptions.value = result.tables.map((value) => ({ label: value, value }));
  sqlFieldsByTable.value = Object.fromEntries(Object.entries(result.columns).map(([table, columns]) => [table, columns.map((column) => column.name)]));
  if (!result.tables.includes(sqlTable.value)) sqlTable.value = result.tables[0] ?? '';
  sqlReturnFields.value = sqlReturnFields.value.filter((field) => sqlFieldsByTable.value[sqlTable.value]?.includes(field));
}

function makeFunction(patch: Partial<DataFunctionDraft> = {}): DataFunctionDraft {
  return {
    id: randomUuid(),
    name: '',
    params: '',
    type: 'template',
    parts: [
      makePart('param', 'base'),
      makePart('time', 'yyyyMMddHHmmss'),
      { ...makePart('random'), length: 4 },
    ],
    template: '${base}${timestamp:yyyyMMddHHmmss}${random:4}',
    templateMode: 'builder',
    javascriptScript: '',
    pythonScript: '',
    connection: '',
    sql: '',
    extract: '',
    sqlTable: '',
    sqlReturnFields: [],
    sqlConditions: [],
    description: '',
    ...patch,
  };
}

function typeLabel(type: FunctionType) {
  return { template: '规则生成', sql: '查数据库' }[type];
}

async function copyUsage() {
  await copyText(usageExpression.value);
  message.success('已复制，可粘贴到示例报文');
}

function selectFunction(id: string) {
  const item = functions.value.find((row) => row.id === id);
  if (!item) return;
  activeId.value = id;
  Object.assign(form, item);
  sqlTable.value = form.sqlTable;
  sqlReturnFields.value = [...form.sqlReturnFields];
  sqlConditions.splice(0, sqlConditions.length, ...form.sqlConditions.map((condition) => ({ ...condition })));
  syncPreviewParams();
  previewResult.value = '';
  previewError.value = '';
}

function createFunction() {
  activeId.value = '';
  Object.assign(form, makeFunction());
  sqlTable.value = '';
  sqlReturnFields.value = [];
  sqlConditions.splice(0);
  syncPreviewParams();
  previewResult.value = '';
  previewError.value = '';
}

function syncPreviewParams() {
  for (const name of Object.keys(previewParams)) {
    if (!parameterNames.value.includes(name)) delete previewParams[name];
  }
  for (const name of parameterNames.value) {
    if (previewParams[name] === undefined) previewParams[name] = '';
  }
}

function setParameterNames(names: string[]) {
  const previous = parameterNames.value;
  form.params = names.join(',');
  if (form.templateMode !== 'builder' && activeScript.value === scriptTemplate(form.templateMode, previous)) activeScript.value = scriptTemplate(form.templateMode, names);
  syncPreviewParams();
}

function scriptTemplate(language: string, params: string[]) {
  return language === 'python'
    ? `def function(${params.join(', ')}):\n    return ${params[0] || 'None'}`
    : `function(${params.join(', ')}) {\n  return ${params[0] || 'null'};\n}`;
}

function handleScriptKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLTextAreaElement;
  if (event.key === 'Tab') {
    event.preventDefault();
    const indent = event.shiftKey ? '' : (form.templateMode === 'python' ? '    ' : '  ');
    target.setRangeText(indent, target.selectionStart, target.selectionEnd, 'end');
    activeScript.value = target.value;
    return;
  }
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const before = target.value.slice(0, target.selectionStart);
  const lines = before.split('\n');
  const currentIndent = lines[lines.length - 1]?.match(/^\s*/)?.[0] ?? '';
  const extra = form.templateMode === 'python' && before.trimEnd().endsWith(':') ? '    ' : form.templateMode === 'javascript' && before.trimEnd().endsWith('{') ? '  ' : '';
  target.setRangeText(`\n${currentIndent}${extra}`, target.selectionStart, target.selectionEnd, 'end');
  activeScript.value = target.value;
}

async function generateScript() {
  if (!scriptRequirement.value.trim()) return message.warning('请输入生成要求');
  generatingScript.value = true;
  try {
    const result = await generateDataFunctionScript(props.projectId, { language: form.templateMode as 'javascript' | 'python', params: parameterNames.value, requirement: scriptRequirement.value.trim() });
    activeScript.value = result.script;
    aiScriptOpen.value = false;
  } finally { generatingScript.value = false; }
}

function addParameter() {
  setParameterNames([...parameterNames.value, uniqueParameterName('参数')]);
}

function addSqlCondition() {
  sqlConditions.push({
    id: randomUuid(),
    field: sqlFieldOptions.value[0]?.value ?? '',
    operator: '=',
    source: 'param',
    value: parameterNames.value[0] ?? '',
  });
}

function insertParameter(index: number) {
  const names = [...parameterNames.value];
  names.splice(index + 1, 0, uniqueParameterName('参数'));
  setParameterNames(names);
}

function copyParameter(index: number) {
  const names = [...parameterNames.value];
  names.splice(index + 1, 0, uniqueParameterName(names[index] || '参数'));
  setParameterNames(names);
}

function removeParameter(index: number) {
  const names = [...parameterNames.value];
  const [removed] = names.splice(index, 1);
  form.parts.forEach((part) => {
    if (part.kind === 'param' && part.value === removed) part.value = '';
  });
  setParameterNames(names);
}

function moveParameter(index: number, offset: -1 | 1) {
  const names = [...parameterNames.value];
  const target = index + offset;
  if (target < 0 || target >= names.length) return;
  [names[index], names[target]] = [names[target], names[index]];
  setParameterNames(names);
}

function renameParameter(index: number, event: Event) {
  const input = event.target as HTMLInputElement;
  const names = [...parameterNames.value];
  const previous = names[index];
  const next = input.value.trim().replace(/,/g, '');
  if (!next || names.some((name, itemIndex) => itemIndex !== index && name === next)) return;
  names[index] = next;
  form.parts.forEach((part) => {
    if (part.kind === 'param' && part.value === previous) part.value = next;
  });
  previewParams[next] = previewParams[previous] ?? '';
  delete previewParams[previous];
  setParameterNames(names);
}

function uniqueParameterName(base: string) {
  let name = base;
  let suffix = 1;
  while (parameterNames.value.includes(name)) name = `${base}${suffix++}`;
  return name;
}

function makePart(kind: FormulaPartKind = 'text', value = ''): FormulaPart {
  return { id: randomUuid(), operator: 'concat', kind, value, length: 4 };
}

function addPart() {
  const part = makePart();
  form.parts.push(part);
  selectedPartId.value = part.id;
}

function removePart(index: number) {
  form.parts.splice(index, 1);
  selectedPartId.value = form.parts[Math.min(index, form.parts.length - 1)]?.id ?? '';
}

function insertPart(index: number) {
  const part = makePart();
  form.parts.splice(index + 1, 0, part);
  selectedPartId.value = part.id;
}

function copyPart(index: number) {
  const part = { ...form.parts[index], id: randomUuid() };
  form.parts.splice(index + 1, 0, part);
  selectedPartId.value = part.id;
}

function movePart(index: number, offset: -1 | 1) {
  const target = index + offset;
  if (target < 0 || target >= form.parts.length) return;
  const [part] = form.parts.splice(index, 1);
  form.parts.splice(target, 0, part);
  selectedPartId.value = part.id;
}

async function saveFunction() {
  form.name = form.name.trim().toUpperCase();
  if (!form.name) {
    message.warning('请输入函数名称');
    return;
  }
  const duplicate = functions.value.some((item) => item.name === form.name && item.id !== activeId.value);
  if (duplicate) {
    message.warning('函数名称已存在');
    return;
  }
  if (form.type === 'template' && form.templateMode === 'builder') {
    form.template = generatedTemplate.value;
  }
  if (form.type === 'sql' && sqlMode.value === 'builder') {
    form.sql = generatedSql.value;
    form.extract = '';
  }
  const payload = apiPayload();
  const saved = activeId.value ? await updateDataFunction(props.projectId, activeId.value, payload) : await createDataFunction(props.projectId, payload);
  activeId.value = saved.id; await loadAll(); message.success('已保存');
}

async function removeFunction() {
  if (!activeId.value) return;
  await deleteDataFunction(props.projectId, activeId.value); activeId.value = ''; await loadAll(); message.success('已删除');
}

async function runPreview() {
  previewResult.value = '';
  previewError.value = '';
  previewing.value = true;
  try { const result = await previewDataFunction(props.projectId, { ...apiPayload(), values: { ...previewParams } }); previewResult.value = typeof result === 'string' ? result : JSON.stringify(result); message.success('运行成功'); }
  catch (error) { previewError.value = (error as any)?.response?.data?.message ?? (error as Error).message ?? '运行失败'; }
  finally { previewing.value = false; }
}

function apiPayload() {
  const fixedValues = Object.fromEntries(sqlConditions.map((condition, index) => [
    `__condition_${index}`,
    condition.source === 'literal' ? condition.value : undefined,
  ]).filter(([, value]) => value !== undefined));
  return { name: form.name, params: parameterNames.value, type: form.type, description: form.description, config: form.type === 'template' ? { mode: form.templateMode, parts: form.parts, template: generatedTemplate.value, script: activeScript.value, javascriptScript: form.javascriptScript, pythonScript: form.pythonScript } : { connectionId: form.connection, sql: sqlMode.value === 'builder' ? generatedSql.value : form.sql, table: sqlTable.value, returnFields: sqlReturnFields.value, conditions: sqlConditions, fixedValues } };
}

function buildGeneratedValue(inputs: string[]) {
  const values = new Map(parameterNames.value.map((name, index) => [name, inputs[index] ?? '']));
  const resolved = form.parts.map((part) => resolvePart(part, values));
  let result: string | number = resolved[0] ?? '';
  for (let index = 1; index < resolved.length; index += 1) {
    const part = form.parts[index];
    const next = resolved[index];
    if (part.operator === 'concat') result = `${result}${next}`;
    else if (part.operator === 'add') result = Number(result) + Number(next);
    else if (part.operator === 'subtract') result = Number(result) - Number(next);
    else if (part.operator === 'multiply') result = Number(result) * Number(next);
    else result = Number(next) === 0 ? '除数不能为 0' : Number(result) / Number(next);
  }
  return String(result);
}

function resolvePart(part: FormulaPart, values: Map<string, string>) {
  if (part.kind === 'param') return values.get(part.value) ?? '';
  if (part.kind === 'time') return formatPreviewTime(part.value);
  if (part.kind === 'random') return randomDigits(part.length);
  if (part.kind === 'uuid') return randomUuid();
  return part.value;
}

function partExpression(part: FormulaPart) {
  if (part.kind === 'param') return `\${${part.value || '参数'}}`;
  if (part.kind === 'time') return part.value === 'ms' ? '${timestamp}' : `\${timestamp:${part.value}}`;
  if (part.kind === 'random') return `\${random:${part.length}}`;
  if (part.kind === 'uuid') return '${uuid}';
  return part.value;
}

function operatorSymbol(operator: FormulaOperator) {
  return { concat: ' + ', add: ' + ', subtract: ' - ', multiply: ' * ', divide: ' / ' }[operator];
}

function formatPreviewTime(format: string) {
  const now = new Date();
  if (format === 'none') return '';
  if (format === 'ms') return String(now.getTime());
  const pad = (part: number) => String(part).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return format === 'yyyyMMdd' ? date : `${date}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function randomDigits(length: number) {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
}
</script>

<style scoped>
.data-function-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 10px;
  min-height: 560px;
}

/* ===== 左侧列表 ===== */
.data-function-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--cf-border, #e4e7ec);
  border-radius: 10px;
  background: var(--cf-surface-soft, #f8f9fb);
  overflow: hidden;
}

.data-function-sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
}

.data-function-sidebar-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--cf-text, #1d2939);
}

.data-function-sidebar-count {
  font-size: 12px;
  color: var(--cf-text-muted, #98a2b3);
}

.data-function-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  padding: 8px;
  overflow-y: auto;
}

.data-function-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.data-function-item:hover {
  background: rgb(255 255 255 / 72%);
  border-color: var(--cf-border, #e4e7ec);
}

.data-function-item.active {
  background: var(--cf-surface, #fff);
  border-color: var(--cf-brand-border, #e7b8c0);
  box-shadow: 0 1px 3px rgb(182 15 45 / 8%);
}

.data-function-item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-size: 14px;
}

.data-function-item-icon.type-template {
  background: var(--cf-brand-soft, #fff5f6);
  color: var(--cf-brand, #b60f2d);
}

.data-function-item-icon.type-sql {
  background: #eff6ff;
  color: #2563eb;
}


.data-function-item-main {
  min-width: 0;
}

.data-function-item-main strong,
.data-function-item-main small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-function-item-main strong {
  font-size: 13px;
  color: var(--cf-text, #1d2939);
}

.data-function-item-main small {
  margin-top: 2px;
  font-size: 11px;
  color: var(--cf-text-muted, #98a2b3);
}

/* ===== 右侧编辑区 ===== */
.data-function-editor {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--cf-border, #e4e7ec);
  border-radius: 10px;
  background: var(--cf-surface, #fff);
  overflow: hidden;
}

.data-function-editor-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.data-function-editor-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--cf-text, #1d2939);
}

.data-function-type-tag {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
}

.data-function-type-tag.type-template {
  background: var(--cf-brand-soft, #fff5f6);
  color: var(--cf-brand, #b60f2d);
}

.data-function-type-tag.type-sql {
  background: #eff6ff;
  color: #2563eb;
}


.data-function-editor-desc {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cf-text-secondary, #667085);
}

.data-function-meta {
  display: grid;
  grid-template-columns: 160px minmax(280px, 1fr) minmax(240px, .9fr);
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--cf-border, #e4e7ec);
}
.data-function-call { display: flex; width: 100%; min-width: 0; }
.data-function-call :deep(.ant-btn-icon) { flex-shrink: 0; }
.data-function-call-text { min-width: 0; overflow: hidden; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }

.data-function-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.data-function-field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--cf-text-body, #344054);
}
.data-function-params-field { grid-column: 1 / -1; }
.parameter-rows { display: grid; gap: 4px; max-height: 156px; overflow-y: auto; }
.parameter-row { display: grid; grid-template-columns: 28px minmax(180px, 1fr) 170px; gap: 8px; align-items: center; min-height: 36px; padding: 3px 6px; border: 1px solid var(--cf-border, #e4e7ec); border-radius: 6px; background: var(--cf-surface, #fff); }
.parameter-index { color: var(--cf-text-muted, #98a2b3); text-align: center; }
.parameter-actions { display: flex; justify-content: flex-end; }
.parameter-actions :deep(.ant-btn) { width: 30px; padding-inline: 0; color: var(--cf-text-secondary, #667085); }

.data-function-name-input {
  font-weight: 600;
}

.data-function-type-segment :deep(.ant-segmented-item-label) {
  font-size: 12px;
}


.data-function-usage-hint {
  font-size: 11px;
  color: var(--cf-text-muted, #98a2b3);
}

.data-function-usage-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--cf-brand-border, #e7b8c0);
  border-radius: 8px;
  background: var(--cf-brand-soft, #fff5f6);
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.data-function-usage-chip:hover {
  background: #fff0f2;
  box-shadow: var(--cf-shadow-sm, 0 1px 2px rgb(16 24 40 / 4%));
}

.data-function-usage-chip code {
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  color: var(--cf-brand, #b60f2d);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-function-usage-copy {
  flex-shrink: 0;
  color: var(--cf-brand, #b60f2d);
  font-size: 14px;
}

.data-function-body {
  flex: 1;
  min-height: 0;
  padding: 4px 20px 0;
  overflow-y: auto;
}

.data-function-form {
  margin-top: 8px;
}

.data-function-form :deep(.ant-form-item-label > label) {
  font-size: 12px;
  font-weight: 600;
  color: var(--cf-text-body, #344054);
}

.data-function-params-item {
  margin-bottom: 12px;
}

.data-function-desc-item {
  margin-bottom: 8px;
}

.data-function-basic-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}


.data-function-code-input {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.script-editor { width: 100%; min-height: 220px; padding: 10px 12px; border: 1px solid var(--cf-border, #d0d5dd); border-radius: 6px; outline: none; resize: vertical; tab-size: 2; }
.script-editor:focus { border-color: var(--cf-brand, #b60f2d); box-shadow: 0 0 0 2px rgb(182 15 45 / 10%); }
.script-editor-label { display: flex; align-items: center; justify-content: space-between; width: 100%; }
.data-function-result.error code { color: #fda29b; }
.template-mode { margin-bottom: 12px; }
.builtin-locked { pointer-events: none; opacity: .72; }
.builtin-locked .data-function-call { pointer-events: auto; }
.sql-condition-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.sql-condition-rows { display: grid; gap: 4px; }
.sql-condition-row { display: grid; grid-template-columns: 28px minmax(120px, 1fr) 80px 150px minmax(130px, 1fr) 30px; gap: 6px; align-items: center; padding: 4px 6px; border: 1px solid var(--cf-border, #e4e7ec); border-radius: 6px; }
.sql-condition-row > span { color: var(--cf-text-muted, #98a2b3); text-align: center; }
.sql-generated-preview { margin: 8px 0 0; padding: 9px 10px; overflow-x: auto; border-radius: 6px; background: #101828; color: #f9fafb; font-size: 12px; white-space: pre-wrap; }

/* ===== 公式构建器 ===== */
.formula-panel,
.config-panel {
  margin-bottom: 4px;
}

.formula-panel-head strong {
  display: block;
  font-size: 13px;
  color: var(--cf-text, #1d2939);
}

.formula-panel-head span {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--cf-text-muted, #98a2b3);
}

.formula-table-head,
.formula-row {
  display: grid;
  grid-template-columns: 32px 90px 130px minmax(180px, 1fr) 170px;
  gap: 8px;
  align-items: center;
}

.formula-table-head {
  padding: 5px 8px;
  color: var(--cf-text-muted, #98a2b3);
  font-size: 11px;
}

.formula-rows {
  display: grid;
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--cf-border, #e4e7ec);
  border-radius: 8px;
}

.formula-row {
  min-height: 40px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--cf-border, #e4e7ec);
  background: var(--cf-surface, #fff);
  transition: background .15s ease, box-shadow .15s ease;
}

.formula-row:last-child { border-bottom: 0; }
.formula-row:hover { background: #fafbfc; }
.formula-row.selected { background: var(--cf-brand-soft, #fff5f6); box-shadow: inset 3px 0 0 var(--cf-brand, #b60f2d); }
.formula-index { color: var(--cf-text-muted, #98a2b3); text-align: center; }
.formula-result-start, .formula-auto { color: var(--cf-text-secondary, #667085); font-size: 12px; }
.formula-actions { display: flex; justify-content: flex-end; gap: 0; }
.formula-actions :deep(.ant-btn) { width: 30px; padding-inline: 0; color: var(--cf-text-secondary, #667085); }

/* ===== 试运行 ===== */
.data-function-preview-card {
  margin: 12px 20px 0;
  padding: 14px 16px;
  border: 1px solid var(--cf-border, #e4e7ec);
  border-radius: 10px;
  background: linear-gradient(180deg, #fafbfc 0%, #fff 100%);
}

.data-function-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.data-function-preview-head strong {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--cf-text, #1d2939);
}

.data-function-preview-head span {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--cf-text-muted, #98a2b3);
}

.data-function-preview-params {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.data-function-preview-param {
  display: grid;
  gap: 4px;
}

.data-function-preview-param > span {
  font-size: 11px;
  font-weight: 600;
  color: var(--cf-text-secondary, #667085);
}

.data-function-no-params {
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--cf-text-muted, #98a2b3);
}

.data-function-result {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #111827;
}

.data-function-result-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #9ca3af;
}

.data-function-result code {
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #f9fafb;
}

.data-function-result.empty code {
  color: #9ca3af;
}

.data-function-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: auto;
  padding: 14px 20px;
  border-top: 1px solid var(--cf-border, #e4e7ec);
  background: #fafbfc;
}

@media (max-width: 900px) {
  .data-function-basic-grid,
  .data-function-meta { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 780px) {
  .data-function-layout {
    grid-template-columns: 1fr;
  }
}
</style>

<style>
.data-function-modal-wrap .ant-modal-content {
  padding: 0;
  overflow: hidden;
}

.data-function-modal-wrap .ant-modal-header {
  margin-bottom: 0;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--cf-border, #e4e7ec);
}

.data-function-modal-wrap .ant-modal-body {
  padding: 16px 18px 18px;
}

.data-function-modal-wrap .ant-modal-close {
  top: 16px;
  inset-inline-end: 16px;
}
</style>
