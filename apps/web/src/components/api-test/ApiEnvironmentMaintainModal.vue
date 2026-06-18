<template>
  <a-modal
    v-model:open="open"
    title="环境维护"
    width="1280px"
    :footer="null"
    destroy-on-close
    class="env-maintain-modal"
    @after-open="onOpen"
  >
    <div class="env-maintain-layout">
      <!-- 左侧：环境列表 -->
      <aside class="env-sidebar">
        <div class="env-sidebar-head">
          <span class="env-sidebar-title">
            <AppstoreOutlined />
            环境配置
          </span>
          <a-button size="small" type="primary" @click="openEnvCreate">
            <template #icon><PlusOutlined /></template>
            新增
          </a-button>
        </div>
        <div class="env-sidebar-body">
          <div class="env-search-box">
            <a-input
              v-model:value="envSearchKeyword"
              size="small"
              placeholder="搜索环境名称…"
              allow-clear
            >
              <template #prefix>
                <SearchOutlined class="env-search-icon" />
              </template>
            </a-input>
          </div>
          <section
            v-for="group in envGroups"
            :key="group.scope"
            class="env-scope-group"
            :class="{ collapsed: collapsedScopes.has(group.scope) }"
          >
            <button
              type="button"
              class="env-scope-header"
              @click="toggleScope(group.scope)"
            >
              <span class="env-scope-toggle">
                <RightOutlined v-if="collapsedScopes.has(group.scope)" />
                <DownOutlined v-else />
              </span>
              <span class="env-scope-dot" :class="`scope-${group.scope}`" />
              <span class="env-scope-label">{{ group.label }}</span>
              <span class="env-scope-count">{{ group.items.length }}</span>
            </button>
            <div v-show="!collapsedScopes.has(group.scope)" class="env-scope-list">
              <button
                v-for="env in group.items"
                :key="env.id"
                type="button"
                class="env-card"
                :class="{ active: env.id === activeEnvId }"
                :title="env.name"
                @click="selectEnv(env.id)"
              >
                <span class="env-card-name">{{ env.name }}</span>
                <a-tag v-if="env.isDefault" class="env-default-tag" :bordered="false">默认</a-tag>
              </button>
              <div v-if="!group.items.length" class="env-scope-empty">
                <InboxOutlined />
                <span>{{ envSearchKeyword ? '无匹配环境' : '暂无环境' }}</span>
              </div>
            </div>
          </section>
        </div>
      </aside>

      <!-- 右侧：服务配置 -->
      <section v-if="activeEnvId" class="env-detail">
        <div class="env-detail-head">
          <div class="env-detail-title">
            <span class="env-detail-name" :title="activeEnvName">{{ activeEnvName }}</span>
            <a-tag v-if="activeEnvScope" class="env-scope-badge" :bordered="false">{{ activeEnvScopeLabel }}</a-tag>
          </div>
          <a-space :size="6">
            <a-button size="small" @click="openEnvEdit">
              <template #icon><EditOutlined /></template>
              编辑
            </a-button>
            <a-button size="small" danger @click="removeEnv">
              <template #icon><DeleteOutlined /></template>
              删除
            </a-button>
          </a-space>
        </div>

        <div class="env-table-wrapper">
          <div v-if="!services.length" class="env-services-empty">
            <InboxOutlined class="env-services-empty-icon" />
            <p class="env-services-empty-text">暂无服务配置</p>
            <a-button type="primary" size="small" ghost @click="openServiceCreate">
              <template #icon><PlusOutlined /></template>
              新增服务
            </a-button>
          </div>
          <a-table
            v-else
            size="small"
            row-key="id"
            :pagination="false"
            :data-source="services"
            :columns="serviceColumns"
            :scroll="{ x: 1100 }"
            class="env-service-table"
          >
            <template #headerCell="{ column }">
              <template v-if="column.key === 'actions'">
                <div class="service-actions-head">
                  <span>{{ column.title }}</span>
                  <a-button type="link" size="small" @click="openServiceCreate">
                    <PlusOutlined />
                    新增
                  </a-button>
                </div>
              </template>
            </template>
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'index'">
                <span class="service-row-index">{{ index + 1 }}</span>
              </template>
              <template v-else-if="column.key === 'name'">
                <a-tooltip :title="record.name" placement="topLeft" :mouse-enter-delay="0.3">
                  <a-button type="link" class="service-name-link" @click="openServiceEdit(record)">
                    {{ record.name }}
                  </a-button>
                </a-tooltip>
              </template>
              <template v-else-if="column.key === 'serverAddress'">
                <a-tooltip v-if="record.serverAddress" placement="topLeft" :mouse-enter-delay="0.3">
                  <template #title>
                    <span class="service-cell-tooltip">{{ record.serverAddress }}</span>
                  </template>
                  <span class="service-cell-text">{{ record.serverAddress }}</span>
                </a-tooltip>
                <span v-else class="service-cell-text service-cell-empty">—</span>
              </template>
              <template v-else-if="column.key === 'jdbcUrl'">
                <a-tooltip v-if="record.jdbcUrl" placement="topLeft" :mouse-enter-delay="0.3">
                  <template #title>
                    <span class="service-cell-tooltip">{{ record.jdbcUrl }}</span>
                  </template>
                  <span class="service-cell-text">{{ record.jdbcUrl }}</span>
                </a-tooltip>
                <span v-else class="service-cell-text service-cell-empty">—</span>
              </template>
              <template v-else-if="column.key === 'remoteConnection'">
                <a-tooltip v-if="record.remoteConnection" placement="topLeft" :mouse-enter-delay="0.3">
                  <template #title>
                    <span class="service-cell-tooltip">{{ record.remoteConnection }}</span>
                  </template>
                  <span class="service-cell-text">{{ record.remoteConnection }}</span>
                </a-tooltip>
                <span v-else class="service-cell-text service-cell-empty">—</span>
              </template>
              <template v-else-if="column.key === 'objectStorage'">
                <a-tooltip v-if="record.objectStorage" placement="topLeft" :mouse-enter-delay="0.3">
                  <template #title>
                    <span class="service-cell-tooltip">{{ record.objectStorage }}</span>
                  </template>
                  <span class="service-cell-text">{{ record.objectStorage }}</span>
                </a-tooltip>
                <span v-else class="service-cell-text service-cell-empty">—</span>
              </template>
              <template v-else-if="column.key === 'remark'">
                <a-tooltip v-if="record.remark" placement="topLeft" :mouse-enter-delay="0.3">
                  <template #title>
                    <span class="service-cell-tooltip">{{ record.remark }}</span>
                  </template>
                  <span class="service-cell-text">{{ record.remark }}</span>
                </a-tooltip>
                <span v-else class="service-cell-text service-cell-empty">—</span>
              </template>
              <template v-else-if="column.key === 'actions'">
                <a-space :size="2">
                  <a-button
                    type="text"
                    size="small"
                    title="置顶"
                    :disabled="index === 0"
                    @click="moveService(record.id, 'top')"
                  >
                    <VerticalAlignTopOutlined />
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
                  <a-divider type="vertical" class="service-action-divider" />
                  <a-button
                    type="text"
                    danger
                    size="small"
                    title="删除"
                    @click="removeService(record.id)"
                  >
                    <DeleteOutlined />
                  </a-button>
                </a-space>
              </template>
            </template>
          </a-table>
        </div>
      </section>

      <!-- 右侧空状态 -->
      <section v-else class="env-detail env-detail-placeholder">
        <div class="env-placeholder-inner">
          <AppstoreOutlined class="env-placeholder-icon" />
          <p class="env-placeholder-text">请选择左侧环境查看服务配置</p>
        </div>
      </section>
    </div>

    <a-modal
      v-model:open="envModalOpen"
      :title="envEditingId ? '编辑环境' : '新增环境'"
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
  AppstoreOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
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
const envSearchKeyword = ref('');
const collapsedScopes = reactive(new Set<ApiEnvironmentScope>());

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

