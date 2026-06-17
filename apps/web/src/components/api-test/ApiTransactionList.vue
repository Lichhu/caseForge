<template>
  <section class="transaction-list-view">
    <div class="transaction-list-sheet">
      <div class="transaction-list-toolbar">
        <h2 class="transaction-list-title">交易码列表</h2>
        <a-input
          v-model:value="keyword"
          class="transaction-search project-search"
          allow-clear
          placeholder="输入交易码、接口名称或备注"
        >
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <div class="transaction-list-toolbar-spacer" />
        <a-space :size="8" class="transaction-list-actions">
          <a-button
            v-if="selectedRowKeys.length"
            danger
            :loading="deleting"
            @click="onBatchDelete"
          >
            删除选中 ({{ selectedRowKeys.length }})
          </a-button>
          <a-button type="primary" @click="openCreate">
            <template #icon><PlusOutlined /></template>
            新建
          </a-button>
        </a-space>
      </div>

      <div class="transaction-table-body">
        <a-table
          v-if="apiStore.transactions.length && filteredTransactions.length"
          class="transaction-table"
          size="middle"
          row-key="id"
          :pagination="false"
          :data-source="paginatedTransactions"
          :columns="columns"
          :row-selection="rowSelection"
          :custom-row="customRow"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'code'">
              <span class="transaction-code">{{ record.code }}</span>
            </template>
            <template v-else-if="column.key === 'name'">
              <span class="transaction-muted">{{ displayTransactionName(record) }}</span>
            </template>
            <template v-else-if="column.key === 'docStatus'">
              <span class="transaction-status" :class="{ done: record.hasDocument }">
                {{ record.hasDocument ? '已上传文档' : '待上传' }}
              </span>
            </template>
            <template v-else-if="column.key === 'description'">
              <span class="transaction-muted">{{ record.description || '—' }}</span>
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space :size="4">
                <a-button type="link" size="small" class="transaction-action" @click.stop="openEdit(record)">
                  编辑
                </a-button>
                <a-button type="link" size="small" danger class="transaction-action" @click.stop="onDelete(record)">
                  删除
                </a-button>
              </a-space>
            </template>
          </template>
        </a-table>
        <a-empty
          v-else
          class="transaction-empty"
          :description="emptyDescription"
        />
      </div>
      <div v-if="showPagination" class="transaction-list-pagination">
        <a-pagination
          size="small"
          :current="listPage"
          :page-size="listPageSize"
          :total="filteredTransactions.length"
          :show-size-changer="true"
          :page-size-options="pageSizeOptions"
          :show-total="(total: number) => `共 ${total} 条`"
          @change="handlePaginationChange"
          @showSizeChange="handlePaginationChange"
        />
      </div>
    </div>

    <a-modal
      v-model:open="modalOpen"
      :title="editingId ? '编辑交易码' : '新建'"
      ok-text="保存"
      cancel-text="取消"
      :confirm-loading="saving"
      @ok="onSave"
    >
      <a-form layout="vertical">
        <a-form-item label="交易码" required>
          <a-input v-model:value="form.code" maxlength="128" placeholder="如 addCtmSealInfo" />
        </a-form-item>
        <a-form-item label="接口名称">
          <a-input v-model:value="form.name" maxlength="256" placeholder="可选，默认同交易码" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="form.description" :rows="3" maxlength="2000" placeholder="可选" />
        </a-form-item>
      </a-form>
    </a-modal>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import {
  caseForgePageSizeOptionLabels,
  DEFAULT_CASE_FORGE_PAGE_SIZE,
  normalizeCaseForgePageSize,
} from '@case-forge/shared';
import { useApiTestStore } from '@/stores/apiTest';
import type { ApiTransactionRow } from '@/api/apiTestClient';

const apiStore = useApiTestStore();
const modalOpen = ref(false);
const saving = ref(false);
const deleting = ref(false);
const editingId = ref('');
const keyword = ref('');
const listPage = ref(1);
const listPageSize = ref(DEFAULT_CASE_FORGE_PAGE_SIZE);
const pageSizeOptions = caseForgePageSizeOptionLabels();
const selectedRowKeys = ref<string[]>([]);
const form = reactive({
  code: '',
  name: '',
  description: '',
});

watch(
  () => apiStore.transactions.map((item) => item.id).join(','),
  () => {
    const existingIds = new Set(apiStore.transactions.map((item) => item.id));
    selectedRowKeys.value = selectedRowKeys.value.filter((id) => existingIds.has(id));
  },
);

watch(keyword, () => {
  listPage.value = 1;
});

const columns = [
  { title: '交易码', dataIndex: 'code', key: 'code', width: 200 },
  { title: '接口名称', dataIndex: 'name', key: 'name', ellipsis: true },
  { title: '文档状态', key: 'docStatus', width: 108, align: 'center' as const },
  { title: '备注', key: 'description', width: 200, ellipsis: true },
  { title: '操作', key: 'actions', width: 108, align: 'center' as const },
];

const filteredTransactions = computed(() => {
  const value = keyword.value.trim().toLowerCase();
  if (!value) return apiStore.transactions;
  const normalizedKeyword = normalizeSearchText(value);
  return apiStore.transactions.filter((item) => {
    const haystack = [item.code, item.name, item.description]
      .filter(Boolean)
      .join(' ');
    return normalizeSearchText(haystack).includes(normalizedKeyword);
  });
});

const showPagination = computed(() => filteredTransactions.value.length > 0);

const paginatedTransactions = computed(() => {
  const items = filteredTransactions.value;
  const start = (listPage.value - 1) * listPageSize.value;
  return items.slice(start, start + listPageSize.value);
});

