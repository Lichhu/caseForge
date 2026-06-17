<template>
  <section class="panel workbench-panel">
    <div class="panel-header">
      <div>
        <h2>案例编辑台</h2>
        <p>{{ store.workbenchTitle }}</p>
      </div>
      <div class="toolbar action-toolbar">
        <a-button
          type="primary"
          :disabled="!store.activeRun"
          :loading="store.treeSaving"
          @click="handleSaveTree"
        >
          <template #icon><SaveOutlined /></template>
          保存
        </a-button>
        <a-button
          :disabled="!store.activeRun"
          :loading="caseSelectConfirmLoading"
          @click="handleSyncToTestPlatform"
        >
          <template #icon><CloudUploadOutlined /></template>
          同步测管
        </a-button>
        <a-dropdown :disabled="!store.activeRun">
          <a-button>
            <template #icon><DownloadOutlined /></template>
            导出
          </a-button>
          <template #overlay>
            <a-menu @click="download">
              <a-menu-item key="xmind">XMind</a-menu-item>
              <a-menu-item key="excel">Excel</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </div>

    <div class="workbench-body">
      <a-spin :spinning="store.activeRunLoading">
        <div v-if="store.activeRun" class="workbench-excel-grid">
          <CaseTreeExcel
            :tree="store.activeRun.tree"
            :list-refresh-key="excelListRefreshKey"
            @change="handleExcelTreeChange"
          />
        </div>

        <a-empty
          v-else-if="store.activeRunLoading && store.hasProjectRuns"
          class="empty-state workbench-empty"
          description="正在加载案例树…"
        />
        <a-empty
          v-else-if="!store.hasProjectRuns"
          class="empty-state workbench-empty"
        >
          <template #description>
            <p class="workbench-empty-title">暂无案例树</p>
            <p class="workbench-empty-steps">
              请先在「02
              动态指令」维护测试要点并<strong>生成</strong>案例，生成完成后返回本页进行在线编辑与导出。
            </p>
          </template>
          <div
            v-if="store.structDoc?.canEnterDynamicInstruct"
            class="action-toolbar"
          >
            <a-button type="primary" @click="goToConstraints">
              去动态指令
            </a-button>
          </div>
        </a-empty>
        <a-empty v-else class="empty-state workbench-empty">
          <template #description>
            <p class="workbench-empty-title">案例树加载失败</p>
            <p class="workbench-empty-steps">
              请重试加载，或返回动态指令确认案例已生成。
            </p>
          </template>
          <div class="action-toolbar">
            <a-button
              type="primary"
              :loading="store.activeRunLoading"
              @click="retryLoadRun"
            >
              重新加载
            </a-button>
          </div>
        </a-empty>
      </a-spin>
    </div>

    <CaseSelectionModal
      v-model:open="caseSelectModalOpen"
      :mode="caseSelectModalMode"
      :project-id="store.activeProject?.id"
      :run-id="store.activeRun?.id ?? store.primaryRunSummary?.id"
      :confirm-loading="caseSelectConfirmLoading"
      @confirm="handleCaseSelectConfirm"
      @download-template="handleDownloadExcelTemplate"
    />
  </section>
</template>

<script setup lang="ts">
import { onActivated, onMounted, ref, watch } from "vue";
import {
  CloudUploadOutlined,
  DownloadOutlined,
  SaveOutlined,
} from "@ant-design/icons-vue";
import { message, type MenuProps } from "ant-design-vue";
import type { CaseTreeNode } from "@case-forge/shared";
import {
  cloneCaseTree,
  EDITOR_CASE_TREE_NORMALIZE_OPTIONS,
  normalizeCaseTreeForSkill,
} from "@case-forge/shared";
import {
  exportExcelTemplateUrl,
  exportUrl,
  syncRunToTestPlatform,
} from "@/api/client";
import { useCaseForgeStore } from "@/stores/caseForge";
import CaseTreeExcel from "@/components/CaseTreeExcel.vue";
import CaseSelectionModal, {
  type CaseSelectionMode,
} from "@/components/CaseSelectionModal.vue";
import { debounce } from "@/utils/debounce";

const store = useCaseForgeStore();

async function goToConstraints() {
  await store.setWorkspaceStage("constraints", { refresh: true });
}

const excelListRefreshKey = ref(0);
const dirty = ref(false);
const caseSelectModalOpen = ref(false);
const caseSelectModalMode = ref<CaseSelectionMode>("sync");
const caseSelectConfirmLoading = ref(false);

