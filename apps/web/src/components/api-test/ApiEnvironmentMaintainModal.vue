<template>
  <a-modal
    v-model:open="open"
    title="环境维护"
    width="960px"
    :footer="null"
    destroy-on-close
    @after-open="onOpen"
  >
    <div class="env-maintain-layout">
      <aside class="env-maintain-envs">
        <div class="env-maintain-head">
          <strong>环境</strong>
          <a-button size="small" type="primary" @click="openEnvCreate">新建</a-button>
        </div>
        <div class="env-maintain-list">
          <button
            v-for="env in apiStore.environments"
            :key="env.id"
            type="button"
            class="env-maintain-item"
            :class="{ active: env.id === activeEnvId }"
            @click="selectEnv(env.id)"
          >
            <strong>{{ env.name }}</strong>
            <small>{{ env.baseUrl }}</small>
          </button>
          <a-empty v-if="!apiStore.environments.length" description="暂无环境" />
        </div>
      </aside>

      <section v-if="activeEnvId" class="env-maintain-services">
        <div class="env-maintain-head">
          <strong>环境服务</strong>
          <a-space>
            <a-button size="small" @click="openEnvEdit">编辑环境</a-button>
            <a-button size="small" danger @click="removeEnv">删除环境</a-button>
            <a-button size="small" type="primary" @click="openServiceCreate">新建服务</a-button>
          </a-space>
        </div>
        <a-table
          size="small"
          row-key="id"
          :pagination="false"
          :data-source="services"
          :columns="serviceColumns"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'transport'">
              <a-tag :color="record.transport === 'tcp' ? 'orange' : 'blue'">
                {{ record.transport === 'tcp' ? 'TCP' : 'HTTP' }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'target'">
              {{ serviceTargetLabel(record) }}
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space>
                <a-button type="link" size="small" @click="openServiceEdit(record)">编辑</a-button>
                <a-button type="link" size="small" danger @click="removeService(record.id)">删除</a-button>
              </a-space>
            </template>
          </template>
        </a-table>
      </section>
      <a-empty v-else class="env-maintain-empty" description="请选择左侧环境" />
    </div>

    <a-modal
      v-model:open="envModalOpen"
      :title="envEditingId ? '编辑环境' : '新建环境'"
      @ok="saveEnv"
    >
      <a-form layout="vertical">
        <a-form-item label="环境名称" required><a-input v-model:value="envForm.name" /></a-form-item>
        <a-form-item label="Base URL / 连接地址" required>
          <a-input
            v-model:value="envForm.baseUrl"
            placeholder="HTTP: https://api.example.com · TCP: 32.114.71.6:60030"
          />
        </a-form-item>
        <a-alert
          type="info"
          show-icon
          message="HTTP 案例填 http(s):// 地址；TCP 案例填 host:port（如 32.114.71.6:60030）"
          style="margin-bottom: 12px"
        />
        <a-form-item label="Token"><a-input-password v-model:value="envForm.token" /></a-form-item>
        <a-form-item label="默认 Headers (JSON)"><a-textarea v-model:value="envForm.headersJson" :rows="2" /></a-form-item>
        <a-form-item label="变量 (JSON)"><a-textarea v-model:value="envForm.variablesJson" :rows="2" /></a-form-item>
        <a-form-item label="设为默认"><a-switch v-model:checked="envForm.isDefault" /></a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="serviceModalOpen"
      :title="serviceEditingId ? '编辑环境服务' : '新建环境服务'"
      @ok="saveService"
    >
      <a-form layout="vertical">
        <a-form-item label="服务名称" required><a-input v-model:value="serviceForm.name" /></a-form-item>
        <a-form-item label="传输协议" required>
          <a-segmented
            v-model:value="serviceForm.transport"
            :options="[
              { label: 'HTTP', value: 'http' },
              { label: 'TCP', value: 'tcp' },
            ]"
          />
        </a-form-item>
        <a-form-item label="报文格式">
          <a-select
            v-model:value="serviceForm.payloadFormat"
            :options="[
              { label: 'JSON', value: 'json' },
              { label: 'XML', value: 'xml' },
              { label: 'TEXT', value: 'text' },
              { label: 'SOAP', value: 'soap' },
              { label: 'OTHER', value: 'other' },
            ]"
          />
        </a-form-item>
        <template v-if="serviceForm.transport === 'http'">
          <a-form-item label="服务 Base URL">
            <a-input v-model:value="serviceForm.baseUrl" placeholder="留空则继承环境 Base URL，如 http://localhost:8080" />
          </a-form-item>
          <a-form-item label="路径前缀"><a-input v-model:value="serviceForm.pathPrefix" placeholder="如 /gateway" /></a-form-item>
          <a-form-item label="Headers (JSON)"><a-textarea v-model:value="serviceForm.headersJson" :rows="2" /></a-form-item>
        </template>
        <template v-else>
          <a-form-item label="Host" required><a-input v-model:value="serviceForm.host" placeholder="如 32.114.71.6" /></a-form-item>
          <a-form-item label="Port" required><a-input-number v-model:value="serviceForm.port" :min="1" :max="65535" style="width: 100%" /></a-form-item>
          <a-form-item label="编码"><a-select v-model:value="serviceForm.encoding" :options="encodingOptions" /></a-form-item>
          <a-form-item label="长度前缀位数"><a-input-number v-model:value="serviceForm.lengthPrefixWidth" :min="0" :max="16" style="width: 100%" /></a-form-item>
        </template>
        <a-form-item label="变量 (JSON)"><a-textarea v-model:value="serviceForm.variablesJson" :rows="2" /></a-form-item>
      </a-form>
    </a-modal>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { Modal } from 'ant-design-vue';
