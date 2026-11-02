<template>
  <div class="api-generation-config-panel">
    <aside class="service-property-list-panel">
      <div class="config-toolbar">
        <div>
          <strong>服务属性</strong>
          <span>{{ rows.length }} 项</span>
        </div>
        <a-button v-if="canEdit" type="primary" size="small" @click="startCreate">
          <template #icon><PlusOutlined /></template>
          新增
        </a-button>
      </div>
      <a-spin :spinning="loading">
        <div class="service-property-list">
          <button
            v-for="item in rows"
            :key="item.id"
            type="button"
            class="service-property-item"
            :class="{ active: selectedId === item.id, inactive: !item.isActive }"
            @click="selectRow(item)"
          >
            <strong>{{ item.name }}</strong>
            <span>{{ item.code }}</span>
            <small>{{ item.scenarioIds.length }} 个场景</small>
          </button>
          <button
            v-if="creating"
            type="button"
            class="service-property-item active"
          >
            <strong>新服务属性</strong>
            <span>尚未保存</span>
            <small>请填写右侧信息</small>
          </button>
        </div>
      </a-spin>
    </aside>

    <section v-if="form" class="service-property-editor">
      <div class="config-toolbar">
        <div>
          <strong>{{ creating ? "新增服务属性" : form.name }}</strong>
          <span>{{ canEdit ? "可维护场景映射与提示词" : "只读" }}</span>
        </div>
        <div class="config-actions">
          <a-button size="small" @click="openScenarioManager">
            查看场景与提示词
          </a-button>
          <a-button
            v-if="canEdit && !creating"
            size="small"
            danger
            :loading="deleting"
            @click="removeCurrent"
          >
            删除
          </a-button>
          <a-button
            v-if="canEdit"
            size="small"
            type="primary"
            :loading="saving"
            @click="saveCurrent"
          >
            保存
          </a-button>
        </div>
      </div>

      <div class="service-property-form">
        <label>
          <span>服务属性编码</span>
          <a-input
            v-model:value="form.code"
            :readonly="!canEdit"
            placeholder="management_non_accounting"
          />
        </label>
        <label>
          <span>显示名称</span>
          <a-input
            v-model:value="form.name"
            :readonly="!canEdit"
            placeholder="管理类非涉账"
          />
        </label>
        <label>
          <span>排序</span>
          <a-input-number
            v-model:value="form.sortOrder"
            :min="0"
            :disabled="!canEdit"
            class="service-property-sort"
          />
        </label>
        <label class="service-property-description">
          <span>说明</span>
          <a-input
            v-model:value="form.description"
            :readonly="!canEdit"
            placeholder="说明该服务属性适用的业务范围"
          />
        </label>
        <label class="service-property-enabled">
          <span>启用</span>
          <a-switch v-model:checked="form.isActive" :disabled="!canEdit" />
        </label>
      </div>

      <div class="scenario-mapping-head">
        <div>
          <strong>适用场景</strong>
          <span>AI 生成案例时按这里勾选的场景执行</span>
        </div>
        <a-button
          v-if="canEdit"
          type="link"
          size="small"
          @click="openScenarioManager"
        >
          维护场景与提示词
        </a-button>
      </div>

      <div class="scenario-mapping-list">
        <button
          v-for="scenario in activeScenarios"
          :key="scenario.id"
          type="button"
          class="scenario-mapping-item"
          :class="{
            selected: form.scenarioIds.includes(scenario.id),
            preview: previewScenarioId === scenario.id,
          }"
          @click="selectScenarioPreview(scenario)"
        >
          <a-checkbox
            :checked="form.scenarioIds.includes(scenario.id)"
            :disabled="!canEdit"
            @click.stop
            @change="(event: unknown) => toggleScenario(scenario.id, event)"
          />
          <span class="scenario-mapping-copy">
            <strong>{{ scenario.name }}</strong>
            <small>{{ scenario.description || scenario.category }}</small>
          </span>
          <a-tag :bordered="false">
            {{ activePromptCount(scenario) }} 条提示词
          </a-tag>
        </button>
      </div>

      <div v-if="previewScenario" class="prompt-preview-panel">
        <div class="prompt-preview-head">
          <strong>{{ previewScenario.name }}</strong>
          <span>{{ previewScenario.category }}</span>
        </div>
        <article
          v-for="prompt in previewPrompts"
          :key="prompt.id"
          class="prompt-preview-item"
        >
          <div>
            <strong>{{ prompt.name }}</strong>
            <a-tag v-if="prompt.isDefault" color="blue">默认</a-tag>
          </div>
          <pre>{{ prompt.content }}</pre>
        </article>
        <a-empty
          v-if="!previewPrompts.length"
          description="该场景暂无启用的提示词"
        />
      </div>
    </section>

    <a-empty
      v-else
      class="service-property-empty"
      description="暂无服务属性配置"
    />

    <ScenarioMaintainModal
      v-model:open="scenarioModalOpen"
      scope="api"
      :readonly="!canEdit"
      @update:open="onScenarioModalVisibleChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { message, Modal } from "ant-design-vue";