watch(
  () => store.activeRun?.id,
  (runId) => {
    dirty.value = false;
    if (!runId) {
      return;
    }
    excelListRefreshKey.value += 1;
  },
  { immediate: true },
);

watch(
  () => store.workspaceStage,
  (stage) => {
    if (stage !== "workbench") {
      return;
    }
    void ensureActiveRunLoaded();
  },
);

async function ensureActiveRunLoaded() {
  if (!store.hasProjectRuns || store.activeRun || store.activeRunLoading) {
    return;
  }
  try {
    await store.loadActiveRun();
  } catch (error) {
    message.error((error as Error)?.message || "案例树加载失败");
  }
}

function retryLoadRun() {
  void store.loadActiveRun({ force: true }).catch((error) => {
    message.error((error as Error)?.message || "案例树加载失败");
  });
}

onMounted(() => {
  void ensureActiveRunLoaded();
});

onActivated(() => {
  void ensureActiveRunLoaded();
});

function handleExcelTreeChange(tree: CaseTreeNode) {
  if (!store.activeRun) return;
  store.activeRun.tree = normalizeCaseTreeForSkill(
    tree,
    EDITOR_CASE_TREE_NORMALIZE_OPTIONS,
  );
  dirty.value = true;
  scheduleExcelAutoSave();
}

const scheduleExcelAutoSave = debounce(async () => {
  if (!store.activeRun) return;
  try {
    await store.saveTree({ successMessage: "已自动保存" });
    dirty.value = false;
  } catch {
    dirty.value = true;
  }
}, 500);

async function handleSaveTree() {
  if (!store.activeRun) return;
  try {
    await store.saveTree();
    dirty.value = false;
  } catch {
    // 错误提示由 store.saveTree 处理
  }
}

function getCurrentEditorTree(): CaseTreeNode | null {
  if (!store.activeRun) return null;
  return cloneCaseTree(store.activeRun.tree);
}

async function prepareTreeForAction() {
  if (!store.activeProject || !store.activeRun) return null;
  if (dirty.value) {
    try {
      await store.saveTree();
      dirty.value = false;
    } catch {
      return null;
    }
  }
  return getCurrentEditorTree();
}

async function openCaseSelectModal(mode: CaseSelectionMode) {
  try {
    const tree = await prepareTreeForAction();
    if (!tree) return;
    caseSelectModalMode.value = mode;
    caseSelectModalOpen.value = true;
  } catch (error) {
    message.error((error as Error)?.message || "无法读取当前案例树");
  }
}

async function handleSyncToTestPlatform() {
  await openCaseSelectModal("sync");
}

function handleDownloadExcelTemplate() {
  if (!store.activeProject || !store.activeRun) return;
  window.open(
    exportExcelTemplateUrl(store.activeProject.id, store.activeRun.id),
  );
}

async function handleCaseSelectConfirm(caseNodeIds: string[]) {
  if (caseSelectModalMode.value === "excel") {
    if (!store.activeProject || !store.activeRun) return;
    window.open(
      exportUrl(
        store.activeProject.id,
        store.activeRun.id,
        "excel",
        caseNodeIds,
      ),
    );
    caseSelectModalOpen.value = false;
    return;
  }
  await submitSyncToTestPlatform(caseNodeIds);
}

async function submitSyncToTestPlatform(caseNodeIds: string[]) {
  if (!store.activeProject || !store.activeRun) return;
  const tree = getCurrentEditorTree();
  if (!tree) return;
  caseSelectConfirmLoading.value = true;
  try {
    const result = await syncRunToTestPlatform(
      store.activeProject.id,
      store.activeRun.id,
      tree,
      caseNodeIds,
    );
    caseSelectModalOpen.value = false;
    message.success(
      `已同步至测管平台（${result.projectCode}）：新增 ${result.inserted}，更新 ${result.updated}，跳过 ${result.skipped}`,
    );
  } catch (error) {
    message.error((error as Error)?.message || "同步测管平台失败");
  } finally {
    caseSelectConfirmLoading.value = false;
  }
}

const download: MenuProps["onClick"] = async ({ key }) => {
  if (!store.activeProject || !store.activeRun) return;
  if (key === "excel") {
    await openCaseSelectModal("excel");
    return;
  }
  if (dirty.value) {
    try {
      await store.saveTree();
      dirty.value = false;
    } catch {
      return;
    }
  }
  window.open(exportUrl(store.activeProject.id, store.activeRun.id, "xmind"));
};
</script>