const activeEnvScope = computed(() => {
  const env = apiStore.environments.find((item) => item.id === activeEnvId.value);
  return env?.scope ?? 'system';
});

const activeEnvScopeLabel = computed(() =>
  API_ENVIRONMENT_SCOPE_LABEL[activeEnvScope.value] ?? '',
);

const envGroups = computed(() => {
  const keyword = envSearchKeyword.value.trim().toLowerCase();
  return API_ENVIRONMENT_SCOPES.map((scope) => ({
    scope,
    label: API_ENVIRONMENT_SCOPE_LABEL[scope],
    items: apiStore.environments.filter((env) => {
      if ((env.scope ?? 'system') !== scope) return false;
      if (!keyword) return true;
      return env.name.toLowerCase().includes(keyword);
    }),
  }));
});

function toggleScope(scope: ApiEnvironmentScope) {
  if (collapsedScopes.has(scope)) {
    collapsedScopes.delete(scope);
  } else {
    collapsedScopes.add(scope);
  }
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
/* ===== 布局 ===== */
.env-maintain-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 20px;
  min-height: 460px;
}

/* ===== 左侧侧边栏 ===== */
.env-sidebar {
  display: flex;
  flex-direction: column;
  background: #fafbfc;
  border: 1px solid var(--cf-border, #e4e7ec);
  border-radius: 10px;
  overflow: hidden;
}
.env-sidebar-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--cf-border, #e4e7ec);
  background: var(--cf-surface, #fff);
}
.env-sidebar-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--cf-text, #1d2939);
}
.env-sidebar-title :deep(.anticon) {
  font-size: 15px;
  color: var(--cf-text-secondary, #667085);
}
.env-sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ===== 搜索框 ===== */
.env-search-box {
  margin-bottom: 2px;
}
.env-search-box :deep(.ant-input-affix-wrapper-sm) {
  border-radius: 8px;
  background: var(--cf-surface, #fff);
}
.env-search-icon {
  color: var(--cf-text-muted, #98a2b3);
  font-size: 13px;
}

/* ===== 环境分组 ===== */
.env-scope-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.env-scope-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--cf-text-muted, #98a2b3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  transition: color 0.15s ease;
}
.env-scope-header:hover {
  color: var(--cf-text-secondary, #667085);
}
.env-scope-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  font-size: 10px;
  color: var(--cf-text-muted, #98a2b3);
  flex-shrink: 0;
}
.env-scope-label {
  flex: 1;
  text-align: left;
}
.env-scope-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #f0f1f3;
  font-size: 11px;
  font-weight: 600;
  color: var(--cf-text-muted, #98a2b3);
  flex-shrink: 0;
}
.env-scope-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.env-scope-dot.scope-global { background: #6366f1; }
.env-scope-dot.scope-system { background: var(--cf-brand, #b60f2d); }
.env-scope-dot.scope-personal { background: #f59e0b; }

.env-scope-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ===== 环境卡片 ===== */
.env-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--cf-border, #e4e7ec);
  border-left: 3px solid transparent;
  border-radius: 8px;
  background: var(--cf-surface, #fff);
  cursor: pointer;
  text-align: left;
  transition: all 0.18s ease;
  font-size: 13px;
}
.env-card:hover {
  border-color: var(--cf-brand-border, #e7b8c0);
  background: var(--cf-brand-soft, #fff5f6);
}
.env-card.active {
  border-left-color: var(--cf-brand, #b60f2d);
  border-color: var(--cf-brand-border, #e7b8c0);
  background: var(--cf-brand-soft, #fff5f6);
  font-weight: 600;
}
.env-card-name {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
  word-break: break-all;
  color: var(--cf-text, #1d2939);
}
.env-default-tag {
  font-size: 11px;
  line-height: 1.4;
  margin: 0;
  padding: 0 6px;
  background: #eff6ff;
  color: #2563eb;
}

/* ===== 空环境提示 ===== */
.env-scope-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px 0;
  font-size: 12px;
  color: var(--cf-text-muted, #98a2b3);
}
.env-scope-empty :deep(.anticon) {
  font-size: 22px;
  opacity: 0.4;
}

/* ===== 右侧详情区 ===== */
.env-detail {
  display: flex;
  flex-direction: column;
  background: var(--cf-surface, #fff);
  border: 1px solid var(--cf-border, #e4e7ec);
  border-radius: 10px;
  overflow: hidden;
}
.env-detail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--cf-border, #e4e7ec);
}
.env-detail-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.env-detail-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--cf-text, #1d2939);
  max-width: 500px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.env-scope-badge {
  font-size: 11px;
  line-height: 1.4;
  padding: 0 6px;
  background: #f0f1f3;
  color: var(--cf-text-secondary, #667085);
}

/* ===== 表格容器 ===== */
.env-table-wrapper {
  flex: 1;
  padding: 16px 20px;
  overflow: auto;
}
.env-service-table :deep(.ant-table) {
  border-radius: 8px;
  overflow: hidden;
}
.env-service-table :deep(.ant-table-thead > tr > th) {
  background: #f7f8fa;
  font-size: 12px;
  font-weight: 600;
  color: var(--cf-text-body, #344054);
}
.env-service-table :deep(.ant-table-tbody > tr > td) {
  font-size: 13px;
}
.env-service-table :deep(.ant-table-tbody > tr:hover > td) {
  background: #fafbfc;
}
.service-row-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #f0f1f3;
  font-size: 11px;
  font-weight: 600;
  color: var(--cf-text-secondary, #667085);
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
  font-weight: 500;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.service-cell-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--cf-text-body, #344054);
  cursor: default;
}
.service-cell-empty {
  color: var(--cf-text-muted, #98a2b3);
  cursor: default;
}
.service-cell-tooltip {
  word-break: break-all;
  max-width: 600px;
  display: inline-block;
}
.service-action-divider {
  margin: 0 2px;
  height: 14px;
}

/* ===== 服务空状态 ===== */
.env-services-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 0;
}
.env-services-empty-icon {
  font-size: 40px;
  color: var(--cf-text-muted, #98a2b3);
  opacity: 0.35;
}
.env-services-empty-text {
  margin: 0;
  font-size: 13px;
  color: var(--cf-text-muted, #98a2b3);
}

/* ===== 右侧占位 ===== */
.env-detail-placeholder {
  align-items: center;
  justify-content: center;
}
.env-placeholder-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.env-placeholder-icon {
  font-size: 48px;
  color: var(--cf-text-muted, #98a2b3);
  opacity: 0.25;
}
.env-placeholder-text {
  margin: 0;
  font-size: 14px;
  color: var(--cf-text-muted, #98a2b3);
}
</style>
