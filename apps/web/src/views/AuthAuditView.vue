<template>
  <main class="auth-audit-page">
    <section class="audit-hero">
      <div class="audit-hero-copy">
        <span class="audit-hero-eyebrow">SYSTEM · 安全审计</span>
        <h1>登录审计</h1>
        <p>
          查询统一认证登录、退出与 SYSTEM 代登录事件。明细默认最近 7 天，单次查询最多 31 天。
        </p>
      </div>
      <a-button
        type="primary"
        class="audit-export-button"
        :loading="exporting"
        @click="startExport"
      >
        <template #icon><DownloadOutlined /></template>
        导出 CSV
      </a-button>
    </section>

    <section class="audit-filter-card">
      <div class="audit-filter-grid">
        <label class="audit-field audit-field-range">
          <span>时间范围</span>
          <a-range-picker
            v-model:value="range"
            show-time
            :allow-clear="false"
            format="YYYY-MM-DD HH:mm"
            :placeholder="['开始时间', '结束时间']"
          />
        </label>
        <label class="audit-field">
          <span>事件类型</span>
          <a-select
            v-model:value="eventType"
            allow-clear
            placeholder="全部事件"
            :options="eventTypeOptions"
          />
        </label>
        <label class="audit-field">
          <span>账号</span>
          <a-input
            v-model:value="userName"
            allow-clear
            placeholder="精确匹配账号"
            @press-enter="search"
          />
        </label>
        <label class="audit-field">
          <span>IP</span>
          <a-input
            v-model:value="ip"
            allow-clear
            placeholder="精确匹配 IP"
            @press-enter="search"
          />
        </label>
        <label class="audit-field">
          <span>请求 ID</span>
          <a-input
            v-model:value="requestId"
            allow-clear
            placeholder="关联访问日志"
            @press-enter="search"
          />
        </label>
        <div class="audit-filter-actions">
          <a-button type="primary" :loading="loading" @click="search">
            <template #icon><SearchOutlined /></template>
            查询
          </a-button>
          <a-button @click="resetFilters">重置</a-button>
        </div>
      </div>
    </section>

    <section class="audit-stat-grid">
      <article class="audit-stat-card audit-stat-card--success">
        <span class="audit-stat-label">登录成功</span>
        <strong>{{ summaryTotals.login_success }}</strong>
        <small>SSO 票据校验通过并签发 JWT</small>
      </article>
      <article class="audit-stat-card audit-stat-card--danger">
        <span class="audit-stat-label">登录失败</span>
        <strong>{{ summaryTotals.login_failure }}</strong>
        <small>票据、应用标识或认证服务异常</small>
      </article>
      <article class="audit-stat-card audit-stat-card--neutral">
        <span class="audit-stat-label">退出登录</span>
        <strong>{{ summaryTotals.logout }}</strong>
        <small>主动清理本地登录态</small>
      </article>
      <article class="audit-stat-card audit-stat-card--warning">
        <span class="audit-stat-label">代登录</span>
        <strong>{{ impersonationTotal }}</strong>
        <small>开始与退出代登录合计</small>
      </article>
    </section>

    <section class="audit-panel">
      <div class="audit-panel-head">
        <div>
          <h2>事件明细</h2>
          <span class="audit-panel-sub">
            共加载 {{ items.length }} 条
            <template v-if="hasMore">，继续向下翻页</template>
          </span>
        </div>
        <div v-if="trendRows.length" class="audit-trend" aria-label="最近事件趋势">
          <span class="audit-trend-label">近期趋势</span>
          <div class="audit-trend-bars">
            <span
              v-for="row in trendRows"
              :key="row.date"
              class="audit-trend-bar"
              :title="`${row.date}：${row.count} 条`"
            >
              <span :style="{ height: `${row.percent}%` }" />
            </span>
          </div>
        </div>
      </div>

      <a-table
        :data-source="items"
        :columns="columns"
        :loading="loading"
        :pagination="false"
        :custom-row="rowProps"
        row-key="id"
        size="middle"
        :scroll="{ x: 1180 }"
        :locale="{ emptyText: emptyText }"
        class="audit-table"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'occurredAt'">
            <span class="audit-time">{{ formatTime(record.occurredAt) }}</span>
          </template>
          <template v-else-if="column.key === 'eventType'">
            <a-tag :color="eventColor(record.eventType)">
              {{ eventLabel(record.eventType) }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'userName'">
            <span>{{ record.userName || "—" }}</span>
          </template>
          <template v-else-if="column.key === 'actorUserName'">
            <span>{{ record.actorUserName || "—" }}</span>
          </template>
          <template v-else-if="column.key === 'clientIp'">
            <code class="audit-ip">{{ record.clientIp || "—" }}</code>
          </template>
          <template v-else-if="column.key === 'result'">
            <span
              v-if="record.failureCode"
              class="audit-result audit-result--failed"
            >
              {{ record.failureCode }}
            </span>
            <span v-else class="audit-result audit-result--success">成功</span>
          </template>
          <template v-else-if="column.key === 'reason'">
            <span class="audit-reason">{{ record.reason || "—" }}</span>
          </template>
          <template v-else-if="column.key === 'requestId'">
            <code class="audit-request-id">{{ record.requestId }}</code>
          </template>
        </template>
      </a-table>

      <div v-if="hasMore || items.length" class="audit-panel-foot">
        <a-button v-if="hasMore" :loading="loadingMore" @click="loadMore">
          加载更多
        </a-button>
        <span v-else class="audit-panel-end">已加载全部结果</span>
      </div>
    </section>

    <a-drawer
      v-model:open="detailOpen"
      title="审计事件详情"
      placement="right"
      :width="560"
      destroy-on-close
    >
      <template v-if="detail">
        <a-descriptions :column="1" bordered size="small">
          <a-descriptions-item label="事件时间">
            {{ formatTime(detail.occurredAt) }}
          </a-descriptions-item>
          <a-descriptions-item label="事件类型">
            <a-tag :color="eventColor(detail.eventType)">
              {{ eventLabel(detail.eventType) }}
            </a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="目标账号">
            {{ detail.userName || "—" }}
          </a-descriptions-item>
          <a-descriptions-item label="原始操作人">
            {{ detail.actorUserName || "—" }}
          </a-descriptions-item>
          <a-descriptions-item label="客户端 IP">
            {{ detail.clientIp || "—" }}
          </a-descriptions-item>
          <a-descriptions-item label="来源">
            {{ detail.sourceApp || "—" }}
          </a-descriptions-item>
          <a-descriptions-item label="结果 / 失败码">
            {{ detail.failureCode || "成功" }}
          </a-descriptions-item>
          <a-descriptions-item label="原因">
            {{ detail.reason || "—" }}
          </a-descriptions-item>
          <a-descriptions-item label="会话 ID">
            <code>{{ detail.sessionId || "—" }}</code>
          </a-descriptions-item>
          <a-descriptions-item label="请求 ID">
            <code>{{ detail.requestId }}</code>
          </a-descriptions-item>
          <a-descriptions-item label="User-Agent">
            {{ detail.userAgent || "—" }}
          </a-descriptions-item>
        </a-descriptions>
        <div class="audit-detail-meta">
          <span>metadata</span>
          <pre>{{ formatMetadata(detail.metadata) }}</pre>
        </div>
      </template>
    </a-drawer>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import dayjs, { type Dayjs } from "dayjs";
import { message } from "ant-design-vue";
import { DownloadOutlined, SearchOutlined } from "@ant-design/icons-vue";
import {
  AUTH_AUDIT_EVENT_TYPES,
  AUTH_AUDIT_EVENT_TYPE_LABELS,
  AUTH_AUDIT_MAX_QUERY_DAYS,
  type AuthAuditEvent,
  type AuthAuditEventType,
  type AuthAuditSummary,
} from "@case-forge/shared";
import {
  createAuthAuditExport,
  downloadAuthAuditExport,
  fetchAuthAuditEvents,
  fetchAuthAuditExport,
  fetchAuthAuditSummary,
  type AuthAuditQueryParams,
} from "@/api/authAudit";

const PAGE_SIZE = 50;

const route = useRoute();
const router = useRouter();
const range = ref<[Dayjs, Dayjs]>([
  dayjs().subtract(6, "day").startOf("day"),
  dayjs().endOf("day"),
]);
const eventType = ref<AuthAuditEventType | undefined>();
const userName = ref("");
const ip = ref("");
const requestId = ref("");

const items = ref<AuthAuditEvent[]>([]);
const summary = ref<AuthAuditSummary | null>(null);
const nextCursor = ref<string | null>(null);
const hasMore = ref(false);
const loading = ref(false);
const loadingMore = ref(false);
const exporting = ref(false);
const detail = ref<AuthAuditEvent | null>(null);
const detailOpen = ref(false);
let loadSequence = 0;

const eventTypeOptions = AUTH_AUDIT_EVENT_TYPES.map((value) => ({
  value,
  label: AUTH_AUDIT_EVENT_TYPE_LABELS[value],
}));

const columns = [
  { title: "时间", key: "occurredAt", width: 176 },
  { title: "事件", key: "eventType", width: 120 },
  { title: "账号", key: "userName", width: 140 },
  { title: "原始操作人", key: "actorUserName", width: 130 },
  { title: "IP", key: "clientIp", width: 150 },
  { title: "结果", key: "result", width: 150 },
  { title: "原因", key: "reason", width: 200 },
  { title: "请求 ID", key: "requestId", width: 190 },
];

const emptyText = computed(() =>
  loading.value ? "正在查询…" : "当前条件下没有审计事件",
);

const summaryTotals = computed(
  () =>
    summary.value?.totals ?? {
      login_success: 0,
      login_failure: 0,
      logout: 0,
      impersonation_start: 0,
      impersonation_exit: 0,
    },
);

const impersonationTotal = computed(
  () =>
    summaryTotals.value.impersonation_start +
    summaryTotals.value.impersonation_exit,
);

const trendRows = computed(() => {
  const map = new Map<string, number>();
  for (const item of summary.value?.items ?? []) {
    map.set(item.statDate, (map.get(item.statDate) ?? 0) + item.count);
  }
  const rows = [...map.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-7);
  const max = Math.max(1, ...rows.map(([, count]) => count));
  return rows.map(([date, count]) => ({
    date,
    count,
    percent: Math.max(8, Math.round((count / max) * 100)),
  }));
});

function currentRange(): [Dayjs, Dayjs] {
  return (
    range.value ?? [
      dayjs().subtract(6, "day").startOf("day"),
      dayjs().endOf("day"),
    ]
  );
}

function buildParams(): AuthAuditQueryParams {
  const [from, to] = currentRange();
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    ...(eventType.value ? { eventType: eventType.value } : {}),
    ...(userName.value.trim() ? { userName: userName.value.trim() } : {}),
    ...(ip.value.trim() ? { ip: ip.value.trim() } : {}),
    ...(requestId.value.trim()
      ? { requestId: requestId.value.trim() }
      : {}),
  };
}

