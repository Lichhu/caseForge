<template>
  <a-drawer
    :open="open"
    :title="sqlStep ? 'SQL 步骤详情' : '编辑步骤'"
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
    <div v-if="sqlStep && caseRow" class="sql-step-detail">
      <div class="sql-step-head">
        <div>
          <strong>{{ sqlStep.name || "未命名 SQL 步骤" }}</strong>
          <span>准生产案例中的 SQL 执行步骤</span>
        </div>
        <a-tag color="purple">
          {{ sqlStep.db?.mode === "execute" ? "改数据" : "查询" }}
        </a-tag>
      </div>

      <div class="sql-step-meta">
        <div>
          <span>数据库连接</span>
          <strong :title="sqlConnectionLabel">
            {{ sqlConnectionLabel }}
          </strong>
        </div>
        <div>
          <span>执行模式</span>
          <strong>
            {{ sqlStep.db?.mode === "execute" ? "更新数据" : "查询数据" }}
          </strong>
        </div>
        <div>
          <span>影响行数上限</span>
          <strong>{{ sqlStep.db?.maxAffectedRows ?? "默认" }}</strong>
        </div>
        <div>
          <span>超时</span>
          <strong>
            {{ sqlStep.db?.timeoutMs ? `${sqlStep.db.timeoutMs} ms` : "默认" }}
          </strong>
        </div>
      </div>

      <section class="sql-step-section">
        <div class="sql-step-section-title">
          <strong>SQL 语句</strong>
          <span>只读展示</span>
        </div>
        <pre class="sql-step-code">{{ sqlStep.db?.sql || "未填写 SQL" }}</pre>
      </section>

      <section class="sql-step-section">
        <div class="sql-step-section-title">
          <strong>变量提取</strong>
          <span>{{ sqlStep.exports?.length ?? 0 }} 项</span>
        </div>
        <a-empty
          v-if="!sqlStep.exports?.length"
          description="该 SQL 步骤未配置变量提取"
        />
        <div v-else class="sql-export-list">
          <div
            v-for="item in sqlStep.exports"
            :key="item.name"
            class="sql-export-row"
          >
            <code>{{ item.name }}</code>
            <span>{{ sqlExportSourceLabel(item.source) }}</span>
            <span>{{ item.expression || "—" }}</span>
            <a-tag v-if="item.required" color="orange">必填</a-tag>
          </div>
        </div>
      </section>

      <div class="sql-step-footer">
        <a-button @click="closeDrawer">关闭</a-button>
        <a-button
          type="primary"
          :loading="sqlDebugRunning"
          @click="debugSqlStep"
        >
          调试 SQL
        </a-button>
      </div>
    </div>

    <ApiStepEditor
      v-else-if="httpStep && caseRow"
      :key="`${httpStep.id}-${open}`"
      :step="httpStep"
      :project-id="caseRow.projectId"
      :transaction-id="caseRow.transactionId"
      :case-id="caseRow.sourceCaseId ?? caseRow.id"
      case-source="preproduction"
      :shared-variables="sharedVariables"
      :saving="saving"
      footer-hint="保存后更新准生产案例步骤"
      @save="saveStep"
      @debugged="onDebugged"
    />
    <a-empty v-else description="请选择要编辑的步骤" />

    <a-modal
      v-model:open="sqlDebugResultOpen"
      title="SQL 调试结果"
      :width="900"
      :footer="null"
      :z-index="NESTED_OVERLAY_Z_INDEX + 20"
    >
      <a-alert
        v-if="sqlDebugError"
        type="error"
        :message="sqlDebugError"
        show-icon
      />
      <template v-else-if="sqlDebugResult">
        <div class="sql-debug-summary">
          <a-tag color="success">执行成功</a-tag>
          <span>{{ sqlDebugResult.connectionName }}</span>
          <span>{{ sqlDebugResult.durationMs }} ms</span>
          <span v-if="sqlDebugResult.rolledBack">
            影响 {{ sqlDebugResult.affectedRows ?? "未知" }} 行，已回滚
          </span>
          <span v-else>
            返回 {{ sqlDebugResult.rowCount }} 行
            <template v-if="sqlDebugResult.truncated"
              >（仅展示前 50 行）</template
            >
          </span>
        </div>
        <a-alert
          v-if="sqlDebugResult.connectionReadonly"
          type="warning"
          message="当前数据库连接标记为只读，真实执行改数据 SQL 会被拦截"
          show-icon
        />
        <template v-if="!sqlDebugResult.rolledBack">
          <div v-if="sqlDebugResult.columns.length" class="sql-debug-columns">
            <a-tag v-for="column in sqlDebugResult.columns" :key="column">
              {{ column }}
            </a-tag>
          </div>
          <a-table
            v-if="sqlDebugResult.rows.length"
            :data-source="sqlDebugResult.rows"
            :columns="sqlDebugColumns"
            :pagination="false"
            :row-key="sqlDebugRowKey"
            size="small"
            :scroll="{ x: 820, y: 360 }"
          >
            <template #bodyCell="{ column, record }">
              <span class="sql-debug-cell">
                {{ sqlDebugCell(record, String(column.key)) }}
              </span>
            </template>
          </a-table>
          <a-empty v-else description="SQL 执行成功，没有返回数据" />
        </template>
      </template>
    </a-modal>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { message } from "ant-design-vue";
import type {
  ApiCaseStep,
  ApiDbCaseStep,
  ApiHttpCaseStep,
} from "@case-forge/shared";
import { isDbStep, isHttpStep } from "@case-forge/shared";
import {
  debugManagedSqlStep,
  listDatabaseConnections,
  updateManagedCaseStep,
  type ManagedCaseRow,
} from "@/api/apiTestClient";
import { NESTED_OVERLAY_Z_INDEX } from "@/constants/overlay-z-index";
import ApiStepEditor from "./ApiStepEditor.vue";

