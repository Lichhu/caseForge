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

        <div
          class="case-detail-tabs"
          role="tablist"
          aria-label="准生产案例详情"
        >
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
              <strong>{{
                caseRow.polarity === "negative" ? "反向" : "正向"
              }}</strong>
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
              class="case-step-item case-step-item--clickable"
              @click="openStepDetail(step)"
            >
              <span class="case-step-index">{{ index + 1 }}</span>
              <div class="case-step-body">
                <div class="case-step-title">
                  <strong>{{ step.name || "未命名步骤" }}</strong>
                  <a-tag
                    :color="
                      isHttpStep(step) && stepProtocol(step) === 'HTTP'
                        ? 'blue'
                        : 'purple'
                    "
                  >
                    {{ isHttpStep(step) ? stepProtocol(step) : "SQL" }}
                  </a-tag>
                  <div class="case-step-actions">
                    <a-button
                      type="link"
                      size="small"
                      @click.stop="openStepDetail(step)"
                    >
                      查看详情
                    </a-button>
                    <a-button
                      type="link"
                      size="small"
                      class="case-step-debug-record"
                      @click.stop="openStepDebugHistory(step)"
                    >
                      调试记录
                    </a-button>
                    <a-button
                      type="link"
                      danger
                      size="small"
                      :loading="deletingStepId === step.id"
                      :disabled="
                        !canDeleteStep(step) ||
                        Boolean(deletingStepId && deletingStepId !== step.id)
                      "
                      :title="
                        canDeleteStep(step)
                          ? '删除步骤'
                          : '案例至少需要保留一个步骤'
                      "
                      @click.stop="confirmDeleteStep(step)"
                    >
                      <template #icon><DeleteOutlined /></template>
                      删除
                    </a-button>
                  </div>
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
      @debugged="onStepDebugged"
    />

    <a-modal
      v-model:open="debugHistoryOpen"
      title="步骤调试记录"
      :width="900"
      :footer="null"
      :z-index="NESTED_OVERLAY_Z_INDEX + 10"
      wrap-class-name="preproduction-debug-history-modal"
    >
      <div v-if="debugHistoryStep" class="debug-history">
        <div class="debug-history-title">
          <strong>{{ debugHistoryStep.name || "未命名步骤" }}</strong>
          <span>{{ debugHistory.length }} 条</span>
        </div>
        <div class="debug-history-toolbar">
          <span>保存最近 30 次单步调试的请求、响应与执行结果。</span>
          <div>
            <a-button
              size="small"
              :loading="debugHistoryLoading"
              @click="refreshStepDebugHistory(debugHistoryStep.id)"
            >
              刷新
            </a-button>
            <a-button
              danger
              size="small"
              :disabled="!debugHistory.length || debugHistoryLoading"
              @click="clearDebugHistory"
            >
              清空记录
            </a-button>
          </div>
        </div>
        <a-spin :spinning="debugHistoryLoading">
          <a-empty v-if="!debugHistory.length" description="暂无调试记录" />
          <div v-else class="debug-history-list">
            <div
              v-for="record in debugHistory"
              :key="record.id"
              class="debug-history-row"
            >
              <div class="debug-history-row-main">
                <a-tag
                  :color="debugRecordConnected(record) ? 'success' : 'error'"
                >
                  {{ debugRecordConnected(record) ? "成功" : "失败" }}
                </a-tag>
                <span class="debug-history-time">
                  {{
                    formatDateTime(record.record.executedAt || record.createdAt)
                  }}
                </span>
                <span class="debug-history-metric">
                  {{ record.record.durationMs }} ms
                </span>
                <span
                  v-if="record.record.statusCode"
                  class="debug-history-metric"
                >
                  {{ debugRecordProtocol(record) }}
                  <template v-if="debugRecordProtocol(record) === 'HTTP'">
                    {{ record.record.statusCode }}
                  </template>
                </span>
                <a-button
                  type="link"
                  size="small"
                  class="debug-history-view"
                  @click="openDebugRecordDetail(record)"
                >
                  查看
                </a-button>
              </div>
              <div v-if="record.record.error" class="debug-history-row-error">
                {{ record.record.error }}
              </div>
            </div>
          </div>
        </a-spin>
      </div>
    </a-modal>

    <a-modal
      v-model:open="debugRecordDetailOpen"
      title="调试记录详情"
      :width="860"
      :footer="null"
      :z-index="NESTED_OVERLAY_Z_INDEX + 20"
    >
      <div v-if="debugRecordDetail" class="debug-record-detail">
        <div class="debug-record-summary">
          <a-tag
            :color="
              debugRecordConnected(debugRecordDetail) ? 'success' : 'error'
            "
          >
            {{ debugRecordConnected(debugRecordDetail) ? "成功" : "失败" }}
          </a-tag>
          <span>{{ debugRecordDetail.record.durationMs }} ms</span>
          <span>{{ debugRecordDetail.record.bodySize }} bytes</span>
          <span>
            {{
              formatDateTime(
                debugRecordDetail.record.executedAt ||
                  debugRecordDetail.createdAt,
              )
            }}
          </span>
        </div>
        <div
          v-if="debugRecordDetail.record.target?.address"
          class="debug-record-target"
        >
          <span>环境</span>
          <strong>{{ debugRecordDetail.record.target.name || "—" }}</strong>
          <span>地址</span>
          <strong>{{ debugRecordDetail.record.target.address }}</strong>
        </div>
        <a-alert
          v-if="debugRecordDetail.record.error"
          type="error"
          :message="debugRecordDetail.record.error"
          show-icon
        />
        <div class="debug-record-block">
          <strong>请求</strong>
          <pre>{{ prettyJson(debugRecordDetail.record.request) }}</pre>
        </div>
        <div class="debug-record-block">
          <strong>响应</strong>
          <pre>{{ prettyJson(debugRecordDetail.record.response) }}</pre>
        </div>
      </div>
    </a-modal>

    <template #footer>
      <div class="case-detail-footer">
        <div class="case-detail-footer-actions">
          <a-button
            type="primary"
            :loading="running"
            :disabled="deleting || !caseRow?.enabled"
            @click="emit('run-push')"
          >
            运行推送
          </a-button>
          <a-button danger :loading="deleting" @click="emit('delete')">
            删除
          </a-button>
        </div>
        <a-button
          :disabled="deleting || running"
          @click="emit('update:open', false)"
        >
          关闭
        </a-button>
      </div>
    </template>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { message, Modal } from "ant-design-vue";
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
} from "@ant-design/icons-vue";
import { isHttpStep } from "@case-forge/shared";
import type { ApiCaseStep, ApiHttpCaseStep } from "@case-forge/shared";
import {
  clearStepDebugRecords,
  deleteManagedCaseStep,
  listStepDebugRecords,
  updateManagedCaseInfo,
  type ManagedCaseRow,
} from "@/api/apiTestClient";
import { NESTED_OVERLAY_Z_INDEX } from "@/constants/overlay-z-index";
import { versionLabel } from "@/utils/caseManagement";
import PreproductionStepDetailDrawer from "./PreproductionStepDetailDrawer.vue";

