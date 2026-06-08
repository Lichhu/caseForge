<template>
  <section class="panel constraint-panel dynamic-instruction-panel">
    <div class="panel-header dynamic-panel-header">
      <div class="dynamic-panel-intro">
        <div>
          <h2>动态指令</h2>
          <p>围绕测试要点维护场景提示词、自然语言约束，并支持批量生成案例</p>
        </div>
      </div>
      <div class="toolbar dynamic-panel-toolbar action-toolbar">
        <a-button @click="openScenarioModal">
          <template #icon><SettingOutlined /></template>
          场景维护
        </a-button>
        <a-button @click="addTestPoint">
          <template #icon><PlusOutlined /></template>
          新增测试要点
        </a-button>
        <a-button :type="batchMode ? 'primary' : 'default'" @click="toggleBatchMode">
          {{ batchMode ? '退出批量' : '批量' }}
        </a-button>
      </div>
    </div>

    <div v-if="store.testPoints.length" class="dynamic-layout">
      <div class="test-point-list test-point-list-panel">
        <div class="test-point-list-head">
          <strong>测试要点</strong>
          <span>{{ store.testPoints.length }} 条</span>
        </div>
        <div v-if="batchMode" class="list-toolbar batch-list-toolbar">
          <a-checkbox
            :checked="allSelected"
            :indeterminate="selectionIndeterminate"
            @change="toggleSelectAll"
          >
            全选
          </a-checkbox>
          <span>已选 {{ selectedRows.length }} / {{ selectableRows.length }}</span>
        </div>

        <div class="test-point-list-scroll">
        <article
          v-for="item in store.testPoints"
          :key="item.id"
          class="test-point-card"
          :class="{
            active: isActiveCard(item.id),
            'browse-card': !batchMode,
            'batch-card': batchMode,
            generating: isTestPointLocked(item),
            disabled: batchMode && isTestPointLocked(item),
          }"
          @click="handleCardClick(item)"
        >
          <div class="test-point-card-head">
            <a-checkbox
              v-if="batchMode"
              :checked="store.selectedTestPointIds.includes(item.id)"
              :disabled="isTestPointLocked(item)"
              @click.stop
              @change="toggleRow(item.id)"
            />
            <div class="test-point-card-title">
              <strong>{{ item.testPoint || '未命名测试要点' }}</strong>
              <small v-if="batchMode">{{ item.system }}</small>
              <small v-else>{{ item.system }} / {{ item.featureModule }}</small>
            </div>
            <div class="test-point-card-status">
              <div
                v-if="isTestPointLocked(item)"
                class="generate-status-pill"
                @click.stop
              >
                <LoadingOutlined spin class="generate-status-pill__icon" />
                <span class="generate-status-pill__label">生成中</span>
                <span class="generate-status-pill__sep" aria-hidden="true" />
                <button
                  type="button"
                  class="generate-status-pill__action"
                  :disabled="isCancellingGenerate(item.id)"
                  @click="cancelGenerating(item)"
                >
                  {{ isCancellingGenerate(item.id) ? '停止中' : '停止' }}
                </button>
              </div>
              <a-tag v-else :color="statusColor(item.status)">{{ item.status }}</a-tag>
            </div>
          </div>
        </article>
        </div>
      </div>

      <div class="instruction-editor instruction-editor-panel">
        <div v-if="batchMode && selectedRows.length" class="instruction-editor-shell">
          <div class="instruction-editor-body">
          <div class="editor-hero editor-hero-batch">
            <div>
              <h3>批量编辑 {{ selectedRows.length }} 条测试要点</h3>
              <p>可批量设置场景提示词、自然语言约束与生成方式</p>
            </div>
            <a-tag color="processing">批量模式</a-tag>
          </div>

          <div class="editor-block">
            <div class="editor-block-title">场景提示词包</div>
            <a-empty
              v-if="!enabledScenarios.length"
              description="暂无已启用场景，请先在场景维护中启用"
            />
            <a-collapse v-else class="scenario-collapse" :bordered="false">
              <a-collapse-panel v-for="scenario in enabledScenarios" :key="scenario.id" :header="scenario.name">
                <template #extra>
                  <span>{{ scenario.prompts.length }} 个提示词</span>
                </template>
                <p v-if="!scenario.prompts.length" class="scenario-prompt-hint">
                  该场景暂无已启用提示词，请先在场景维护里新增并保存
                </p>
                <div v-else class="prompt-chip-list">
                  <label v-for="prompt in scenario.prompts" :key="prompt.id" class="prompt-chip">
                    <input
                      v-model="instructionDraft.promptIds"
                      type="checkbox"
                      :value="prompt.id"
                      :disabled="editingDisabled"
                    />
                    <span class="prompt-chip-text" :title="promptLabel(prompt, 'full')">
                      {{ promptLabel(prompt) }}
                    </span>
                  </label>
                </div>
              </a-collapse-panel>
            </a-collapse>
          </div>

          <div class="editor-block">
            <div class="editor-block-title">自然语言约束</div>
            <a-textarea
              v-model:value="instructionDraft.naturalText"
              class="editor-textarea"
              :rows="6"
              :maxlength="FIELD_LIMITS.naturalText"
              :disabled="editingDisabled"
              show-count
              placeholder="例如：重点覆盖超时重试、错误码映射、重复提交、提示文案和落库一致性"
            />
          </div>

          <div class="editor-block editor-block-inline">
            <div class="editor-block-title">生成方式</div>
            <a-radio-group
              v-model:value="generationMode"
              button-style="solid"
              :disabled="editingDisabled"
            >
              <a-radio-button value="append">追加</a-radio-button>
              <a-radio-button value="full">全量覆盖</a-radio-button>
            </a-radio-group>
          </div>
          <a-alert
            v-if="editingDisabled"
            type="warning"
            show-icon
            message="选中的测试要点正在生成案例，暂不可编辑；可切换其他条目或维护场景。"
          />
          </div>

          <div class="instruction-editor-footer dynamic-editor-footer action-toolbar">
            <a-button danger :disabled="!selectedRows.length || editingDisabled" @click="removeSelectedTestPoints">
              <template #icon><DeleteOutlined /></template>
              删除
            </a-button>
            <a-button :disabled="editingDisabled" @click="saveSelection(false)">
              <template #icon><SaveOutlined /></template>
              保存
            </a-button>
            <a-button type="primary" :disabled="editingDisabled" :loading="generateLoading" @click="saveSelection(true)">
              <template #icon><ThunderboltOutlined /></template>
              生成
            </a-button>
          </div>
        </div>

        <div v-else-if="!batchMode && activeRow" class="instruction-editor-shell">
          <div class="instruction-editor-body">
          <div class="editor-hero" :class="{ 'editor-hero--generating': editingDisabled }">
            <div class="editor-hero-main">
              <h3>{{ activeRow.testPoint }}</h3>
              <p>{{ activeRow.system }} · {{ activeRow.featureModule }}</p>
            </div>
            <a-tag v-if="!editingDisabled" :color="statusColor(activeRow.status)">
              {{ activeRow.status }}
            </a-tag>
          </div>

          <div v-if="editingDisabled" class="editor-generating-banner">
            <div class="editor-generating-banner__content">
              <LoadingOutlined spin class="editor-generating-banner__icon" />
              <div>
                <strong>正在生成测试案例</strong>
                <p>可切换其他要点或维护场景；不需要时可停止生成。</p>
              </div>
            </div>
            <a-button
              size="small"
              class="editor-generating-banner__btn"
              :loading="isCancellingGenerate(activeRow.id)"
              @click="cancelGenerating(activeRow)"
            >
              停止生成
            </a-button>
          </div>

          <div class="editor-block">
            <div class="editor-block-title">基础信息</div>
            <div class="editor-form-grid">
              <label class="field-label field-label--required">系统</label>
              <a-auto-complete
                v-model:value="definitionDraft.system"
                :options="systemOptions"
                :filter-option="false"
                :disabled="editingDisabled"
              >
                <a-input
                  :maxlength="FIELD_LIMITS.system"
                  :disabled="editingDisabled"
                  show-count
                  placeholder="选择或输入系统"
                />
              </a-auto-complete>
              <label class="field-label field-label--required">功能模块</label>
              <a-auto-complete
                v-model:value="definitionDraft.featureModule"
                :options="featureModuleOptions"
                :filter-option="false"
                :disabled="editingDisabled"
              >
                <a-input
                  :maxlength="FIELD_LIMITS.featureModule"
                  :disabled="editingDisabled"
                  show-count
                  placeholder="选择或输入功能模块"
                />
              </a-auto-complete>
              <label class="field-label field-label--required">测试要点</label>
              <a-input
                v-model:value="definitionDraft.testPoint"
                :maxlength="FIELD_LIMITS.testPoint"
                :disabled="editingDisabled"
                show-count
              />
            </div>
          </div>

          <div class="editor-block">
            <div class="editor-block-title">场景提示词包</div>
            <a-empty
              v-if="!enabledScenarios.length"
              description="暂无已启用场景，请先在场景维护中启用"
            />
            <a-collapse v-else class="scenario-collapse" :bordered="false">
              <a-collapse-panel v-for="scenario in enabledScenarios" :key="scenario.id" :header="scenario.name">
                <p v-if="!scenario.prompts.length" class="scenario-prompt-hint">
                  该场景暂无已启用提示词，请先在场景维护里新增并保存
                </p>
                <div v-else class="prompt-chip-list">
                  <label v-for="prompt in scenario.prompts" :key="prompt.id" class="prompt-chip">
                    <input
                      v-model="instructionDraft.promptIds"
                      type="checkbox"
                      :value="prompt.id"
                      :disabled="editingDisabled"
                    />
                    <span class="prompt-chip-text" :title="promptLabel(prompt, 'full')">
                      {{ promptLabel(prompt) }}
                    </span>
                  </label>
                </div>
              </a-collapse-panel>
            </a-collapse>
          </div>

          <div class="editor-block">
            <div class="editor-block-title">自然语言约束</div>
            <a-textarea
              v-model:value="instructionDraft.naturalText"
              class="editor-textarea"
              :rows="6"
              :maxlength="FIELD_LIMITS.naturalText"
              :disabled="editingDisabled"
              show-count
              placeholder="例如：重点覆盖超时重试、错误码映射、重复提交"
            />
          </div>

          <div class="editor-block editor-block-inline">
            <div class="editor-block-title">生成方式</div>
            <a-radio-group v-model:value="generationMode" button-style="solid" :disabled="editingDisabled">
              <a-radio-button value="append">追加</a-radio-button>
              <a-radio-button value="full">全量覆盖</a-radio-button>
            </a-radio-group>
          </div>

          </div>

          <div class="instruction-editor-footer dynamic-editor-footer action-toolbar">
            <a-button danger :disabled="editingDisabled" @click="removeActiveTestPoint">
              <template #icon><DeleteOutlined /></template>
              删除
            </a-button>
            <a-button :disabled="editingDisabled" @click="saveSelection(false)">
              <template #icon><SaveOutlined /></template>
              保存
            </a-button>
            <a-button type="primary" :disabled="editingDisabled" :loading="generateLoading" @click="saveSelection(true)">
              <template #icon><ThunderboltOutlined /></template>
              生成
            </a-button>
          </div>
        </div>

        <div v-else class="instruction-editor-placeholder">
          <a-empty :description="batchMode ? '请从左侧勾选测试要点进行批量操作' : '请从左侧选择一条测试要点'" />
        </div>
      </div>
    </div>

    <a-empty v-else class="empty-state" description="暂无测试要点，请先在结构化需求文档中生成，或在这里新增" />

    <a-modal
      v-model:open="scenarioModalOpen"
      title="场景维护后台"
      width="1100px"
      wrap-class-name="scenario-maintain-modal"
      :z-index="IMMERSIVE_OVERLAY_Z_INDEX"
      :footer="null"
      destroy-on-close
    >
      <div class="scenario-manager">
        <aside class="scenario-manager-list">
          <div class="list-toolbar action-toolbar action-toolbar--compact">
            <strong>场景库</strong>
            <a-button type="primary" @click="createEmptyScenario">新增场景</a-button>
          </div>
          <div class="scenario-list-scroll">
            <div
              v-for="item in store.scenarios"
              :key="item.id"
              class="scenario-card"
              :class="{
                active: editingScenarioId === item.id,
                inactive: !item.isActive,
              }"
              @click="selectScenario(item.id)"
            >
              <a-input
                :value="item.name"
                :maxlength="FIELD_LIMITS.scenarioName"
                show-count
                class="scenario-name-input"
                placeholder="场景名称"
                @mousedown="selectScenario(item.id)"
                @update:value="(value: string) => handleScenarioNameInput(item, value)"
                @blur="flushScenarioNameSave(item)"
              />
              <div class="scenario-card-footer">
                <div class="scenario-status">
                  <span class="scenario-status-text" :class="{ on: item.isActive }">
                    {{ item.isActive ? '已启用' : '已停用' }}
                  </span>
                  <a-switch
                    size="small"
                    :checked="Boolean(item.isActive)"
                    @mousedown.stop
                    @change="(checked: boolean) => toggleScenarioActive(item, checked)"
                  />
                </div>
                <a-button
                  type="text"
                  danger
                  size="small"
                  @click.stop="confirmDeleteScenario(item.id)"
                >
                  删除
                </a-button>
              </div>
            </div>
            <a-empty v-if="!store.scenarios.length" description="暂无场景，点击右上角新增" />
          </div>
        </aside>

        <section class="scenario-manager-editor">
          <div class="list-toolbar action-toolbar action-toolbar--compact">
            <strong>提示词包</strong>
            <a-button type="primary" :disabled="!activeScenario" @click="addPromptRow">
              新增提示词
            </a-button>
          </div>

          <div
            v-if="activeScenario"
            :key="editingScenarioId"
            ref="promptTableWrapRef"
            class="scenario-prompt-table-wrap"
          >
          <a-table
            class="scenario-prompt-table"
            size="small"
            :pagination="false"
            :scroll="{ y: promptTableScrollY }"
            :data-source="activeScenarioPrompts"
            :columns="promptColumns"
            row-key="id"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'content'">
                <a-textarea
                  :value="record.content"
                  :rows="3"
                  :maxlength="FIELD_LIMITS.promptContent"
                  show-count
                  placeholder="请输入提示词内容"
                  @update:value="(value: string) => handlePromptContentInput(record.id, value)"
                  @focus="promptEditScenarioId = editingScenarioId"
                  @blur="flushPromptSave(record, promptEditScenarioId)"
                />
              </template>
              <template v-else-if="column.key === 'isActive'">
                <div class="prompt-status-cell">
                  <a-switch
                    size="small"
                    :checked="record.isActive"
                    @change="(checked: boolean) => togglePromptActive(record, checked)"
                  />
                  <span>{{ record.isActive ? '启用' : '停用' }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'actions'">
                <a-button type="link" danger @click="confirmDeletePrompt(record.id)">删除</a-button>
              </template>
            </template>
          </a-table>
          </div>
          <a-empty v-else class="scenario-prompt-empty" description="请先在左侧新增或选择场景" />
        </section>
      </div>
    </a-modal>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import type { TableColumnsType } from 'ant-design-vue';
import {
  DeleteOutlined,
  LoadingOutlined,
  PlusOutlined,
  SaveOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons-vue';
import type { ScenarioLibraryItem, TestPointInstructionItem } from '@/api/client';
import { useCaseForgeStore } from '@/stores/caseForge';
import { configureAppMessage, configureScenarioModalMessage } from '@/utils/globalFeedback';
import {
  isTestPointDefinitionComplete,
  testPointDefinitionLabel,
} from '@/utils/testPointDefinition';

const IMMERSIVE_OVERLAY_Z_INDEX = 2600;
const SCENARIO_AUTO_SAVE_DELAY_MS = 600;

const FIELD_LIMITS = {
  scenarioName: 120,
  promptContent: 4000,
  system: 120,
  featureModule: 120,
  testPoint: 120,
  naturalText: 4000,
} as const;

function clipText(value: string, maxLength: number) {
  return value.slice(0, maxLength);
}

function filterAutocompleteOption(input: string, option: { value?: string; label?: string }) {
  const text = String(option?.value ?? option?.label ?? '').toLowerCase();
  const keyword = input.trim().toLowerCase();
  if (!keyword) {
    return true;
  }
  // 双向包含：避免「自定义功能模块1」输入时把「自定义功能模块」从候选里滤掉
  return text.includes(keyword) || keyword.includes(text);
}

function buildDefinitionFieldOptions(
  getFieldValue: (item: TestPointInstructionItem) => string | undefined,
  draftValue: string,
  sourceItems: TestPointInstructionItem[] = store.testPoints,
) {
  const values = new Set<string>();
  for (const item of sourceItems) {
    const value = getFieldValue(item)?.trim();
    if (value) {
      values.add(value);
    }
  }
  const draft = draftValue.trim();
  if (draft) {
    values.add(draft);
  }
  return [...values].map((value) => ({ label: value, value }));
}

function filterDefinitionFieldOptions(
  options: Array<{ label: string; value: string }>,
  draftValue: string,
) {
  const keyword = draftValue.trim();
  if (!keyword) {
    return options;
  }
  return options.filter((option) => filterAutocompleteOption(keyword, option));
}

const store = useCaseForgeStore();
const batchMode = ref(false);
const scenarioModalOpen = ref(false);
const editingScenarioId = ref('');
const promptTableWrapRef = ref<HTMLElement | null>(null);
const promptTableScrollY = ref(320);
let promptTableResizeObserver: ResizeObserver | undefined;
const scenarioNameSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const promptSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const scenarioNameLastSaved = new Map<string, string>();
const promptContentLastSaved = new Map<string, string>();

function syncPromptTableScrollY() {
  const el = promptTableWrapRef.value;
  if (!el) return;
  promptTableScrollY.value = Math.max(120, Math.floor(el.getBoundingClientRect().height) - 2);
}

function bindPromptTableResizeObserver() {
  promptTableResizeObserver?.disconnect();
  const el = promptTableWrapRef.value;
  if (!el) return;
  promptTableResizeObserver = new ResizeObserver(() => syncPromptTableScrollY());
  promptTableResizeObserver.observe(el);
}

watch(scenarioModalOpen, async (open) => {
  if (!open) {
    promptTableResizeObserver?.disconnect();
    promptTableResizeObserver = undefined;
    await flushPendingScenarioSaves();
    await store.loadScenarioLibrary();
    configureAppMessage();
    return;
  }
  configureScenarioModalMessage();
  await nextTick();
  syncPromptTableScrollY();
  bindPromptTableResizeObserver();
});

watch(editingScenarioId, async () => {
  if (!scenarioModalOpen.value) return;
  await nextTick();
  syncPromptTableScrollY();
});

onBeforeUnmount(() => {
  promptTableResizeObserver?.disconnect();
  clearScenarioAutoSaveTimers();
});
const activeTestPointId = ref('');
const generationMode = ref<'append' | 'full'>('full');

const definitionDraft = reactive({
  id: '',
  system: '',
  systemDesc: '',
  featureModule: '',
  testPoint: '',
});

const instructionDraft = reactive({
  promptIds: [] as string[],
  naturalText: '',
});

const selectedRows = computed(() =>
  store.testPoints.filter((item) => store.selectedTestPointIds.includes(item.id)),
);

const selectableRows = computed(() =>
  store.testPoints.filter((item) => !isTestPointLocked(item)),
);

const activeRow = computed(() =>
  store.testPoints.find((item) => item.id === activeTestPointId.value) || null,
);

const activeScenario = computed(() =>
  store.scenarios.find((item) => item.id === editingScenarioId.value) ?? null,
);

const activeScenarioPrompts = computed(() => activeScenario.value?.prompts ?? []);

const enabledScenarios = computed(() =>
  store.scenarios
    .filter((scenario) => isEnabledFlag(scenario.isActive))
    .map((scenario) => ({
      ...scenario,
      prompts: (scenario.prompts ?? []).filter((prompt) => isEnabledFlag(prompt.isActive)),
    })),
);

const selectablePromptIds = computed(() =>
  enabledScenarios.value.flatMap((scenario) => scenario.prompts.map((prompt) => prompt.id)),
);

function filterSelectablePromptIds(promptIds: string[]) {
  const allowed = new Set(selectablePromptIds.value);
  return promptIds.filter((id) => allowed.has(id));
}

function isEnabledFlag(value: unknown) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
  }
  return Boolean(value);
}