import { PlusOutlined } from "@ant-design/icons-vue";
import type { ScenarioLibraryItem } from "@/api/client";
import {
  createApiGenerationServiceProperty,
  deleteApiGenerationServiceProperty,
  getApiGenerationConfig,
  updateApiGenerationServiceProperty,
  type ApiServicePropertyConfigRow,
} from "@/api/apiTestClient";
import ScenarioMaintainModal from "@/components/ScenarioMaintainModal.vue";
import { useApiTestStore } from "@/stores/apiTest";

const props = withDefaults(
  defineProps<{
    canEdit?: boolean;
  }>(),
  { canEdit: false },
);

type PropertyForm = {
  code: string;
  name: string;
  description: string;
  scenarioIds: string[];
  sortOrder: number;
  isActive: boolean;
};

const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const rows = ref<ApiServicePropertyConfigRow[]>([]);
const scenarios = ref<ScenarioLibraryItem[]>([]);
const selectedId = ref("");
const creating = ref(false);
const previewScenarioId = ref("");
const scenarioModalOpen = ref(false);
const form = ref<PropertyForm | null>(null);
const apiStore = useApiTestStore();

const configCanEdit = ref(false);
const canEdit = computed(() => props.canEdit && configCanEdit.value);
const activeScenarios = computed(() =>
  scenarios.value.filter((scenario) => scenario.isActive),
);
const previewScenario = computed(
  () =>
    activeScenarios.value.find((item) => item.id === previewScenarioId.value) ??
    null,
);
const previewPrompts = computed(() =>
  (previewScenario.value?.prompts ?? [])
    .filter((prompt) => prompt.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder),
);

function normalizeScenarioIds(ids: string[]) {
  const available = new Set(
    activeScenarios.value.map((scenario) => scenario.id),
  );
  return ids.filter((id) => available.has(id));
}

function setSelected(row: ApiServicePropertyConfigRow) {
  selectedId.value = row.id;
  creating.value = false;
  form.value = {
    code: row.code,
    name: row.name,
    description: row.description,
    scenarioIds: normalizeScenarioIds(row.scenarioIds),
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
  if (!form.value.scenarioIds.includes(previewScenarioId.value)) {
    previewScenarioId.value = form.value.scenarioIds[0] ?? "";
  }
}

function selectRow(row: ApiServicePropertyConfigRow) {
  setSelected(row);
}

function startCreate() {
  creating.value = true;
  selectedId.value = "";
  form.value = {
    code: "",
    name: "",
    description: "",
    scenarioIds: [],
    sortOrder: rows.value.length + 1,
    isActive: true,
  };
  previewScenarioId.value = activeScenarios.value[0]?.id ?? "";
}

async function loadConfig(options?: { keepSelection?: boolean }) {
  loading.value = true;
  try {
    const config = await getApiGenerationConfig();
    rows.value = config.rows;
    scenarios.value = config.scenarios;
    pruneInactiveScenarios();
    configCanEdit.value = config.canEdit;
    const current =
      rows.value.find((item) => item.id === selectedId.value) ?? rows.value[0];
    if (!options?.keepSelection && current) {
      setSelected(current);
    } else if (!current && !creating.value) {
      selectedId.value = "";
      form.value = null;
    }
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : "加载服务属性配置失败",
    );
  } finally {
    loading.value = false;
  }
}