function handlePaginationChange(page: number, pageSize: number) {
  const sizeChanged = pageSize !== listPageSize.value;
  listPageSize.value = normalizeCaseForgePageSize(pageSize);
  listPage.value = sizeChanged ? 1 : page;
}

watch(
  () => filteredTransactions.value.length,
  (total) => {
    const maxPage = Math.max(1, Math.ceil(total / listPageSize.value));
    if (listPage.value > maxPage) {
      listPage.value = maxPage;
    }
  },
);

const emptyDescription = computed(() => {
  if (!apiStore.transactions.length) return '暂无交易码，请点击右上角「新建」';
  if (keyword.value.trim()) return '暂无匹配交易码';
  return '暂无交易码';
});

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[‐‑‒–—―－]/g, '-')
    .replace(/\s+/g, '');
}

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: string[]) => {
    selectedRowKeys.value = keys;
  },
}));

function customRow(record: ApiTransactionRow) {
  return {
    class: 'transaction-row',
    onClick: (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          '.ant-checkbox-wrapper, .ant-checkbox, .ant-table-selection-column, .transaction-action, .ant-btn',
        )
      ) {
        return;
      }
      enterTransaction(record.id);
    },
  };
}

function openCreate() {
  editingId.value = '';
  form.code = '';
  form.name = '';
  form.description = '';
  modalOpen.value = true;
}

function openEdit(item: ApiTransactionRow) {
  editingId.value = item.id;
  form.code = item.code;
  form.name = item.name;
  form.description = item.description ?? '';
  modalOpen.value = true;
}

function displayTransactionName(item: ApiTransactionRow) {
  const name = item.name?.trim();
  if (!name || name === item.code) return '—';
  return name;
}

async function onSave() {
  const code = form.code.trim();
  if (!code) {
    message.warning('请输入交易码');
    return Promise.reject();
  }
  const name = form.name.trim();
  saving.value = true;
  try {
    const payload = {
      code,
      name: name || undefined,
      description: form.description.trim() || undefined,
    };
    if (editingId.value) {
      await apiStore.updateTransactionInfo(editingId.value, payload);
    } else {
      await apiStore.createTransaction(payload);
    }
    modalOpen.value = false;
  } catch {
    return Promise.reject();
  } finally {
    saving.value = false;
  }
}

function enterTransaction(transactionId: string) {
  void apiStore.selectTransaction(transactionId);
}

function onDelete(item: ApiTransactionRow) {
  Modal.confirm({
    title: '删除交易码',
    content: `确定删除「${item.code}」？关联文档与案例将一并删除。`,
    okText: '删除',
    cancelText: '取消',
    okType: 'danger',
    centered: true,
    onOk: async () => {
      await apiStore.removeTransaction(item.id);
      selectedRowKeys.value = selectedRowKeys.value.filter((id) => id !== item.id);
    },
  });
}

function onBatchDelete() {
  const ids = [...selectedRowKeys.value];
  if (!ids.length) return;
  Modal.confirm({
    title: '批量删除交易码',
    content: `确定删除选中的 ${ids.length} 条交易码？关联文档与案例将一并删除。`,
    okText: '删除',
    cancelText: '取消',
    okType: 'danger',
    centered: true,
    async onOk() {
      deleting.value = true;
      try {
        await apiStore.removeTransactions(ids);
        selectedRowKeys.value = [];
      } finally {
        deleting.value = false;
      }
    },
  });
}
</script>

<style scoped>
.transaction-list-view {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.transaction-list-sheet {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fff;
}

.transaction-list-toolbar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #eaecf0;
  background: #fff;
}

.transaction-list-title {
  margin: 0;
  flex-shrink: 0;
  color: #1d2939;
  font-size: 14px;
  font-weight: 600;
  line-height: 32px;
}

.transaction-search {
  width: 280px;
  flex-shrink: 0;
}

.transaction-list-toolbar-spacer {
  flex: 1 1 auto;
  min-width: 12px;
}

.transaction-list-actions {
  flex-shrink: 0;
}

.transaction-table-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.transaction-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  padding: 32px 16px;
}

.transaction-code {
  color: var(--cf-brand-hover, #c01048);
  font-weight: 500;
}

.transaction-muted {
  color: #667085;
}

.transaction-status {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f2f4f7;
  color: #667085;
  font-size: 12px;
  line-height: 1.5;
}

.transaction-status.done {
  background: #eff8ff;
  color: #175cd3;
}

.transaction-action {
  padding-inline: 4px;
}

:deep(.transaction-table .ant-table) {
  background: #fff;
}

:deep(.transaction-table .ant-table-container) {
  border-inline: 0 !important;
}

:deep(.transaction-table .ant-table-thead > tr > th) {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 10px 16px;
  border-bottom: 1px solid #eaecf0;
  background: #f9fafb;
  color: #667085;
  font-size: 13px;
  font-weight: 500;
}

:deep(.transaction-table .ant-table-tbody > tr > td) {
  padding: 11px 16px;
  border-bottom: 1px solid #f2f4f7;
  background: #fff;
  color: #344054;
  font-size: 14px;
}

:deep(.transaction-table .ant-table-tbody > tr:last-child > td) {
  border-bottom: 0;
}

:deep(.transaction-row) {
  cursor: pointer;
}

:deep(.transaction-row:hover > td) {
  background: var(--cf-brand-soft, #fff5f6) !important;
}

.transaction-list-pagination {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 10px 12px 12px;
  border-top: 1px solid #eef2f6;
  background: #fff;
}
</style>
