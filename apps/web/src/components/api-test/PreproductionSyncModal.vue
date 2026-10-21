<template>
  <a-modal
    :open="open"
    title="同步准生产"
    width="1080px"
    :confirm-loading="loading"
    :closable="!loading"
    :cancel-button-props="{ disabled: loading }"
    :ok-button-props="{ disabled: !selectedKeys.length || loading }"
    ok-text="同步准生产"
    cancel-text="取消"
    @ok="emit('confirm', selectedKeys)"
    @cancel="emit('update:open', false)"
  >
    <div v-if="preview" class="preprod-sync-modal">
      <div class="preprod-sync-summary">
        <span>
          需求归属应用：
          <strong>{{ preview.requirement?.applicationName || "未维护" }}</strong>
        </span>
        <span>
          已选交易 <strong>{{ preview.transactions.length }}</strong> 条
        </span>
        <span>
          关联案例 <strong>{{ preview.cases.length }}</strong> 条
        </span>
      </div>

      <a-alert
        v-if="preview.invalidCaseCount"
        type="warning"
        show-icon
        :message="`有 ${preview.invalidCaseCount} 条关联案例已失效或不属于所选交易，已跳过`"
      />

      <div class="preprod-sync-toolbar">
        <a-select
          v-model:value="transactionFilter"
          allow-clear
          show-search
          option-filter-prop="label"
          placeholder="全部交易"
          class="preprod-sync-transaction-filter"
          :options="transactionOptions"
        />
        <a-space :size="4">
          <a-button
            size="small"
            :disabled="!filteredSelectableIds.length"
            @click="selectAllFiltered"
          >
            全选当前筛选
          </a-button>
          <a-button size="small" :disabled="!selectedKeys.length" @click="clearSelection">
            清空
          </a-button>
        </a-space>
        <span class="preprod-sync-selected">
          已选 <strong>{{ selectedKeys.length }}</strong> 条
        </span>
      </div>

      <a-table
        size="small"
        row-key="id"
        :data-source="filteredCases"
        :columns="columns"
        :row-selection="rowSelection"
        :pagination="false"
        :scroll="{ y: 380, x: 900 }"
        :locale="{ emptyText: '所选交易在执行平台内没有可同步的关联案例' }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'polarity'">
            <a-tag :color="record.polarity === 'negative' ? 'orange' : 'blue'">
              {{ record.polarity === "negative" ? "反向" : "正向" }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'enabled'">
            <a-tag :color="record.enabled ? 'green' : 'default'">
              {{ record.enabled ? "启用" : "未启用" }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'version'">
            {{ record.versionCode || (record.generateVersion != null ? `V${record.generateVersion}` : "未版本化") }}
          </template>
          <template v-else-if="column.key === 'preproduction'">
            <a-tag :color="record.alreadySynced ? 'gold' : 'default'">
              {{ record.alreadySynced ? "已同步·不可重复" : "未同步" }}
            </a-tag>
          </template>
        </template>
      </a-table>

      <p class="preprod-sync-hint">
        已同步案例不可重复同步；如需更新，请先在准生产管理删除该案例后再同步。未启用案例也不可勾选。
      </p>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  PreproductionSyncCasePreview,
  PreproductionSyncPreview,
} from "@case-forge/shared";

const props = defineProps<{
  open: boolean;
  preview: PreproductionSyncPreview | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (event: "update:open", value: boolean): void;
  (event: "confirm", caseIds: string[]): void;
}>();

const selectedKeys = ref<string[]>([]);
const transactionFilter = ref<string | undefined>();

const columns = [
  { title: "交易码", dataIndex: "transactionCode", key: "transactionCode", width: 150 },
  { title: "案例编号", dataIndex: "caseNo", key: "caseNo", width: 160 },
  { title: "案例名称", dataIndex: "title", key: "title", ellipsis: true },
  { title: "版本", key: "version", width: 150 },
  { title: "方向", key: "polarity", width: 82 },
  { title: "是否启用", key: "enabled", width: 92 },
  { title: "步骤", key: "stepCount", width: 64, align: "center" as const },
  { title: "准生产", key: "preproduction", width: 110 },
];

watch(
  () => props.preview,
  (preview) => {
    transactionFilter.value = undefined;
    selectedKeys.value = preview
      ? preview.cases
          .filter((item) => item.enabled && !item.alreadySynced)
          .map((item) => item.id)
      : [];
  },
  { immediate: true },
);

const transactionOptions = computed(() =>
  (props.preview?.transactions ?? []).map((item) => ({
    value: item.id,
    label: `${item.code} · ${item.name}（${item.linkedCount}）`,
  })),
);

const filteredCases = computed(() => {
  const cases = props.preview?.cases ?? [];
  return transactionFilter.value
    ? cases.filter((item) => item.transactionId === transactionFilter.value)
    : cases;
});

const filteredSelectableIds = computed(() =>
  filteredCases.value
    .filter((item) => item.enabled && !item.alreadySynced)
    .map((item) => item.id),
);

const rowSelection = computed(() => ({
  selectedRowKeys: selectedKeys.value,
  preserveSelectedRowKeys: true,
  getCheckboxProps: (record: PreproductionSyncCasePreview) => ({
    disabled: !record.enabled || record.alreadySynced,
  }),
  onSelect: (record: PreproductionSyncCasePreview, selected: boolean) => {
    if (!record.enabled || record.alreadySynced) return;
    selectedKeys.value = selected
      ? [...new Set([...selectedKeys.value, record.id])]
      : selectedKeys.value.filter((id) => id !== record.id);
  },
  onSelectAll: (
    selected: boolean,
    _selectedRows: PreproductionSyncCasePreview[],
    changeRows: PreproductionSyncCasePreview[],
  ) => {
    const ids = changeRows
      .filter((item) => item.enabled && !item.alreadySynced)
      .map((item) => item.id);
    selectedKeys.value = selected
      ? [...new Set([...selectedKeys.value, ...ids])]
      : selectedKeys.value.filter((id) => !ids.includes(id));
  },
}));

function selectAllFiltered() {
  selectedKeys.value = [
    ...new Set([...selectedKeys.value, ...filteredSelectableIds.value]),
  ];
}

function clearSelection() {
  selectedKeys.value = [];
}
</script>

<style scoped>
.preprod-sync-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.preprod-sync-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  color: #667085;
  font-size: 13px;
}
.preprod-sync-summary strong {
  color: #1d2939;
}
.preprod-sync-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.preprod-sync-transaction-filter {
  width: 300px;
}
.preprod-sync-selected {
  margin-left: auto;
  color: #667085;
  font-size: 13px;
}
.preprod-sync-selected strong {
  color: var(--cf-brand, #b60f2d);
}
.preprod-sync-hint {
  margin: 0;
  color: #667085;
  font-size: 12px;
}
</style>
