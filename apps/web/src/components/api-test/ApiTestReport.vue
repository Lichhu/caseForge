<template>
  <section class="panel api-report-panel">
    <div class="panel-header report-panel-header">
      <div>
        <h2>结果报表</h2>
        <p>通过率统计与趋势分析，支持导出 Excel / PDF / HTML</p>
        <p v-if="reportScopeHint" class="report-scope-hint">{{ reportScopeHint }}</p>
      </div>
      <a-space wrap>
        <a-select
          v-model:value="selectedRunId"
          class="report-run-select"
          :options="runOptions"
          placeholder="选择执行批次"
        />
        <a-dropdown
          v-model:open="exportMenuOpen"
          trigger="click"
          :disabled="!selectedRunId || !canExportReport"
        >
          <a-button :disabled="!selectedRunId || !canExportReport">
            <ExportOutlined />
            导出方式
            <DownOutlined
              :class="['dropdown-trigger-chevron', { 'is-open': exportMenuOpen }]"
            />
          </a-button>
          <template #overlay>
            <a-menu @click="onExportMenuClick">
              <a-menu-item key="xlsx">
                <FileExcelOutlined />
                Excel
              </a-menu-item>
              <a-menu-item key="pdf">
                <FilePdfOutlined />
                PDF
              </a-menu-item>
              <a-menu-item key="html">
                <FileTextOutlined />
                HTML
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </a-space>
    </div>

    <div class="report-panel-body">
      <a-empty v-if="!selectedRunId" class="report-empty" description="请选择执行批次查看报表" />

      <div v-else-if="summaryLoading" class="report-loading">
        <a-spin tip="加载报表数据..." />
      </div>

      <a-result
        v-else-if="summaryError"
        status="warning"
        title="报表加载失败"
        :sub-title="summaryError"
      >
        <template #extra>
          <a-button type="primary" @click="reloadSummary">重试</a-button>
        </template>
      </a-result>

      <template v-else-if="summary">
        <div class="report-overview">
          <div class="report-pass-hero">
            <div
              class="report-pass-ring"
              :class="passRateToneClass"
              :style="passRingStyle"
            >
              <div class="report-pass-ring-inner">
                <strong>{{ summary.passRate }}%</strong>
                <span>通过率</span>
              </div>
            </div>
            <div class="report-pass-caption">
              <h3>{{ selectedRunLabel }}</h3>
              <p>{{ passOutcomeLabel }}</p>
            </div>
          </div>
          <div class="report-metrics">
            <div
              v-for="metric in metricItems"
              :key="metric.key"
              class="report-metric"
              :class="`report-metric--${metric.tone}`"
            >
              <span class="report-metric-label">{{ metric.label }}</span>
              <strong class="report-metric-value">{{ metric.value }}</strong>
            </div>
          </div>
        </div>

        <div class="report-chart-section">
          <div class="report-chart-toolbar">
            <div>
              <strong class="report-chart-title">结果分布</strong>
              <span class="report-chart-subtitle">当前批次各状态占比</span>
            </div>
            <a-segmented v-model:value="chartMode" :options="chartModeOptions" size="small" />
          </div>

          <div v-if="chartMode === 'progress'" class="report-distribution">
            <div
              class="report-stack-bar"
              role="img"
              :aria-label="distributionAriaLabel"
            >
              <template v-if="summary.total > 0">
                <div
                  v-for="item in chartItems"
                  :key="item.key"
                  class="report-stack-segment"
                  :style="{
                    flex: item.value > 0 ? `${item.value} 1 0` : '0 0 0',
                    background: item.color,
                  }"
                  :title="`${item.name} ${item.value}（${percent(item.value, summary.total)}%）`"
                />
              </template>
            </div>
            <div class="report-dist-legend">
              <div
                v-for="item in chartItems"
                :key="item.key"
                class="report-dist-card"
                :class="`report-dist-card--${item.key}`"
              >
                <span class="report-dist-card-head">
                  <i class="report-dist-dot" :style="{ background: item.color }" />
                  {{ item.name }}
                </span>
                <div class="report-dist-card-body">
                  <strong class="report-dist-card-value">{{ item.value }}</strong>
                  <span class="report-dist-card-rate">
                    {{ percent(item.value, summary.total) }}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="chartMode === 'bar'" class="report-bar-chart">
            <div v-for="item in chartItems" :key="item.key" class="report-bar-col">
              <span class="report-bar-value">{{ item.value }}</span>
              <div class="report-bar-track">
                <div
                  class="report-bar-fill"
                  :style="{
                    height: `${barHeightPercent(item.value)}%`,
                    background: item.color,
                  }"
                />
              </div>
              <span class="report-bar-label">{{ item.name }}</span>
            </div>
          </div>

          <div v-else class="report-trend-chart">
            <svg viewBox="0 0 640 220" role="img" aria-label="通过率折线图">
              <line x1="56" y1="184" x2="604" y2="184" stroke="#eaecf0" />
              <line x1="56" y1="24" x2="56" y2="184" stroke="#eaecf0" />
              <line
                v-for="tick in [0, 25, 50, 75, 100]"
                :key="tick"
                x1="56"
                :y1="184 - tick * 1.6"
                x2="604"
                :y2="184 - tick * 1.6"
                stroke="#f2f4f7"
              />
              <text x="48" y="188" text-anchor="end" class="report-axis-label">0%</text>
              <text x="48" y="56" text-anchor="end" class="report-axis-label">100%</text>
              <template v-if="trendPoints.length">
                <polyline
                  :points="linePoints"
                  fill="none"
                  stroke="#8c1f3d"
                  stroke-width="2.5"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                />
                <g v-for="(point, index) in trendPoints" :key="point.id">
                  <circle
                    :cx="linePoint(index).x"
                    :cy="linePoint(index).y"
                    r="5"
                    :fill="point.id === selectedRunId ? '#8c1f3d' : '#fff'"
                    :stroke="point.id === selectedRunId ? '#8c1f3d' : '#d0d5dd'"
                    stroke-width="2"
                  />
                  <text
                    :x="linePoint(index).x"
                    :y="linePoint(index).y - 12"
                    text-anchor="middle"
                    class="report-point-value"
                  >
                    {{ point.passRate }}%
                  </text>
                  <text
                    :x="linePoint(index).x"
                    y="204"
                    text-anchor="middle"
                    class="report-axis-label"
                  >
                    {{ point.label }}
                  </text>
                </g>
              </template>
              <text v-else x="320" y="112" text-anchor="middle" class="report-axis-label">
                暂无历史批次数据
              </text>
            </svg>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onActivated, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import type { MenuProps } from 'ant-design-vue';
