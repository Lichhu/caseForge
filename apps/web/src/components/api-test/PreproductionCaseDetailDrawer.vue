<template>
  <a-drawer
    :open="open"
    title="准生产案例详情"
    placement="right"
    width="min(1280px, 78vw)"
    :body-style="{ padding: '20px 24px' }"
    :footer-style="{ padding: '12px 24px' }"
    :mask-closable="!deleting"
    :closable="!deleting"
    @close="emit('update:open', false)"
  >
    <a-spin :spinning="loading">
    <div v-if="caseRow" class="case-detail-drawer">
      <div class="case-detail-head">
        <div>
          <strong>{{ caseRow.caseNo || caseRow.title }}</strong>
          <span>{{ caseRow.title }}</span>
        </div>
        <a-tag :color="caseRow.polarity === 'negative' ? 'orange' : 'blue'">
          {{ caseRow.polarity === "negative" ? "反向" : "正向" }}
        </a-tag>
      </div>

      <div class="case-detail-tabs" role="tablist" aria-label="准生产案例详情">
        <button
          type="button"
          role="tab"
          :class="{ active: detailTab === 'basic' }"
          :aria-selected="detailTab === 'basic'"
          @click="detailTab = 'basic'"
        >
          基础信息
        </button>
        <button
          type="button"
          role="tab"
          :class="{ active: detailTab === 'steps' }"
          :aria-selected="detailTab === 'steps'"
          @click="detailTab = 'steps'"
        >
          步骤列表
        </button>
      </div>

      <div v-show="detailTab === 'basic'" class="case-detail-tab-panel">
      <div class="case-detail-info">
        <div class="editable-info-field">
          <span>案例名称</span>
          <div v-if="editingField === 'title'" class="inline-edit-row">
            <a-input
              v-model:value="fieldDraft"
              size="small"
              @press-enter="saveField"
            />
            <a-button
              type="text"
              size="small"
              class="inline-edit-save"
              :loading="fieldSaving"
              aria-label="保存案例名称"
              @click="saveField"
              ><CheckOutlined
            /></a-button>
            <a-button
              type="text"
              size="small"
              danger
              :disabled="fieldSaving"
              aria-label="取消编辑"
              @click="cancelFieldEdit"
              ><CloseOutlined
            /></a-button>
          </div>
          <strong
            v-else
            class="inline-editable-value"
            @click="startFieldEdit('title', caseRow.title)"
            >{{ caseRow.title || "—" }}</strong
          >
        </div>
        <div>
          <span>案例编号</span>
          <strong>{{ caseRow.caseNo || "—" }}</strong>
        </div>
        <div>
          <span>案例类型</span>
          <strong>{{ caseRow.polarity === "negative" ? "反向" : "正向" }}</strong>
        </div>
        <div>
          <span>状态</span>
          <strong>{{ statusLabel(caseRow.status) }}</strong>
        </div>
        <div>
          <span>交易码</span>
          <strong>{{ caseRow.transactionCode || "—" }}</strong>
        </div>
        <div>
          <span>需求编号</span>
          <strong>{{ caseRow.requirementNo || "—" }}</strong>
        </div>
        <div>
          <span>归属应用</span>
          <strong>{{ caseRow.applicationPath || "未指定" }}</strong>
        </div>
        <div>
          <span>版本</span>
          <strong>{{ currentVersionLabel || "未版本化" }}</strong>
        </div>
        <div>
          <span>创建时间</span>
          <strong>{{ formatDateTime(caseRow.createdAt) }}</strong>
        </div>
        <div>
          <span>负责人</span>
          <strong>{{ caseRow.owner || "—" }}</strong>
        </div>
        <div>
          <span>创建人</span>
          <strong>{{ caseRow.createdBy || "—" }}</strong>
        </div>
        <div>
          <span>优先级</span>
          <strong>{{ caseRow.priority || "—" }}</strong>
        </div>
        <div>
          <span>来源</span>
          <strong>{{ sourceLabel(caseRow.metadata?.source) }}</strong>
        </div>
        <div>
          <span>步骤数</span>
          <strong>{{ steps.length }} 步</strong>
        </div>
      </div>

      <div class="case-detail-text">
        <span>案例描述</span>
        <div
          v-if="editingField === 'description'"
          class="inline-edit-row inline-edit-row--multiline"
        >
          <a-textarea
            v-model:value="fieldDraft"
            :auto-size="{ minRows: 2, maxRows: 5 }"
          />
          <div class="inline-edit-buttons">
            <a-button
              type="text"
              size="small"
              class="inline-edit-save"
              :loading="fieldSaving"
              aria-label="保存案例描述"
              @click="saveField"
              ><CheckOutlined
            /></a-button>
            <a-button
              type="text"
              size="small"
              danger
              :disabled="fieldSaving"
              aria-label="取消编辑"
              @click="cancelFieldEdit"
              ><CloseOutlined
            /></a-button>
          </div>
        </div>
        <p
          v-else
          class="inline-editable-value"
          @click="startFieldEdit('description', caseRow.description)"
        >
          {{ caseRow.description || "—" }}
        </p>
      </div>
      <div class="case-detail-text">
        <span>备注</span>
        <div
          v-if="editingField === 'remark'"
          class="inline-edit-row inline-edit-row--multiline"
        >
          <a-textarea
            v-model:value="fieldDraft"
            :auto-size="{ minRows: 2, maxRows: 5 }"
          />
          <div class="inline-edit-buttons">
            <a-button
              type="text"
              size="small"
              class="inline-edit-save"
              :loading="fieldSaving"
              aria-label="保存备注"
              @click="saveField"
              ><CheckOutlined
            /></a-button>
            <a-button
              type="text"
              size="small"
              danger
              :disabled="fieldSaving"
              aria-label="取消编辑"
              @click="cancelFieldEdit"
              ><CloseOutlined
            /></a-button>
          </div>
        </div>
        <p
          v-else
          class="inline-editable-value"
          @click="startFieldEdit('remark', caseRow.remark)"
        >
          {{ caseRow.remark || "—" }}
        </p>
      </div>
      <div v-if="caseRow.preconditions?.length" class="case-detail-text">
        <span>前置条件</span>
        <p>{{ caseRow.preconditions.join("；") }}</p>
      </div>
      </div>

      <div v-show="detailTab === 'steps'" class="case-detail-tab-panel">

      <a-empty
        v-if="!steps.length"
        description="该案例没有配置步骤"
        class="case-steps-empty"
      />
      <div v-else class="case-step-list">
        <article
          v-for="(step, index) in steps"
          :key="step.id"
          class="case-step-item"
          :class="{ 'case-step-item--clickable': isHttpStep(step) }"
          @click="isHttpStep(step) && openStepDetail(step)"
        >
          <span class="case-step-index">{{ index + 1 }}</span>
          <div class="case-step-body">
            <div class="case-step-title">
              <strong>{{ step.name || "未命名步骤" }}</strong>
              <a-tag :color="isHttpStep(step) && stepProtocol(step) === 'HTTP' ? 'blue' : 'purple'">
                {{ isHttpStep(step) ? stepProtocol(step) : "SQL" }}
              </a-tag>
              <span v-if="isHttpStep(step)" class="case-step-open-hint">查看详情</span>
            </div>

            <template v-if="isHttpStep(step)">
              <div class="case-step-line">
                <span>请求</span>
                <code>{{ stepRequestLabel(step) }}</code>
              </div>
              <div v-if="step.target?.address" class="case-step-line">
                <span>目标</span>
                <code>{{ step.target.address }}</code>
              </div>
              <div class="case-step-line">
                <span>断言</span>
                <code>{{ step.expected?.assertions?.length ?? 0 }} 条</code>
              </div>
            </template>
            <template v-else>
              <div class="case-step-line case-step-line--sql">
                <span>SQL</span>
                <code>{{ step.db.sql }}</code>
              </div>
            </template>
          </div>
        </article>
      </div>
      </div>

    </div>
    </a-spin>

    <PreproductionStepDetailDrawer
      v-model:open="stepDrawerOpen"
      :case-row="caseRow"
      :step="selectedStep"
      @updated="onStepUpdated"
    />

    <template #footer>
      <div class="case-detail-footer">
        <a-button
          danger
          :loading="deleting"
          @click="emit('delete')"
        >
          删除
        </a-button>
        <a-button :disabled="deleting" @click="emit('update:open', false)">
          关闭
        </a-button>
      </div>
    </template>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { message } from "ant-design-vue";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons-vue";
