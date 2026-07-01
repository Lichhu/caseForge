<template>
  <a-modal
    v-model:open="open"
    title="从服管平台同步交易码"
    width="960px"
    :confirm-loading="syncing"
    :ok-text="`确认同步 (${selectedRowKeys.length})`"
    cancel-text="取消"
    @ok="onSync"
  >
    <div class="smp-sync-modal">
      <div class="smp-sync-toolbar">
        <a-input
          v-model:value="keyword"
          class="smp-sync-search"
          allow-clear
          placeholder="搜索交易码、服务名称、服务编码"
        >
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <a-button size="small" @click="onReload" :loading="loading">
          <template #icon><ReloadOutlined /></template>
          重新获取
        </a-button>
      </div>

      <a-table
        class="smp-sync-table"
        size="small"
        row-key="rowKey"
        :loading="loading"
        :pagination="false"
        :scroll="{ y: 360 }"
        :data-source="filteredItems"
        :columns="columns"
        :row-selection="rowSelection"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'code'">
            <span class="smp-sync-code">{{ record.code }}</span>
          </template>
          <template v-else-if="column.key === 'name'">
            <span class="smp-sync-name">{{ record.name }}</span>
          </template>
          <template v-else-if="column.key === 'serviceCode'">
            <span class="smp-sync-muted">{{ record.serviceCode }}</span>
          </template>
          <template v-else-if="column.key === 'resSystemName'">
            <span class="smp-sync-muted">{{ record.resSystemName || '—' }}</span>
          </template>
          <template v-else-if="column.key === 'serviceAttribute'">
            <span class="smp-sync-tag">{{ record.serviceAttribute || '—' }}</span>
          </template>
        </template>
      </a-table>

      <div class="smp-sync-hint">
        <span v-if="!items.length && !loading">点击「重新获取」从服管平台拉取交易码列表</span>
        <span v-else-if="!filteredItems.length">暂无匹配数据</span>
        <span v-else>共 {{ items.length }} 条，已勾选 {{ selectedRowKeys.length }} 条</span>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import { useApiTestStore } from '@/stores/apiTest';
import type { SmpTransactionCandidate } from '@/api/apiTestClient';

const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ (e: 'synced'): void }>();

const apiStore = useApiTestStore();
const items = ref<SmpRow[]>([]);
const loading = ref(false);
const syncing = ref(false);
const keyword = ref('');
const selectedRowKeys = ref<string[]>([]);

interface SmpRow extends SmpTransactionCandidate {
  rowKey: string;
}

const columns = [
  { title: '交易码', dataIndex: 'code', key: 'code', width: 180 },
  { title: '服务名称', dataIndex: 'name', key: 'name', ellipsis: true },
  { title: '服务编码', dataIndex: 'serviceCode', key: 'serviceCode', width: 140 },
  { title: '响应系统', dataIndex: 'resSystemName', key: 'resSystemName', width: 140 },
  { title: '属性', dataIndex: 'serviceAttribute', key: 'serviceAttribute', width: 100 },
];

const filteredItems = computed(() => {
  const value = keyword.value.trim().toLowerCase();
  if (!value) return items.value;
  return items.value.filter((item) => {
    const haystack = [
      item.code,
      item.name,
      item.serviceCode,
      item.resSystemName,
      item.serviceAttribute,
      item.reqSystemId,
    ]
      .filter(Boolean)
      .join(' ');
    return haystack.toLowerCase().includes(value);
  });
});

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: string[]) => {
    selectedRowKeys.value = keys;
  },
  getCheckboxProps: (record: SmpRow) => ({
    disabled: !record.selected,
  }),
}));

watch(open, (isOpen) => {
  if (isOpen) {
    keyword.value = '';
    selectedRowKeys.value = [];
    void loadItems();
  }
});

async function loadItems() {
  loading.value = true;
  try {
    const data = await apiStore.fetchSmpTransactionList();
    items.value = ((data ?? []) as SmpRow[]).map((item) => ({
      ...item,
      rowKey: `${item.reqCode}|${item.taskId}|${item.serviceCode}|${item.reqSystemId}|${item.code}`,
    }));
    selectedRowKeys.value = items.value.filter((i) => i.selected).map((i) => i.rowKey);
  } catch (error) {
    message.error(error instanceof Error ? error.message : '获取服管数据失败');
  } finally {
    loading.value = false;
  }
}

function onReload() {
  void loadItems();
}

async function onSync() {
  const selected = items.value.filter((item) => selectedRowKeys.value.includes(item.rowKey));
  if (!selected.length) {
    message.warning('请选择要同步的交易码');
    return Promise.reject();
  }
  syncing.value = true;
  try {
    await apiStore.syncSmpTransactions(selected);
    emit('synced');
    open.value = false;
  } catch (error) {
    message.error(error instanceof Error ? error.message : '同步失败');
    return Promise.reject();
  } finally {
    syncing.value = false;
  }
}
</script>

<style scoped>
.smp-sync-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.smp-sync-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
}

.smp-sync-search {
  flex: 1;
}

.smp-sync-table :deep(.ant-table) {
  border: 1px solid #eaecf0;
  border-radius: 6px;
}

.smp-sync-hint {
  color: #667085;
  font-size: 12px;
  text-align: right;
}

.smp-sync-code {
  color: var(--cf-brand-hover, #c01048);
  font-weight: 500;
}

.smp-sync-name {
  color: #344054;
}

.smp-sync-muted {
  color: #667085;
}

.smp-sync-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f2f4f7;
  color: #667085;
  font-size: 12px;
}
</style>
