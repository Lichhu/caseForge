<template>
  <a-modal
    v-model:open="open"
    :title="scope === 'api' ? '接口场景维护' : '场景维护后台'"
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
            v-for="item in scenarios"
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
          <a-empty v-if="!scenarios.length" description="暂无场景，点击右上角新增" />
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
          class="scenario-prompt-list-wrap"
        >
          <article
            v-for="record in activeScenarioPrompts"
            :key="getPromptRowKey(record.id)"
            class="scenario-prompt-card"
          >
            <a-textarea
              :value="record.content"
              class="scenario-prompt-textarea"
              :auto-size="{ minRows: 3, maxRows: 32 }"
              :maxlength="FIELD_LIMITS.promptContent"
              show-count
              placeholder="请输入提示词内容"
              @update:value="(value: string) => handlePromptContentInput(record.id, value)"
              @focus="promptEditScenarioId = editingScenarioId"
              @blur="flushPromptSave(record, promptEditScenarioId, { notify: false })"
            />
            <div class="scenario-prompt-card-actions">
              <div class="prompt-status-cell">
                <a-switch
                  size="small"
                  :checked="record.isActive"
                  @change="(checked: boolean) => togglePromptActive(record, checked)"
                />
                <span>{{ record.isActive ? '启用' : '停用' }}</span>
              </div>
              <a-button type="link" danger @click="confirmDeletePrompt(record.id)">删除</a-button>
            </div>
          </article>
          <a-empty
            v-if="!activeScenarioPrompts.length"
            class="scenario-prompt-inline-empty"
            description="暂无提示词，点击右上角新增"
          />
        </div>
        <a-empty v-else class="scenario-prompt-empty" description="请先在左侧新增或选择场景" />
      </section>
    </div>
    <div class="scenario-manager-footer">
      <span class="scenario-save-status" :class="scenarioSaveStatusClass">
        {{ scenarioSaveStatusText }}
      </span>
      <a-button @click="closeScenarioModal">关闭</a-button>
      <a-button
        type="primary"
        :loading="scenarioSaveUi === 'saving'"
        :disabled="!activeScenario || (!activeScenarioDirty && scenarioSaveUi !== 'error')"
        @click="saveActiveScenarioManual"
      >
        <template #icon><SaveOutlined /></template>
        保存
      </a-button>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, ref, watch, withDefaults, defineProps } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { SaveOutlined } from '@ant-design/icons-vue';
import type { ScenarioLibraryItem } from '@/api/client';
import { useScenarioLibrary } from '@/composables/useScenarioLibrary';
import type { ScenarioScope } from '@case-forge/shared';
import { SCENARIO_SCOPE_CASE } from '@case-forge/shared';
import { configureAppMessage, configureScenarioModalMessage } from '@/utils/globalFeedback';

const props = withDefaults(
  defineProps<{
    scope?: ScenarioScope;
  }>(),
  {
    scope: SCENARIO_SCOPE_CASE,
  },
);

const IMMERSIVE_OVERLAY_Z_INDEX = 2600;
const SCENARIO_AUTO_SAVE_DELAY_MS = 600;

const FIELD_LIMITS = {
  scenarioName: 120,
  promptContent: 4000,
} as const;

const open = defineModel<boolean>('open', { default: false });

const {
  scenarios,
  loadScenarioLibrary,
  saveScenario,
  deleteScenario,
} = useScenarioLibrary(props.scope);
const editingScenarioId = ref('');
const scenarioNameSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const promptSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const scenarioNameLastSaved = new Map<string, string>();
const promptContentLastSaved = new Map<string, string>();
const promptStableKeys = new Map<string, string>();
type ScenarioSaveUiState = 'idle' | 'saving' | 'saved' | 'error';
const scenarioSaveUi = ref<ScenarioSaveUiState>('idle');
let scenarioSavedFadeTimer: ReturnType<typeof setTimeout> | undefined;
const promptEditScenarioId = ref('');

function clipText(value: string, maxLength: number) {
  return value.slice(0, maxLength);
}

const activeScenario = computed(() =>
  scenarios.value.find((item) => item.id === editingScenarioId.value) ?? null,
);

const activeScenarioPrompts = computed(() => activeScenario.value?.prompts ?? []);

const activeScenarioDirty = computed(() => {
  const scenario = activeScenario.value;
  return scenario ? isScenarioDirty(scenario) : false;
});

const scenarioSaveStatusText = computed(() => {
  if (scenarioSaveUi.value === 'saving') return '保存中…';
  if (scenarioSaveUi.value === 'error') return '保存失败，请重试';
  if (scenarioSaveUi.value === 'saved') return '已保存';
  if (activeScenarioDirty.value) return '有未保存的修改';
  return '已全部保存';
});