function promptLabel(
  prompt: { content?: string; name?: string },
  mode: 'preview' | 'full' = 'preview',
) {
  const content = prompt.content?.trim() || '';
  if (mode === 'full') {
    return content || '（未填写提示词内容）';
  }
  if (!content) {
    return '（未填写提示词内容）';
  }
  const singleLine = content.replace(/\s+/g, ' ');
  return singleLine.length > 120 ? `${singleLine.slice(0, 120)}…` : singleLine;
}

const promptEditScenarioId = ref('');

const allSelected = computed(
  () =>
    Boolean(selectableRows.value.length) &&
    selectableRows.value.every((item) => store.selectedTestPointIds.includes(item.id)),
);

const selectionIndeterminate = computed(() => {
  const count = selectableRows.value.filter((item) => store.selectedTestPointIds.includes(item.id)).length;
  return count > 0 && count < selectableRows.value.length;
});

function isTestPointLocked(item: TestPointInstructionItem) {
  return item.status === '生成中' || store.generatingTestPointIds.includes(item.id);
}

const cancellingTestPointIds = ref<string[]>([]);

function isCancellingGenerate(testPointId: string) {
  return cancellingTestPointIds.value.includes(testPointId);
}

async function cancelGenerating(item: TestPointInstructionItem) {
  if (isCancellingGenerate(item.id)) {
    return;
  }
  cancellingTestPointIds.value = [...cancellingTestPointIds.value, item.id];
  try {
    await store.cancelTestPointGenerate(item.id);
  } finally {
    cancellingTestPointIds.value = cancellingTestPointIds.value.filter((id) => id !== item.id);
  }
}

