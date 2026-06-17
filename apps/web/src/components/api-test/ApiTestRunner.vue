<template>
  <section class="panel constraint-panel dynamic-instruction-panel api-runner-panel">
    <div class="panel-header dynamic-panel-header">
      <div class="dynamic-panel-intro">
        <div>
          <h2>执行平台</h2>
          <p>维护环境与执行集，查看执行状态与结果</p>
        </div>
      </div>
      <div class="toolbar dynamic-panel-toolbar action-toolbar">
        <a-select
          v-model:value="apiStore.selectedEnvironmentId"
          style="min-width: 180px"
          placeholder="选择环境"
          :options="envOptions"
          @change="onEnvChange"
        />
        <a-select
          v-model:value="apiStore.selectedEnvironmentServiceId"
          style="min-width: 180px"
          placeholder="环境服务（可选）"
          allow-clear
          :options="serviceOptions"
          :disabled="!apiStore.selectedEnvironmentId"
        />
        <a-button @click="envModalOpen = true">
          <template #icon><SettingOutlined /></template>
          环境维护
        </a-button>
        <a-button type="primary" @click="openCreateSet">
          <template #icon><PlusOutlined /></template>
          新建执行集
        </a-button>
      </div>
    </div>

    <div v-if="apiStore.executionSets.length" class="dynamic-layout">
      <div class="test-point-list test-point-list-panel">
        <div class="test-point-list-head">
          <strong>执行集</strong>
          <span>{{ apiStore.executionSets.length }} 个</span>
        </div>
        <div class="test-point-list-scroll">
          <article
            v-for="set in apiStore.executionSets"
            :key="set.id"
            class="test-point-card browse-card"
            :class="{ active: set.id === apiStore.activeExecutionSetId }"
            @click="selectSet(set.id)"
          >
            <div class="test-point-card-head">
              <div class="test-point-card-title">
                <strong>{{ set.name }}</strong>
                <small>{{ set.caseCount ?? 0 }} 条案例</small>
              </div>
              <div class="test-point-card-status">
                <a-tag v-if="set.lastRunStatus" :color="runStatusColor(set.lastRunStatus)">
                  {{ runStatusLabel(set) }}
                </a-tag>
                <a-tag v-else>未执行</a-tag>
              </div>
            </div>
          </article>
        </div>
        <div v-if="activeSet" class="exec-set-actions">
          <a-button block :disabled="!activeSet.caseCount" :loading="apiStore.running" @click="onRunSet">
            执行当前集
          </a-button>
          <a-button block @click="openManageCases">管理案例</a-button>
          <a-button block danger @click="onDeleteSet">删除执行集</a-button>
        </div>
      </div>

      <div class="instruction-editor instruction-editor-panel">
        <div v-if="apiStore.activeRun" class="instruction-editor-shell">
          <div class="instruction-editor-body">
            <a-descriptions bordered size="small" :column="3">
              <a-descriptions-item label="总数">{{ apiStore.activeRun.totalCount }}</a-descriptions-item>
              <a-descriptions-item label="通过">{{ apiStore.activeRun.passedCount }}</a-descriptions-item>
              <a-descriptions-item label="失败">
                {{ apiStore.activeRun.failedCount + apiStore.activeRun.errorCount }}
              </a-descriptions-item>
            </a-descriptions>
            <h3 class="run-history-title">执行历史</h3>
            <a-list size="small" :data-source="apiStore.transactionRuns" bordered>
              <template #renderItem="{ item }">
                <a-list-item
                  class="run-item"
                  :class="{ active: item.id === apiStore.activeRun?.id }"
                  @click="selectRun(item.id)"
                >
                  <div>
                    <div>{{ formatTime(item.createdAt) }}</div>
                    <small>通过 {{ item.passedCount }}/{{ item.totalCount }}</small>
                  </div>
                </a-list-item>
              </template>
            </a-list>
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
                          <a-tag :color="assertion.passed ? 'success' : 'error'">
                            {{ assertion.passed ? '通过' : '失败' }}
                          </a-tag>
                        </template>
                      </template>
                    </a-table>
                  </a-tab-pane>
                </a-tabs>
              </template>
            </a-table>
          </div>
        </div>
        <div v-else class="instruction-editor-placeholder">
          <a-empty description="选择执行集并执行后查看结果" />
        </div>
      </div>
    </div>

    <a-empty v-else class="empty-state" description="暂无执行集，请先新建并引入案例" />

    <ApiEnvironmentMaintainModal v-model:open="envModalOpen" />

    <a-modal v-model:open="createSetOpen" title="新建执行集" @ok="onCreateSet">
      <a-form layout="vertical">
        <a-form-item label="执行集名称" required>
          <a-input v-model:value="newSetName" placeholder="如 冒烟测试集" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="manageCasesOpen"
      title="管理执行集案例"
      width="640px"
      @ok="onSaveCases"
    >
      <p class="manage-hint">同一执行集内案例不可重复；同一案例可被多个执行集引用。</p>
      <a-checkbox-group v-model:value="selectedCaseIds" class="case-checkbox-group">
        <a-checkbox v-for="item in apiStore.runnerCases" :key="item.id" :value="item.id">
          {{ item.caseNo || item.title }}
        </a-checkbox>
      </a-checkbox-group>
    </a-modal>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Modal } from 'ant-design-vue';