function toggleScenario(id: string, event: unknown) {
  if (!canEdit.value || !form.value) return;
  const scenario = scenarios.value.find((item) => item.id === id);
  if (!scenario?.isActive) return;
  const checked = Boolean(
    (event as { target?: { checked?: boolean } })?.target?.checked,
  );
  const next = new Set(form.value.scenarioIds);
  if (checked) next.add(id);
  else next.delete(id);
  form.value.scenarioIds = [...next];
  previewScenarioId.value = id;
}

function selectScenarioPreview(scenario: ScenarioLibraryItem) {
  previewScenarioId.value = scenario.id;
}

function pruneInactiveScenarios() {
  if (!form.value) return;
  form.value.scenarioIds = normalizeScenarioIds(form.value.scenarioIds);
  const preview = activeScenarios.value.find(
    (scenario) => scenario.id === previewScenarioId.value,
  );
  if (!preview?.isActive) {
    previewScenarioId.value =
      form.value.scenarioIds[0] ||
      activeScenarios.value[0]?.id ||
      "";
  }
}

function activePromptCount(scenario: ScenarioLibraryItem) {
  return scenario.prompts.filter((prompt) => prompt.isActive).length;
}

function buildPayload() {
  if (!form.value) return null;
  if (!form.value.code.trim() || !form.value.name.trim()) {
    message.warning("请填写服务属性编码和显示名称");
    return null;
  }
  return {
    code: form.value.code.trim(),
    name: form.value.name.trim(),
    description: form.value.description.trim(),
    scenarioIds: normalizeScenarioIds(form.value.scenarioIds),
    sortOrder: form.value.sortOrder,
    isActive: form.value.isActive,
  };
}

async function saveCurrent() {
  if (!canEdit.value) return;
  const payload = buildPayload();
  if (!payload) return;
  saving.value = true;
  try {
    if (creating.value) {
      const saved = await createApiGenerationServiceProperty(payload);
      message.success("服务属性已创建");
      await loadConfig();
      const matched = rows.value.find((item) => item.id === saved.id);
      if (matched) setSelected(matched);
    } else if (selectedId.value) {
      await updateApiGenerationServiceProperty(selectedId.value, payload);
      message.success("服务属性已保存");
      await loadConfig({ keepSelection: true });
    }
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : "保存服务属性失败",
    );
  } finally {
    saving.value = false;
  }
}

function removeCurrent() {
  const row = rows.value.find((item) => item.id === selectedId.value);
  if (!row) return;
  Modal.confirm({
    title: "删除服务属性？",
    content: `删除后 AI 生成案例将不能再选择“${row.name}”。`,
    okText: "删除",
    okType: "danger",
    cancelText: "取消",
    onOk: async () => {
      deleting.value = true;
      try {
        await deleteApiGenerationServiceProperty(row.id);
        message.success("服务属性已删除");
        selectedId.value = "";
        await loadConfig();
      } finally {
        deleting.value = false;
      }
    },
  });
}

async function onScenarioModalVisibleChange(visible: boolean) {
  if (visible) return;
  await loadConfig({ keepSelection: true });
}

async function openScenarioManager() {
  try {
    await apiStore.loadApiScenarioLibrary();
    scenarioModalOpen.value = true;
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : "加载场景与提示词失败",
    );
  }
}

watch(
  () => props.canEdit,
  (value) => {
    if (!value) creating.value = false;
  },
);

