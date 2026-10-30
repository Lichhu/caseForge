<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { message } from "ant-design-vue";
import { ApartmentOutlined, ReloadOutlined } from "@ant-design/icons-vue";
import type {
  RequirementCaseExecution,
  RequirementExecutionStatus,
  RequirementPlatformItem,
  RequirementProgressCase,
  RequirementProgressDetail,
  RequirementProgressStep,
  RequirementProgressTransaction,
  RequirementPushStatus,
} from "@case-forge/shared";
import { REQUIREMENT_STATUS_LABELS } from "@case-forge/shared";
import { fetchRequirementProgress } from "@/api/requirementPlatform";

const props = defineProps<{
  open: boolean;
  requirement: RequirementPlatformItem | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const loading = ref(false);
const detail = ref<RequirementProgressDetail | null>(null);
const loadError = ref("");
const activeTransactions = ref<string[]>([]);

const completionPercent = computed(() => {
  const summary = detail.value?.summary;
  if (!summary?.caseCount) return 0;
  return Math.round((summary.executedCaseCount / summary.caseCount) * 100);
});

const passPercent = computed(() => {
  const summary = detail.value?.summary;
  if (!summary?.executedCaseCount) return 0;
  return Math.round((summary.passedCount / summary.executedCaseCount) * 100);
});

const statusColor: Record<RequirementExecutionStatus, string> = {
  running: "processing",
  passed: "success",
  failed: "error",
  error: "warning",
  skipped: "default",
};

const statusLabel: Record<RequirementExecutionStatus, string> = {
  running: "执行中",
  passed: "通过",
  failed: "失败",
  error: "异常",
  skipped: "跳过",
};

const pushStatusColor: Record<RequirementPushStatus, string> = {
  pending: "processing",
  success: "success",
  failed: "error",
};

const pushStatusLabel: Record<RequirementPushStatus, string> = {
  pending: "推送中",
  success: "已推送",
  failed: "推送失败",
};

const requirementStatusColor: Record<
  RequirementPlatformItem["status"],
  string
> = {
  pending_dispatch: "orange",
  pending_claim: "blue",
  testing: "green",
  completed: "cyan",
  returned: "red",
};

watch(
  () => [props.open, props.requirement?.id] as const,
  ([open, id]) => {
    if (!open || !id) return;
    void loadProgress(id);
  },
  { immediate: true },
);

async function loadProgress(id = props.requirement?.id) {
  if (!id) return;
  loading.value = true;
  loadError.value = "";
  try {
    detail.value = await fetchRequirementProgress(id);
    activeTransactions.value = detail.value.transactions.map(
      (transaction) => transaction.id,
    );
  } catch (error) {
    detail.value = null;
    loadError.value =
      error instanceof Error ? error.message : "加载需求完成情况失败";
    message.error(loadError.value);
  } finally {
    loading.value = false;
  }
}

function setOpen(open: boolean) {
  emit("update:open", open);
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDuration(value?: number | null) {
  if (value == null) return "-";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

function executionColor(execution?: RequirementCaseExecution | null) {
  return execution ? statusColor[execution.status] : "default";
}

function executionLabel(execution?: RequirementCaseExecution | null) {
  return execution ? statusLabel[execution.status] : "未执行";
}

function executionPushColor(execution?: RequirementCaseExecution | null) {
  return execution?.pushStatus
    ? pushStatusColor[execution.pushStatus]
    : "default";
}

function executionPushLabel(execution?: RequirementCaseExecution | null) {
  return execution?.pushStatus ? pushStatusLabel[execution.pushStatus] : "-";
}

function stepStatus(step: RequirementProgressStep) {
  return step.executionStatus ? statusLabel[step.executionStatus] : "未执行";
}

function stepStatusColor(step: RequirementProgressStep) {
  return step.executionStatus ? statusColor[step.executionStatus] : "default";
}

function executionSource(execution?: RequirementCaseExecution | null) {
  if (!execution) return "";
  return execution.source === "preproduction" ? "测管执行推送" : "接口工作台";
}

function transactionProgress(transaction: RequirementProgressTransaction) {
  if (!transaction.caseCount) return 0;
  return Math.round(
    (transaction.executedCaseCount / transaction.caseCount) * 100,
  );
}

function transactionProgressStatus(
  transaction: RequirementProgressTransaction,
) {
  if (transaction.executedCaseCount === 0) return "normal";
  if (transaction.executedCaseCount < transaction.caseCount) return "active";
  if (transaction.failedCount || transaction.errorCount) return "exception";
  return "success";
}

function caseStepSummary(testCase: RequirementProgressCase) {
  if (!testCase.stepCount) return "暂无步骤";
  return `${testCase.stepCount} 个步骤`;
}

function rowExpandable(record: RequirementProgressCase) {
  return record.steps.length > 0;
}

function transactionRows(transaction: RequirementProgressTransaction) {
  return transaction.cases;
}
</script>

<template>
  <a-drawer
    :open="open"
    width="min(1440px, 96vw)"
    placement="right"
    root-class-name="requirement-progress-drawer"
    :body-style="{ padding: '0' }"
    @close="setOpen(false)"
  >
    <template #title>
      <div class="progress-title">
        <span class="progress-title-icon"><ApartmentOutlined /></span>
        <div>
          <strong>需求完成情况</strong>
          <span v-if="requirement">
            {{ requirement.projectCode }} · {{ requirement.projectName }}
          </span>
        </div>
      </div>
    </template>

    <div class="progress-drawer-body">
      <div class="progress-toolbar">
        <span>数据来源：执行平台关联案例（交易、案例、步骤、执行记录）</span>
        <a-button size="small" :loading="loading" @click="loadProgress()">
          <template #icon><ReloadOutlined /></template>
          刷新
        </a-button>
      </div>

      <a-spin :spinning="loading" :delay="120">
        <div v-if="loadError && !loading" class="progress-error">
          <a-empty description="需求完成情况加载失败">
            <a-button type="primary" @click="loadProgress()">重试</a-button>
          </a-empty>
        </div>

        <template v-else-if="detail">
          <section class="progress-requirement">
            <div class="progress-requirement-main">
              <div class="progress-requirement-heading">
                <div>
                  <span class="progress-eyebrow">需求详情</span>
                  <h3>{{ detail.requirement.projectName }}</h3>
                  <p>
                    {{ detail.requirement.projectCode }}
                    <span class="progress-dot">·</span>
                    {{ detail.requirement.applicationName || "未设置应用" }}
                    <span class="progress-dot">·</span>
                    {{ detail.requirement.versionName || "未设置版本" }}
                  </p>
                </div>
                <a-tag
                  :color="requirementStatusColor[detail.requirement.status]"
                  class="progress-requirement-status"
                >
                  {{ REQUIREMENT_STATUS_LABELS[detail.requirement.status] }}
                </a-tag>
              </div>
              <div class="progress-requirement-meta">
                <span>
                  认领人：
                  <b>{{
                    detail.requirement.claimedByName ||
                    detail.requirement.claimedBy ||
                    "-"
                  }}</b>
                </span>
                <span>
                  认领时间：<b>{{
                    formatTime(detail.requirement.claimedAt)
                  }}</b>
                </span>
                <span>
                  更新于：<b>{{ formatTime(detail.refreshedAt) }}</b>
                </span>
              </div>
            </div>
            <div class="progress-requirement-ring">
              <a-progress
                type="circle"
                :percent="completionPercent"
                :width="104"
                :stroke-color="
                  completionPercent === 100 ? '#13a36b' : '#b60f2d'
                "
              />
              <span>案例执行覆盖</span>
            </div>
          </section>

          <section class="progress-summary">
            <div class="progress-summary-card">
              <span class="progress-summary-label">交易</span>
              <strong>{{ detail.summary.transactionCount }}</strong>
              <small>接口交易码</small>
            </div>
            <div class="progress-summary-card">
              <span class="progress-summary-label">案例</span>
              <strong>{{ detail.summary.caseCount }}</strong>
              <small>{{ detail.summary.stepCount }} 个步骤</small>
            </div>
            <div class="progress-summary-card progress-summary-card--success">
              <span class="progress-summary-label">通过</span>
              <strong>{{ detail.summary.passedCount }}</strong>
              <small>通过率 {{ passPercent }}%</small>
            </div>
            <div class="progress-summary-card progress-summary-card--danger">
              <span class="progress-summary-label">失败 / 异常</span>
              <strong>
                {{ detail.summary.failedCount + detail.summary.errorCount }}
              </strong>
              <small>
                {{ detail.summary.failedCount }} 失败 ·
                {{ detail.summary.errorCount }} 异常
              </small>
            </div>
            <div class="progress-summary-card">
              <span class="progress-summary-label">测管推送</span>
              <strong>{{ detail.summary.pushSuccessCount }}</strong>
              <small>{{ detail.summary.pushFailedCount }} 条失败</small>
            </div>
          </section>

          <div class="progress-section-head">
            <div>
              <span class="progress-eyebrow">完成情况</span>
              <h4>交易与案例</h4>
            </div>
            <span
              >已执行 {{ detail.summary.executedCaseCount }} /
              {{ detail.summary.caseCount }} 个案例</span
            >
          </div>

          <a-empty
            v-if="!detail.transactions.length"
            class="progress-empty"
            :description="
              detail.projectId
                ? '该需求暂无交易数据'
                : '该需求尚未创建接口测试项目'
            "
          />

          <a-collapse
            v-else
            v-model:active-key="activeTransactions"
            ghost
            class="progress-transactions"
          >
            <a-collapse-panel
              v-for="transaction in detail.transactions"
              :key="transaction.id"
              class="progress-transaction-panel"
            >
              <template #header>
                <div class="progress-transaction-head">
                  <div class="progress-transaction-title">
                    <span class="progress-transaction-icon">
                      <ApartmentOutlined />
                    </span>
                    <div>
                      <strong>{{ transaction.code }}</strong>
                      <span>{{ transaction.name }}</span>
                    </div>
                  </div>
                  <div class="progress-transaction-stats">
                    <a-tag>{{ transaction.caseCount }} 个案例</a-tag>
                    <a-tag
                      :color="
                        transaction.executedCaseCount ===
                          transaction.caseCount && transaction.caseCount > 0
                          ? 'green'
                          : 'default'
                      "
                    >
                      {{ transaction.executedCaseCount }} 已执行
                    </a-tag>
                    <a-tag v-if="transaction.failedCount" color="red">
                      {{ transaction.failedCount }} 失败
                    </a-tag>
                    <a-tag v-if="transaction.errorCount" color="orange">
                      {{ transaction.errorCount }} 异常
                    </a-tag>
                    <a-progress
                      :percent="transactionProgress(transaction)"
                      :status="transactionProgressStatus(transaction)"
                      :show-info="false"
                      :stroke-width="5"
                      class="progress-transaction-bar"
                    />
                  </div>
                </div>
              </template>

              <a-empty
                v-if="
                  !transactionRows(
                    transaction as RequirementProgressTransaction,
                  ).length
                "
                description="执行平台尚未关联案例"
                class="progress-empty"
              />
              <a-table
                v-else
                :data-source="
                  transactionRows(transaction as RequirementProgressTransaction)
                "
                row-key="id"
                size="small"
                :pagination="false"
                :row-expandable="rowExpandable"
                :expand-row-by-click="true"
                class="progress-case-table"
              >
                <a-table-column title="案例" key="case" :width="330">
                  <template #default="{ record }">
                    <div class="progress-case-title">
                      <div class="progress-case-title-line">
                        <span>{{ record.title }}</span>
                        <a-tag
                          v-if="!record.enabled"
                          size="small"
                          color="default"
                        >
                          已停用
                        </a-tag>
                      </div>
                      <small>
                        {{ record.caseNo || "无案例编号" }} ·
                        {{ record.priority }} ·
                        {{ record.polarity === "positive" ? "正向" : "反向" }}
                      </small>
                    </div>
                  </template>
                </a-table-column>
                <a-table-column title="步骤" key="steps" :width="100">
                  <template #default="{ record }">
                    <span class="progress-muted">
                      {{ caseStepSummary(record) }}
                    </span>
                  </template>
                </a-table-column>
                <a-table-column title="最近执行" key="execution" :width="130">
                  <template #default="{ record }">
                    <a-tag :color="executionColor(record.latestExecution)">
                      {{ executionLabel(record.latestExecution) }}
                    </a-tag>
                  </template>
                </a-table-column>
                <a-table-column title="执行来源" key="source" :width="150">
                  <template #default="{ record }">
                    <div
                      v-if="record.latestExecution"
                      class="progress-execution-source"
                    >
                      <span>{{ executionSource(record.latestExecution) }}</span>
                      <small>{{
                        formatTime(record.latestExecution.createdAt)
                      }}</small>
                    </div>
                    <span v-else class="progress-muted">-</span>
                  </template>
                </a-table-column>
                <a-table-column title="测管推送" key="push" :width="120">
                  <template #default="{ record }">
                    <a-tag
                      v-if="record.latestExecution?.pushStatus"
                      :color="executionPushColor(record.latestExecution)"
                    >
                      {{ executionPushLabel(record.latestExecution) }}
                    </a-tag>
                    <span v-else class="progress-muted">-</span>
                  </template>
                </a-table-column>
                <template #expandedRowRender="{ record }">
                  <div class="progress-case-detail">
                    <div
                      v-if="record.latestExecution"
                      class="progress-execution-card"
                    >
                      <div class="progress-execution-card-head">
                        <div>
                          <span class="progress-eyebrow">执行平台</span>
                          <strong>{{
                            executionSource(record.latestExecution)
                          }}</strong>
                        </div>
                        <a-tag :color="executionColor(record.latestExecution)">
                          {{ executionLabel(record.latestExecution) }}
                        </a-tag>
                      </div>
                      <div class="progress-execution-meta">
                        <span>
                          执行时间：<b>{{
                            formatTime(record.latestExecution.createdAt)
                          }}</b>
                        </span>
                        <span>
                          完成时间：<b>{{
                            formatTime(record.latestExecution.finishedAt)
                          }}</b>
                        </span>
                        <span>
                          耗时：<b>{{
                            formatDuration(record.latestExecution.durationMs)
                          }}</b>
                        </span>
                        <span v-if="record.latestExecution.pushStatus">
                          推送：<b>{{
                            executionPushLabel(record.latestExecution)
                          }}</b>
                        </span>
                      </div>
                      <p
                        v-if="record.latestExecution.error"
                        class="progress-execution-error"
                      >
                        {{ record.latestExecution.error }}
                      </p>
                      <a
                        v-if="record.latestExecution.reportUrl"
                        class="progress-report-link"
                        :href="record.latestExecution.reportUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        查看执行报告
                      </a>
                    </div>
                    <div class="progress-step-list">
                      <div
                        v-for="(step, index) in record.steps"
                        :key="step.id"
                        class="progress-step"
                      >
                        <div class="progress-step-index">
                          {{ String(index + 1).padStart(2, "0") }}
                        </div>
                        <div class="progress-step-main">
                          <div class="progress-step-title">
                            <strong>{{ step.name }}</strong>
                            <a-tag
                              size="small"
                              :color="step.kind === 'db' ? 'purple' : 'blue'"
                            >
                              {{ step.kind === "db" ? "SQL" : "HTTP" }}
                            </a-tag>
                            <a-tag size="small" :color="stepStatusColor(step)">
                              {{ stepStatus(step) }}
                            </a-tag>
                            <small>{{ formatDuration(step.durationMs) }}</small>
                          </div>
                          <code class="progress-step-summary">{{
                            step.summary
                          }}</code>
                          <p v-if="step.error" class="progress-step-error">
                            {{ step.error }}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </a-table>
            </a-collapse-panel>
          </a-collapse>
        </template>
      </a-spin>
    </div>
  </a-drawer>
</template>

<style scoped>
.progress-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.progress-title-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid rgba(182, 15, 45, 0.15);
  border-radius: 12px;
  background: #fff5f6;
  color: #b60f2d;
  font-size: 18px;
}

.progress-title > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.progress-title strong {
  color: #1d2939;
  font-size: 18px;
}

.progress-title span:not(.progress-title-icon) {
  overflow: hidden;
  color: #667085;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-drawer-body {
  min-height: 100%;
  padding: 0 24px 32px;
  background:
    radial-gradient(
      circle at 95% 0%,
      rgba(182, 15, 45, 0.055),
      transparent 28%
    ),
    #f7f8fa;
}

.progress-toolbar {
  position: sticky;
  z-index: 5;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 -24px 18px;
  padding: 12px 24px;
  border-bottom: 1px solid #edf0f3;
  background: rgba(255, 255, 255, 0.94);
  color: #667085;
  font-size: 12px;
  backdrop-filter: blur(10px);
}

.progress-error,
.progress-empty {
  padding: 72px 0;
}

.progress-requirement {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 24px;
  overflow: hidden;
  border: 1px solid #eaecf0;
  border-radius: 18px;
  background:
    linear-gradient(
      120deg,
      rgba(255, 255, 255, 0.96),
      rgba(255, 250, 250, 0.95)
    ),
    #fff;
  box-shadow: 0 10px 28px rgba(40, 48, 64, 0.055);
}

.progress-requirement-main {
  min-width: 0;
  flex: 1;
}

.progress-requirement-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.progress-eyebrow {
  color: #b60f2d;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.progress-requirement-heading h3,
.progress-section-head h4 {
  margin: 5px 0 0;
  color: #1d2939;
}

.progress-requirement-heading h3 {
  font-size: 23px;
}

.progress-requirement-heading p {
  margin: 8px 0 0;
  color: #667085;
  font-size: 13px;
}

.progress-dot {
  margin: 0 7px;
  color: #c3c8d1;
}

.progress-requirement-status {
  margin: 0;
  border-radius: 999px;
}

.progress-requirement-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 24px;
  margin-top: 24px;
  color: #667085;
  font-size: 12px;
}

.progress-requirement-meta b {
  color: #344054;
  font-weight: 550;
}

.progress-requirement-ring {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 8px;
  padding: 0 10px 0 24px;
  border-left: 1px solid #edf0f3;
  color: #667085;
  font-size: 11px;
}

.progress-summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.progress-summary-card {
  display: flex;
  min-height: 115px;
  flex-direction: column;
  justify-content: space-between;
  padding: 17px 18px;
  border: 1px solid #eaecf0;
  border-radius: 14px;
  background: #fff;
}

.progress-summary-label {
  color: #667085;
  font-size: 12px;
}

.progress-summary-card strong {
  color: #1d2939;
  font-size: 27px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.progress-summary-card small {
  color: #98a2b3;
  font-size: 11px;
}

.progress-summary-card--success strong {
  color: #079455;
}

.progress-summary-card--danger strong {
  color: #d92d20;
}

.progress-section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin: 26px 2px 10px;
}

.progress-section-head h4 {
  font-size: 17px;
}

.progress-section-head > span {
  color: #667085;
  font-size: 12px;
}

.progress-transactions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.progress-transaction-panel {
  overflow: hidden;
  border: 1px solid #eaecf0 !important;
  border-radius: 14px;
  background: #fff;
}

.progress-transaction-panel :deep(.ant-collapse-header) {
  align-items: center !important;
  padding: 17px 18px !important;
}

.progress-transaction-panel :deep(.ant-collapse-content-box) {
  padding: 0 16px 16px !important;
}

.progress-transaction-head {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.progress-transaction-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.progress-transaction-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  background: #f5f7fa;
  color: #475467;
}

.progress-transaction-title > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.progress-transaction-title strong {
  color: #1d2939;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 14px;
}

.progress-transaction-title span {
  overflow: hidden;
  color: #667085;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-transaction-stats {
  display: flex;
  width: min(470px, 52%);
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.progress-transaction-stats .ant-tag {
  margin-inline-end: 0;
}

.progress-transaction-bar {
  width: 80px;
  margin-left: 8px;
}

.progress-case-table :deep(.ant-table) {
  border: 1px solid #eaecf0;
  border-radius: 10px;
}

.progress-case-table :deep(.ant-table-thead > tr > th) {
  background: #f9fafb;
  color: #667085;
  font-size: 11px;
}

.progress-case-title {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.progress-case-title-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.progress-case-title-line > span {
  overflow: hidden;
  color: #344054;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-case-title small,
.progress-execution-source small {
  color: #98a2b3;
  font-size: 11px;
}

.progress-muted {
  color: #98a2b3;
  font-size: 12px;
}

.progress-execution-source {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: #475467;
  font-size: 12px;
}

.progress-case-detail {
  display: grid;
  grid-template-columns: minmax(250px, 0.82fr) minmax(380px, 1.5fr);
  gap: 14px;
  padding: 6px;
}

.progress-execution-card {
  height: fit-content;
  padding: 17px;
  border: 1px solid #eaecf0;
  border-radius: 12px;
  background: #fafbfc;
}

.progress-execution-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.progress-execution-card-head > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.progress-execution-card-head strong {
  color: #1d2939;
  font-size: 14px;
}

.progress-execution-meta {
  display: grid;
  gap: 8px;
  margin-top: 18px;
  color: #667085;
  font-size: 11px;
}

.progress-execution-meta b {
  color: #344054;
  font-weight: 550;
}

.progress-execution-error,
.progress-step-error {
  margin: 12px 0 0;
  padding: 9px 10px;
  border-radius: 8px;
  background: #fffbfa;
  color: #b42318;
  font-size: 11px;
  line-height: 1.55;
  word-break: break-word;
}

.progress-report-link {
  display: inline-flex;
  margin-top: 12px;
  color: #b60f2d;
  font-size: 11px;
  font-weight: 550;
}

.progress-step-list {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 7px;
}

.progress-step {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #edf0f3;
  border-radius: 10px;
  background: #fff;
}

.progress-step-index {
  padding-top: 1px;
  color: #b0b7c3;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
}

.progress-step-main {
  min-width: 0;
  flex: 1;
}

.progress-step-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.progress-step-title strong {
  overflow: hidden;
  min-width: 90px;
  color: #344054;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-step-title .ant-tag {
  margin-inline-end: 0;
}

.progress-step-title small {
  margin-left: auto;
  color: #98a2b3;
  font-size: 10px;
  white-space: nowrap;
}

.progress-step-summary {
  display: block;
  overflow: hidden;
  margin-top: 7px;
  color: #667085;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .progress-summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .progress-case-detail {
    grid-template-columns: 1fr;
  }

  .progress-transaction-stats {
    display: none;
  }
}

@media (max-width: 640px) {
  .progress-drawer-body {
    padding-inline: 14px;
  }

  .progress-toolbar {
    margin-inline: -14px;
    padding-inline: 14px;
  }

  .progress-toolbar > span {
    display: none;
  }

  .progress-requirement {
    align-items: flex-start;
    padding: 18px;
  }

  .progress-requirement-ring {
    display: none;
  }

  .progress-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
