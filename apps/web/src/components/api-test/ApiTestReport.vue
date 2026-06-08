<template>
  <section class="panel">
    <div class="panel-header">
      <div><h2>结果报表</h2><p>通过率统计，支持导出 Excel / PDF</p></div>
      <a-space>
        <a-select v-model:value="selectedRunId" style="min-width: 280px" :options="runOptions" placeholder="选择执行批次" />
        <a-button :disabled="!selectedRunId" @click="exportXlsx">导出 Excel</a-button>
        <a-button :disabled="!selectedRunId" @click="exportPdf">导出 PDF</a-button>
      </a-space>
    </div>
    <a-row v-if="summary" :gutter="16" class="stats-row">
      <a-col :span="6"><a-statistic title="总数" :value="summary.total" /></a-col>
      <a-col :span="6"><a-statistic title="通过" :value="summary.passed" value-style="color: #16a34a" /></a-col>
      <a-col :span="6"><a-statistic title="失败" :value="summary.failed" value-style="color: #dc2626" /></a-col>
      <a-col :span="6"><a-statistic title="通过率" :value="summary.passRate" suffix="%" /></a-col>
    </a-row>
    <div v-if="summary?.byStatus?.length" class="chart-row">
      <div v-for="item in summary.byStatus" :key="item.name" class="chart-bar">
        <span>{{ item.name }}</span>
        <a-progress :percent="percent(item.value, summary.total)" :show-info="true" :format="() => String(item.value)" />
      </div>
    </div>
    <a-empty v-if="!selectedRunId" description="请选择执行批次查看报表" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useApiTestStore } from '@/stores/apiTest';

const apiStore = useApiTestStore();
const selectedRunId = ref('');
const summary = ref<{
  total: number;
  passed: number;
  failed: number;
  error: number;
  passRate: number;
  byStatus: Array<{ name: string; value: number }>;
} | null>(null);

const runOptions = computed(() =>
  apiStore.transactionRuns.map((r) => ({
    label: `${new Date(r.createdAt).toLocaleString()} — ${r.passedCount}/${r.totalCount}`,
    value: r.id,
  })),
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
  )) as typeof summary.value;
});

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

async function exportXlsx() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId || !selectedRunId.value) return;
  await apiStore.exportReport(projectId, transactionId, selectedRunId.value, 'xlsx');
}

async function exportPdf() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId || !selectedRunId.value) return;
  await apiStore.exportReport(projectId, transactionId, selectedRunId.value, 'pdf');
}
</script>

<style scoped>
.stats-row { margin-bottom: 20px; }
.chart-row { max-width: 480px; }
.chart-bar { margin-bottom: 12px; }
.chart-bar span { display: block; margin-bottom: 4px; font-size: 13px; }
</style>