import { PlusOutlined, SettingOutlined } from '@ant-design/icons-vue';
import ApiEnvironmentMaintainModal from '@/components/api-test/ApiEnvironmentMaintainModal.vue';
import { useApiTestStore } from '@/stores/apiTest';
import type { ApiExecutionSetRow } from '@/api/apiTestClient';

const apiStore = useApiTestStore();
const envModalOpen = ref(false);
const createSetOpen = ref(false);
const manageCasesOpen = ref(false);
const newSetName = ref('');
const selectedCaseIds = ref<string[]>([]);
const expandedKeys = ref<string[]>([]);

const activeSet = computed(() =>
  apiStore.executionSets.find((item) => item.id === apiStore.activeExecutionSetId) ?? null,
);

const envOptions = computed(() =>
  apiStore.environments.map((e) => ({ label: e.name, value: e.id })),
);

const serviceOptions = computed(() => {
  const services = apiStore.environmentServices[apiStore.selectedEnvironmentId] ?? [];
  return services.map((item) => ({
    label: item.pathPrefix ? `${item.name} (${item.pathPrefix})` : item.name,
    value: item.id,
  }));
});

watch(
  () => apiStore.selectedEnvironmentId,
  async (environmentId) => {
    const projectId = apiStore.activeProjectId;
    if (projectId && environmentId) {
      await apiStore.refreshEnvironmentServices(projectId, environmentId);
    }
    apiStore.selectedEnvironmentServiceId = '';
  },
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

function runStatusColor(status: string) {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'error';
  return 'processing';
}

function runStatusLabel(set: ApiExecutionSetRow) {
  if (!set.lastRunStatus) return '未执行';
  if (set.lastRunStatus === 'running') return '执行中';
  return `通过 ${set.lastPassedCount ?? 0}/${set.lastTotalCount ?? 0}`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

function onEnvChange() {
  apiStore.selectedEnvironmentServiceId = '';
}

function selectSet(setId: string) {
  apiStore.activeExecutionSetId = setId;
  const set = apiStore.executionSets.find((item) => item.id === setId);
  if (set?.lastRunId) {
    void loadRun(set.lastRunId);
  }
}

function openCreateSet() {
  newSetName.value = `${apiStore.activeTransaction?.code ?? '交易码'}-执行集`;
  createSetOpen.value = true;
}

async function onCreateSet() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId || !newSetName.value.trim()) return;
  await apiStore.createExecutionSet(projectId, transactionId, {
    name: newSetName.value.trim(),
  });
  createSetOpen.value = false;
}

function openManageCases() {
  selectedCaseIds.value = [...(activeSet.value?.caseIds ?? [])];
  manageCasesOpen.value = true;
}

async function onSaveCases() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  const setId = apiStore.activeExecutionSetId;
  if (!projectId || !transactionId || !setId) return;
  await apiStore.replaceExecutionSetCases(
    projectId,
    transactionId,
    setId,
    selectedCaseIds.value,
  );
  manageCasesOpen.value = false;
}

async function onRunSet() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  const setId = apiStore.activeExecutionSetId;
  if (!projectId || !transactionId || !setId) return;
  await apiStore.runExecutionSet(projectId, transactionId, setId);
}

function onDeleteSet() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  const setId = apiStore.activeExecutionSetId;
  if (!projectId || !transactionId || !setId) return;
  Modal.confirm({
    title: '删除执行集？',
    content: '删除后不影响案例本身，其它执行集仍可引用相同案例。',
    okText: '删除',
    cancelText: '取消',
    okType: 'danger',
    onOk: () => apiStore.removeExecutionSet(projectId, transactionId, setId),
  });
}

async function selectRun(runId: string) {
  await loadRun(runId);
}

async function loadRun(runId: string) {
  const projectId = apiStore.activeProjectId;
  if (!projectId) return;
  await apiStore.loadRun(projectId, runId);
}

function onExpand(expanded: boolean, record: { id: string }) {
  expandedKeys.value = expanded ? [record.id] : [];
}
</script>

<style scoped>
.api-runner-panel {
  min-height: 0;
}
.exec-set-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid #e4e7ec;
}
.run-history-title {
  margin: 16px 0 8px;
  font-size: 14px;
}
.run-item {
  cursor: pointer;
}
.run-item.active {
  background: var(--cf-brand-soft, #fff5f6);
}
.run-detail-table {
  margin-top: 12px;
}
.manage-hint {
  margin-bottom: 12px;
  color: #64748b;
  font-size: 13px;
}
.case-checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow: auto;
}
.empty-state {
  margin: 48px 0;
}
pre {
  font-size: 12px;
  max-height: 240px;
  overflow: auto;
  background: #f8fafc;
  padding: 8px;
  border-radius: 6px;
}
</style>
