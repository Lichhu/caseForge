<template>
  <LibraryPanelShell
    v-model:open="open"
    title="步骤库"
    width="min(1240px, 84vw)"
    :z-index="IMMERSIVE_OVERLAY_Z_INDEX"
    body-padding="20px 28px 24px"
    :embedded="embedded"
    @close="close"
  >
    <div class="step-library-layout">
      <LibrarySidebar title="步骤" :count="filteredRows.length" @create="openCreate">
        <template #tools>
          <LibrarySearch v-model="stepKeyword" placeholder="搜索步骤名称" />
        </template>
        <LibraryListItem
          v-for="row in filteredRows"
          :key="row.id"
          :name="row.name || '未命名步骤'"
          :meta="stepMeta(row)"
          :active="row.id === editingId"
          @select="openEdit(row)"
        >
          <template #icon><ApiOutlined /></template>
        </LibraryListItem>

        <div v-if="loading && !rows.length" class="step-library-list-state">加载中…</div>
        <LibraryEmptyState
          v-else-if="!filteredRows.length"
          :text="stepKeyword?.trim() ? '无匹配步骤' : '暂无步骤'"
        />
      </LibrarySidebar>

      <section v-if="editorVisible" class="step-library-editor">
        <div class="step-library-editor-head">
          <div>
            <strong>{{ editingId ? "编辑步骤" : "新增步骤" }}</strong>
            <p>{{ editingId ? "修改后保存即可更新步骤库" : "填写步骤信息后保存到步骤库" }}</p>
          </div>
          <a-tag v-if="!editingId" color="processing" :bordered="false">未保存</a-tag>
        </div>
        <div class="step-library-editor-body">
          <ApiStepEditor
            v-if="editingStep"
            :step="editingStep"
            :project-id="debugProjectId"
            :transaction-id="debugTransactionId"
            :shared-variables="sharedVariables"
            :saving="saving"
            :show-delete="Boolean(editingId)"
            :can-delete="Boolean(editingId)"
            footer-hint="保存后更新步骤库"
            @save="saveStep"
            @delete="removeActiveStep"
          />
        </div>
      </section>

      <section v-else class="step-library-placeholder">
        <InboxOutlined />
        <p>选择左侧步骤查看详情，或新建一个步骤</p>
      </section>
    </div>
  </LibraryPanelShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { message, Modal } from "ant-design-vue";
import { ApiOutlined, InboxOutlined } from "@ant-design/icons-vue";
import type { ApiCaseStep } from "@case-forge/shared";
import { isHttpStep } from "@case-forge/shared";
import {
  deleteStepLibrary,
  listStepLibrary,
  saveStepLibrary,
  type ApiStepLibraryRow,
} from "@/api/apiTestClient";
import { GLOBAL_LIBRARY_PROJECT_ID } from "@/constants/library";
import {
  IMMERSIVE_OVERLAY_Z_INDEX,
  NESTED_OVERLAY_Z_INDEX,
} from "@/constants/overlay-z-index";
import { useApiTestStore } from "@/stores/apiTest";
import { randomUuid } from "@/utils/randomUuid";
import ApiStepEditor from "./ApiStepEditor.vue";
import LibraryEmptyState from "./LibraryEmptyState.vue";
import LibraryListItem from "./LibraryListItem.vue";
import LibraryPanelShell from "./LibraryPanelShell.vue";
import LibrarySearch from "./LibrarySearch.vue";
import LibrarySidebar from "./LibrarySidebar.vue";

const open = defineModel<boolean>("open", { default: false });
const props = defineProps<{ embedded?: boolean }>();
const { embedded } = props;
const apiStore = useApiTestStore();
const rows = ref<ApiStepLibraryRow[]>([]);
const stepKeyword = ref("");
const filteredRows = computed(() => {
  const keyword = (stepKeyword.value ?? "").trim().toLowerCase();
  if (!keyword) return rows.value;
  return rows.value.filter((row) => (row.name ?? "").toLowerCase().includes(keyword));
});
const loading = ref(false);
const saving = ref(false);
const editorVisible = ref(false);
const editingId = ref("");
const editingStep = ref<ApiCaseStep | null>(null);
const currentRow = computed(
  () => rows.value.find((row) => row.id === editingId.value) ?? null,
);
const debugTransactionId = computed(
  () => apiStore.activeTransactionId || "step-library",
);
const debugProjectId = computed(
  () => apiStore.activeProjectId || GLOBAL_LIBRARY_PROJECT_ID,
);
const sharedVariables = computed(() => {
  const seen = new Set<string>();
  const options: Array<{ label: string; value: string }> = [];
  for (const row of rows.value) {
    if (row.id === editingId.value) continue;
    for (const item of row.step.exports ?? []) {
      const name = item.name?.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      options.push({ label: `${row.name} · ${name}`, value: name });
    }
  }
  return options;
});