onMounted(() => {
  void loadConfig();
});
</script>

<style scoped>
.api-generation-config-panel {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  border: 1px solid #e4e7ec;
  border-radius: 10px;
  overflow: hidden;
}

.service-property-list-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid #e4e7ec;
  background: #f8f9fb;
}

.config-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 52px;
  padding: 10px 12px;
  border-bottom: 1px solid #e4e7ec;
  background: #fff;
}

.config-toolbar > div:first-child {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.config-toolbar strong {
  overflow: hidden;
  color: #1d2939;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-toolbar span {
  color: #98a2b3;
  font-size: 12px;
}

.config-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 6px;
}

.service-property-list {
  display: grid;
  gap: 6px;
  padding: 10px;
}

.service-property-item {
  display: grid;
  gap: 3px;
  width: 100%;
  padding: 10px 11px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #344054;
  text-align: left;
  cursor: pointer;
}

.service-property-item:hover {
  background: #fff;
}

.service-property-item.active {
  border-color: #e8b4bd;
  background: #fff5f6;
}

.service-property-item.inactive {
  opacity: 0.58;
}

.service-property-item strong {
  font-size: 13px;
}

.service-property-item span,
.service-property-item small {
  overflow: hidden;
  color: #667085;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.service-property-editor {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  background: #fff;
}

.service-property-form {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) 110px;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid #eaecf0;
}

.service-property-form label {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: #475467;
  font-size: 12px;
}

.service-property-description {
  grid-column: 1 / 3;
}

.service-property-enabled {
  align-content: start;
  justify-items: start;
}

.service-property-sort {
  width: 100%;
}

.scenario-mapping-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 8px;
}

.scenario-mapping-head > div {
  display: grid;
  gap: 3px;
}

.scenario-mapping-head strong {
  color: #1d2939;
  font-size: 14px;
}

.scenario-mapping-head span {
  color: #98a2b3;
  font-size: 12px;
}

.scenario-mapping-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 0 16px 14px;
}

.scenario-mapping-item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 10px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.scenario-mapping-item:hover,
.scenario-mapping-item.preview {
  border-color: #d7a2ac;
  background: #fffafb;
}

.scenario-mapping-item.selected {
  border-color: #b60f2d;
}

.scenario-mapping-item.inactive {
  opacity: 0.58;
}

.scenario-mapping-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.scenario-mapping-copy strong,
.scenario-mapping-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scenario-mapping-copy strong {
  color: #344054;
  font-size: 13px;
}

.scenario-mapping-copy small {
  color: #98a2b3;
  font-size: 11px;
}

.prompt-preview-panel {
  margin: 0 16px 16px;
  padding: 12px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fafbfc;
}

.prompt-preview-head,
.prompt-preview-item > div {
  display: flex;
  align-items: center;
  gap: 8px;
}

.prompt-preview-head {
  justify-content: space-between;
  margin-bottom: 10px;
}

.prompt-preview-head strong,
.prompt-preview-item strong {
  color: #344054;
  font-size: 13px;
}

.prompt-preview-head span {
  color: #98a2b3;
  font-size: 11px;
}

.prompt-preview-item + .prompt-preview-item {
  margin-top: 10px;
}

.prompt-preview-item pre {
  max-height: 220px;
  margin: 6px 0 0;
  padding: 10px;
  overflow: auto;
  border: 1px solid #e4e7ec;
  border-radius: 6px;
  background: #fff;
  color: #475467;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.service-property-empty {
  align-self: center;
  justify-self: center;
}

@media (max-width: 900px) {
  .api-generation-config-panel {
    grid-template-columns: 1fr;
  }

  .service-property-list-panel {
    max-height: 220px;
    border-right: 0;
    border-bottom: 1px solid #e4e7ec;
  }

  .scenario-mapping-list {
    grid-template-columns: 1fr;
  }

  .service-property-form {
    grid-template-columns: 1fr;
  }

  .service-property-description {
    grid-column: auto;
  }
}
</style>