const editingDisabled = computed(() => {
  if (batchMode.value) {
    return selectedRows.value.some((item) => isTestPointLocked(item));
  }
  return activeRow.value ? isTestPointLocked(activeRow.value) : false;
});

/** 仅当前选中项在请求进行中时显示 loading，避免切换卡片后按钮一直转圈 */
const generateLoading = computed(() => {
  const targetIds = batchMode.value
    ? selectedRows.value.map((item) => item.id)
    : activeRow.value
      ? [activeRow.value.id]
      : [];
  return targetIds.some((id) => store.generatingTestPointIds.includes(id));
});

const systemOptions = computed(() =>
  filterDefinitionFieldOptions(
    buildDefinitionFieldOptions((item) => item.system, definitionDraft.system),
    definitionDraft.system,
  ),
);

const featureModuleOptions = computed(() => {
  const system = definitionDraft.system.trim();
  const sourceItems = system
    ? store.testPoints.filter((item) => (item.system?.trim() || '') === system)
    : store.testPoints;
  return filterDefinitionFieldOptions(
    buildDefinitionFieldOptions(
      (item) => item.featureModule,
      definitionDraft.featureModule,
      sourceItems,
    ),
    definitionDraft.featureModule,
  );
});

const promptColumns: TableColumnsType = [
  { title: '提示词内容', key: 'content', dataIndex: 'content' },
  { title: '启用', key: 'isActive', width: 88 },
  { title: '操作', key: 'actions', width: 72 },
];