import type { ApiEnvironmentRow, ApiEnvironmentServiceRow } from '@/api/apiTestClient';
import { useApiTestStore } from '@/stores/apiTest';

const open = defineModel<boolean>('open', { default: false });
const apiStore = useApiTestStore();
const activeEnvId = ref('');
const envModalOpen = ref(false);
const envEditingId = ref('');
const serviceModalOpen = ref(false);
const serviceEditingId = ref('');

const envForm = reactive({
  name: '',
  baseUrl: '',
  token: '',
  headersJson: '{}',
  variablesJson: '{}',
  isDefault: false,
});

const serviceForm = reactive({
  name: '',
  transport: 'http' as 'http' | 'tcp',
  payloadFormat: 'json',
  baseUrl: '',
  pathPrefix: '',
  host: '',
  port: undefined as number | undefined,
  encoding: 'UTF-8',
  lengthPrefixWidth: 0,
  headersJson: '{}',
  variablesJson: '{}',
});

const encodingOptions = [
  { label: 'UTF-8', value: 'UTF-8' },
  { label: 'GBK', value: 'GBK' },
];

const serviceColumns = [
  { title: '服务名', dataIndex: 'name', key: 'name' },
  { title: '协议', key: 'transport', width: 84 },
  { title: '格式', dataIndex: 'payloadFormat', key: 'payloadFormat', width: 84 },
  { title: '目标地址', key: 'target', ellipsis: true },
  { title: '操作', key: 'actions', width: 120 },
];

const services = computed(
  () => apiStore.environmentServices[activeEnvId.value] ?? [],
);

function serviceTargetLabel(row: ApiEnvironmentServiceRow) {
  if ((row.transport ?? 'http') === 'tcp') {
    return row.host && row.port ? `${row.host}:${row.port}` : '未配置 TCP 地址';
  }
  const base = row.baseUrl || '继承环境 Base URL';
  return row.pathPrefix ? `${base}${row.pathPrefix.startsWith('/') ? row.pathPrefix : `/${row.pathPrefix}`}` : base;
}

watch(
  () => apiStore.selectedEnvironmentId,
  (id) => {
    if (id && !activeEnvId.value) activeEnvId.value = id;
  },
);

async function onOpen() {
  const projectId = apiStore.activeProjectId;
  if (!projectId) return;
  await apiStore.refreshEnvironments(projectId);
  activeEnvId.value =
    apiStore.selectedEnvironmentId || apiStore.environments[0]?.id || '';
  if (activeEnvId.value) {
    await apiStore.refreshEnvironmentServices(projectId, activeEnvId.value);
  }
}

async function selectEnv(environmentId: string) {
  activeEnvId.value = environmentId;
  const projectId = apiStore.activeProjectId;
  if (projectId) {
    await apiStore.refreshEnvironmentServices(projectId, environmentId);
  }
}

function openEnvCreate() {
  envEditingId.value = '';
  envForm.name = 'DEV';
  envForm.baseUrl = 'http://localhost:8080';
  envForm.token = '';
  envForm.headersJson = JSON.stringify({ 'Content-Type': 'application/json' }, null, 2);
  envForm.variablesJson = '{}';
  envForm.isDefault = apiStore.environments.length === 0;
  envModalOpen.value = true;
}

function openEnvEdit() {
  const env = apiStore.environments.find((item) => item.id === activeEnvId.value);
  if (!env) return;
  envEditingId.value = env.id;
  envForm.name = env.name;
  envForm.baseUrl = env.baseUrl;
  envForm.token = '';
  envForm.headersJson = JSON.stringify(env.headers ?? {}, null, 2);
  envForm.variablesJson = JSON.stringify(env.variables ?? {}, null, 2);
  envForm.isDefault = env.isDefault;
  envModalOpen.value = true;
}