import {
  DownOutlined,
  ExportOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FileTextOutlined,
} from '@ant-design/icons-vue';
import { useApiTestStore } from '@/stores/apiTest';

type ChartMode = 'bar' | 'line' | 'progress';

type ReportSummary = {
  total: number;
  passed: number;
  failed: number;
  error: number;
  passRate: number;
  byStatus: Array<{ name: string; value: number; key?: string }>;
};

const apiStore = useApiTestStore();
const selectedRunId = ref('');
const exportMenuOpen = ref(false);
const chartMode = ref<ChartMode>('progress');
const summary = ref<ReportSummary | null>(null);
const summaryLoading = ref(false);
const summaryError = ref('');

const chartModeOptions = [
  { label: '进度条', value: 'progress' },
  { label: '柱状图', value: 'bar' },
  { label: '折线图', value: 'line' },
];

const statusColors: Record<string, string> = {
  passed: '#16a34a',
  failed: '#dc2626',
  error: '#d97706',
};

const runOptions = computed(() =>
  apiStore.reportRuns.map((r) => ({
    label: `${new Date(r.createdAt).toLocaleString()} — ${r.passedCount}/${r.totalCount}`,
    value: r.id,
  })),
);

const reportScopeHint = computed(() => {
  const setName = apiStore.activeExecutionSet?.name;
  if (apiStore.activeExecutionSetId && setName) {
    return `当前执行集：${setName}`;
  }
  return '';
});

