<template>
  <a-drawer
    :open="open"
    title="编辑步骤"
    placement="right"
    width="min(1200px, 84vw)"
    :z-index="NESTED_OVERLAY_Z_INDEX"
    :footer="null"
    :mask-closable="!saving"
    :closable="!saving"
    :destroy-on-close="true"
    root-class-name="preproduction-step-drawer"
    @close="closeDrawer"
  >
    <ApiStepEditor
      v-if="step && caseRow"
      :key="`${step.id}-${open}`"
      :step="step"
      :project-id="caseRow.projectId"
      :transaction-id="caseRow.transactionId"
      :shared-variables="sharedVariables"
      :saving="saving"
      footer-hint="保存后更新准生产案例步骤"
      @save="saveStep"
    />
    <a-empty v-else description="请选择要编辑的步骤" />
  </a-drawer>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { message } from "ant-design-vue";
import type { ApiHttpCaseStep } from "@case-forge/shared";
import {
  updateManagedCaseStep,
  type ManagedCaseRow,
} from "@/api/apiTestClient";
import { NESTED_OVERLAY_Z_INDEX } from "@/constants/overlay-z-index";
import ApiStepEditor from "./ApiStepEditor.vue";

const props = defineProps<{
  open: boolean;
  caseRow: ManagedCaseRow | null;
  step: ApiHttpCaseStep | null;
}>();

const emit = defineEmits<{
  (event: "update:open", value: boolean): void;
  (event: "updated", row: ManagedCaseRow): void;
}>();

const saving = ref(false);
const sharedVariables = computed(() => {
  const seen = new Set<string>();
  const options: Array<{ label: string; value: string }> = [];
  for (const row of props.caseRow?.steps ?? []) {
    if (row.id === props.step?.id) continue;
    for (const item of row.exports ?? []) {
      const name = item.name?.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      options.push({ label: `${row.name} · ${name}`, value: name });
    }
  }
  return options;
});

function closeDrawer() {
  if (saving.value) return;
  emit("update:open", false);
}

async function saveStep(payload: { name: string; step: ApiHttpCaseStep }) {
  if (!props.caseRow || !props.step || saving.value) return;
  saving.value = true;
  try {
    const updated = await updateManagedCaseStep(
      props.caseRow.id,
      props.step.id,
      { step: payload.step },
    );
    emit("updated", updated);
    message.success("步骤已保存");
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : "保存步骤失败，请重试",
    );
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
:global(.preproduction-step-drawer .ant-drawer-body) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 16px 22px;
  overflow: hidden;
  background: var(--cf-surface-soft, #f8f9fb);
}
</style>