function validateRange() {
  const [from, to] = currentRange();
  if (to.isBefore(from)) {
    message.error("结束时间必须晚于开始时间");
    return false;
  }
  if (to.diff(from, "day", true) > AUTH_AUDIT_MAX_QUERY_DAYS) {
    message.error(`单次查询最多允许 ${AUTH_AUDIT_MAX_QUERY_DAYS} 天`);
    return false;
  }
  return true;
}

function parseQueryDate(value: unknown) {
  return typeof value === "string" ? dayjs(value) : null;
}

function isEventType(value: unknown): value is AuthAuditEventType {
  return (
    typeof value === "string" &&
    (AUTH_AUDIT_EVENT_TYPES as readonly string[]).includes(value)
  );
}

/** 刷新页面时从 URL 恢复筛选条件，游标不持久化。 */
function applyQueryFilters() {
  const query = route.query;
  const from = parseQueryDate(query.from);
  const to = parseQueryDate(query.to);
  if (from?.isValid() && to?.isValid() && !to.isBefore(from)) {
    range.value = [from, to];
  }
  if (isEventType(query.type)) {
    eventType.value = query.type;
  }
  userName.value = typeof query.account === "string" ? query.account : "";
  ip.value = typeof query.ip === "string" ? query.ip : "";
  requestId.value =
    typeof query.requestId === "string" ? query.requestId : "";
}