const selectedRun = computed(() =>
  apiStore.reportRuns.find((run) => run.id === selectedRunId.value),
);

const selectedRunLabel = computed(() => {
  if (!selectedRun.value) return '当前批次';
  return new Date(selectedRun.value.createdAt).toLocaleString();
});

const metricItems = computed(() => {
  if (!summary.value) return [];
  return [
    { key: 'total', label: '总数', value: summary.value.total, tone: 'neutral' },
    { key: 'passed', label: '通过', value: summary.value.passed, tone: 'pass' },
    { key: 'failed', label: '失败', value: summary.value.failed, tone: 'fail' },
    { key: 'error', label: '错误', value: summary.value.error, tone: 'error' },
  ];
});

const passRateToneClass = computed(() => {
  if (!summary.value) return 'report-pass-ring--neutral';
  if (summary.value.passRate >= 100) return 'report-pass-ring--pass';
  if (summary.value.passRate <= 0) return 'report-pass-ring--fail';
  return 'report-pass-ring--partial';
});

const passOutcomeLabel = computed(() => {
  if (!summary.value) return '';
  const { total, passed, failed, error } = summary.value;
  if (!total) return '暂无案例';
  if (passed === total) return `全部 ${total} 条案例通过`;
  if (!passed && failed + error === total) return `全部 ${total} 条案例未通过`;
  return `通过 ${passed} 条，未通过 ${failed + error} 条`;
});

const canExportReport = computed(() => (summary.value?.total ?? 0) > 0);

const passRingStyle = computed(() => {
  if (!summary.value) return {};
  const rate = Math.max(0, Math.min(100, summary.value.passRate));
  const color =
    rate >= 100 ? '#16a34a' : rate <= 0 ? '#dc2626' : '#d97706';
  return {
    background: `conic-gradient(${color} 0 ${rate}%, #eef2f6 ${rate}% 100%)`,
  };
});

const chartItems = computed(() => {
  if (!summary.value) return [];
  const nameToKey: Record<string, string> = {
    通过: 'passed',
    失败: 'failed',
    错误: 'error',
  };
  return (summary.value.byStatus ?? []).map((item, index) => {
    const key = item.key ?? nameToKey[item.name] ?? ['passed', 'failed', 'error'][index] ?? item.name;
    return {
      ...item,
      key,
      color: statusColors[key] ?? '#667085',
    };
  });
});

const distributionAriaLabel = computed(() => {
  if (!summary.value) return '结果分布';
  return chartItems.value
    .map(
      (item) =>
        `${item.name} ${item.value} 条，占 ${percent(item.value, summary.value!.total)}%`,
    )
    .join('；');
});

const trendPoints = computed(() =>
  [...apiStore.reportRuns]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-8)
    .map((run) => ({
      id: run.id,
      label: formatShortTime(run.createdAt),
      passRate:
        run.totalCount > 0
          ? Math.round((run.passedCount / run.totalCount) * 1000) / 10
          : 0,
    })),
);

const maxBarValue = computed(() =>
  Math.max(1, ...chartItems.value.map((item) => item.value)),
);

watch(
  () => apiStore.reportRuns,
  (runs) => {
    if (!runs.some((run) => run.id === selectedRunId.value)) {
      selectedRunId.value = runs[0]?.id ?? '';
    }
  },
  { immediate: true },
);

watch(selectedRunId, (runId) => {
  void loadSummary(runId);
});

watch(
  () => apiStore.workspaceStage,
  (stage) => {
    if (stage === 'api-report' && selectedRunId.value) {
      void loadSummary(selectedRunId.value);
    }
  },
);

onActivated(() => {
  const projectId = apiStore.activeProjectId;
  if (projectId) {
    void apiStore.ensureRunnerRunsLoaded(projectId);
  }
  if (selectedRunId.value) {
    void loadSummary(selectedRunId.value);
  }
});