import { isHttpStep } from "@case-forge/shared";
import type { ApiCaseStep, ApiHttpCaseStep } from "@case-forge/shared";
import {
  updateManagedCaseInfo,
  type ManagedCaseRow,
} from "@/api/apiTestClient";
import { versionLabel } from "@/utils/caseManagement";
import PreproductionStepDetailDrawer from "./PreproductionStepDetailDrawer.vue";

const props = defineProps<{
  open: boolean;
  caseRow: ManagedCaseRow | null;
  deleting?: boolean;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (event: "update:open", value: boolean): void;
  (event: "delete"): void;
  (event: "updated", row: ManagedCaseRow): void;
}>();

const editingField = ref<"title" | "description" | "remark" | null>(null);
const fieldDraft = ref("");
const fieldSaving = ref(false);
const detailTab = ref<"basic" | "steps">("basic");
const stepDrawerOpen = ref(false);
const selectedStep = ref<ApiHttpCaseStep | null>(null);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    detailTab.value = "basic";
    editingField.value = null;
    stepDrawerOpen.value = false;
    selectedStep.value = null;
  },
  { immediate: true },
);

watch(
  () => props.caseRow?.id,
  (id, previousId) => {
    if (!props.open || !id || id === previousId) return;
    detailTab.value = "basic";
    editingField.value = null;
    stepDrawerOpen.value = false;
    selectedStep.value = null;
  },
);