function syncQuery(params: AuthAuditQueryParams) {
  const query: Record<string, string> = {
    from: params.from,
    to: params.to,
  };
  if (params.eventType) query.type = params.eventType;
  if (params.userName) query.account = params.userName;
  if (params.ip) query.ip = params.ip;
  if (params.requestId) query.requestId = params.requestId;
  void router.replace({ path: route.path, query });
}

async function search() {
  if (!validateRange()) return;
  const sequence = ++loadSequence;
  loading.value = true;
  detailOpen.value = false;
  try {
    const params = buildParams();
    syncQuery(params);
    const [page, summaryData] = await Promise.all([
      fetchAuthAuditEvents({ ...params, limit: PAGE_SIZE }),
      fetchAuthAuditSummary(params),
    ]);
    if (sequence !== loadSequence) return;
    items.value = page.items;
    nextCursor.value = page.nextCursor;
    hasMore.value = page.hasMore;
    summary.value = summaryData;
  } catch (error) {
    if (sequence === loadSequence) {
      message.error(errorMessage(error, "查询登录审计失败"));
      items.value = [];
      nextCursor.value = null;
      hasMore.value = false;
    }
  } finally {
    if (sequence === loadSequence) {
      loading.value = false;
    }
  }
}

async function loadMore() {
  if (!hasMore.value || !nextCursor.value || loadingMore.value) return;
  loadingMore.value = true;
  try {
    const page = await fetchAuthAuditEvents({
      ...buildParams(),
      cursor: nextCursor.value,
      limit: PAGE_SIZE,
    });
    items.value = [...items.value, ...page.items];
    nextCursor.value = page.nextCursor;
    hasMore.value = page.hasMore;
  } catch (error) {
    message.error(errorMessage(error, "加载更多失败"));
  } finally {
    loadingMore.value = false;
  }
}

