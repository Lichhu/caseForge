<template>
  <a-modal
    :open="open"
    title="添加案例"
    ok-text="添加案例"
    cancel-text="取消"
    :width="580"
    centered
    wrap-class-name="case-add-modal"
    :z-index="IMMERSIVE_OVERLAY_Z_INDEX"
    destroy-on-close
    @update:open="onOpenChange"
    @ok="handleOk"
    @cancel="handleCancel"
  >
    <div class="case-add-form">
      <section class="case-add-card">
        <div class="case-add-card-head">归属层级</div>
        <div class="case-add-grid case-add-grid--path">
          <div class="case-add-field">
            <label class="case-add-label">根</label>
            <a-select
              v-model:value="pathForm.root"
              size="small"
              placeholder="请选择"
              show-search
              :options="rootOptions"
              :filter-option="filterOption"
              @change="onRootChange"
            />
          </div>
          <div class="case-add-field">
            <label class="case-add-label">系统</label>
            <a-auto-complete
              v-model:value="pathForm.system"
              :options="systemOptions"
              :filter-option="filterAutocompleteOption"
              :disabled="!pathForm.root"
            >
              <a-input
                size="small"
                :maxlength="PATH_FIELD_LIMITS.system"
                placeholder="选择或输入系统"
              />
            </a-auto-complete>
          </div>
          <div class="case-add-field">
            <label class="case-add-label">功能模块</label>
            <a-auto-complete
              v-model:value="pathForm.module"
              :options="moduleOptions"
              :filter-option="filterAutocompleteOption"
              :disabled="!pathForm.system.trim()"
            >
              <a-input
                size="small"
                :maxlength="PATH_FIELD_LIMITS.module"
                placeholder="选择或输入功能模块"
              />
            </a-auto-complete>
          </div>
          <div class="case-add-field">
            <label class="case-add-label">测试要点</label>
            <a-auto-complete
              v-model:value="pathForm.requirement"
              :options="requirementOptions"
              :filter-option="filterAutocompleteOption"
              :disabled="!pathForm.module.trim()"
            >
              <a-input
                size="small"
                :maxlength="PATH_FIELD_LIMITS.requirement"
                placeholder="选择或输入测试要点"
              />
            </a-auto-complete>
          </div>
        </div>
        <div v-if="selectedRequirementPreview" class="case-add-requirement-preview">
          {{ selectedRequirementPreview }}
        </div>
      </section>

      <section class="case-add-card">
        <div class="case-add-card-head">案例内容</div>
        <div class="case-add-grid">
          <div class="case-add-field">
            <label class="case-add-label">案例</label>
            <a-input v-model:value="caseForm.caseName" size="small" placeholder="案例名称" />
          </div>
          <div class="case-add-field">
            <label class="case-add-label">案例标题</label>
            <a-input v-model:value="caseForm.caseTitle" size="small" placeholder="案例标题" />
          </div>
          <div class="case-add-field">
            <label class="case-add-label">性质</label>
            <a-select v-model:value="caseForm.caseNature" size="small" :options="caseNatureOptions" />
          </div>
          <div class="case-add-field">
            <label class="case-add-label">优先级</label>
            <a-select v-model:value="caseForm.priority" size="small" :options="priorityOptions" />
          </div>
          <div class="case-add-field case-add-field--full">
            <label class="case-add-label">前置条件</label>
            <a-textarea
              v-model:value="caseForm.caseCondition"
              size="small"
              :rows="2"
              placeholder="前置条件"
            />
          </div>
          <div class="case-add-field">
            <label class="case-add-label">测试步骤</label>
            <a-textarea
              v-model:value="caseForm.caseStep"
              size="small"
              :rows="3"
              placeholder="测试步骤"
            />
          </div>
          <div class="case-add-field">
            <label class="case-add-label">预期结果</label>
            <a-textarea
              v-model:value="caseForm.caseExpected"
              size="small"
              :rows="3"
              placeholder="预期结果"
            />
          </div>
        </div>
      </section>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { message } from 'ant-design-vue';
