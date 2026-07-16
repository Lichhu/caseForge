<template>
  <a-modal
    :open="open"
    title="导出案例"
    :width="900"
    :confirm-loading="exporting"
    :ok-button-props="{ disabled: !selectedIds.size }"
    ok-text="导出"
    cancel-text="取消"
    @ok="onExport"
    @cancel="onClose"
  >
    <div class="case-export-modal">
      <div class="case-export-filters">
        <a-input
          v-model:value="keyword"
          placeholder="搜索案例名称 / 编号"
          allow-clear
          class="case-export-filter-input"
        />
        <a-select
          v-model:value="polarityFilter"
          :options="polarityOptions"
          class="case-export-filter-select"
        />
        <a-select
          v-if="versionOptions.length > 1"
          v-model:value="versionFilter"
          :options="versionOptions"
          allow-clear
          placeholder="全部版本"
          class="case-export-filter-select"
        />
        <a-select
          v-if="channelOptions.length > 1"
          v-model:value="channelFilter"
          :options="channelOptions"
          allow-clear
          placeholder="全部渠道"
          class="case-export-filter-select"
        />
      </div>

      <div class="case-export-table-wrap">
        <table class="case-export-table">
          <colgroup>
            <col class="case-export-col-select" />
            <col class="case-export-col-polarity" />
            <col class="case-export-col-title" />
            <col class="case-export-col-version" />
          </colgroup>
          <thead>
            <tr>
              <th class="case-export-th-select">
                <a-checkbox
                  :checked="allSelected"
                  :indeterminate="someSelected && !allSelected"
                  @change="toggleSelectAll"
                />
              </th>
              <th>属性</th>
              <th>案例名称</th>
              <th>版本</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="4" class="case-export-empty">
                <a-spin size="small" /> 加载中…
              </td>
            </tr>
            <tr v-else-if="!filteredCases.length">
              <td colspan="4" class="case-export-empty">暂无匹配案例</td>
            </tr>
            <tr
              v-for="row in filteredCases"
              :key="row.id"
              :class="{ 'is-selected': selectedIds.has(row.id) }"
              @click="toggleRow(row.id)"
            >
              <td class="case-export-td-select" @click.stop>
                <a-checkbox
                  :checked="selectedIds.has(row.id)"
                  @change="() => toggleRow(row.id)"
                />
              </td>
              <td>
                <span class="polarity-pill" :class="row.polarity">
                  {{ row.polarity === 'negative' ? '反' : '正' }}
                </span>
              </td>
              <td :title="row.title">{{ row.title || row.caseNo || '未命名案例' }}</td>
              <td>
                <span v-if="row.metadata?.versionCode">{{ row.metadata.versionCode }}</span>
                <span v-else class="case-export-muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="case-export-summary">
        已选 <strong>{{ selectedIds.size }}</strong> / 共 {{ filteredCases.length }} 条
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ApiTestCaseRow } from '@/api/apiTestClient';
import { listAllApiCases } from '@/api/apiTestClient';
import { useApiTestStore } from '@/stores/apiTest';
import { exportApiCasesToExcel } from '@/utils/apiCaseExcelExport.util';

const props = defineProps<{
  open: boolean;
  projectId: string;
  transactionId: string;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
}>();

const apiStore = useApiTestStore();

const open = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
});

const allCases = ref<ApiTestCaseRow[]>([]);
const loading = ref(false);
const exporting = ref(false);
const keyword = ref('');
const polarityFilter = ref<'all' | 'positive' | 'negative'>('all');
const versionFilter = ref<string | undefined>(undefined);
const channelFilter = ref<string | undefined>(undefined);
const selectedIds = ref<Set<string>>(new Set());

const polarityOptions = [
  { label: '全部属性', value: 'all' },
  { label: '正案例', value: 'positive' },
  { label: '反案例', value: 'negative' },
];

const versionOptions = computed(() => {
  const versions = new Set<string>();
  for (const c of allCases.value) {
    const code = c.metadata?.versionCode;
    if (code != null) {
      versions.add(code);
    }
  }
  return Array.from(versions)
    .sort()
    .map((v) => ({ label: v, value: v }));
});

