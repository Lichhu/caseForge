<template>
  <a-drawer
    v-model:open="open"
    title="系统配置"
    placement="right"
    width="min(1400px, 92vw)"
    :z-index="IMMERSIVE_OVERLAY_Z_INDEX"
    :body-style="drawerBodyStyle"
  >
    <div class="system-config-shell">
      <nav class="system-config-tabs" role="tablist" aria-label="系统配置">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="system-config-tab"
          :class="{ 'is-active': activeTab === tab.key }"
          role="tab"
          :aria-selected="activeTab === tab.key"
          @click="activeTab = tab.key"
        >
          <component :is="tab.icon" />
          {{ tab.label }}
        </button>
      </nav>

      <div class="system-config-content">
        <ApiDataFunctionMaintainModal
          v-if="activeTab === 'functions'"
          :open="open"
          embedded
          :project-id="GLOBAL_LIBRARY_PROJECT_ID"
        />
        <ApiDatabaseConnectionMaintainModal
          v-if="activeTab === 'database'"
          :open="open"
          embedded
          :project-id="GLOBAL_LIBRARY_PROJECT_ID"
        />
        <ApiEnvironmentMaintainModal
          v-if="activeTab === 'environment'"
          :open="open"
          embedded
          :project-id="GLOBAL_LIBRARY_PROJECT_ID"
        />
        <StepLibraryMaintainModal
          v-if="activeTab === 'steps'"
          :open="open"
          embedded
        />
      </div>
    </div>
  </a-drawer>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
  CodeOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons-vue";
import { GLOBAL_LIBRARY_PROJECT_ID } from "@/constants/library";
import { IMMERSIVE_OVERLAY_Z_INDEX } from "@/constants/overlay-z-index";
import ApiDataFunctionMaintainModal from "./ApiDataFunctionMaintainModal.vue";
import ApiDatabaseConnectionMaintainModal from "./ApiDatabaseConnectionMaintainModal.vue";
import ApiEnvironmentMaintainModal from "./ApiEnvironmentMaintainModal.vue";
import StepLibraryMaintainModal from "./StepLibraryMaintainModal.vue";

type LibraryTab = "functions" | "database" | "environment" | "steps";

const open = defineModel<boolean>("open", { default: false });
const activeTab = ref<LibraryTab>("functions");
const tabs: Array<{
  key: LibraryTab;
  label: string;
  icon: typeof CodeOutlined;
}> = [
  { key: "functions", label: "函数库", icon: CodeOutlined },
  { key: "database", label: "数据库", icon: DatabaseOutlined },
  { key: "environment", label: "环境库", icon: GlobalOutlined },
  { key: "steps", label: "步骤库", icon: UnorderedListOutlined },
];
const drawerBodyStyle = {
  padding: "0",
  display: "flex",
  flexDirection: "column",
  minHeight: "0",
  overflow: "hidden",
};
</script>

<style scoped>
.system-config-shell {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.system-config-tabs {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
  padding: 0 28px;
  border-bottom: 1px solid var(--cf-border, #e4e7ec);
  background: var(--cf-surface, #fff);
}

.system-config-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 54px;
  padding: 0 18px;
  border: 0;
  background: transparent;
  color: var(--cf-text-secondary, #667085);
  font-size: 14px;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.system-config-tab:hover {
  color: var(--cf-brand, #b60f2d);
  background: var(--cf-brand-soft, #fff5f6);
}

.system-config-tab.is-active {
  color: var(--cf-brand, #b60f2d);
  font-weight: 600;
}

.system-config-tab.is-active::after {
  position: absolute;
  right: 14px;
  bottom: 0;
  left: 14px;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--cf-brand, #b60f2d);
  content: "";
}

.system-config-content {
  flex: 1;
  min-height: 0;
  padding: 20px 28px 24px;
}

.system-config-content :deep(.data-function-layout),
.system-config-content :deep(.db-connection-layout),
.system-config-content :deep(.env-maintain-layout),
.system-config-content :deep(.step-library-layout) {
  height: 100%;
  min-height: 0;
}
</style>