watch(
  () => store.testPoints.map((item) => item.id).join(','),
  () => {
    if (!store.testPoints.length) {
      activeTestPointId.value = '';
      return;
    }
    if (!store.testPoints.some((item) => item.id === activeTestPointId.value)) {
      activeTestPointId.value = store.testPoints[0].id;
    }
    if (!batchMode.value && activeTestPointId.value) {
      store.setSelectedTestPointIds([activeTestPointId.value]);
    }
  },
  { immediate: true },
);

watch(
  () => [activeTestPointId.value, batchMode.value, selectedRows.value.map((item) => item.id).join(',')],
  () => {
    if (batchMode.value) {
      if (!selectedRows.value.length) {
        resetInstructionDraft();
        return;
      }
      syncInstructionDraft(selectedRows.value);
      return;
    }
    if (!activeRow.value) {
      resetDefinitionDraft();
      resetInstructionDraft();
      return;
    }
    syncDefinitionDraft(activeRow.value);
    syncInstructionDraft([activeRow.value]);
  },
  { immediate: true },
);

watch(
  () => store.scenarios.map((item) => item.id).join(','),
  () => {
    if (!store.scenarios.length) {
      editingScenarioId.value = '';
      promptEditScenarioId.value = '';
      return;
    }
    if (!store.scenarios.some((item) => item.id === editingScenarioId.value)) {
      editingScenarioId.value = store.scenarios[0].id;
    }
    if (
      promptEditScenarioId.value &&
      !store.scenarios.some((item) => item.id === promptEditScenarioId.value)
    ) {
      promptEditScenarioId.value = editingScenarioId.value;
    }
  },
  { immediate: true },
);

