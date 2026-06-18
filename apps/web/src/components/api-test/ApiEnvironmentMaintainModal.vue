<template>
  <a-modal
    v-model:open="open"
    title="环境维护"
    width="1280px"
    :footer="null"
    destroy-on-close
    @after-open="onOpen"
  >
    <div class="env-maintain-layout">
      <aside class="env-maintain-envs">
        <div class="env-maintain-head">
          <strong>环境配置</strong>
          <a-button size="small" type="primary" @click="openEnvCreate">新增环境</a-button>
        </div>
        <div class="env-maintain-groups">
          <section
            v-for="group in envGroups"
            :key="group.scope"
            class="env-scope-group"
          >
            <div class="env-scope-title">{{ group.label }}</div>
            <div class="env-maintain-list">
              <button
                v-for="env in group.items"
                :key="env.id"
                type="button"
                class="env-maintain-item"
                :class="{ active: env.id === activeEnvId }"
                @click="selectEnv(env.id)"
              >
                <strong>{{ env.name }}</strong>
              </button>
              <div v-if="!group.items.length" class="env-scope-empty">暂无环境</div>
            </div>
          </section>
        </div>
      </aside>

      <section v-if="activeEnvId" class="env-maintain-services">
        <div class="env-maintain-head">
          <strong>{{ activeEnvName }}</strong>
          <a-space>
            <a-button size="small" @click="openEnvEdit">编辑环境</a-button>
            <a-button size="small" danger @click="removeEnv">删除环境</a-button>
          </a-space>
        </div>
        <a-table
          size="small"
          row-key="id"
          :pagination="false"
          :data-source="services"
          :columns="serviceColumns"
          :scroll="{ x: 1100 }"
        >
          <template #headerCell="{ column }">
            <template v-if="column.key === 'actions'">
              <div class="service-actions-head">
                <span>{{ column.title }}</span>
                <a-button type="link" size="small" @click="openServiceCreate">+ 新增</a-button>
              </div>
            </template>
          </template>
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.key === 'index'">
              {{ index + 1 }}
            </template>
            <template v-else-if="column.key === 'name'">
              <a-button type="link" class="service-name-link" @click="openServiceEdit(record)">
                {{ record.name }}
              </a-button>
            </template>
            <template v-else-if="column.key === 'serverAddress'">
              <span class="service-cell-text" :title="record.serverAddress">{{ record.serverAddress || '—' }}</span>
            </template>
            <template v-else-if="column.key === 'jdbcUrl'">
              <span class="service-cell-text" :title="record.jdbcUrl">{{ record.jdbcUrl || '—' }}</span>
            </template>
            <template v-else-if="column.key === 'remoteConnection'">
              <span class="service-cell-text">{{ record.remoteConnection || '—' }}</span>
            </template>
            <template v-else-if="column.key === 'objectStorage'">
              <span class="service-cell-text">{{ record.objectStorage || '—' }}</span>
            </template>
            <template v-else-if="column.key === 'remark'">
              <span class="service-cell-text" :title="record.remark">{{ record.remark || '—' }}</span>
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space :size="4">
                <a-button
                  type="text"
                  danger
                  size="small"
                  title="删除"
                  @click="removeService(record.id)"
                >
                  <DeleteOutlined />
                </a-button>
                <a-button
                  type="text"
                  size="small"
                  title="上移"
                  :disabled="index === 0"
                  @click="moveService(record.id, 'up')"
                >
                  <ArrowUpOutlined />
                </a-button>
                <a-button
                  type="text"
                  size="small"
                  title="下移"
                  :disabled="index === services.length - 1"
                  @click="moveService(record.id, 'down')"
                >
                  <ArrowDownOutlined />
                </a-button>
                <a-button
                  type="text"
                  size="small"
                  title="置顶"
                  :disabled="index === 0"
                  @click="moveService(record.id, 'top')"
                >
                  <VerticalAlignTopOutlined />
                </a-button>
              </a-space>
            </template>
          </template>
        </a-table>
      </section>
      <a-empty v-else class="env-maintain-empty" description="请选择左侧环境" />
    </div>

    <a-modal
      v-model:open="envModalOpen"
      :title="envEditingId ? '编辑环境' : '新增'"
      @ok="saveEnv"
    >
      <a-form layout="vertical">
        <a-form-item label="环境类型" required>
          <a-radio-group v-model:value="envForm.scope" :options="scopeOptions" />
        </a-form-item>
        <a-form-item label="环境名称" required>
          <a-auto-complete
            v-model:value="envForm.name"
            :options="nameOptions"
            placeholder="请输入或选择环境名称"
            allow-clear
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="serviceModalOpen"
      :title="serviceEditingId ? '编辑服务' : '新增服务'"
      width="720px"
      @ok="saveService"
    >
      <a-form layout="vertical">
        <a-form-item label="服务名" required>
          <a-input v-model:value="serviceForm.name" placeholder="如 default、ESBJSON" />
        </a-form-item>
        <a-form-item label="服务器地址" required>
          <a-input
            v-model:value="serviceForm.serverAddress"
            placeholder="http://host:port/path 或 socket2://host:port"
          />
        </a-form-item>
        <a-form-item label="数据库连接">
          <a-input
            v-model:value="serviceForm.jdbcUrl"
            placeholder="jdbc:oracle:thin:@host:port:sid"
          />
        </a-form-item>
        <a-form-item label="远程连接">
          <a-input v-model:value="serviceForm.remoteConnection" />
        </a-form-item>
        <a-form-item label="对象存储">
          <a-input v-model:value="serviceForm.objectStorage" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="serviceForm.remark" :rows="2" />
        </a-form-item>
      </a-form>
    </a-modal>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons-vue';