const channelOptions = computed(() => {
  const caseChannelIds = new Set(allCases.value.map((c) => c.metadata?.channelId));
  return (apiStore.apiDoc?.generationProfile?.channels ?? [])
    .filter((channel) => caseChannelIds.has(channel.id))
    .map((channel) => ({ label: channel.name, value: channel.id }));
});

const filteredCases = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return allCases.value.filter((c) => {
    if (polarityFilter.value !== 'all' && c.polarity !== polarityFilter.value) {
      return false;
    }
    if (versionFilter.value != null && c.metadata?.versionCode !== versionFilter.value) {
      return false;
    }
    if (channelFilter.value != null && c.metadata?.channelId !== channelFilter.value) {
      return false;
    }
    if (kw) {
      const hay = `${c.title ?? ''} ${c.caseNo ?? ''} ${c.transactionCode ?? ''}`.toLowerCase();
      return hay.includes(kw);
    }
    return true;
  });
});

const allSelected = computed(() => {
  const filtered = filteredCases.value;
  return filtered.length > 0 && filtered.every((c) => selectedIds.value.has(c.id));
});

const someSelected = computed(() => filteredCases.value.some((c) => selectedIds.value.has(c.id)));

function toggleRow(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  selectedIds.value = next;
}

function toggleSelectAll() {
  const filtered = filteredCases.value;
  if (allSelected.value) {
    const next = new Set(selectedIds.value);
    for (const c of filtered) {
      next.delete(c.id);
    }
    selectedIds.value = next;
  } else {
    const next = new Set(selectedIds.value);
    for (const c of filtered) {
      next.add(c.id);
    }
    selectedIds.value = next;
  }
}

async function loadCases() {
  if (!props.projectId || !props.transactionId) return;
  loading.value = true;
  try {
    allCases.value = await listAllApiCases(props.projectId, props.transactionId);
  } finally {
    loading.value = false;
  }
}

const activeTransaction = computed(() =>
  apiStore.transactions.find((t) => t.id === props.transactionId),
);

function buildExportFileName() {
  const projectTitle = apiStore.activeProject?.title ?? '';
  const transactionCode = activeTransaction.value?.code ?? '';
  const date = new Date().toISOString().slice(0, 10);
  const segments = [projectTitle, transactionCode, '接口测试案例', date].filter(Boolean);
  return segments.join('_');
}

async function onExport() {
  const selected = allCases.value.filter((c) => selectedIds.value.has(c.id));
  if (!selected.length) return;
  exporting.value = true;
  try {
    exportApiCasesToExcel(selected, buildExportFileName());
    onClose();
  } finally {
    exporting.value = false;
  }
}

function onClose() {
  open.value = false;
}

function reset() {
  keyword.value = '';
  polarityFilter.value = 'all';
  versionFilter.value = undefined;
  channelFilter.value = undefined;
  selectedIds.value = new Set();
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      reset();
      void loadCases();
    }
  },
);
</script>

<style scoped lang="less">
.case-export-modal {
  .case-export-filters {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }

  .case-export-filter-input {
    flex: 1;
  }

  .case-export-filter-select {
    width: 140px;
  }

  .case-export-table-wrap {
    max-height: 420px;
    overflow: auto;
    border: 1px solid #f0f0f0;
    border-radius: 6px;
  }

  .case-export-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;

    th,
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #f0f0f0;
      text-align: left;
      white-space: nowrap;
    }

    th {
      background: #fafafa;
      font-weight: 500;
      position: sticky;
      top: 0;
      z-index: 1;
    }

    tbody tr {
      cursor: pointer;

      &:hover {
        background: #f5f5f5;
      }

      &.is-selected {
        background: #e6f7ff;
      }

      &:last-child td {
        border-bottom: none;
      }
    }
  }

  .case-export-col-select {
    width: 48px;
  }

  .case-export-col-polarity {
    width: 72px;
  }

  .case-export-col-version {
    width: 80px;
  }

  .case-export-empty {
    text-align: center;
    color: #999;
    padding: 32px;
  }

  .case-export-summary {
    margin-top: 12px;
    text-align: right;
    color: #666;
  }

  .case-export-muted {
    color: #bfbfbf;
  }
}
</style>
