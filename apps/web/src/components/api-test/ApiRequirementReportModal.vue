<template>
  <a-modal
    :open="open"
    title="导出需求测试报告"
    width="1180px"
    :confirm-loading="exporting"
    :closable="!exporting"
    :cancel-button-props="{ disabled: exporting }"
    :ok-button-props="{
      disabled: !selectedRowKeys.length || loading || Boolean(loadError),
    }"
    :ok-text="exporting ? '正在生成…' : `导出 HTML (${selectedRowKeys.length})`"
    cancel-text="取消"
    @ok="submitExport"
    @cancel="emit('update:open', false)"
  >
    <div class="requirement-report-modal">
      <div class="report-selection-summary">
        <span>
          已选交易 <strong>{{ transactions.length }}</strong> 条
        </span>
        <span>
          已勾选历史 <strong>{{ selectedRowKeys.length }}</strong> 条
        </span>
        <span>导出格式 <strong>HTML</strong></span>
      </div>

      <div class="report-transaction-list">
        <a-tag
          v-for="transaction in transactions"
          :key="transaction.id"
          :color="historyCount(transaction.id) ? 'blue' : 'default'"
        >
          {{ transaction.code }} ·
          {{ historyCount(transaction.id) ? `${historyCount(transaction.id)} 次执行` : "暂无历史" }}
        </a-tag>
      </div>

      <a-alert
        v-if="loadError"
        type="error"
        show-icon
        :message="loadError"
      />

      <div class="report-history-toolbar">
        <span class="report-history-hint">
          报告按「交易码 + 执行历史 ID」区分，选中历史下方展示对应执行案例。
        </span>
        <a-space :size="4">
          <a-button size="small" :disabled="!selectableRows.length" @click="selectAll">
            全选
          </a-button>
          <a-button size="small" :disabled="!selectedRowKeys.length" @click="clearSelection">
            清空
          </a-button>
        </a-space>
      </div>

      <a-spin :spinning="loading">
        <a-table
          size="small"
          row-key="id"
          :data-source="historyRows"
          :columns="columns"
          :row-selection="rowSelection"
          :pagination="false"
          :scroll="{ y: 390, x: 1100 }"
          :locale="{ emptyText: '所选交易暂无执行历史' }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'transactionCode'">
              <span class="report-transaction-code">{{ record.transactionCode }}</span>
            </template>
            <template v-else-if="column.key === 'runId'">
              <span class="report-run-id" :title="record.id">{{ record.id }}</span>
            </template>
            <template v-else-if="column.key === 'versionCode'">
              {{ record.versionCode || "—" }}
            </template>
            <template v-else-if="column.key === 'result'">
              <span>总数 {{ record.totalCount }} · 通过 {{ record.passedCount }} · 失败 {{ record.failedCount + record.errorCount }}</span>
              <strong class="report-pass-rate">{{ runPassRate(record) }}%</strong>
            </template>
            <template v-else-if="column.key === 'status'">
              <a-tag :color="record.status === 'completed' ? 'green' : 'default'">
                {{ runStatusLabel(record.status) }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'createdAt'">
              {{ formatDateTime(record.createdAt) }}
            </template>
          </template>
        </a-table>
      </a-spin>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { message } from "ant-design-vue";
import type {
  ApiRunDetail,
  ApiTransactionRow,
  RequirementReportSelection,
} from "@/api/apiTestClient";
import { listApiTransactionRuns } from "@/api/apiTestClient";

type HistoryRow = Omit<ApiRunDetail, "transactionId"> & {
  transactionId: string;
  transactionCode: string;
  transactionName: string;
};

const props = defineProps<{
  open: boolean;
  projectId?: string;
  transactions: ApiTransactionRow[];
  exporting?: boolean;
}>();

const emit = defineEmits<{
  (event: "update:open", value: boolean): void;
  (
    event: "export",
    payload: { selections: RequirementReportSelection[] },
  ): void;
}>();

const loading = ref(false);
const loadError = ref("");
const histories = ref<Record<string, ApiRunDetail[]>>({});
const selectedRowKeys = ref<string[]>([]);

const columns = [
  { title: "交易码", key: "transactionCode", width: 150 },
  { title: "接口名称", dataIndex: "transactionName", key: "transactionName", width: 180, ellipsis: true },
  { title: "执行历史 ID", key: "runId", width: 300 },
  { title: "执行版本", key: "versionCode", width: 150 },
  { title: "执行时间", key: "createdAt", width: 170 },
  { title: "执行结果", key: "result", width: 210 },
  { title: "状态", key: "status", width: 90, align: "center" as const },
];

const historyRows = computed<HistoryRow[]>(() =>
  props.transactions.flatMap((transaction) =>
    (histories.value[transaction.id] ?? []).map((run) => ({
      ...run,
      transactionId: transaction.id,
      transactionCode: transaction.code,
      transactionName: transaction.name,
    })),
  ),
);

const selectableRows = computed(() =>
  historyRows.value.filter((row) => isSelectable(row)),
);

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  preserveSelectedRowKeys: true,
  getCheckboxProps: (record: HistoryRow) => ({
    disabled: !isSelectable(record),
  }),
  onSelect: (record: HistoryRow, selected: boolean) => {
    if (!isSelectable(record)) return;
    selectedRowKeys.value = selected
      ? [...new Set([...selectedRowKeys.value, record.id])]
      : selectedRowKeys.value.filter((id) => id !== record.id);
  },
  onSelectAll: (
    selected: boolean,
    _selectedRows: HistoryRow[],
    changeRows: HistoryRow[],
  ) => {
    const ids = changeRows
      .filter((row) => isSelectable(row))
      .map((row) => row.id);
    selectedRowKeys.value = selected
      ? [...new Set([...selectedRowKeys.value, ...ids])]
      : selectedRowKeys.value.filter((id) => !ids.includes(id));
  },
}));