import type {
  CaseExcelRow,
  CaseExcelRowPath,
  CaseNature,
  CasePriority,
  NewCaseRowInput,
} from '@case-forge/shared';
import { DEFAULT_CASE_NATURE, DEFAULT_CASE_PRIORITY } from '@case-forge/shared';
import { IMMERSIVE_OVERLAY_Z_INDEX } from '@/constants/overlay-z-index';

const props = defineProps<{
  open: boolean;
  rows: CaseExcelRow[];
  initialPath?: CaseExcelRowPath | null;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  submit: [path: CaseExcelRowPath, input: NewCaseRowInput];
}>();

const PATH_FIELD_LIMITS = {
  system: 120,
  module: 120,
  requirement: 4000,
} as const;

const pathForm = reactive({
  root: '',
  system: '',
  module: '',
  requirement: '',
});

const caseForm = reactive({
  caseName: '',
  caseTitle: '',
  caseNature: DEFAULT_CASE_NATURE as CaseNature,
  priority: DEFAULT_CASE_PRIORITY as CasePriority,
  caseCondition: '',
  caseStep: '',
  caseExpected: '',
});

const caseNatureOptions = [
  { label: '正', value: '正' },
  { label: '反', value: '反' },
];

const priorityOptions = [
  { label: '高', value: '高' },
  { label: '中', value: '中' },
  { label: '低', value: '低' },
];

type PathKey = keyof CaseExcelRowPath;

function matchesPathFilter(row: CaseExcelRow, filter: Partial<CaseExcelRowPath>) {
  return (Object.keys(filter) as PathKey[]).every(
    (key) => !filter[key]?.trim() || row[key] === filter[key],
  );
}

function uniquePathValues(key: PathKey, filter: Partial<CaseExcelRowPath>) {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const row of props.rows) {
    if (!matchesPathFilter(row, filter)) {
      continue;
    }
    const value = row[key].trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    values.push(value);
  }
  return values.sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function toSelectOptions(values: string[]) {
  return values.map((value) => ({ label: value, value }));
}

const rootOptions = computed(() => toSelectOptions(uniquePathValues('root', {})));

const systemOptions = computed(() =>
  toSelectOptions(uniquePathValues('system', { root: pathForm.root })),
);

const moduleOptions = computed(() =>
  toSelectOptions(
    uniquePathValues('module', { root: pathForm.root, system: pathForm.system }),
  ),
);

const requirementOptions = computed(() =>
  toSelectOptions(
    uniquePathValues('requirement', {
      root: pathForm.root,
      system: pathForm.system,
      module: pathForm.module,
    }),
  ),
);

const selectedRequirementPreview = computed(() => {
  const full = pathForm.requirement.trim();
  if (!full || full.length <= 48) {
    return '';
  }
  return full;
});

function filterAutocompleteOption(input: string, option?: { value?: string; label?: string }) {
  const keyword = input.trim().toLowerCase();
  if (!keyword) {
    return true;
  }
  const label = (option?.label || option?.value || '').toLowerCase();
  return label.includes(keyword);
}

function filterOption(input: string, option?: { label?: string; value?: string }) {
  const keyword = input.trim().toLowerCase();
  if (!keyword) {
    return true;
  }
  const label = (option?.label || '').toLowerCase();
  const value = (option?.value || '').toLowerCase();
  return label.includes(keyword) || value.includes(keyword);
}

function resetCaseForm() {
  caseForm.caseName = '';
  caseForm.caseTitle = '';
  caseForm.caseNature = DEFAULT_CASE_NATURE;
  caseForm.priority = DEFAULT_CASE_PRIORITY;
  caseForm.caseCondition = '';
  caseForm.caseStep = '';
  caseForm.caseExpected = '';
}

