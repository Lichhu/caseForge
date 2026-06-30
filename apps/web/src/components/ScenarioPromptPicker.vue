<template>
  <div
    class="scenario-prompt-picker"
    :class="{ 'scenario-prompt-picker--embedded': embedded }"
  >
    <div class="scenario-prompt-picker-head">
      <div class="scenario-prompt-picker-title">场景提示词包</div>
      <div v-if="enabledScenarios.length" class="scenario-prompt-picker-actions">
        <span class="scenario-prompt-picker-count">已选 {{ promptIds.length }} 项</span>
        <a-button type="link" size="small" :disabled="disabled" @click="clearSelection">
          清空
        </a-button>
      </div>
    </div>

    <a-empty
      v-if="!enabledScenarios.length"
      :description="
        optional
          ? '暂无已启用场景，可直接生成或前往场景维护启用'
          : '暂无已启用场景，请先在场景维护中启用'
      "
    />

    <template v-else>
      <div class="scenario-prompt-picker-scroll">
        <a-input
          v-if="enabledScenarios.length > 5"
          v-model:value="filterText"
          allow-clear
          size="small"
          class="scenario-prompt-picker-search"
          placeholder="搜索场景名称"
        />

        <div class="scenario-prompt-picker-list">
          <a-collapse
            v-model:active-key="expandedScenarioKey"
            accordion
            class="scenario-collapse"
            :bordered="false"
          >
            <a-collapse-panel
              v-for="scenario in filteredScenarios"
              :key="scenario.id"
            >
              <template #header>
                <div class="scenario-collapse-header">
                  <input
                    :checked="scenarioAllSelected(scenario)"
                    :indeterminate="scenarioPartialSelected(scenario)"
                    type="checkbox"
                    :disabled="disabled || !scenario.prompts.length"
                    @click.stop="toggleScenario(scenario)"
                  />
                  <span class="scenario-collapse-name">{{ scenario.name }}</span>
                  <span
                    v-if="scenarioSelectedCount(scenario)"
                    class="scenario-collapse-badge"
                  >
                    已选 {{ scenarioSelectedCount(scenario) }}
                  </span>
                </div>
              </template>

              <p v-if="!scenario.prompts.length" class="scenario-prompt-hint">
                该场景暂无已启用提示词，请先在场景维护里新增并保存
              </p>
              <div v-else class="prompt-chip-list">
                <label
                  v-for="prompt in scenario.prompts"
                  :key="prompt.id"
                  class="prompt-chip"
                  :class="{ 'prompt-chip--compact': !embedded }"
                >
                  <input
                    v-model="promptIds"
                    type="checkbox"
                    :value="prompt.id"
                    :disabled="disabled"
                  />
                  <span class="prompt-chip-body">
                    <span class="prompt-chip-name">{{ promptDisplayName(prompt) }}</span>
                    <span
                      class="prompt-chip-preview"
                      :class="{ 'prompt-chip-preview--full': embedded }"
                    >
                      {{ promptBodyText(prompt) }}
                    </span>
                  </span>
                </label>
              </div>
            </a-collapse-panel>
          </a-collapse>

          <a-empty
            v-if="!filteredScenarios.length"
            class="scenario-prompt-filter-empty"
            description="没有匹配的场景"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ScenarioScope } from '@case-forge/shared';
import { SCENARIO_SCOPE_CASE } from '@case-forge/shared';
import type { ScenarioLibraryItem } from '@/api/client';
import { useScenarioLibrary } from '@/composables/useScenarioLibrary';
import {
  buildEnabledScenarios,
  promptLabel,
  promptDisplayName,
  promptPreviewText,
} from '@/utils/scenarioLibrary';

const props = withDefaults(
  defineProps<{
    scope?: ScenarioScope;
    disabled?: boolean;
    optional?: boolean;
    /** 弹窗内嵌模式：固定高度滚动，全量展示提示词 */
    embedded?: boolean;
  }>(),
  {
    scope: SCENARIO_SCOPE_CASE,
    optional: false,
    embedded: false,
  },
);

const promptIds = defineModel<string[]>('promptIds', { default: () => [] });

const { scenarios } = useScenarioLibrary(props.scope);
const enabledScenarios = computed(() => buildEnabledScenarios(scenarios.value));
const filterText = ref('');
const expandedScenarioKey = ref<string>();

const filteredScenarios = computed(() => {
  const keyword = filterText.value.trim().toLowerCase();
  if (!keyword) {
    return enabledScenarios.value;
  }
  return enabledScenarios.value.filter((scenario) =>
    scenario.name.toLowerCase().includes(keyword),
  );
});