function resetFilters() {
  range.value = [
    dayjs().subtract(6, "day").startOf("day"),
    dayjs().endOf("day"),
  ];
  eventType.value = undefined;
  userName.value = "";
  ip.value = "";
  requestId.value = "";
  void search();
}

function openDetail(record: AuthAuditEvent) {
  detail.value = record;
  detailOpen.value = true;
}

function rowProps(record: AuthAuditEvent) {
  return {
    onClick: () => openDetail(record),
  };
}

async function startExport() {
  if (exporting.value || !validateRange()) return;
  exporting.value = true;
  try {
    let job = await createAuthAuditExport(buildParams());
    const deadline = Date.now() + 5 * 60 * 1000;
    while (job.status === "pending" || job.status === "running") {
      if (Date.now() > deadline) {
        message.warning("导出仍在后台执行，请稍后重新导出或缩小范围");
        return;
      }
      await sleep(1500);
      job = await fetchAuthAuditExport(job.id);
    }
    if (job.status === "completed") {
      await downloadAuthAuditExport(job);
      message.success("导出完成，文件已开始下载");
    } else {
      message.error(job.errorMessage || "导出失败");
    }
  } catch (error) {
    message.error(errorMessage(error, "创建导出任务失败"));
  } finally {
    exporting.value = false;
  }
}

function errorMessage(error: unknown, fallback: string) {
  const data = (
    error as { response?: { data?: { message?: string | string[] } } }
  )?.response?.data?.message;
  if (Array.isArray(data) && data.length) return data.join("；");
  if (typeof data === "string" && data) return data;
  return error instanceof Error && error.message ? error.message : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTime(value: string) {
  return dayjs(value).format("YYYY-MM-DD HH:mm:ss");
}

function formatMetadata(value: Record<string, unknown> | null) {
  if (!value) return "—";
  return JSON.stringify(value, null, 2);
}

function eventLabel(value: AuthAuditEventType) {
  return AUTH_AUDIT_EVENT_TYPE_LABELS[value] ?? value;
}

function eventColor(value: AuthAuditEventType) {
  switch (value) {
    case "login_success":
      return "green";
    case "login_failure":
      return "red";
    case "logout":
      return "default";
    case "impersonation_start":
      return "orange";
    case "impersonation_exit":
      return "blue";
    default:
      return "default";
  }
}

onMounted(() => {
  applyQueryFilters();
  void search();
});
</script>

<style scoped>
.auth-audit-page {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
  padding: 24px clamp(16px, 3vw, 36px) 40px;
  background:
    radial-gradient(circle at 100% 0%, rgb(182 15 45 / 6%), transparent 34%),
    var(--cf-canvas);
}

.audit-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 4px 2px;
}

.audit-hero-copy {
  max-width: 760px;
}