watch(editingScenarioId, (scenarioId) => {
  if (scenarioId) {
    promptEditScenarioId.value = scenarioId;
    syncScenarioSaveSnapshots(scenarioId);
  }
});

watch(selectablePromptIds, () => {
  const next = filterSelectablePromptIds(instructionDraft.promptIds);
  if (next.length !== instructionDraft.promptIds.length) {
    instructionDraft.promptIds = next;
  }
});

function toggleBatchMode() {
  batchMode.value = !batchMode.value;
  if (batchMode.value) {
    store.setSelectedTestPointIds([]);
    return;
  }
  if (activeTestPointId.value) {
    store.setSelectedTestPointIds([activeTestPointId.value]);
  }
}

function isActiveCard(testPointId: string) {
  if (batchMode.value) {
    return store.selectedTestPointIds.includes(testPointId);
  }
  return activeTestPointId.value === testPointId;
}

function handleCardClick(item: TestPointInstructionItem) {
  if (batchMode.value) {
    if (isTestPointLocked(item)) {
      return;
    }
    toggleRow(item.id);
    return;
  }
  activeTestPointId.value = item.id;
  store.setSelectedTestPointIds([item.id]);
}

function toggleRow(testPointId: string) {
  const row = store.testPoints.find((item) => item.id === testPointId);
  if (!row || isTestPointLocked(row)) {
    return;
  }
  store.toggleTestPointSelection(testPointId);
}

function toggleSelectAll(event: { target: { checked: boolean } }) {
  store.setSelectedTestPointIds(
    event.target.checked ? selectableRows.value.map((item) => item.id) : [],
  );
}

function statusColor(status: TestPointInstructionItem['status']) {
  const colors: Record<TestPointInstructionItem['status'], string> = {
    待编辑: 'default',
    已编辑: 'blue',
    再编辑: 'orange',
    生成中: 'processing',
    生成失败: 'red',
    生成完成: 'green',
  };
  return colors[status];
}