async function loadSummary(runId: string) {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId || !runId) {
    summary.value = null;
    summaryError.value = '';
    summaryLoading.value = false;
    return;
  }
  summaryLoading.value = true;
  summaryError.value = '';
  try {
    summary.value = (await apiStore.loadReportSummary(
      projectId,
      transactionId,
      runId,
    )) as ReportSummary;
  } catch (error) {
    summary.value = null;
    summaryError.value = (error as Error)?.message || '无法加载报表，请稍后重试';
  } finally {
    summaryLoading.value = false;
  }
}

function reloadSummary() {
  if (selectedRunId.value) {
    void loadSummary(selectedRunId.value);
  }
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function barHeightPercent(value: number) {
  return Math.max(value > 0 ? 8 : 0, (value / maxBarValue.value) * 100);
}

function formatShortTime(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function linePoint(index: number) {
  const count = Math.max(trendPoints.value.length, 1);
  const innerWidth = 548;
  const step = count > 1 ? innerWidth / (count - 1) : 0;
  const x = 56 + index * step;
  const passRate = trendPoints.value[index]?.passRate ?? 0;
  const y = 184 - (passRate / 100) * 160;
  return { x, y };
}

const linePoints = computed(() =>
  trendPoints.value.map((_, index) => {
    const point = linePoint(index);
    return `${point.x},${point.y}`;
  }).join(' '),
);

async function exportXlsx() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId || !selectedRunId.value) return;
  if (!canExportReport.value) {
    message.warning('当前批次在本交易码下无执行明细，无法导出');
    return;
  }
  try {
    await apiStore.exportReport(projectId, transactionId, selectedRunId.value, 'xlsx');
  } catch (error) {
    message.error((error as Error)?.message || '导出 Excel 失败');
  }
}

async function exportPdf() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId || !selectedRunId.value) return;
  if (!canExportReport.value) {
    message.warning('当前批次在本交易码下无执行明细，无法导出');
    return;
  }
  try {
    await apiStore.exportReport(projectId, transactionId, selectedRunId.value, 'pdf');
  } catch (error) {
    message.error((error as Error)?.message || '导出 PDF 失败');
  }
}

async function exportHtml() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId || !selectedRunId.value) return;
  if (!canExportReport.value) {
    message.warning('当前批次在本交易码下无执行明细，无法导出');
    return;
  }
  try {
    await apiStore.exportReport(projectId, transactionId, selectedRunId.value, 'html');
  } catch (error) {
    message.error((error as Error)?.message || '导出 HTML 失败');
  }
}

const onExportMenuClick: MenuProps['onClick'] = ({ key }) => {
  if (key === 'xlsx') void exportXlsx();
  else if (key === 'pdf') void exportPdf();
  else if (key === 'html') void exportHtml();
};
</script>

<style scoped>
.api-report-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.report-panel-header {
  flex-shrink: 0;
  align-items: flex-start;
}

.report-scope-hint {
  margin: 4px 0 0;
  color: #667085;
  font-size: 12px;
}

.report-panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 16px 20px 20px;
  -webkit-overflow-scrolling: touch;
}

.report-run-select {
  min-width: 280px;
}

.report-empty,
.report-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
}

