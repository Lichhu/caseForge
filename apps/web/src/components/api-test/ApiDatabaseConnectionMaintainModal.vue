<template>
  <a-modal v-model:open="open" title="数据库连接" width="1040px" :footer="null" :z-index="IMMERSIVE_OVERLAY_Z_INDEX">
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
            <a-form-item :label="databaseLabel" :required="databaseRequired"><a-input v-model:value="form.database" /></a-form-item>
            <a-form-item label="用户名" required><a-input v-model:value="form.username" /></a-form-item>
            <a-form-item label="密码" required><a-input-password v-model:value="form.password" /></a-form-item>
            <a-form-item label="只读连接"><a-switch v-model:checked="form.readonly" /></a-form-item>
          </div>
        </a-form>
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
import { message, Modal } from 'ant-design-vue';
import { IMMERSIVE_OVERLAY_Z_INDEX, NESTED_OVERLAY_Z_INDEX } from '@/constants/overlay-z-index';
import { createDatabaseConnection, deleteDatabaseConnection, listDatabaseConnections, testDatabaseConnection, updateDatabaseConnection } from '@/api/apiTestClient';

interface DatabaseConnectionDraft { id: string; name: string; type: string; host: string; port: number; database: string; username: string; password: string; readonly: boolean }
const props = defineProps<{ projectId: string }>();
const open = defineModel<boolean>('open', { required: true });
const connections = ref<DatabaseConnectionDraft[]>([]);
const activeId = ref('');
const form = reactive<DatabaseConnectionDraft>({ id: '', name: '', type: 'MySQL', host: '', port: 3306, database: '', username: '', password: '', readonly: true });
const testing = ref(false);
const databaseTypes = [
  ['MySQL', 'MySQL', 3306],
  ['MariaDB', 'MariaDB', 3306],
  ['Oracle', 'Oracle', 1521],
  ['达梦 DM8', 'DM8', 5236],
  ['OceanBase', 'OceanBase-MySQL', 2881],
  ['PostgreSQL', 'PostgreSQL', 5432],
  ['人大金仓 KingbaseES', 'KingbaseES', 54321],
  ['华为 GaussDB', 'GaussDB', 5432],
  ['中兴 GoldenDB', 'GoldenDB', 3306],
] as const;
const typeOptions = databaseTypes.map(([label, value]) => ({ label, value }));
const defaultPorts = Object.fromEntries(databaseTypes.map(([, value, port]) => [value, port]));
const databaseRequired = computed(() => ['Oracle', 'PostgreSQL', 'KingbaseES', 'GaussDB'].includes(form.type));
const databaseLabel = computed(() => form.type === 'Oracle' ? '服务名' : databaseRequired.value ? '数据库名' : '默认数据库（可选）');

watch(() => form.type, (type, previous) => {
  if (!type || type === previous) return;
  form.port = defaultPorts[type] ?? form.port;
});
watch(open, (value) => { if (value) void loadConnections(); });

async function loadConnections() { connections.value = (await listDatabaseConnections(props.projectId)).map((item) => ({ ...item, database: item.databaseName, password: '' })); const current = connections.value.find((item) => item.id === activeId.value) ?? connections.value[0]; if (current) selectConnection(current.id); else createConnection(); }

function selectConnection(id: string) { const item = connections.value.find((row) => row.id === id); if (item) { activeId.value = id; Object.assign(form, item); } }
function createConnection() { activeId.value = ''; Object.assign(form, { id: '', name: '', type: 'MySQL', host: '', port: 3306, database: '', username: '', password: '', readonly: true }); }
async function saveConnection() {
  if (!form.name.trim() || !form.host.trim() || !form.username.trim() || (databaseRequired.value && !form.database.trim())) return message.warning('请完整填写连接信息');
  const payload = { name: form.name, type: form.type, host: form.host, port: form.port, databaseName: form.database, username: form.username, password: form.password || undefined, readonly: form.readonly };
  const saved = activeId.value ? await updateDatabaseConnection(props.projectId, activeId.value, payload) : await createDatabaseConnection(props.projectId, payload);
  activeId.value = saved.id; await loadConnections(); message.success('已保存');
}
function removeConnection() {
  if (!activeId.value) return;
  Modal.confirm({
    title: '删除数据库连接？',
    content: `确定删除连接「${form.name}」？删除后无法恢复。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    centered: true,
    zIndex: NESTED_OVERLAY_Z_INDEX,
    onOk: async () => {
      await deleteDatabaseConnection(props.projectId, activeId.value);
      activeId.value = '';
      await loadConnections();
      message.success('已删除');
    },
  });
}
async function testConnection() { if (!activeId.value) return message.warning('请先保存连接'); testing.value = true; try { await testDatabaseConnection(props.projectId, activeId.value); message.success('连接成功'); } catch (error) { message.error((error as Error).message || '数据库连接失败'); } finally { testing.value = false; } }
</script>

<style scoped>
.db-connection-layout { display: grid; grid-template-columns: 240px minmax(0, 1fr); height: min(520px, calc(100vh - 140px)); min-height: 0; border: 1px solid var(--cf-border, #e4e7ec); border-radius: 8px; overflow: hidden; }
.db-connection-list { display: flex; flex-direction: column; min-height: 0; padding: 10px; overflow-y: auto; border-right: 1px solid var(--cf-border, #e4e7ec); background: var(--cf-surface-soft, #f8f9fb); }
.db-connection-list-head { position: sticky; top: -10px; z-index: 1; flex-shrink: 0; margin: -10px -10px 0; padding: 10px; background: var(--cf-surface-soft, #f8f9fb); }
.db-connection-list-head, .db-connection-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.db-connection-list > button { display: grid; grid-template-columns: 24px 1fr; gap: 8px; width: 100%; margin-top: 6px; padding: 9px; border: 1px solid transparent; border-radius: 6px; background: transparent; text-align: left; cursor: pointer; }
.db-connection-list > button.active { border-color: var(--cf-brand-border, #e7b8c0); background: var(--cf-brand-soft, #fff5f6); }
.db-connection-list strong, .db-connection-list small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.db-connection-list small { margin-top: 2px; color: var(--cf-text-secondary, #667085); }
.db-connection-editor { display: flex; flex-direction: column; min-height: 0; padding: 16px 18px; overflow-y: auto; }
.db-connection-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
.db-connection-footer { margin-top: auto; padding-top: 14px; border-top: 1px solid var(--cf-border, #e4e7ec); }
@media (max-width: 700px) { .db-connection-layout, .db-connection-grid { grid-template-columns: 1fr; } }
</style>
