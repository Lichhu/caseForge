<template>
  <a-modal v-model:open="open" title="数据库连接" width="820px" :footer="null" :z-index="IMMERSIVE_OVERLAY_Z_INDEX">
    <div class="db-connection-layout">
      <aside class="db-connection-list">
        <div class="db-connection-list-head"><strong>连接</strong><a-button type="primary" size="small" @click="createConnection"><PlusOutlined /> 新建</a-button></div>
        <button v-for="item in connections" :key="item.id" type="button" :class="{ active: item.id === activeId }" @click="selectConnection(item.id)">
          <DatabaseOutlined /><span><strong>{{ item.name }}</strong><small>{{ item.type }} · {{ item.host }}:{{ item.port }}</small></span>
        </button>
      </aside>
      <section class="db-connection-editor">
        <a-form layout="vertical">
          <div class="db-connection-grid">
            <a-form-item label="连接名称" required><a-input v-model:value="form.name" /></a-form-item>
            <a-form-item label="数据库类型" required><a-select v-model:value="form.type" :options="typeOptions" /></a-form-item>
            <a-form-item label="主机" required><a-input v-model:value="form.host" /></a-form-item>
            <a-form-item label="端口" required><a-input-number v-model:value="form.port" :min="1" :max="65535" style="width: 100%" /></a-form-item>
            <a-form-item label="数据库名" required><a-input v-model:value="form.database" /></a-form-item>
            <a-form-item label="用户名" required><a-input v-model:value="form.username" /></a-form-item>
            <a-form-item label="密码" required><a-input-password v-model:value="form.password" /></a-form-item>
            <a-form-item label="只读连接"><a-switch v-model:checked="form.readonly" /></a-form-item>
          </div>
        </a-form>
        <div class="db-metadata-head">
          <strong>表结构</strong>
          <a-button size="small" :loading="loadingMetadata" @click="loadMetadata">刷新</a-button>
        </div>
        <div class="db-metadata">
          <a-select v-model:value="activeTable" show-search :options="tableOptions" placeholder="选择表" />
          <a-table size="small" :columns="columnColumns" :data-source="activeColumns" :pagination="false" :scroll="{ x: 520, y: 220 }" row-key="name" />
        </div>
        <div class="db-connection-footer">
          <a-button danger :disabled="!activeId" @click="removeConnection"><DeleteOutlined /> 删除</a-button>
          <a-space><a-button :loading="testing" @click="testConnection"><ApiOutlined /> 测试连接</a-button><a-button type="primary" @click="saveConnection">保存</a-button></a-space>
        </div>
      </section>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ApiOutlined, DatabaseOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import { IMMERSIVE_OVERLAY_Z_INDEX } from '@/constants/overlay-z-index';
import { createDatabaseConnection, deleteDatabaseConnection, getDatabaseMetadata, listDatabaseConnections, testDatabaseConnection, updateDatabaseConnection } from '@/api/apiTestClient';

interface DatabaseConnectionDraft { id: string; name: string; type: string; host: string; port: number; database: string; username: string; password: string; readonly: boolean }
const props = defineProps<{ projectId: string }>();
const open = defineModel<boolean>('open', { required: true });
const connections = ref<DatabaseConnectionDraft[]>([]);
const activeId = ref('');
const form = reactive<DatabaseConnectionDraft>({ id: '', name: '', type: 'MySQL', host: '', port: 3306, database: '', username: '', password: '', readonly: true });
const testing = ref(false);
const loadingMetadata = ref(false);
const activeTable = ref('');
const metadata = ref<Record<string, Array<{ name: string; type: string; nullable: string }>>>({});
const tableOptions = computed(() => Object.keys(metadata.value).map((value) => ({ label: value, value })));
const activeColumns = computed(() => metadata.value[activeTable.value] ?? []);
const columnColumns = [
  { title: '字段', dataIndex: 'name', key: 'name', width: 210, ellipsis: true },
  { title: '类型', dataIndex: 'type', key: 'type', width: 220, ellipsis: true },
  { title: '可空', dataIndex: 'nullable', key: 'nullable', width: 64 },
];
const databaseTypes = [
  ['达梦 DM', 5236],
  ['人大金仓 KingbaseES', 54321],
  ['OceanBase', 2881],
  ['TiDB', 4000],
  ['OpenGauss / GaussDB', 5432],
  ['GBase 8a', 5258],
  ['MySQL', 3306],
  ['Oracle', 1521],
  ['PostgreSQL', 5432],
] as const;
const typeOptions = databaseTypes.map(([value]) => ({ label: value, value }));
const defaultPorts = Object.fromEntries(databaseTypes);