import { Modal } from 'ant-design-vue';
import {
  API_ENVIRONMENT_PRESET_NAMES,
  API_ENVIRONMENT_SCOPE_LABEL,
  API_ENVIRONMENT_SCOPES,
  type ApiEnvironmentScope,
} from '@case-forge/shared';
import type { ApiEnvironmentServiceRow } from '@/api/apiTestClient';
import { useApiTestStore } from '@/stores/apiTest';

const open = defineModel<boolean>('open', { default: false });
const apiStore = useApiTestStore();
const activeEnvId = ref('');
const envModalOpen = ref(false);
const envEditingId = ref('');
const serviceModalOpen = ref(false);
const serviceEditingId = ref('');

const envForm = reactive({
  scope: 'system' as ApiEnvironmentScope,
  name: '',
});

const serviceForm = reactive({
  name: '',
  serverAddress: '',
  jdbcUrl: '',
  remoteConnection: '',
  objectStorage: '',
  remark: '',
});

const scopeOptions = Object.entries(API_ENVIRONMENT_SCOPE_LABEL).map(([value, label]) => ({
  label,
  value,
}));

const nameOptions = API_ENVIRONMENT_PRESET_NAMES.map((name) => ({ value: name }));

const serviceColumns = [
  { title: '#', key: 'index', width: 44, align: 'center' as const },
  { title: '服务名', key: 'name', width: 140, ellipsis: true },
  { title: '服务器地址', key: 'serverAddress', width: 280, ellipsis: true },
  { title: '数据库连接', key: 'jdbcUrl', width: 260, ellipsis: true },
  { title: '远程连接', key: 'remoteConnection', width: 120, ellipsis: true },
  { title: '对象存储', key: 'objectStorage', width: 120, ellipsis: true },
  { title: '备注', key: 'remark', width: 160, ellipsis: true },
  { title: '操作', key: 'actions', width: 140, fixed: 'right' as const },
];

const services = computed(
  () => apiStore.environmentServices[activeEnvId.value] ?? [],
);

const activeEnvName = computed(() => {
  const env = apiStore.environments.find((item) => item.id === activeEnvId.value);
  return env?.name ?? '环境服务';
});

const envGroups = computed(() =>
  API_ENVIRONMENT_SCOPES.map((scope) => ({
    scope,
    label: API_ENVIRONMENT_SCOPE_LABEL[scope],
    items: apiStore.environments.filter((env) => (env.scope ?? 'system') === scope),
  })),
);

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
  envForm.scope = 'system';
  envForm.name = '';
  envModalOpen.value = true;
}

function openEnvEdit() {
  const env = apiStore.environments.find((item) => item.id === activeEnvId.value);
  if (!env) return;
  envEditingId.value = env.id;
  envForm.scope = env.scope ?? 'system';
  envForm.name = env.name;
  envModalOpen.value = true;
}

async function saveEnv() {
  const projectId = apiStore.activeProjectId;
  if (!projectId || !envForm.name.trim()) return;
  await apiStore.saveEnvironment(
    projectId,
    {
      name: envForm.name.trim(),
      scope: envForm.scope,
    },
    envEditingId.value || undefined,
  );
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
  serviceForm.serverAddress = '';
  serviceForm.jdbcUrl = '';
  serviceForm.remoteConnection = '';
  serviceForm.objectStorage = '';
  serviceForm.remark = '';
  serviceModalOpen.value = true;
}

function openServiceEdit(row: ApiEnvironmentServiceRow) {
  serviceEditingId.value = row.id;
  serviceForm.name = row.name;
  serviceForm.serverAddress = row.serverAddress ?? '';
  serviceForm.jdbcUrl = row.jdbcUrl ?? '';
  serviceForm.remoteConnection = row.remoteConnection ?? '';
  serviceForm.objectStorage = row.objectStorage ?? '';
  serviceForm.remark = row.remark ?? '';
  serviceModalOpen.value = true;
}

async function saveService() {
  const projectId = apiStore.activeProjectId;
  if (!projectId || !activeEnvId.value || !serviceForm.name.trim()) return;
  if (!serviceForm.serverAddress.trim()) return;
  const payload = {
    name: serviceForm.name.trim(),
    serverAddress: serviceForm.serverAddress.trim(),
    jdbcUrl: serviceForm.jdbcUrl.trim() || undefined,
    remoteConnection: serviceForm.remoteConnection.trim() || undefined,
    objectStorage: serviceForm.objectStorage.trim() || undefined,
    remark: serviceForm.remark.trim() || undefined,
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

async function moveService(serviceId: string, direction: 'up' | 'down' | 'top') {
  const projectId = apiStore.activeProjectId;
  if (!projectId || !activeEnvId.value) return;
  await apiStore.reorderEnvironmentService(
    projectId,
    activeEnvId.value,
    serviceId,
    direction,
  );
}
</script>

<style scoped>
.env-maintain-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 16px;
  min-height: 420px;
}
.env-maintain-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.env-maintain-groups {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.env-scope-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.env-scope-title {
  font-size: 13px;
  font-weight: 600;
  color: #344054;
}
.env-scope-empty {
  padding: 8px 0;
  font-size: 12px;
  color: #98a2b3;
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
.service-actions-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.service-name-link {
  padding: 0;
  height: auto;
}
.service-cell-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.env-maintain-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