watch(
  () => [
    props.open,
    props.projectId,
    props.transactions.map((item) => item.id).join(","),
  ] as const,
  ([open]) => {
    if (open) void loadHistories();
  },
  { immediate: true },
);

async function loadHistories() {
  selectedRowKeys.value = [];
  histories.value = {};
  loadError.value = "";
  if (!props.projectId) {
    loadError.value = "当前需求不存在，无法加载执行历史";
    return;
  }
  loading.value = true;
  try {
    const results = await Promise.allSettled(
      props.transactions.map(async (transaction) => ({
        transactionId: transaction.id,
        runs: await listApiTransactionRuns(props.projectId!, transaction.id),
      })),
    );
    const next: Record<string, ApiRunDetail[]> = {};
    let failedCount = 0;
    for (const result of results) {
      if (result.status === "fulfilled") {
        next[result.value.transactionId] = result.value.runs;
      } else {
        failedCount += 1;
      }
    }
    histories.value = next;
    if (failedCount) {
      message.warning(`${failedCount} 个交易码的执行历史加载失败`);
    }
  } catch (error) {
    loadError.value =
      error instanceof Error ? error.message : "执行历史加载失败，请稍后重试";
  } finally {
    loading.value = false;
  }
}

function selectAll() {
  selectedRowKeys.value = selectableRows.value.map((row) => row.id);
}

function clearSelection() {
  selectedRowKeys.value = [];
}

function submitExport() {
  const selectionKeys = new Set(selectedRowKeys.value);
  const selections = historyRows.value
    .filter((row) => selectionKeys.has(row.id))
    .map((row) => ({
      transactionId: row.transactionId,
      runId: row.id,
    }));
  if (!selections.length) {
    message.warning("请至少勾选一条已完成的历史记录");
    return;
  }
  emit("export", { selections });
}

function runPassRate(run: ApiRunDetail) {
  return run.totalCount > 0
    ? ((run.passedCount / run.totalCount) * 100).toFixed(1)
    : "0.0";
}

function historyCount(transactionId: string) {
  return histories.value[transactionId]?.length ?? 0;
}

function isSelectable(run: ApiRunDetail) {
  return run.status === "completed" && run.totalCount > 0;
}

function runStatusLabel(status: string) {
  if (status === "completed") return "已完成";
  if (status === "running") return "执行中";
  if (status === "failed") return "执行失败";
  return status || "—";
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
</script>

<style scoped>
.requirement-report-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.report-selection-summary,
.report-history-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 20px;
}

.report-selection-summary {
  color: #667085;
  font-size: 13px;
}

.report-selection-summary strong {
  color: #1d2939;
}

.report-transaction-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.report-history-toolbar {
  justify-content: space-between;
  padding: 10px 12px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #f9fafb;
}

.report-history-hint {
  color: #667085;
  font-size: 12px;
}

.report-transaction-code {
  color: var(--cf-brand-hover, #c01048);
  font-weight: 600;
}

.report-run-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: #475467;
}

.report-pass-rate {
  margin-left: 8px;
  color: var(--cf-brand, #b60f2d);
}
</style>