.audit-hero-eyebrow {
  color: var(--cf-brand);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.audit-hero h1 {
  margin: 6px 0 6px;
  color: var(--cf-text);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.audit-hero p {
  margin: 0;
  color: var(--cf-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.audit-export-button {
  flex: 0 0 auto;
  height: 38px;
  padding-inline: 18px;
  border-radius: 8px;
  box-shadow: 0 8px 20px rgb(182 15 45 / 18%);
}

.audit-filter-card,
.audit-panel {
  border: 1px solid var(--cf-border);
  border-radius: 14px;
  background: var(--cf-surface);
  box-shadow: var(--cf-shadow-sm);
}

.audit-filter-card {
  padding: 18px 20px;
}

.audit-filter-grid {
  display: grid;
  grid-template-columns: minmax(330px, 1.5fr) minmax(150px, 0.7fr) repeat(3, minmax(140px, 1fr)) auto;
  align-items: end;
  gap: 12px;
}

.audit-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.audit-field > span {
  color: var(--cf-text-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.audit-field :deep(.ant-picker),
.audit-field :deep(.ant-select),
.audit-field :deep(.ant-input-affix-wrapper) {
  width: 100%;
}

.audit-filter-actions {
  display: flex;
  gap: 8px;
}

.audit-filter-actions .ant-btn {
  height: 32px;
  border-radius: 7px;
}

.audit-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.audit-stat-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-height: 118px;
  padding: 16px 18px;
  overflow: hidden;
  border: 1px solid var(--cf-border);
  border-radius: 12px;
  background: var(--cf-surface);
  box-shadow: var(--cf-shadow-sm);
}

.audit-stat-card::after {
  position: absolute;
  top: -22px;
  right: -22px;
  width: 74px;
  height: 74px;
  border-radius: 50%;
  background: currentcolor;
  content: "";
  opacity: 0.08;
}

.audit-stat-card--success {
  color: #067647;
}

.audit-stat-card--danger {
  color: #b42318;
}

.audit-stat-card--neutral {
  color: #344054;
}

.audit-stat-card--warning {
  color: #b54708;
}

.audit-stat-label {
  color: currentcolor;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  opacity: 0.9;
}

.audit-stat-card strong {
  margin: 2px 0;
  color: var(--cf-text);
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.audit-stat-card small {
  color: var(--cf-text-muted);
  font-size: 11px;
  line-height: 1.45;
}

.audit-panel {
  display: flex;
  flex-direction: column;
  min-height: 320px;
  padding: 6px 0 0;
}

.audit-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 20px 12px;
}

.audit-panel-head h2 {
  margin: 0;
  color: var(--cf-text);
  font-size: 15px;
  font-weight: 700;
}

.audit-panel-sub {
  display: block;
  margin-top: 3px;
  color: var(--cf-text-muted);
  font-size: 11px;
}

.audit-trend {
  display: flex;
  align-items: center;
  gap: 10px;
}

.audit-trend-label {
  color: var(--cf-text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.audit-trend-bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 32px;
}

.audit-trend-bar {
  display: flex;
  align-items: flex-end;
  width: 9px;
  height: 100%;
  border-radius: 3px;
  background: #f2f4f7;
}

.audit-trend-bar > span {
  width: 100%;
  min-height: 3px;
  border-radius: 3px;
  background: linear-gradient(180deg, #d63a55, var(--cf-brand));
}

.audit-table {
  flex: 1 1 auto;
}

.audit-table :deep(.ant-table-thead > tr > th) {
  padding: 10px 12px;
  border-bottom: 1px solid var(--cf-border);
  background: #fafbfc;
  color: var(--cf-text-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.audit-table :deep(.ant-table-tbody > tr > td) {
  padding: 10px 12px;
  border-bottom: 1px solid #f2f4f7;
  color: var(--cf-text-body);
  font-size: 12px;
  vertical-align: middle;
}

.audit-table :deep(.ant-table-tbody > tr) {
  cursor: pointer;
}

.audit-table :deep(.ant-table-tbody > tr:hover > td) {
  background: #fff7f8;
}

.audit-time {
  color: var(--cf-text);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.audit-ip,
.audit-request-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  white-space: nowrap;
}

.audit-ip {
  color: #475467;
}

.audit-request-id {
  display: inline-block;
  max-width: 176px;
  overflow: hidden;
  color: #667085;
  text-overflow: ellipsis;
  vertical-align: bottom;
}

.audit-result {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.audit-result--success {
  background: #ecfdf3;
  color: #067647;
}

.audit-result--failed {
  background: #fef3f2;
  color: #b42318;
}

.audit-reason {
  display: inline-block;
  max-width: 190px;
  overflow: hidden;
  color: var(--cf-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-panel-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 58px;
  padding: 12px 20px 16px;
}

.audit-panel-end {
  color: var(--cf-text-muted);
  font-size: 11px;
}

.audit-detail-meta {
  margin-top: 16px;
}

.audit-detail-meta > span {
  color: var(--cf-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.audit-detail-meta pre {
  margin: 6px 0 0;
  padding: 12px;
  overflow: auto;
  border: 1px solid var(--cf-border);
  border-radius: 8px;
  background: #fcfcfd;
  color: var(--cf-text-body);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

@media (max-width: 1180px) {
  .audit-filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .audit-field-range {
    grid-column: 1 / -1;
  }

  .audit-filter-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
}

@media (max-width: 820px) {
  .audit-hero {
    align-items: flex-start;
    flex-direction: column;
  }

  .audit-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .audit-panel-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .audit-trend {
    align-self: stretch;
    justify-content: space-between;
  }
}

@media (max-width: 560px) {
  .audit-filter-grid,
  .audit-stat-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