const props = defineProps<{
  open: boolean;
  caseRow: ManagedCaseRow | null;
  deleting?: boolean;
  loading?: boolean;
  running?: boolean;
}>();

const emit = defineEmits<{
  (event: "update:open", value: boolean): void;
  (event: "delete"): void;
  (event: "run-push"): void;
  (event: "updated", row: ManagedCaseRow): void;
}>();

const editingField = ref<"title" | "description" | "remark" | null>(null);
const fieldDraft = ref("");
const fieldSaving = ref(false);
const detailTab = ref<"basic" | "steps">("basic");
const stepDrawerOpen = ref(false);
const selectedStep = ref<ApiCaseStep | null>(null);
const deletingStepId = ref("");
type StepDebugRecordRow = Awaited<
  ReturnType<typeof listStepDebugRecords>
>[number];
const debugHistoryOpen = ref(false);
const debugHistoryLoading = ref(false);
const debugHistoryStep = ref<ApiCaseStep | null>(null);
const debugHistory = ref<StepDebugRecordRow[]>([]);
const stepDebugCounts = ref<Record<string, number>>({});
const debugRecordDetailOpen = ref(false);
const debugRecordDetail = ref<StepDebugRecordRow | null>(null);

function resetDebugHistory() {
  debugHistoryOpen.value = false;
  debugHistoryLoading.value = false;
  debugHistoryStep.value = null;
  debugHistory.value = [];
  stepDebugCounts.value = {};
  debugRecordDetailOpen.value = false;
  debugRecordDetail.value = null;
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    detailTab.value = "basic";
    editingField.value = null;
    stepDrawerOpen.value = false;
    selectedStep.value = null;
    resetDebugHistory();
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
    resetDebugHistory();
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

function canDeleteStep(step: ApiCaseStep) {
  const explicitSteps = props.caseRow?.steps ?? [];
  return (
    explicitSteps.length > 1 &&
    explicitSteps.some((item) => item.id === step.id)
  );
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
  selectedStep.value = step;
  stepDrawerOpen.value = true;
}

function confirmDeleteStep(step: ApiCaseStep) {
  const row = props.caseRow;
  if (!row || deletingStepId.value || !canDeleteStep(step)) return;
  Modal.confirm({
    title: "删除步骤",
    content: `确定删除步骤「${step.name || "未命名步骤"}」吗？删除后将从准生产案例快照中移除该步骤。`,
    okText: "删除",
    cancelText: "取消",
    okType: "danger",
    centered: true,
    zIndex: NESTED_OVERLAY_Z_INDEX + 20,
    onOk: async () => {
      deletingStepId.value = step.id;
      try {
        const updated = await deleteManagedCaseStep(row.id, step.id);
        if (selectedStep.value?.id === step.id) {
          stepDrawerOpen.value = false;
          selectedStep.value = null;
        }
        if (debugHistoryStep.value?.id === step.id) resetDebugHistory();
        emit("updated", updated);
        message.success("步骤已删除");
      } catch (error) {
        message.error(
          error instanceof Error ? error.message : "删除步骤失败，请重试",
        );
        throw error;
      } finally {
        deletingStepId.value = "";
      }
    },
  });
}

function onStepUpdated(row: ManagedCaseRow) {
  detailTab.value = "steps";
  const updatedStep = row.steps?.find(
    (step) => step.id === selectedStep.value?.id,
  );
  if (updatedStep && isHttpStep(updatedStep)) {
    selectedStep.value = updatedStep;
    if (debugHistoryStep.value?.id === updatedStep.id) {
      debugHistoryStep.value = updatedStep;
    }
  }
  emit("updated", row);
}

function debugRecordConnected(record: StepDebugRecordRow) {
  return !record.record.error && record.record.statusCode > 0;
}

function debugRecordProtocol(record: StepDebugRecordRow) {
  const request = record.record.request as { kind?: string } | null;
  return request?.kind === "db" ? "SQL" : "HTTP";
}

async function fetchStepDebugHistory(stepId: string, showError = true) {
  if (!props.caseRow) return [];
  const caseId = props.caseRow.sourceCaseId ?? props.caseRow.id;
  try {
    const records = await listStepDebugRecords(
      props.caseRow.projectId,
      caseId,
      stepId,
      "preproduction",
    );
    stepDebugCounts.value = {
      ...stepDebugCounts.value,
      [stepId]: records.length,
    };
    return records;
  } catch (error) {
    if (showError) {
      message.error(
        error instanceof Error ? error.message : "加载调试记录失败，请重试",
      );
    }
    return null;
  }
}

async function openStepDebugHistory(step: ApiCaseStep) {
  debugHistoryStep.value = step;
  debugHistory.value = [];
  debugHistoryOpen.value = true;
  await refreshStepDebugHistory(step.id);
}

async function refreshStepDebugHistory(stepId: string) {
  debugHistoryLoading.value = true;
  try {
    const records = await fetchStepDebugHistory(stepId);
    if (records && debugHistoryStep.value?.id === stepId) {
      debugHistory.value = records;
    }
  } finally {
    debugHistoryLoading.value = false;
  }
}

async function onStepDebugged(stepId: string) {
  const records = await fetchStepDebugHistory(stepId, false);
  if (records && debugHistoryStep.value?.id === stepId) {
    debugHistory.value = records;
  }
}

async function clearDebugHistory() {
  const row = props.caseRow;
  const step = debugHistoryStep.value;
  if (!row || !step || debugHistoryLoading.value) return;
  const caseId = row.sourceCaseId ?? row.id;
  debugHistoryLoading.value = true;
  try {
    await clearStepDebugRecords(
      row.projectId,
      caseId,
      step.id,
      "preproduction",
    );
    debugHistory.value = [];
    stepDebugCounts.value = {
      ...stepDebugCounts.value,
      [step.id]: 0,
    };
    message.success("调试记录已清空");
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : "清空调试记录失败，请重试",
    );
  } finally {
    debugHistoryLoading.value = false;
  }
}