function buildInstructionPayload(generateNow: boolean) {
  const statusSource = batchMode.value
    ? selectedRows.value[0]?.status
    : activeRow.value?.status;
  return {
    promptIds: [...instructionDraft.promptIds],
    naturalText: instructionDraft.naturalText,
    status: (generateNow ? '生成中' : inferSaveStatus(statusSource || '已编辑')) as TestPointInstructionItem['status'],
    isFull: generationMode.value === 'full',
    isAppend: generationMode.value !== 'full',
  };
}

function validateDefinitionDraft() {
  if (!definitionDraft.system.trim()) {
    message.warning('请填写系统');
    return false;
  }
  if (!definitionDraft.featureModule.trim()) {
    message.warning('请填写功能模块');
    return false;
  }
  if (!definitionDraft.testPoint.trim()) {
    message.warning('请填写测试要点');
    return false;
  }
  return true;
}

function validateTestPointsDefinition(
  rows: TestPointInstructionItem[],
  action: 'save' | 'generate',
) {
  const incomplete = rows.filter((row) => !isTestPointDefinitionComplete(row));
  if (!incomplete.length) {
    return true;
  }
  const sample = incomplete.map((row) => testPointDefinitionLabel(row)).slice(0, 3).join('、');
  const actionText = action === 'generate' ? '无法生成' : '无法保存';
  message.warning(
    incomplete.length === 1
      ? `「${sample}」的系统、功能模块、测试要点未填写完整，${actionText}`
      : `${incomplete.length} 条测试要点（如 ${sample}）的基础信息未填写完整，${actionText}`,
  );
  return false;
}

async function saveSelection(generateNow: boolean) {
  const targetIds = batchMode.value
    ? selectedRows.value.map((item) => item.id)
    : activeRow.value
      ? [activeRow.value.id]
      : [];
  if (!targetIds.length) {
    message.warning('请先选择测试要点');
    return;
  }
  if (editingDisabled.value) {
    message.warning('生成中的测试要点暂不支持编辑');
    return;
  }
  if (!batchMode.value) {
    if (!validateDefinitionDraft()) {
      return;
    }
  } else if (
    !validateTestPointsDefinition(selectedRows.value, generateNow ? 'generate' : 'save')
  ) {
    return;
  }

  try {
    await store.saveTestPointBundle(targetIds, {
      definition: batchMode.value
        ? undefined
        : {
            system: clipText(definitionDraft.system.trim(), FIELD_LIMITS.system),
            systemDesc: definitionDraft.systemDesc.trim(),
            featureModule: clipText(
              definitionDraft.featureModule.trim(),
              FIELD_LIMITS.featureModule,
            ),
            featureDesc: activeRow.value?.featureDesc || '',
            testPoint: clipText(definitionDraft.testPoint.trim(), FIELD_LIMITS.testPoint),
            testPointDesc: activeRow.value?.testPointDesc || '',
          },
      instruction: buildInstructionPayload(generateNow),
    });
    if (generateNow) {
      store.markGeneratingTestPoints(targetIds);
      void store.generate(targetIds);
    }
  } catch (error) {
    message.error((error as Error)?.message || '保存或生成失败');
  }
}

function confirmRemoveTestPoints(testPointIds: string[]) {
  Modal.confirm({
    title: '删除测试要点',
    content: `确定删除选中的 ${testPointIds.length} 条测试要点？`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    centered: true,
    zIndex: IMMERSIVE_OVERLAY_Z_INDEX,
    onOk: async () => {
      const nextList = store.testPoints
        .filter((item) => !testPointIds.includes(item.id))
        .map((item) => ({
          id: item.id,
          system: item.system,
          systemDesc: item.systemDesc,
          featureModule: item.featureModule,
          featureDesc: item.featureDesc,
          testPoint: item.testPoint,
          testPointDesc: item.testPointDesc,
        }));
      try {
        await store.saveTestPointDefinitions(nextList, {
          successMessage:
            testPointIds.length > 1
              ? `已删除 ${testPointIds.length} 条测试要点`
              : '已删除测试要点',
        });
      } catch (error) {
        message.error((error as Error)?.message || '删除测试要点失败');
        throw error;
      }
      store.setSelectedTestPointIds(
        store.selectedTestPointIds.filter((id) => !testPointIds.includes(id)),
      );
      if (testPointIds.includes(activeTestPointId.value)) {
        activeTestPointId.value = store.testPoints[0]?.id || '';
      }
    },
  });
}

function removeActiveTestPoint() {
  if (!activeRow.value) return;
  confirmRemoveTestPoints([activeRow.value.id]);
}

function removeSelectedTestPoints() {
  if (!selectedRows.value.length) return;
  confirmRemoveTestPoints(selectedRows.value.map((item) => item.id));
}

async function addTestPoint() {
  const nextList = [
    ...store.testPoints.map((item) => ({
      id: item.id,
      system: item.system,
      systemDesc: item.systemDesc,
      featureModule: item.featureModule,
      featureDesc: item.featureDesc,
      testPoint: item.testPoint,
      testPointDesc: item.testPointDesc,
    })),
    {
      system: '',
      systemDesc: '',
      featureModule: '',
      featureDesc: '',
      testPoint: '',
      testPointDesc: '',
    },
  ];
  try {
    await store.saveTestPointDefinitions(nextList, {
      successMessage: '已新增测试要点，请填写系统、功能模块与测试要点后保存',
    });
    const created = store.testPoints[store.testPoints.length - 1];
    if (created) {
      activeTestPointId.value = created.id;
      store.setSelectedTestPointIds([created.id]);
      if (!batchMode.value) {
        syncDefinitionDraft(created);
        syncInstructionDraft([created]);
      }
    }
  } catch (error) {
    message.error((error as Error)?.message || '新增测试要点失败');
  }
}