const currentVersionLabel = computed(() =>
  props.caseRow ? versionLabel(props.caseRow) : "",
);

const steps = computed<ApiCaseStep[]>(() => {
  const row = props.caseRow;
  if (!row) return [];
  if (row.steps?.length) return row.steps;
  return [
    {
      id: row.id,
      name: row.title,
      isMainRequest: true,
      request: row.request,
      expected: row.expected,
      exports: [],
    },
  ];
});

function stepProtocol(step: ApiHttpCaseStep) {
  const transport = String(step.request.transport ?? "http").toLowerCase();
  if (transport === "tcp" || transport === "socket") return "SOCKET";
  if (transport === "mq") return "MQ";
  if (transport === "tuxedo") return "TUXEDO";
  if (transport === "other") return "OTHER";
  return "HTTP";
}

function stepRequestLabel(step: ApiHttpCaseStep) {
  const protocol = stepProtocol(step);
  if (protocol !== "HTTP") return protocol;
  return `${step.request.method || "—"} ${step.request.path || "—"}`;
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function statusLabel(value?: string) {
  const labels: Record<string, string> = {
    draft: "草稿",
    ready: "就绪",
    disabled: "停用",
  };
  return value ? labels[value] || value : "—";
}

function sourceLabel(value?: string) {
  const labels: Record<string, string> = {
    ai: "AI 生成",
    manual: "手工创建",
    ai_edited: "AI 生成后编辑",
  };
  return value ? labels[value] || value : "—";
}

function startFieldEdit(
  field: "title" | "description" | "remark",
  value?: string | null,
) {
  if (fieldSaving.value) return;
  editingField.value = field;
  fieldDraft.value = value ?? "";
}

function cancelFieldEdit() {
  if (fieldSaving.value) return;
  editingField.value = null;
  fieldDraft.value = "";
}

async function saveField() {
  if (!props.caseRow || !editingField.value || fieldSaving.value) return;
  const value = fieldDraft.value.trim();
  if (editingField.value === "title" && !value) {
    message.warning("案例名称不能为空");
    return;
  }
  const payload =
    editingField.value === "title"
      ? { title: value }
      : editingField.value === "description"
        ? { description: value }
        : { remark: value };
  fieldSaving.value = true;
  try {
    const updated = await updateManagedCaseInfo(props.caseRow.id, payload);
    emit("updated", updated);
    editingField.value = null;
    message.success("案例信息已保存");
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : "保存案例信息失败，请重试",
    );
  } finally {
    fieldSaving.value = false;
  }
}