async function saveEnv() {
  const projectId = apiStore.activeProjectId;
  if (!projectId) return;
  const payload: Record<string, unknown> = {
    name: envForm.name,
    baseUrl: envForm.baseUrl,
    headers: JSON.parse(envForm.headersJson || '{}'),
    variables: JSON.parse(envForm.variablesJson || '{}'),
    isDefault: envForm.isDefault,
  };
  if (envForm.token) payload.token = envForm.token;
  await apiStore.saveEnvironment(projectId, payload, envEditingId.value || undefined);
  envModalOpen.value = false;
  if (!activeEnvId.value) {
    activeEnvId.value = apiStore.selectedEnvironmentId;
  }
  if (activeEnvId.value) {
    await apiStore.refreshEnvironmentServices(projectId, activeEnvId.value);
  }
}

function removeEnv() {
  const projectId = apiStore.activeProjectId;
  if (!projectId || !activeEnvId.value) return;
  Modal.confirm({
    title: '删除环境？',
    content: '将同时无法使用该环境下的服务配置。',
    okText: '删除',
    cancelText: '取消',
    okType: 'danger',
    onOk: async () => {
      await apiStore.removeEnvironment(projectId, activeEnvId.value);
      activeEnvId.value = apiStore.environments[0]?.id ?? '';
    },
  });
}

function openServiceCreate() {
  serviceEditingId.value = '';
  serviceForm.name = '';
  serviceForm.transport = 'http';
  serviceForm.payloadFormat = 'json';
  serviceForm.baseUrl = '';
  serviceForm.pathPrefix = '';
  serviceForm.host = '';
  serviceForm.port = undefined;
  serviceForm.encoding = 'UTF-8';
  serviceForm.lengthPrefixWidth = 0;
  serviceForm.headersJson = '{}';
  serviceForm.variablesJson = '{}';
  serviceModalOpen.value = true;
}

function openServiceEdit(row: ApiEnvironmentServiceRow) {
  serviceEditingId.value = row.id;
  serviceForm.name = row.name;
  serviceForm.transport = row.transport ?? 'http';
  serviceForm.payloadFormat = row.payloadFormat ?? (serviceForm.transport === 'tcp' ? 'xml' : 'json');
  serviceForm.baseUrl = row.baseUrl ?? '';
  serviceForm.pathPrefix = row.pathPrefix ?? '';
  serviceForm.host = row.host ?? '';
  serviceForm.port = row.port;
  serviceForm.encoding = row.encoding ?? 'UTF-8';
  serviceForm.lengthPrefixWidth = row.framing?.width ?? 0;
  serviceForm.headersJson = JSON.stringify(row.headers ?? {}, null, 2);
  serviceForm.variablesJson = JSON.stringify(row.variables ?? {}, null, 2);
  serviceModalOpen.value = true;
}

async function saveService() {
  const projectId = apiStore.activeProjectId;
  if (!projectId || !activeEnvId.value) return;
  const payload = {
    name: serviceForm.name,
    transport: serviceForm.transport,
    payloadFormat: serviceForm.payloadFormat,
    baseUrl: serviceForm.transport === 'http' ? serviceForm.baseUrl || undefined : undefined,
    pathPrefix: serviceForm.transport === 'http' ? serviceForm.pathPrefix || undefined : undefined,
    host: serviceForm.transport === 'tcp' ? serviceForm.host || undefined : undefined,
    port: serviceForm.transport === 'tcp' ? serviceForm.port : undefined,
    encoding: serviceForm.transport === 'tcp' ? serviceForm.encoding : undefined,
    framing:
      serviceForm.transport === 'tcp' && serviceForm.lengthPrefixWidth > 0
        ? { type: 'length-prefix', width: serviceForm.lengthPrefixWidth, encoding: serviceForm.encoding }
        : undefined,
    headers: serviceForm.transport === 'http' ? JSON.parse(serviceForm.headersJson || '{}') : {},
    variables: JSON.parse(serviceForm.variablesJson || '{}'),
  };
  await apiStore.saveEnvironmentService(
    projectId,
    activeEnvId.value,
    payload,
    serviceEditingId.value || undefined,
  );
  serviceModalOpen.value = false;
}

async function removeService(serviceId: string) {
  const projectId = apiStore.activeProjectId;
  if (!projectId || !activeEnvId.value) return;
  await apiStore.removeEnvironmentService(projectId, activeEnvId.value, serviceId);
}
</script>

<style scoped>
.env-maintain-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 16px;
  min-height: 360px;
}
.env-maintain-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.env-maintain-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.env-maintain-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  text-align: left;
}
.env-maintain-item.active {
  border-color: #f04438;
  background: #fff5f6;
}
.env-maintain-item small {
  color: #64748b;
  word-break: break-all;
}
.env-maintain-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