.report-overview {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.report-pass-hero,
.report-metrics {
  padding: 18px 20px;
  border: 1px solid #eaecf0;
  border-radius: 12px;
  background: linear-gradient(180deg, #fff 0%, #fafbfc 100%);
}

.report-pass-hero {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
}

.report-pass-ring {
  flex-shrink: 0;
  width: 108px;
  height: 108px;
  padding: 8px;
  border-radius: 50%;
}

.report-pass-ring-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #fff;
  box-shadow: inset 0 0 0 1px #f2f4f7;
}

.report-pass-ring-inner strong {
  color: #101828;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.1;
}

.report-pass-ring-inner span {
  margin-top: 4px;
  color: #667085;
  font-size: 11px;
}

.report-pass-ring--pass .report-pass-ring-inner strong {
  color: #16a34a;
}

.report-pass-ring--fail .report-pass-ring-inner strong {
  color: #dc2626;
}

.report-pass-ring--partial .report-pass-ring-inner strong {
  color: #d97706;
}

.report-pass-caption {
  min-width: 0;
}

.report-pass-caption h3 {
  margin: 0 0 6px;
  color: #1d2939;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}

.report-pass-caption p {
  margin: 0;
  color: #667085;
  font-size: 13px;
  line-height: 1.5;
}

.report-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  align-content: center;
}

.report-metric {
  padding: 12px 14px;
  border: 1px solid #eef2f6;
  border-left: 3px solid #d0d5dd;
  border-radius: 10px;
  background: #fff;
}

.report-metric-label {
  display: block;
  margin-bottom: 4px;
  color: #667085;
  font-size: 11px;
}

.report-metric-value {
  color: #101828;
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.report-metric--pass {
  border-left-color: #16a34a;
}

.report-metric--pass .report-metric-value {
  color: #16a34a;
}

.report-metric--fail {
  border-left-color: #dc2626;
}

.report-metric--fail .report-metric-value {
  color: #dc2626;
}

.report-metric--error {
  border-left-color: #d97706;
}

.report-metric--error .report-metric-value {
  color: #d97706;
}

.report-chart-section {
  padding: 16px 20px 18px;
  border: 1px solid #eaecf0;
  border-radius: 12px;
  background: #fff;
}

.report-chart-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.report-chart-title {
  display: block;
  color: #344054;
  font-size: 14px;
  font-weight: 600;
}

.report-chart-subtitle {
  display: block;
  margin-top: 2px;
  color: #98a2b3;
  font-size: 12px;
}

.report-distribution {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.report-stack-bar {
  display: flex;
  height: 12px;
  border-radius: 999px;
  background: #f2f4f7;
  overflow: hidden;
}

.report-stack-segment {
  min-width: 0;
  transition: flex 0.25s ease;
}

.report-dist-legend {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.report-dist-card {
  padding: 12px 14px;
  border: 1px solid #eef2f6;
  border-radius: 10px;
  background: #fafbfc;
}

.report-dist-card-head {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #667085;
  font-size: 12px;
}

.report-dist-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.report-dist-card-body {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 8px;
}

.report-dist-card-value {
  color: #101828;
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.report-dist-card-rate {
  color: #98a2b3;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.report-dist-card--passed .report-dist-card-value {
  color: #16a34a;
}

.report-dist-card--failed .report-dist-card-value {
  color: #dc2626;
}

.report-dist-card--error .report-dist-card-value {
  color: #d97706;
}

.report-bar-chart {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 28px;
  min-height: 220px;
  padding: 8px 12px 0;
}

.report-bar-col {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 120px;
}

.report-bar-value {
  color: #344054;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.report-bar-track {
  display: flex;
  align-items: flex-end;
  width: 100%;
  height: 160px;
  padding: 0 18px;
  border-radius: 10px 10px 0 0;
  background: linear-gradient(180deg, #fafbfc 0%, #f9fafb 100%);
}

.report-bar-fill {
  width: 100%;
  min-height: 0;
  border-radius: 8px 8px 0 0;
  transition: height 0.25s ease;
}

.report-bar-label {
  color: #667085;
  font-size: 12px;
}

.report-trend-chart {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
}

.report-trend-chart svg {
  display: block;
  width: 100%;
  height: auto;
}

.report-axis-label,
.report-point-value {
  fill: #667085;
  font-size: 11px;
}

.report-point-value {
  fill: #344054;
  font-size: 11px;
  font-weight: 600;
}

@media (max-width: 960px) {
  .report-overview {
    grid-template-columns: 1fr;
  }

  .report-chart-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .report-dist-legend {
    grid-template-columns: 1fr;
  }
}
</style>