function openStepDetail(step: ApiCaseStep) {
  if (!isHttpStep(step)) return;
  selectedStep.value = step;
  stepDrawerOpen.value = true;
}

function onStepUpdated(row: ManagedCaseRow) {
  detailTab.value = "steps";
  const updatedStep = row.steps?.find(
    (step) => step.id === selectedStep.value?.id,
  );
  if (updatedStep && isHttpStep(updatedStep)) {
    selectedStep.value = updatedStep;
  }
  emit("updated", row);
}
</script>

<style scoped>
.case-detail-drawer {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}
.case-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eaecf0;
}
.case-detail-head strong,
.case-detail-head span {
  display: block;
}
.case-detail-head strong {
  color: #1d2939;
  font-size: 16px;
}
.case-detail-head span {
  margin-top: 3px;
  color: #667085;
  font-size: 13px;
}
.case-detail-tabs {
  display: flex;
  gap: 24px;
  border-bottom: 1px solid #eaecf0;
}
.case-detail-tabs button {
  position: relative;
  padding: 8px 2px 10px;
  border: 0;
  background: transparent;
  color: #667085;
  font-size: 14px;
  cursor: pointer;
}
.case-detail-tabs button.active {
  color: var(--cf-brand);
  font-weight: 600;
}
.case-detail-tabs button.active::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--cf-brand);
  content: "";
}
.case-detail-tab-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.case-detail-info {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 20px;
  padding: 14px 16px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fcfcfd;
}
.case-detail-info > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.case-detail-info span {
  color: #98a2b3;
  font-size: 12px;
}
.case-detail-info strong {
  overflow: hidden;
  color: #344054;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inline-editable-value {
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.15s ease;
}
.inline-editable-value:hover {
  background: #fff7e6;
}
.inline-edit-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
}
.inline-edit-row :deep(.ant-input) {
  flex: 1;
  min-width: 0;
}
.inline-edit-row--multiline {
  align-items: flex-start;
}
.inline-edit-buttons {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
}
.inline-edit-save {
  color: #027a48;
}
.case-detail-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 16px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fff;
}
.case-detail-text span {
  color: #98a2b3;
  font-size: 12px;
}
.case-detail-text p {
  margin: 0;
  color: #344054;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.case-detail-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #1d2939;
}
.case-steps-empty {
  padding: 28px 0;
}
.case-step-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.case-step-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
  padding: 12px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fcfcfd;
}
.case-step-item--clickable {
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}
.case-step-item--clickable:hover {
  border-color: #e7b8c0;
  background: #fffafb;
}
.case-step-index {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff1f3;
  color: var(--cf-brand);
  font-size: 12px;
  font-weight: 600;
}
.case-step-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.case-step-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #1d2939;
}
.case-step-open-hint {
  margin-left: auto;
  color: var(--cf-brand);
  font-size: 12px;
}
.case-step-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  color: #475467;
  font-size: 12px;
}
.case-step-line > span {
  flex: 0 0 32px;
  color: #98a2b3;
}
.case-step-line code {
  min-width: 0;
  color: #344054;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  white-space: pre-wrap;
  word-break: break-all;
}
.case-step-line--sql code {
  max-height: 120px;
  overflow: auto;
}
.case-detail-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}

@media (max-width: 900px) {
  .case-detail-info {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