async function load(preferredId?: string) {
  loading.value = true;
  try {
    await apiStore.refreshEnvironments(GLOBAL_LIBRARY_PROJECT_ID);
    rows.value = await listStepLibrary();
    const targetId = preferredId || editingId.value;
    const current =
      rows.value.find((row) => row.id === targetId) ?? rows.value[0];
    if (current && isHttpStep(current.step)) {
      openEdit(current);
    } else {
      editingId.value = current?.id ?? "";
      editingStep.value = current?.step ?? null;
      editorVisible.value = false;
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : "加载步骤库失败");
  } finally {
    loading.value = false;
  }
}

function close() {
  open.value = false;
}

function openCreate() {
  editingId.value = "";
  editingStep.value = {
    id: randomUuid(),
    name: "",
    request: { method: "POST", path: "/", transport: "http", encoding: "UTF-8" },
    expected: {},
    exports: [],
  };
  editorVisible.value = true;
}

function openEdit(row: ApiStepLibraryRow) {
  if (!isHttpStep(row.step)) {
    message.warning("SQL 步骤请在案例步骤列表中编辑");
    return;
  }
  editingId.value = row.id;
  editingStep.value = row.step;
  editorVisible.value = true;
}

async function saveStep(payload: { name: string; step: ApiCaseStep }) {
  saving.value = true;
  try {
    const saved = await saveStepLibrary(payload, editingId.value || undefined);
    editingId.value = saved.id;
    await load(saved.id);
    message.success("步骤已保存");
  } catch (error) {
    message.error(error instanceof Error ? error.message : "保存步骤失败");
  } finally {
    saving.value = false;
  }
}

function removeStep(row: ApiStepLibraryRow) {
  Modal.confirm({
    title: "删除步骤",
    content: `确定删除「${row.name}」？`,
    okText: "删除",
    cancelText: "取消",
    okType: "danger",
    centered: true,
    zIndex: NESTED_OVERLAY_Z_INDEX,
    onOk: async () => {
      await deleteStepLibrary(row.id);
      if (editingId.value === row.id) {
        editingId.value = "";
        editingStep.value = null;
        editorVisible.value = false;
      }
      await load();
      message.success("步骤已删除");
    },
  });
}

function removeActiveStep() {
  if (currentRow.value) removeStep(currentRow.value);
}

function requestMethod(row: ApiStepLibraryRow) {
  if (!("request" in row.step)) return "SQL";
  const transport = String(row.step.request?.transport ?? "http").toLowerCase();
  if (transport === "tcp" || transport === "socket") return "SOCKET";
  if (transport === "mq") return "MQ";
  if (transport === "tuxedo") return "TUXEDO";
  if (transport === "other") return "OTHER";
  return row.step.request?.method || "POST";
}

function stepMeta(row: ApiStepLibraryRow) {
  const environment =
    "target" in row.step
      ? row.step.target?.name || "未选择环境"
      : "数据库步骤";
  return `${environment} · ${requestMethod(row)}`;
}

defineExpose({ load });

watch(
  open,
  (value) => {
    if (value) void load();
  },
  { immediate: true },
);
</script>

<style scoped>
.step-library-layout {
  display: grid;
  grid-template-columns: 252px minmax(0, 1fr);
  gap: 20px;
  height: calc(100vh - 120px);
  min-height: 540px;
}

.step-library-list-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 12px;
  font-size: 12px;
  color: var(--cf-text-muted, #98a2b3);
}

.step-library-list-state :deep(.anticon) {
  font-size: 24px;
  opacity: 0.4;
}

.step-library-editor {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--cf-border, #e4e7ec);
  border-radius: 12px;
  background: var(--cf-surface-soft, #f8f9fb);
  overflow: hidden;
}

.step-library-editor-head {
  display: flex;
  flex-shrink: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 22px 14px;
  border-bottom: 1px solid var(--cf-border, #e4e7ec);
}

.step-library-editor-head strong {
  display: block;
  font-size: 15px;
  color: var(--cf-text, #1d2939);
}

.step-library-editor-head p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--cf-text-muted, #98a2b3);
}

.step-library-editor-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 18px 22px 0;
  background: var(--cf-surface-soft, #f8f9fb);
  overflow: hidden;
}

.step-library-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border: 1px dashed var(--cf-border, #d0d5dd);
  border-radius: 12px;
  background: var(--cf-surface-soft, #f8f9fb);
  color: var(--cf-text-muted, #98a2b3);
}

.step-library-placeholder :deep(.anticon) {
  font-size: 42px;
  opacity: 0.3;
}

.step-library-placeholder p {
  margin: 0;
  font-size: 13px;
}

@media (max-width: 700px) {
  .step-library-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