function selectScenario(scenarioId: string) {
  if (!scenarioId) {
    return;
  }
  if (editingScenarioId.value !== scenarioId) {
    editingScenarioId.value = scenarioId;
    promptEditScenarioId.value = scenarioId;
  }
}

function openScenarioModal() {
  scenarioModalOpen.value = true;
  const firstId = store.scenarios[0]?.id || '';
  editingScenarioId.value = firstId;
  promptEditScenarioId.value = firstId;
}

defineExpose({
  openScenarioModal,
});

async function createEmptyScenario() {
  const draftName = `新场景 ${store.scenarios.length + 1}`;
  const saved = await store.saveScenario(
    {
      name: draftName,
      description: '',
      category: '默认',
      isActive: true,
      prompts: [],
    },
    { successMessage: '场景已创建' },
  );
  editingScenarioId.value = saved.id;
  promptEditScenarioId.value = saved.id;
  syncScenarioSaveSnapshots(saved.id);
}

function promptSaveKey(scenarioId: string, promptId: string) {
  return `${scenarioId}:${promptId}`;
}

function syncScenarioSaveSnapshots(scenarioId: string) {
  const scenario = store.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) return;
  scenarioNameLastSaved.set(scenarioId, scenario.name.trim());
  scenario.prompts.forEach((prompt) => {
    promptContentLastSaved.set(promptSaveKey(scenarioId, prompt.id), prompt.content.trim());
  });
}

function clearScenarioAutoSaveTimers() {
  scenarioNameSaveTimers.forEach((timer) => clearTimeout(timer));
  promptSaveTimers.forEach((timer) => clearTimeout(timer));
  scenarioNameSaveTimers.clear();
  promptSaveTimers.clear();
}

function handleScenarioNameInput(item: ScenarioLibraryItem, value: string) {
  item.name = clipText(value, FIELD_LIMITS.scenarioName);
  if (scenarioNameSaveTimers.has(item.id)) {
    clearTimeout(scenarioNameSaveTimers.get(item.id)!);
  }
  scenarioNameSaveTimers.set(
    item.id,
    setTimeout(() => {
      scenarioNameSaveTimers.delete(item.id);
      void flushScenarioNameSave(item);
    }, SCENARIO_AUTO_SAVE_DELAY_MS),
  );
}

async function flushScenarioNameSave(item: ScenarioLibraryItem) {
  if (scenarioNameSaveTimers.has(item.id)) {
    clearTimeout(scenarioNameSaveTimers.get(item.id)!);
    scenarioNameSaveTimers.delete(item.id);
  }
  const name = clipText(item.name.trim(), FIELD_LIMITS.scenarioName);
  if (!name) {
    return;
  }
  if (scenarioNameLastSaved.get(item.id) === name) {
    return;
  }
  const duplicated = store.scenarios.some((scenario) => scenario.id !== item.id && scenario.name === name);
  if (duplicated) {
    message.warning('场景名称不能重复');
    return;
  }
  const saved = await store.saveScenario(
    {
      id: item.id,
      name,
      description: item.description,
      category: item.category,
      isActive: item.isActive,
      prompts: item.prompts,
    },
    { successMessage: '场景名称已保存' },
  );
  scenarioNameLastSaved.set(item.id, name);
  editingScenarioId.value = saved.id;
  promptEditScenarioId.value = saved.id;
}

function handlePromptContentInput(promptId: string, value: string) {
  updatePromptContent(promptId, value);
  const scenarioId = editingScenarioId.value;
  if (!scenarioId) return;
  const timerKey = promptSaveKey(scenarioId, promptId);
  if (promptSaveTimers.has(timerKey)) {
    clearTimeout(promptSaveTimers.get(timerKey)!);
  }
  promptSaveTimers.set(
    timerKey,
    setTimeout(() => {
      promptSaveTimers.delete(timerKey);
      const scenario = store.scenarios.find((item) => item.id === scenarioId);
      const prompt = scenario?.prompts.find((item) => item.id === promptId);
      if (prompt) {
        void flushPromptSave(prompt, scenarioId);
      }
    }, SCENARIO_AUTO_SAVE_DELAY_MS),
  );
}

async function flushPendingScenarioSaves() {
  clearScenarioAutoSaveTimers();
  const tasks: Promise<void>[] = [];
  store.scenarios.forEach((scenario) => {
    tasks.push(flushScenarioNameSave(scenario));
    scenario.prompts.forEach((prompt) => {
      tasks.push(flushPromptSave(prompt, scenario.id, { notify: false }));
    });
  });
  await Promise.all(tasks);
}

function buildScenarioPromptPayload(scenario: ScenarioLibraryItem) {
  return scenario.prompts.map((item, index) => ({
    id: item.id.startsWith('draft-') ? undefined : item.id,
    scenarioId: scenario.id,
    name: item.name || `提示词 ${index + 1}`,
    content: item.content,
    tags: item.tags || [],
    usageCount: item.usageCount,
    sortOrder: index + 1,
    isSystem: item.isSystem,
    isActive: item.isActive,
    isDefault: item.isDefault,
  }));
}

