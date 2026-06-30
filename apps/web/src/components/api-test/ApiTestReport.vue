<template>
  <section class="panel api-report-panel">
    <div class="panel-header report-panel-header">
      <div>
        <h2>结果报表</h2>
        <p>通过率统计与趋势分析，支持导出 Excel / PDF / HTML</p>
      </div>
      <a-space wrap>
        <a-select
          v-model:value="selectedRunId"
          class="report-run-select"
          :options="runOptions"
          placeholder="选择执行批次"
        />
        <a-button :disabled="!selectedRunId" @click="exportXlsx">导出 Excel</a-button>
        <a-button :disabled="!selectedRunId" @click="exportPdf">导出 PDF</a-button>
        <a-button :disabled="!selectedRunId" @click="exportHtml">导出 HTML</a-button>
      </a-space>
    </div>

    <a-empty v-if="!selectedRunId" class="report-empty" description="请选择执行批次查看报表" />

    <template v-else-if="summary">
      <div class="report-stat-grid">
        <div class="report-stat-card">
          <span class="report-stat-label">总数</span>
          <strong class="report-stat-value">{{ summary.total }}</strong>
        </div>
        <div class="report-stat-card report-stat-card--pass">
          <span class="report-stat-label">通过</span>
          <strong class="report-stat-value">{{ summary.passed }}</strong>
        </div>
        <div class="report-stat-card report-stat-card--fail">
          <span class="report-stat-label">失败</span>
          <strong class="report-stat-value">{{ summary.failed }}</strong>
        </div>
        <div class="report-stat-card report-stat-card--rate">
          <span class="report-stat-label">通过率</span>
          <strong class="report-stat-value">{{ summary.passRate }}%</strong>
        </div>
      </div>

      <div class="report-chart-section">
        <div class="report-chart-toolbar">
          <strong>结果分布</strong>
          <a-segmented v-model:value="chartMode" :options="chartModeOptions" size="small" />
        </div>

        <div v-if="chartMode === 'progress'" class="report-progress-list">
          <div v-for="item in chartItems" :key="item.key" class="report-progress-row">
            <span class="report-progress-label">{{ item.name }}</span>
            <a-progress
              :percent="percent(item.value, summary.total)"
              :stroke-color="item.color"
              :show-info="true"
              :format="() => String(item.value)"
            />
          </div>
        </div>

        <div v-else-if="chartMode === 'bar'" class="report-svg-chart">
          <svg viewBox="0 0 560 240" role="img" aria-label="结果柱状图">
            <line x1="48" y1="200" x2="520" y2="200" stroke="#eaecf0" />
            <line x1="48" y1="24" x2="48" y2="200" stroke="#eaecf0" />
            <g v-for="(item, index) in chartItems" :key="item.key">
              <rect
                :x="barSlot(index).x"
                :y="barSlot(index).y"
                :width="barSlot(index).width"
                :height="barSlot(index).height"
                :fill="item.color"
                rx="6"
              />
              <text
                :x="barSlot(index).x + barSlot(index).width / 2"
                :y="barSlot(index).y - 8"
                text-anchor="middle"
                class="report-svg-value"
              >
                {{ item.value }}
              </text>
              <text
                :x="barSlot(index).x + barSlot(index).width / 2"
                y="218"
                text-anchor="middle"
                class="report-svg-label"
              >
                {{ item.name }}
              </text>
            </g>
          </svg>
        </div>

        <div v-else class="report-svg-chart">
          <svg viewBox="0 0 560 240" role="img" aria-label="通过率折线图">
            <line x1="48" y1="200" x2="520" y2="200" stroke="#eaecf0" />
            <line x1="48" y1="24" x2="48" y2="200" stroke="#eaecf0" />
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
                  r="4.5"
                  :fill="point.id === selectedRunId ? '#8c1f3d' : '#fff'"
                  :stroke="point.id === selectedRunId ? '#8c1f3d' : '#d0d5dd'"
                  stroke-width="2"
                />
                <text
                  :x="linePoint(index).x"
                  :y="linePoint(index).y - 12"
                  text-anchor="middle"
                  class="report-svg-value"
                >
                  {{ point.passRate }}%
                </text>
                <text
                  :x="linePoint(index).x"
                  y="218"
                  text-anchor="middle"
                  class="report-svg-label"
                >
                  {{ point.label }}
                </text>
              </g>
            </template>
            <text v-else x="280" y="120" text-anchor="middle" class="report-svg-empty">
              暂无历史批次数据
            </text>
          </svg>
        </div>
      </div>

      <div v-if="summary.byStatus?.length" class="report-legend">
        <span v-for="item in chartItems" :key="item.key" class="report-legend-item">
          <i :style="{ background: item.color }" />
          {{ item.name }} {{ item.value }}
        </span>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
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
const chartMode = ref<ChartMode>('bar');
const summary = ref<ReportSummary | null>(null);