function promptBodyText(prompt: { content?: string; name?: string }) {
  if (props.embedded) {
    return promptLabel(prompt, 'full');
  }
  return promptPreviewText(prompt);
}

function scenarioSelectedCount(scenario: ScenarioLibraryItem) {
  return scenario.prompts.filter((prompt) => promptIds.value.includes(prompt.id)).length;
}

function clearSelection() {
  promptIds.value = [];
}

function scenarioAllSelected(scenario: ScenarioLibraryItem) {
  if (!scenario.prompts.length) return false;
  return scenario.prompts.every((prompt) => promptIds.value.includes(prompt.id));
}

function scenarioPartialSelected(scenario: ScenarioLibraryItem) {
  const selectedCount = scenarioSelectedCount(scenario);
  return selectedCount > 0 && selectedCount < scenario.prompts.length;
}

function toggleScenario(scenario: ScenarioLibraryItem) {
  const ids = scenario.prompts.map((prompt) => prompt.id);
  const allSelected = scenarioAllSelected(scenario);
  if (allSelected) {
    promptIds.value = promptIds.value.filter((id) => !ids.includes(id));
  } else {
    const existing = new Set(promptIds.value);
    ids.forEach((id) => existing.add(id));
    promptIds.value = Array.from(existing);
  }
}
</script>

<style scoped>
.scenario-prompt-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.scenario-prompt-picker--embedded {
  flex: 1 1 auto;
  gap: 8px;
  min-height: 0;
}

.scenario-prompt-picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.scenario-prompt-picker-title {
  color: #344054;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.scenario-prompt-picker-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.scenario-prompt-picker-count {
  color: #667085;
  font-size: 12px;
}

.scenario-prompt-picker-scroll {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 2px;
}

.scenario-prompt-picker--embedded .scenario-prompt-picker-scroll {
  max-height: min(520px, calc(72vh - 200px));
}

.scenario-prompt-picker-search {
  position: sticky;
  top: 0;
  z-index: 2;
  flex-shrink: 0;
  margin-bottom: 8px;
  background: #fff;
}

.scenario-prompt-picker-list {
  flex: 0 0 auto;
  min-height: 0;
}

.scenario-prompt-picker .scenario-collapse {
  border: 1px solid #eef2f6;
  border-radius: 10px;
  background: #f9fafb;
}

.scenario-prompt-picker--embedded .scenario-collapse {
  overflow: visible;
}

.scenario-prompt-picker .scenario-collapse :deep(.ant-collapse-item) {
  border-bottom: 1px solid #eef2f6;
}

.scenario-prompt-picker .scenario-collapse :deep(.ant-collapse-item:last-child) {
  border-bottom: 0;
}

.scenario-prompt-picker .scenario-collapse :deep(.ant-collapse-header) {
  padding: 10px 12px !important;
  color: #1d2939 !important;
  font-weight: 600;
  align-items: center !important;
}

.scenario-prompt-picker .scenario-collapse :deep(.ant-collapse-content-box) {
  padding: 8px 12px 12px !important;
  background: #fff;
}

.scenario-prompt-picker--embedded .scenario-collapse :deep(.ant-collapse-content) {
  overflow: visible;
}

.scenario-prompt-picker--embedded .scenario-collapse :deep(.ant-collapse-content-box) {
  padding: 10px 12px 14px !important;
}

.scenario-collapse-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.scenario-collapse-header input[type="checkbox"] {
  flex-shrink: 0;
  cursor: pointer;
}

.scenario-collapse-header input[type="checkbox"]:disabled {
  cursor: not-allowed;
}

.scenario-collapse-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scenario-collapse-badge {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 999px;
  background: #fff1f3;
  color: #c01048;
  font-size: 11px;
  font-weight: 600;
  line-height: 20px;
}

.prompt-chip--compact {
  padding: 8px 10px;
}

.prompt-chip-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.prompt-chip-name {
  color: #344054;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.prompt-chip-preview {
  display: -webkit-box;
  overflow: hidden;
  color: #667085;
  font-size: 12px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  white-space: pre-wrap;
  word-break: break-word;
}

.prompt-chip-preview--full {
  display: block;
  overflow: visible;
  -webkit-line-clamp: unset;
  color: #475467;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.scenario-prompt-picker--embedded .prompt-chip {
  align-items: flex-start;
  padding: 12px;
}

.scenario-prompt-filter-empty {
  margin: 16px 0;
}
</style>