function applyInitialPath(initial?: CaseExcelRowPath | null) {
  const roots = rootOptions.value.map((item) => item.value);
  pathForm.root = initial?.root && roots.includes(initial.root) ? initial.root : roots[0] || '';

  const systems = uniquePathValues('system', { root: pathForm.root });
  pathForm.system = initial?.system?.trim()
    ? initial.system.trim()
    : systems[0] || '';

  const modules = uniquePathValues('module', {
    root: pathForm.root,
    system: pathForm.system,
  });
  pathForm.module = initial?.module?.trim()
    ? initial.module.trim()
    : modules[0] || '';

  const requirements = uniquePathValues('requirement', {
    root: pathForm.root,
    system: pathForm.system,
    module: pathForm.module,
  });
  pathForm.requirement = initial?.requirement?.trim()
    ? initial.requirement.trim()
    : requirements[0] || '';
}

function onRootChange() {
  const systems = uniquePathValues('system', { root: pathForm.root });
  pathForm.system = systems.includes(pathForm.system) ? pathForm.system : systems[0] || '';
  const modules = uniquePathValues('module', {
    root: pathForm.root,
    system: pathForm.system,
  });
  pathForm.module = modules.includes(pathForm.module) ? pathForm.module : modules[0] || '';
  const requirements = uniquePathValues('requirement', {
    root: pathForm.root,
    system: pathForm.system,
    module: pathForm.module,
  });
  pathForm.requirement = requirements.includes(pathForm.requirement)
    ? pathForm.requirement
    : requirements[0] || '';
}

function onOpenChange(value: boolean) {
  emit('update:open', value);
}

function handleCancel() {
  emit('update:open', false);
}

async function handleOk() {
  if (!pathForm.root.trim()) {
    message.warning('请选择根');
    return Promise.reject(new Error('invalid'));
  }
  if (!pathForm.system.trim()) {
    message.warning('请填写系统');
    return Promise.reject(new Error('invalid'));
  }
  if (!pathForm.module.trim()) {
    message.warning('请填写功能模块');
    return Promise.reject(new Error('invalid'));
  }
  if (!pathForm.requirement.trim()) {
    message.warning('请填写测试要点');
    return Promise.reject(new Error('invalid'));
  }
  if (!caseForm.caseName.trim() && !caseForm.caseTitle.trim()) {
    message.warning('请填写案例或案例标题');
    return Promise.reject(new Error('invalid'));
  }
  emit('submit', {
    root: pathForm.root.trim(),
    system: pathForm.system.trim(),
    module: pathForm.module.trim(),
    requirement: pathForm.requirement.trim(),
  }, {
    caseName: caseForm.caseName.trim() || caseForm.caseTitle.trim(),
    caseTitle: caseForm.caseTitle.trim() || caseForm.caseName.trim(),
    caseNature: caseForm.caseNature,
    priority: caseForm.priority,
    caseCondition: caseForm.caseCondition.trim(),
    caseStep: caseForm.caseStep.trim(),
    caseExpected: caseForm.caseExpected.trim(),
  });
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      return;
    }
    resetCaseForm();
    applyInitialPath(props.initialPath);
  },
);
</script>

<style scoped>
.case-add-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.case-add-card {
  padding: 10px 12px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #f9fafb;
}

.case-add-card-head {
  margin-bottom: 8px;
  color: var(--cf-text, #1d2939);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.case-add-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 10px;
}

.case-add-grid--path {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.case-add-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.case-add-field--full {
  grid-column: 1 / -1;
}

.case-add-label {
  color: var(--cf-text-secondary, #667085);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
}

.case-add-requirement-preview {
  margin-top: 8px;
  padding: 6px 8px;
  border: 1px solid #e4e7ec;
  border-radius: 6px;
  background: #fff;
  color: var(--cf-text-body, #344054);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.case-add-field :deep(.ant-input),
.case-add-field :deep(.ant-select-selector),
.case-add-field :deep(textarea.ant-input) {
  font-size: 13px;
}
</style>

<style>
.case-add-modal .ant-modal-body {
  padding: 14px 20px 8px;
}

.case-add-modal .ant-modal-header {
  padding: 12px 20px;
}

.case-add-modal .ant-modal-footer {
  padding: 10px 20px 14px;
}
</style>