const chartModeOptions = [
  { label: '柱状图', value: 'bar' },
  { label: '折线图', value: 'line' },
  { label: '进度条', value: 'progress' },
];

const statusColors: Record<string, string> = {
  passed: '#16a34a',
  failed: '#dc2626',
  error: '#d97706',
};

const runOptions = computed(() =>
  apiStore.transactionRuns.map((r) => ({
    label: `${new Date(r.createdAt).toLocaleString()} — ${r.passedCount}/${r.totalCount}`,
    value: r.id,
  })),
);

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

const trendPoints = computed(() =>
  [...apiStore.transactionRuns]
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
  () => apiStore.transactionRuns,
  (runs) => {
    if (!runs.some((run) => run.id === selectedRunId.value)) {
      selectedRunId.value = runs[0]?.id ?? '';
    }
  },
  { immediate: true },
);

watch(selectedRunId, async (runId) => {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId || !runId) {
    summary.value = null;
    return;
  }
  summary.value = (await apiStore.loadReportSummary(
    projectId,
    transactionId,
    runId,
  )) as ReportSummary;
});

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function formatShortTime(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function barSlot(index: number) {
  const slotWidth = 120;
  const gap = 36;
  const x = 88 + index * (slotWidth + gap);
  const item = chartItems.value[index];
  const height = item ? Math.max(8, (item.value / maxBarValue.value) * 140) : 0;
  return {
    x,
    y: 200 - height,
    width: slotWidth,
    height,
  };
}

function linePoint(index: number) {
  const count = Math.max(trendPoints.value.length, 1);
  const innerWidth = 472;
  const step = count > 1 ? innerWidth / (count - 1) : 0;
  const x = 48 + index * step;
  const passRate = trendPoints.value[index]?.passRate ?? 0;
  const y = 200 - (passRate / 100) * 176;
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
  try {
    await apiStore.exportReport(projectId, transactionId, selectedRunId.value, 'html');
  } catch (error) {
    message.error((error as Error)?.message || '导出 HTML 失败');
  }
}
</script>

<style scoped>
.api-report-panel {
  min-height: 0;
}

.report-panel-header {
  align-items: flex-start;
}

.report-run-select {
  min-width: 280px;
}

.report-empty {
  margin-top: 48px;
}

.report-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.report-stat-card {
  padding: 14px 16px;
  border: 1px solid #eaecf0;
  border-radius: 12px;
  background: linear-gradient(180deg, #fff 0%, #fcfcfd 100%);
}

.report-stat-label {
  display: block;
  margin-bottom: 6px;
  color: #667085;
  font-size: 12px;
}

.report-stat-value {
  color: #101828;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.2;
}

.report-stat-card--pass .report-stat-value {
  color: #16a34a;
}

.report-stat-card--fail .report-stat-value {
  color: #dc2626;
}

.report-stat-card--rate .report-stat-value {
  color: #8c1f3d;
}

.report-chart-section {
  padding: 16px 18px 12px;
  border: 1px solid #eaecf0;
  border-radius: 14px;
  background: #fff;
}

.report-chart-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.report-chart-toolbar strong {
  color: #344054;
  font-size: 14px;
}

.report-progress-list {
  max-width: 560px;
}

.report-progress-row {
  margin-bottom: 12px;
}

.report-progress-label {
  display: block;
  margin-bottom: 4px;
  color: #475467;
  font-size: 13px;
}

.report-svg-chart {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
}

.report-svg-chart svg {
  display: block;
  width: 100%;
  height: auto;
}

.report-svg-label,
.report-svg-value,
.report-svg-empty {
  fill: #667085;
  font-size: 12px;
}

.report-svg-value {
  fill: #344054;
  font-size: 11px;
  font-weight: 600;
}

.report-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 14px;
}

.report-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #667085;
  font-size: 12px;
}

.report-legend-item i {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

@media (max-width: 960px) {
  .report-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .report-chart-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
