<template>
  <LibraryPanelShell
    v-model:open="open"
    title="数据库连接"
    width="min(1200px, 82vw)"
    :z-index="IMMERSIVE_OVERLAY_Z_INDEX"
    body-padding="20px 28px 24px"
    :embedded="embedded"
  >
    <div class="db-connection-layout">
      <LibrarySidebar title="数据库" :count="filteredConnections.length" @create="createConnection">
        <template #tools>
          <LibrarySearch v-model="connectionKeyword" placeholder="搜索连接名称或主机 IP" />
        </template>
        <LibraryListItem
          v-for="item in filteredConnections"
          :key="item.id"
          :name="item.name"
          :meta="`${item.type} · ${item.host}:${item.port}`"
          :active="item.id === activeId"
          icon-tone="blue"
          @select="selectConnection(item.id)"
        >
          <template #icon><DatabaseOutlined /></template>
        </LibraryListItem>
        <LibraryEmptyState
          v-if="!filteredConnections.length"
          :text="connectionKeyword?.trim() ? '无匹配连接' : '暂无连接'"
        />
      </LibrarySidebar>
      <section class="db-connection-editor">
        <div class="db-connection-body">
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
        </div>
        <LibraryEditorFooter>
          <template #start>
            <a-button danger :disabled="!activeId" @click="removeConnection"><DeleteOutlined /> 删除</a-button>
          </template>
          <template #end>
            <a-button :loading="testing" @click="testConnection"><ApiOutlined /> 测试连接</a-button>
            <a-button type="primary" @click="saveConnection">保存</a-button>
          </template>
        </LibraryEditorFooter>
      </section>
    </div>
  </LibraryPanelShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ApiOutlined, DatabaseOutlined, DeleteOutlined } from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import { IMMERSIVE_OVERLAY_Z_INDEX, NESTED_OVERLAY_Z_INDEX } from '@/constants/overlay-z-index';
import { createDatabaseConnection, deleteDatabaseConnection, listDatabaseConnections, testDatabaseConnection, updateDatabaseConnection } from '@/api/apiTestClient';
import LibraryEditorFooter from './LibraryEditorFooter.vue';
import LibraryEmptyState from './LibraryEmptyState.vue';
import LibraryListItem from './LibraryListItem.vue';
import LibraryPanelShell from './LibraryPanelShell.vue';
import LibrarySearch from './LibrarySearch.vue';
import LibrarySidebar from './LibrarySidebar.vue';

interface DatabaseConnectionDraft { id: string; name: string; type: string; host: string; port: number; database: string; username: string; password: string; readonly: boolean }
const props = defineProps<{ projectId: string; embedded?: boolean }>();
const open = defineModel<boolean>('open', { required: true });
const connections = ref<DatabaseConnectionDraft[]>([]);
const connectionKeyword = ref('');
const filteredConnections = computed(() => {
  const keyword = (connectionKeyword.value ?? '').trim().toLowerCase();
  if (!keyword) return connections.value;
  return connections.value.filter((item) =>
    [item.name, item.host].some((value) => value?.toLowerCase().includes(keyword)),
  );
});
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
watch(open, (value) => { if (value) void loadConnections(); }, { immediate: true });

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
.db-connection-layout { display: grid; grid-template-columns: 252px minmax(0, 1fr); gap: 20px; height: calc(100vh - 120px); min-height: 540px; }
.db-connection-editor { display: flex; flex-direction: column; min-width: 0; min-height: 0; border: 1px solid var(--cf-border, #e4e7ec); border-radius: 12px; background: var(--cf-surface, #fff); overflow: hidden; }
.db-connection-body { flex: 1; min-height: 0; padding: 24px 28px; overflow-y: auto; }
.db-connection-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; }
.db-connection-grid :deep(.ant-form-item) { margin-bottom: 22px; }
@media (max-width: 700px) { .db-connection-layout, .db-connection-grid { grid-template-columns: 1fr; } }
</style>
