<template>
  <section class="panel">
    <div class="panel-header">
      <div><h2>接口测试案例</h2><p>AI 生成 + 手工维护，支持单条/多选执行</p></div>
      <div class="toolbar action-toolbar">
        <a-button type="primary" :disabled="!apiStore.canEnterCases" @click="onGenerate">AI 生成案例</a-button>
        <a-button :disabled="!apiStore.canEnterCases" @click="openCreate">新建案例</a-button>
        <a-button
          :disabled="!selectedIds.length || !apiStore.selectedEnvironmentId"
          :loading="apiStore.running"
          @click="onRunSelected"
        >执行选中 ({{ selectedIds.length }})</a-button>
      </div>
    </div>
    <a-table
      size="small"
      row-key="id"
      :data-source="apiStore.cases"
      :columns="columns"
      :row-selection="rowSelection"
      :pagination="{ pageSize: 12 }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'actions'">
          <a-space>
            <a-button type="link" size="small" @click="openEdit(record)">编辑</a-button>
            <a-button type="link" size="small" @click="onRunOne(record.id)">执行</a-button>
            <a-button type="link" size="small" danger @click="onDelete(record.id)">删除</a-button>
          </a-space>
        </template>
        <template v-else-if="column.key === 'endpoint'">
          {{ record.endpoint?.method }} {{ record.endpoint?.path }}
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalOpen" :title="editingId ? '编辑案例' : '新建案例'" width="720px" @ok="onSave">
      <a-form layout="vertical">
        <a-form-item label="绑定接口" required>
          <a-select v-model:value="form.endpointId" :options="endpointOptions" placeholder="选择接口" />
        </a-form-item>
        <a-form-item label="标题" required><a-input v-model:value="form.title" /></a-form-item>
        <a-form-item label="描述"><a-textarea v-model:value="form.description" :rows="2" /></a-form-item>
        <a-row :gutter="12">
          <a-col :span="8"><a-form-item label="优先级"><a-select v-model:value="form.priority" :options="priorityOptions" /></a-form-item></a-col>
          <a-col :span="8"><a-form-item label="类型"><a-select v-model:value="form.polarity" :options="polarityOptions" /></a-form-item></a-col>
          <a-col :span="8"><a-form-item label="启用"><a-switch v-model:checked="form.enabled" /></a-form-item></a-col>
        </a-row>
        <a-form-item label="请求 JSON">
          <a-textarea v-model:value="form.requestJson" :rows="6" />
        </a-form-item>
        <a-form-item label="预期 JSON">
          <a-textarea v-model:value="form.expectedJson" :rows="4" />
        </a-form-item>
      </a-form>
    </a-modal>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useApiTestStore } from '@/stores/apiTest';
import type { ApiTestCaseRow } from '@/api/apiTestClient';

const apiStore = useApiTestStore();
const modalOpen = ref(false);
const editingId = ref('');
const selectedIds = computed(() => apiStore.selectedCaseIds);
const projectId = computed(() => apiStore.activeProjectId ?? '');
const transactionId = computed(() => apiStore.activeTransactionId ?? '');

const form = reactive({
  endpointId: '',
  title: '',
  description: '',
  priority: 'P1',
  polarity: 'positive',
  enabled: true,
  requestJson: '{\n  "method": "GET",\n  "path": "/api/example",\n  "headers": {},\n  "body": {}\n}',
  expectedJson: '{\n  "statusCode": 200,\n  "statusOnly": true\n}',
});

const priorityOptions = ['P0', 'P1', 'P2'].map((v) => ({ label: v, value: v }));
const polarityOptions = [
  { label: '正向', value: 'positive' },
  { label: '反向', value: 'negative' },
];

const endpointOptions = computed(() =>
  (apiStore.apiDoc?.endpoints ?? []).map((e) => ({
    label: `${e.method} ${e.path}`,
    value: e.id,
  })),
);

const columns = [
  { title: '标题', dataIndex: 'title', key: 'title' },
  { title: '接口', key: 'endpoint' },
  { title: '优先级', dataIndex: 'priority', width: 72 },
  { title: '类型', dataIndex: 'polarity', width: 72 },
  { title: '来源', dataIndex: ['metadata', 'source'], width: 80 },
  { title: '操作', key: 'actions', width: 200 },
];

const rowSelection = computed(() => ({
  selectedRowKeys: apiStore.selectedCaseIds,
  onChange: (keys: string[]) => {
    apiStore.selectedCaseIds = keys;
  },
}));

function resetForm(row?: ApiTestCaseRow) {
  if (row) {
    editingId.value = row.id;
    form.endpointId = row.endpointId;
    form.title = row.title;
    form.description = row.description;
    form.priority = row.priority;
    form.polarity = row.polarity;
    form.enabled = row.enabled;
    form.requestJson = JSON.stringify(row.request, null, 2);
    form.expectedJson = JSON.stringify(row.expected, null, 2);
  } else {
    editingId.value = '';
    const first = apiStore.apiDoc?.endpoints?.[0];
    form.endpointId = first?.id ?? '';
    form.title = '';
    form.description = '';
    form.priority = 'P1';
    form.polarity = 'positive';
    form.enabled = true;
    if (first) {
      form.requestJson = JSON.stringify(
        { method: first.method, path: first.path, headers: { 'Content-Type': 'application/json' }, body: {} },
        null,
        2,
      );
    }
    form.expectedJson = JSON.stringify({ statusCode: 200, statusOnly: true }, null, 2);
  }
}

function openCreate() {
  resetForm();
  modalOpen.value = true;
}

function openEdit(row: ApiTestCaseRow) {
  resetForm(row);
  modalOpen.value = true;
}

async function onSave() {
  if (!projectId.value || !transactionId.value) return;
  const payload = {
    endpointId: form.endpointId,
    title: form.title,
    description: form.description,
    priority: form.priority,
    polarity: form.polarity,
    enabled: form.enabled,
    status: 'ready',
    request: JSON.parse(form.requestJson),
    expected: JSON.parse(form.expectedJson),
  };
  await apiStore.saveCase(
    projectId.value,
    transactionId.value,
    payload,
    editingId.value || undefined,
  );
  modalOpen.value = false;
}

async function onGenerate() {
  if (!projectId.value || !transactionId.value) return;
  await apiStore.generateCases(projectId.value, transactionId.value);
}

async function onDelete(caseId: string) {
  if (!projectId.value || !transactionId.value) return;
  await apiStore.removeCase(projectId.value, transactionId.value, caseId);
}

async function onRunOne(caseId: string) {
  if (!projectId.value || !transactionId.value) return;
  const run = await apiStore.executeCases(projectId.value, transactionId.value, [caseId]);
  if (run) apiStore.setWorkspaceStage(projectId.value, transactionId.value, 'api-runner');
}

async function onRunSelected() {
  if (!projectId.value || !transactionId.value || !selectedIds.value.length) return;
  const run = await apiStore.executeCases(
    projectId.value,
    transactionId.value,
    [...selectedIds.value],
  );
  if (run) apiStore.setWorkspaceStage(projectId.value, transactionId.value, 'api-runner');
}
</script>
