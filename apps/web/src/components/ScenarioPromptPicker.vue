<template>
  <div class="editor-block">
    <div class="editor-block-title">场景提示词包</div>
    <a-empty
      v-if="!enabledScenarios.length"
      :description="
        optional
          ? '暂无已启用场景，可直接生成或前往场景维护启用'
          : '暂无已启用场景，请先在场景维护中启用'
      "
    />
    <a-collapse v-else class="scenario-collapse" :bordered="false">
      <a-collapse-panel
        v-for="scenario in enabledScenarios"
        :key="scenario.id"
        :header="scenario.name"
      >
        <p v-if="!scenario.prompts.length" class="scenario-prompt-hint">
          该场景暂无已启用提示词，请先在场景维护里新增并保存
        </p>
        <div v-else class="prompt-chip-list">
          <label v-for="prompt in scenario.prompts" :key="prompt.id" class="prompt-chip">
            <input
              v-model="promptIds"
              type="checkbox"
              :value="prompt.id"
              :disabled="disabled"
            />
            <span class="prompt-chip-text" :title="promptLabel(prompt, 'full')">
              {{ promptLabel(prompt) }}
            </span>
          </label>
        </div>
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<script setup lang="ts">
import { computed, withDefaults, defineProps } from 'vue';
import type { ScenarioScope } from '@case-forge/shared';
import { SCENARIO_SCOPE_CASE } from '@case-forge/shared';
import { useScenarioLibrary } from '@/composables/useScenarioLibrary';
import { buildEnabledScenarios, promptLabel } from '@/utils/scenarioLibrary';

const props = withDefaults(
  defineProps<{
    scope?: ScenarioScope;
    disabled?: boolean;
    optional?: boolean;
  }>(),
  {
    scope: SCENARIO_SCOPE_CASE,
    optional: false,
  },
);

const promptIds = defineModel<string[]>('promptIds', { default: () => [] });

const { scenarios } = useScenarioLibrary(props.scope);
const enabledScenarios = computed(() => buildEnabledScenarios(scenarios.value));
</script>
