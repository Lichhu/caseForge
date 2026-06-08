<template>
  <section class="panel">
    <div class="panel-header">
      <div><h2>执行平台</h2><p>查看请求过程、响应与断言比对</p></div>
      <a-select
        v-model:value="apiStore.selectedEnvironmentId"
        style="min-width: 220px"
        placeholder="选择环境"
        :options="envOptions"
      />
    </div>
    <ApiEnvironmentCenter />
    <a-row :gutter="16">
      <a-col :span="8">
        <h3>执行批次</h3>
        <a-list size="small" :data-source="apiStore.transactionRuns" bordered>
          <template #renderItem="{ item }">
            <a-list-item class="run-item" :class="{ active: item.id === activeRunId }" @click="selectRun(item.id)">
              <div>
                <div>{{ formatTime(item.createdAt) }}</div>
                <small>通过 {{ item.passedCount }}/{{ item.totalCount }}</small>
              </div>
            </a-list-item>
          </template>
        </a-list>
        <h3 class="case-list-title">案例快执</h3>
        <a-list size="small" :data-source="apiStore.cases" bordered>
          <template #renderItem="{ item }">
            <a-list-item>
              <span>{{ item.title }}</span>
              <a-button type="link" size="small" :loading="apiStore.running" @click="runOne(item.id)">执行</a-button>
            </a-list-item>
          </template>
        </a-list>
      </a-col>
      <a-col :span="16">
        <template v-if="apiStore.activeRun">
          <a-descriptions bordered size="small" :column="3">
            <a-descriptions-item label="总数">{{ apiStore.activeRun.totalCount }}</a-descriptions-item>
            <a-descriptions-item label="通过">{{ apiStore.activeRun.passedCount }}</a-descriptions-item>
            <a-descriptions-item label="失败">{{ apiStore.activeRun.failedCount + apiStore.activeRun.errorCount }}</a-descriptions-item>
          </a-descriptions>
          <a-table
            class="run-detail-table"
            size="small"
            row-key="id"
            :data-source="apiStore.activeRun.items"
            :columns="itemColumns"
            :pagination="false"
            :expanded-row-keys="expandedKeys"
            @expand="onExpand"
          >
            <template #expandedRowRender="{ record }">
              <a-tabs size="small">
                <a-tab-pane key="req" tab="请求">
                  <pre>{{ JSON.stringify(record.requestSnapshot, null, 2) }}</pre>
                </a-tab-pane>
                <a-tab-pane key="res" tab="响应">
                  <pre>{{ JSON.stringify(record.responseSnapshot, null, 2) }}</pre>
                </a-tab-pane>
                <a-tab-pane key="assert" tab="断言比对">
                  <a-table
                    size="small"
                    :pagination="false"
                    :data-source="record.assertions"
                    :columns="assertionColumns"
                    row-key="name"
                  >
                    <template #bodyCell="{ column, record: assertion }">
                      <template v-if="column.key === 'passed'">
                        <a-tag :color="assertion.passed ? 'success' : 'error'">{{ assertion.passed ? '通过' : '失败' }}</a-tag>
                      </template>
                    </template>
                  </a-table>
                </a-tab-pane>
              </a-tabs>
            </template>
          </a-table>
        </template>
        <a-empty v-else description="选择批次或执行案例后查看结果" />
      </a-col>
    </a-row>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import ApiEnvironmentCenter from '@/components/api-test/ApiEnvironmentCenter.vue';
import { useApiTestStore } from '@/stores/apiTest';

const apiStore = useApiTestStore();
const expandedKeys = ref<string[]>([]);
const activeRunId = computed(() => apiStore.activeRun?.id);

const envOptions = computed(() =>
  apiStore.environments.map((e) => ({ label: `${e.name} (${e.baseUrl})`, value: e.id })),
);

const itemColumns = [
  { title: '案例', dataIndex: 'caseTitle', key: 'caseTitle' },
  { title: '状态', dataIndex: 'status', width: 88 },
  { title: '耗时(ms)', dataIndex: 'durationMs', width: 96 },
];

const assertionColumns = [
  { title: '断言', dataIndex: 'name', key: 'name' },
  { title: '结果', key: 'passed', width: 72 },
  { title: '期望', dataIndex: 'expected', key: 'expected', ellipsis: true },
  { title: '实际', dataIndex: 'actual', key: 'actual', ellipsis: true },
];

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

async function selectRun(runId: string) {
  const projectId = apiStore.activeProjectId;
  if (!projectId) return;
  await apiStore.loadRun(projectId, runId);
}

function onExpand(expanded: boolean, record: { id: string }) {
  expandedKeys.value = expanded ? [record.id] : [];
}

async function runOne(caseId: string) {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) return;
  await apiStore.executeCases(projectId, transactionId, [caseId]);
}
</script>

<style scoped>
.run-item { cursor: pointer; }
.run-item.active { background: var(--cf-brand-soft, #fff5f6); }
.case-list-title { margin: 16px 0 8px; font-size: 14px; }
.run-detail-table { margin-top: 12px; }
pre { font-size: 12px; max-height: 240px; overflow: auto; background: #f8fafc; padding: 8px; border-radius: 6px; }
</style>