const props = defineProps<{
  open: boolean;
  caseRow: ManagedCaseRow | null;
  step: ApiCaseStep | null;
}>();

const emit = defineEmits<{
  (event: "update:open", value: boolean): void;
  (event: "updated", row: ManagedCaseRow): void;
  (event: "debugged", stepId: string): void;
}>();

const saving = ref(false);
const sqlDebugRunning = ref(false);
const sqlDebugResultOpen = ref(false);
const sqlDebugResult = ref<Awaited<
  ReturnType<typeof debugManagedSqlStep>
> | null>(null);
const sqlDebugError = ref("");
const databaseConnections = ref<
  Awaited<ReturnType<typeof listDatabaseConnections>>
>([]);
const sqlStep = computed<ApiDbCaseStep | null>(() =>
  isDbStep(props.step) ? props.step : null,
);
const httpStep = computed<ApiHttpCaseStep | null>(() =>
  isHttpStep(props.step) ? props.step : null,
);
const sqlConnectionLabel = computed(() => {
  const connectionId = sqlStep.value?.db?.connectionId;
  if (!connectionId) return "未选择数据库连接";
  const connection = databaseConnections.value.find(
    (item) => item.id === connectionId,
  );
  return connection
    ? `${connection.name}（${connection.type}） · ${connection.host}:${connection.port}${connection.databaseName ? `/${connection.databaseName}` : ""}`
    : connectionId;
});
const sqlDebugColumns = computed(() =>
  (sqlDebugResult.value?.columns ?? []).map((column) => ({
    title: column,
    dataIndex: column,
    key: column,
    ellipsis: true,
  })),
);
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
  if (saving.value || sqlDebugRunning.value) return;
  emit("update:open", false);
}

function onDebugged() {
  if (props.step) emit("debugged", props.step.id);
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

function sqlExportSourceLabel(source: string) {
  return (
    (
      {
        row: "首行字段",
        rows: "全部结果",
        rowCount: "结果行数",
        affectedRows: "影响行数",
      } as Record<string, string>
    )[source] ?? source
  );
}

function sqlDebugRowKey(_record: Record<string, unknown>, index?: number) {
  return `sql-debug-row-${index ?? 0}`;
}

function sqlDebugCell(record: Record<string, unknown>, key: string) {
  const value = record?.[key];
  if (value == null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function debugSqlStep() {
  const row = props.caseRow;
  const step = sqlStep.value;
  if (!row || !step || sqlDebugRunning.value) return;
  if (!step.db?.connectionId) {
    message.warning("请先选择数据库连接");
    return;
  }
  sqlDebugRunning.value = true;
  sqlDebugResult.value = null;
  sqlDebugError.value = "";
  try {
    sqlDebugResult.value = await debugManagedSqlStep(row.projectId, {
      connectionId: step.db.connectionId,
      sql: step.db.sql,
      timeoutMs: step.db.timeoutMs,
      caseId: row.sourceCaseId ?? row.id,
      stepId: step.id,
      caseSource: "preproduction",
    });
    message.success("SQL 调试完成");
  } catch (error) {
    sqlDebugError.value =
      error instanceof Error ? error.message : "SQL 调试失败";
    message.error(sqlDebugError.value);
  } finally {
    sqlDebugResultOpen.value = true;
    emit("debugged", step.id);
    sqlDebugRunning.value = false;
  }
}

watch(
  () => [props.open, sqlStep.value?.id] as const,
  ([open]) => {
    if (!open || !props.caseRow || !sqlStep.value?.db?.connectionId) return;
    void listDatabaseConnections(props.caseRow.projectId)
      .then((rows) => {
        databaseConnections.value = rows;
      })
      .catch(() => {
        databaseConnections.value = [];
      });
  },
  { immediate: true },
);
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

.sql-step-detail {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: 16px;
}

.sql-step-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid #eaecf0;
}

.sql-step-head > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sql-step-head strong {
  color: #1d2939;
  font-size: 18px;
}

.sql-step-head span {
  color: #667085;
  font-size: 12px;
}

.sql-step-meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 16px;
  border: 1px solid #eaecf0;
  border-radius: 10px;
  background: #fff;
}

.sql-step-meta > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.sql-step-meta span {
  color: #98a2b3;
  font-size: 11px;
}

.sql-step-meta strong {
  overflow: hidden;
  color: #344054;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sql-step-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 1px solid #eaecf0;
  border-radius: 10px;
  background: #fff;
}

.sql-step-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sql-step-section-title strong {
  color: #1d2939;
  font-size: 13px;
}

.sql-step-section-title span {
  color: #98a2b3;
  font-size: 11px;
}

.sql-step-code {
  margin: 0;
  padding: 14px;
  overflow: auto;
  border-radius: 8px;
  background: #101828;
  color: #f2f4f7;
  font:
    12px/1.7 "SFMono-Regular",
    Consolas,
    monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.sql-export-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.sql-export-row {
  display: grid;
  grid-template-columns: minmax(100px, 0.8fr) 100px minmax(160px, 1.4fr) 50px;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid #edf0f3;
  border-radius: 8px;
  color: #667085;
  font-size: 11px;
}

.sql-export-row code {
  color: #344054;
}

.sql-export-row code,
.sql-export-row > span:nth-child(3) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sql-step-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
}

.sql-debug-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  color: #667085;
  font-size: 12px;
}

.sql-debug-columns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 14px 0 10px;
}

.sql-debug-cell {
  display: block;
  overflow: hidden;
  color: #344054;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .sql-step-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