async function persistScenarioPrompts(
  scenario: ScenarioLibraryItem,
  options?: { successMessage?: string; silent?: boolean },
) {
  const saved = await store.saveScenario(
    {
      id: scenario.id,
      name: scenario.name,
      description: scenario.description,
      category: scenario.category,
      isActive: scenario.isActive,
      prompts: buildScenarioPromptPayload(scenario),
    },
    options,
  );
  syncScenarioSaveSnapshots(saved.id);
  editingScenarioId.value = saved.id;
  promptEditScenarioId.value = saved.id;
  return saved;
}

async function toggleScenarioActive(item: ScenarioLibraryItem, checked: boolean) {
  if (Boolean(item.isActive) === checked) {
    return;
  }
  try {
    await store.saveScenario(
      {
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        isActive: checked,
      },
      { successMessage: checked ? '场景已启用' : '场景已停用' },
    );
  } catch {
    // 保存失败时保持开关与后端一致
    await store.loadScenarioLibrary();
  }
}

function confirmDeleteScenario(scenarioId: string) {
  Modal.confirm({
    title: '删除场景',
    content: '确定删除该场景及其提示词包？',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    centered: true,
    zIndex: IMMERSIVE_OVERLAY_Z_INDEX,
    onOk: async () => {
      await store.deleteScenario(scenarioId);
      editingScenarioId.value = store.scenarios[0]?.id || '';
      await store.loadScenarioLibrary();
    },
  });
}

function addPromptRow() {
  const scenario = activeScenario.value;
  if (!scenario) return;
  scenario.prompts.unshift({
    id: `draft-${Date.now()}`,
    scenarioId: scenario.id,
    name: `提示词 ${scenario.prompts.length + 1}`,
    content: '',
    tags: [],
    usageCount: 0,
    sortOrder: 1,
    isSystem: false,
    isActive: true,
    isDefault: false,
  });
}

function updatePromptContent(promptId: string, value: string) {
  const scenario = store.scenarios.find((item) => item.id === editingScenarioId.value);
  if (!scenario) return;
  const prompt = scenario.prompts.find((item) => item.id === promptId);
  if (prompt) {
    prompt.content = clipText(value, FIELD_LIMITS.promptContent);
  }
}

async function flushPromptSave(
  prompt: ScenarioLibraryItem['prompts'][number],
  scenarioId = editingScenarioId.value,
  options?: { notify?: boolean },
) {
  const timerKey = promptSaveKey(scenarioId, prompt.id);
  if (promptSaveTimers.has(timerKey)) {
    clearTimeout(promptSaveTimers.get(timerKey)!);
    promptSaveTimers.delete(timerKey);
  }
  const scenario = store.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) {
    return;
  }
  const content = prompt.content.trim();
  if (!content) {
    return;
  }
  if (promptContentLastSaved.get(timerKey) === content) {
    return;
  }
  const duplicated = scenario.prompts.some(
    (item) => item.id !== prompt.id && item.content.trim() === content,
  );
  if (duplicated) {
    message.warning('同一场景下提示词内容不能重复');
    return;
  }
  const notify = options?.notify !== false;
  await persistScenarioPrompts(scenario, {
    successMessage: notify ? '提示词已保存' : undefined,
    silent: !notify,
  });
}

async function togglePromptActive(prompt: ScenarioLibraryItem['prompts'][number], checked: boolean) {
  if (Boolean(prompt.isActive) === checked) {
    return;
  }
  prompt.isActive = checked;
  const scenario = store.scenarios.find((item) => item.id === editingScenarioId.value);
  if (!scenario) return;
  await persistScenarioPrompts(scenario, {
    successMessage: checked ? '提示词已启用' : '提示词已停用',
  });
}

function confirmDeletePrompt(promptId: string) {
  const scenario = activeScenario.value;
  if (!scenario) return;
  Modal.confirm({
    title: '删除提示词',
    content: '确定删除该提示词？',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    centered: true,
    zIndex: IMMERSIVE_OVERLAY_Z_INDEX,
    onOk: async () => {
      scenario.prompts = scenario.prompts.filter((item) => item.id !== promptId);
      await persistScenarioPrompts(scenario, { successMessage: '提示词已删除' });
    },
  });
}

function syncDefinitionDraft(row: TestPointInstructionItem) {
  definitionDraft.id = row.id;
  definitionDraft.system = clipText(row.system, FIELD_LIMITS.system);
  definitionDraft.systemDesc = row.systemDesc;
  definitionDraft.featureModule = clipText(row.featureModule, FIELD_LIMITS.featureModule);
  definitionDraft.testPoint = clipText(row.testPoint, FIELD_LIMITS.testPoint);
}

function syncInstructionDraft(rows: TestPointInstructionItem[]) {
  const first = rows[0];
  instructionDraft.promptIds = filterSelectablePromptIds(intersectPromptIds(rows));
  instructionDraft.naturalText = rows.length === 1 ? first.naturalText : '';
  generationMode.value = first.isFull ? 'full' : 'append';
}

function intersectPromptIds(rows: TestPointInstructionItem[]) {
  if (!rows.length) return [];
  const [first, ...rest] = rows;
  return first.promptIds.filter((id) => rest.every((item) => item.promptIds.includes(id)));
}

function inferSaveStatus(status: TestPointInstructionItem['status']) {
  return status === '生成完成' || status === '再编辑' ? '再编辑' : '已编辑';
}

function resetDefinitionDraft() {
  definitionDraft.id = '';
  definitionDraft.system = '';
  definitionDraft.systemDesc = '';
  definitionDraft.featureModule = '';
  definitionDraft.testPoint = '';
}

function resetInstructionDraft() {
  instructionDraft.promptIds = [];
  instructionDraft.naturalText = '';
  generationMode.value = 'full';
}
</script>