function openDebugRecordDetail(record: StepDebugRecordRow) {
  debugRecordDetail.value = record;
  debugRecordDetailOpen.value = true;
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
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
.case-step-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}
.case-step-actions :deep(.ant-btn) {
  height: 24px;
  padding-inline: 6px;
  font-size: 12px;
}
.case-step-debug-record {
  color: #b42318;
}
.case-step-debug-count {
  min-width: 18px;
  margin-left: 3px;
  padding: 0 5px;
  border-radius: 9px;
  background: #fff1f3;
  color: var(--cf-brand);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
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
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}
.case-detail-footer-actions {
  display: flex;
  gap: 8px;
}

.debug-history {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.debug-history-title,
.debug-history-toolbar,
.debug-history-row-main,
.debug-record-summary,
.debug-record-target {
  display: flex;
  align-items: center;
}
.debug-history-title {
  gap: 8px;
}
.debug-history-title strong {
  color: #1d2939;
}
.debug-history-title span,
.debug-history-toolbar {
  color: #667085;
  font-size: 12px;
}
.debug-history-toolbar {
  justify-content: space-between;
  gap: 16px;
}
.debug-history-toolbar > div {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}
.debug-history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 56vh;
  overflow-y: auto;
}
.debug-history-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #fff;
}
.debug-history-row-main {
  gap: 12px;
  flex-wrap: wrap;
}
.debug-history-time {
  color: #344054;
  font-size: 13px;
  font-weight: 600;
}
.debug-history-metric {
  color: #667085;
  font:
    12px ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
}
.debug-history-view {
  margin-left: auto;
}
.debug-history-row-error {
  padding: 4px 8px;
  border: 1px solid #fecdca;
  border-radius: 4px;
  background: #fef3f2;
  color: #b42318;
  font-size: 12px;
}
.debug-record-detail {
  display: grid;
  gap: 12px;
}
.debug-record-summary {
  gap: 12px;
  color: #667085;
  font:
    12px ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
}
.debug-record-target {
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid #e4e7ec;
  border-radius: 6px;
  background: #fafbfc;
  color: #667085;
  font-size: 12px;
  flex-wrap: wrap;
}
.debug-record-target strong {
  margin-right: 10px;
  color: #344054;
}
.debug-record-block {
  display: grid;
  gap: 6px;
}
.debug-record-block > strong {
  color: #344054;
  font-size: 13px;
}
.debug-record-block pre {
  max-height: 320px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  border: 1px solid #e4e7ec;
  border-radius: 6px;
  background: #fafbfc;
  font:
    12px/1.6 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 900px) {
  .case-detail-info {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .debug-history-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