const scenarioSaveStatusClass = computed(() => ({
  'is-saving': scenarioSaveUi.value === 'saving',
  'is-saved': scenarioSaveUi.value === 'saved',
  'is-dirty': activeScenarioDirty.value && scenarioSaveUi.value === 'idle',
  'is-error': scenarioSaveUi.value === 'error',
}));

watch(open, async (isOpen) => {
  if (!isOpen) {
    await flushPendingScenarioSaves();
    scenarioSaveUi.value = 'idle';
    if (scenarioSavedFadeTimer) {
      clearTimeout(scenarioSavedFadeTimer);
      scenarioSavedFadeTimer = undefined;
    }
    configureAppMessage();
    return;
  }

  configureScenarioModalMessage();
  if (!scenarios.value.length) {
    await loadScenarioLibrary();
  }
  scenarios.value.forEach((scenario) => syncScenarioSaveSnapshots(scenario.id));
  scenarioSaveUi.value = 'idle';
  if (!editingScenarioId.value && scenarios.value[0]) {
    editingScenarioId.value = scenarios.value[0].id;
    promptEditScenarioId.value = scenarios.value[0].id;
  }
});

watch(
  () => scenarios.value.map((item) => item.id).join(','),
  () => {
    if (!scenarios.value.length) {
      editingScenarioId.value = '';
      promptEditScenarioId.value = '';
      return;
    }
    if (!scenarios.value.some((item) => item.id === editingScenarioId.value)) {
      editingScenarioId.value = scenarios.value[0].id;
    }
    if (
      promptEditScenarioId.value &&
      !scenarios.value.some((item) => item.id === promptEditScenarioId.value)
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

onActivated(() => {
  void nextTick(() => {
    window.dispatchEvent(new Event('resize'));
  });
});

onBeforeUnmount(() => {
  clearScenarioAutoSaveTimers();
});

function selectScenario(scenarioId: string) {
  if (!scenarioId || editingScenarioId.value === scenarioId) {
    return;
  }
  void (async () => {
    await flushActiveScenarioPendingSaves();
    editingScenarioId.value = scenarioId;
    promptEditScenarioId.value = scenarioId;
  })();
}

function closeScenarioModal() {
  open.value = false;
}

async function createEmptyScenario() {
  const draftName = `新场景 ${scenarios.value.length + 1}`;
  const saved = await saveScenario(
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

function ensurePromptStableKey(promptId: string) {
  if (!promptStableKeys.has(promptId)) {
    promptStableKeys.set(promptId, promptId);
  }
}

function getPromptRowKey(promptId: string) {
  return promptStableKeys.get(promptId) ?? promptId;
}

function linkPromptStableKey(fromId: string, toId: string) {
  if (fromId === toId) {
    return;
  }
  const stable = promptStableKeys.get(fromId) ?? fromId;
  promptStableKeys.set(toId, stable);
}

function isScenarioDirty(scenario: ScenarioLibraryItem) {
  const name = scenario.name.trim();
  if (scenarioNameLastSaved.get(scenario.id) !== name) {
    return true;
  }
  return scenario.prompts.some((prompt) => {
    const key = promptSaveKey(scenario.id, prompt.id);
    return promptContentLastSaved.get(key) !== prompt.content.trim();
  });
}

function markScenarioAutoSaved() {
  scenarioSaveUi.value = 'saved';
  if (scenarioSavedFadeTimer) {
    clearTimeout(scenarioSavedFadeTimer);
  }
  scenarioSavedFadeTimer = setTimeout(() => {
    if (scenarioSaveUi.value === 'saved') {
      scenarioSaveUi.value = 'idle';
    }
  }, 2500);
}

function migratePromptKeysAfterSave(
  scenarioId: string,
  prevPromptIds: string[],
  savedPrompts: ScenarioLibraryItem['prompts'],
) {
  savedPrompts.forEach((savedPrompt, index) => {
    const prevId = prevPromptIds[index];
    if (!prevId || prevId === savedPrompt.id) {
      ensurePromptStableKey(savedPrompt.id);
      return;
    }
    linkPromptStableKey(prevId, savedPrompt.id);
    const oldKey = promptSaveKey(scenarioId, prevId);
    const content = promptContentLastSaved.get(oldKey);
    if (content !== undefined) {
      promptContentLastSaved.delete(oldKey);
      promptContentLastSaved.set(promptSaveKey(scenarioId, savedPrompt.id), content);
    }
  });
}

function syncScenarioSaveSnapshots(scenarioId: string) {
  const scenario = scenarios.value.find((item) => item.id === scenarioId);
  if (!scenario) return;
  scenarioNameLastSaved.set(scenarioId, scenario.name.trim());
  scenario.prompts.forEach((prompt) => {
    ensurePromptStableKey(prompt.id);
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
  if (scenarioSaveUi.value === 'saved') {
    scenarioSaveUi.value = 'idle';
  }
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
  const duplicated = scenarios.value.some((scenario) => scenario.id !== item.id && scenario.name === name);
  if (duplicated) {
    message.warning('场景名称不能重复');
    scenarioSaveUi.value = 'error';
    return;
  }
  scenarioSaveUi.value = 'saving';
  try {
    await saveScenario(
      {
        id: item.id,
        name,
        description: item.description,
        category: item.category,
        isActive: item.isActive,
      },
      { silent: true },
    );
    scenarioNameLastSaved.set(item.id, name);
    markScenarioAutoSaved();
  } catch (error) {
    scenarioSaveUi.value = 'error';
    message.error((error as Error)?.message || '场景名称保存失败');
  }
}

function handlePromptContentInput(promptId: string, value: string) {
  updatePromptContent(promptId, value);
  if (scenarioSaveUi.value === 'saved') {
    scenarioSaveUi.value = 'idle';
  }
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
      const scenario = scenarios.value.find((item) => item.id === scenarioId);
      const prompt = scenario?.prompts.find((item) => item.id === promptId);
      if (prompt) {
        void flushPromptSave(prompt, scenarioId, { notify: false });
      }
    }, SCENARIO_AUTO_SAVE_DELAY_MS),
  );
}

async function flushPendingScenarioSaves() {
  clearScenarioAutoSaveTimers();
  for (const scenario of scenarios.value) {
    await flushScenarioNameSave(scenario);
    for (const prompt of scenario.prompts) {
      await flushPromptSave(prompt, scenario.id, { notify: false });
    }
  }
}

async function flushActiveScenarioPendingSaves() {
  const scenario = activeScenario.value;
  if (!scenario) {
    return;
  }
  clearScenarioAutoSaveTimers();
  await flushScenarioNameSave(scenario);
  for (const prompt of scenario.prompts) {
    await flushPromptSave(prompt, scenario.id, { notify: false });
  }
}

async function saveActiveScenarioManual() {
  const scenario = activeScenario.value;
  if (!scenario) {
    return;
  }
  scenarioSaveUi.value = 'saving';
  try {
    await flushActiveScenarioPendingSaves();
    if (isScenarioDirty(scenario)) {
      scenarioSaveUi.value = 'error';
      message.warning('部分内容未能保存，请检查是否为空或重复');
      return;
    }
    message.success('场景已保存');
    markScenarioAutoSaved();
  } catch (error) {
    scenarioSaveUi.value = 'error';
    message.error((error as Error)?.message || '保存失败');
  }
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
  const prevPromptIds = scenario.prompts.map((item) => item.id);
  scenarioSaveUi.value = 'saving';
  try {
    const saved = await saveScenario(
      {
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        category: scenario.category,
        isActive: scenario.isActive,
        prompts: buildScenarioPromptPayload(scenario),
      },
      { silent: true },
    );
    migratePromptKeysAfterSave(scenario.id, prevPromptIds, saved.prompts);
    syncScenarioSaveSnapshots(saved.id);
    editingScenarioId.value = saved.id;
    promptEditScenarioId.value = saved.id;
    if (!options?.silent && options?.successMessage) {
      message.success(options.successMessage);
    }
    markScenarioAutoSaved();
    return saved;
  } catch (error) {
    scenarioSaveUi.value = 'error';
    if (!options?.silent) {
      message.error((error as Error)?.message || '提示词保存失败');
    }
    throw error;
  }
}

async function toggleScenarioActive(item: ScenarioLibraryItem, checked: boolean) {
  if (Boolean(item.isActive) === checked) {
    return;
  }
  try {
    const saved = await saveScenario(
      {
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        isActive: checked,
      },
      { successMessage: checked ? '场景已启用' : '场景已停用' },
    );
    syncScenarioSaveSnapshots(saved.id);
  } catch {
    await loadScenarioLibrary();
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
      await deleteScenario(scenarioId);
      editingScenarioId.value = scenarios.value[0]?.id || '';
      await loadScenarioLibrary();
    },
  });
}

function addPromptRow() {
  const scenario = activeScenario.value;
  if (!scenario) return;
  const draftId = `draft-${Date.now()}`;
  ensurePromptStableKey(draftId);
  scenario.prompts.unshift({
    id: draftId,
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
  scenarioSaveUi.value = 'idle';
}

function updatePromptContent(promptId: string, value: string) {
  const scenario = scenarios.value.find((item) => item.id === editingScenarioId.value);
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
  const scenario = scenarios.value.find((item) => item.id === scenarioId);
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
    scenarioSaveUi.value = 'error';
    return;
  }
  const notify = options?.notify === true;
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
  const scenario = scenarios.value.find((item) => item.id === editingScenarioId.value);
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
</script>