watch(() => form.type, (type, previous) => {
  if (!type || type === previous) return;
  form.port = defaultPorts[type] ?? form.port;
});
watch(open, (value) => { if (value) void loadConnections(); });

async function loadConnections() { connections.value = (await listDatabaseConnections(props.projectId)).map((item) => ({ ...item, database: item.databaseName, password: '' })); const current = connections.value.find((item) => item.id === activeId.value) ?? connections.value[0]; if (current) selectConnection(current.id); else createConnection(); }

function selectConnection(id: string) { const item = connections.value.find((row) => row.id === id); if (item) { activeId.value = id; Object.assign(form, item); } }
function createConnection() { activeId.value = ''; Object.assign(form, { id: '', name: '', type: 'MySQL', host: '', port: 3306, database: '', username: '', password: '', readonly: true }); }
async function saveConnection() {
  if (!form.name.trim() || !form.host.trim() || !form.database.trim() || !form.username.trim()) return message.warning('请完整填写连接信息');
  const payload = { name: form.name, type: form.type, host: form.host, port: form.port, databaseName: form.database, username: form.username, password: form.password || undefined, readonly: form.readonly };
  const saved = activeId.value ? await updateDatabaseConnection(props.projectId, activeId.value, payload) : await createDatabaseConnection(props.projectId, payload);
  activeId.value = saved.id; await loadConnections(); message.success('已保存');
}
async function removeConnection() { if (!activeId.value) return; await deleteDatabaseConnection(props.projectId, activeId.value); activeId.value = ''; await loadConnections(); message.success('已删除'); }
async function testConnection() { if (!activeId.value) return message.warning('请先保存连接'); testing.value = true; try { await testDatabaseConnection(props.projectId, activeId.value); message.success('连接成功'); } finally { testing.value = false; } }
async function loadMetadata() { if (!activeId.value) return message.warning('请先保存连接'); loadingMetadata.value = true; try { const result = await getDatabaseMetadata(props.projectId, activeId.value); metadata.value = result.columns; activeTable.value = result.tables[0] ?? ''; } finally { loadingMetadata.value = false; } }
</script>

<style scoped>
.db-connection-layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: 460px; border: 1px solid var(--cf-border, #e4e7ec); border-radius: 8px; overflow: hidden; }
.db-connection-list { padding: 10px; border-right: 1px solid var(--cf-border, #e4e7ec); background: var(--cf-surface-soft, #f8f9fb); }
.db-connection-list-head, .db-connection-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.db-connection-list > button { display: grid; grid-template-columns: 24px 1fr; gap: 8px; width: 100%; margin-top: 6px; padding: 9px; border: 1px solid transparent; border-radius: 6px; background: transparent; text-align: left; cursor: pointer; }
.db-connection-list > button.active { border-color: var(--cf-brand-border, #e7b8c0); background: var(--cf-brand-soft, #fff5f6); }
.db-connection-list strong, .db-connection-list small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.db-connection-list small { margin-top: 2px; color: var(--cf-text-secondary, #667085); }
.db-connection-editor { display: flex; flex-direction: column; padding: 16px 18px; }
.db-connection-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
.db-metadata-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-top: 10px; border-top: 1px solid var(--cf-border, #e4e7ec); }
.db-metadata { display: grid; gap: 10px; min-width: 0; margin-bottom: 14px; }
.db-metadata > :first-child { width: min(100%, 320px); }
.db-metadata :deep(.ant-table-wrapper) { min-width: 0; border: 1px solid var(--cf-border, #e4e7ec); border-radius: 6px; overflow: hidden; }
.db-metadata :deep(.ant-table-cell) { white-space: nowrap; }
.db-connection-footer { margin-top: auto; padding-top: 14px; border-top: 1px solid var(--cf-border, #e4e7ec); }
@media (max-width: 700px) { .db-connection-layout, .db-connection-grid { grid-template-columns: 1fr; } }
</style>
