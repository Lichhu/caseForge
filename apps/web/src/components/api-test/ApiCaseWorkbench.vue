<template>
  <section class="panel constraint-panel dynamic-instruction-panel api-case-panel">
    <div class="panel-header dynamic-panel-header">
      <div class="dynamic-panel-intro">
        <div>
          <h2>接口测试案例</h2>
          <p>编辑与维护 AI 生成的测试案例</p>
        </div>
      </div>
      <div class="toolbar dynamic-panel-toolbar action-toolbar">
        <a-button @click="onCreate">
          <template #icon><PlusOutlined /></template>
          新建案例
        </a-button>
        <a-button :type="batchMode ? 'primary' : 'default'" @click="toggleBatchMode">
          {{ batchMode ? '退出批量' : '批量' }}
        </a-button>
        <a-select
          v-model:value="apiStore.selectedEnvironmentId"
          style="min-width: 160px"
          placeholder="选择环境"
          :options="envOptions"
          @change="onEnvChange"
        />
        <a-button @click="envModalOpen = true">
          <template #icon><SettingOutlined /></template>
          环境
        </a-button>
      </div>
    </div>

    <div v-if="apiStore.caseListTotal > 0 || apiStore.cases.length" class="dynamic-layout">
      <div class="test-point-list test-point-list-panel case-list-panel">
        <div class="test-point-list-head">
          <strong>案例列表</strong>
          <span>{{ apiStore.caseListTotal }} 条</span>
        </div>
        <div v-if="batchMode" class="list-toolbar batch-list-toolbar case-list-toolbar">
          <a-checkbox
            :checked="allSelected"
            :indeterminate="selectionIndeterminate"
            @change="toggleSelectAll"
          >
            全选当前页
          </a-checkbox>
          <span class="case-list-selection">已选 {{ selectedIds.length }} / {{ apiStore.caseListTotal }}</span>
        </div>
        <div class="test-point-list-scroll">
          <article
            v-for="item in apiStore.cases"
            :key="item.id"
            class="test-point-card case-card"
            :class="{
              active: isActiveCard(item.id),
              'browse-card': !batchMode,
              'batch-card': batchMode,
            }"
            @click="handleCardClick(item.id)"
          >
            <div class="test-point-card-head">
              <a-checkbox
                v-if="batchMode"
                :checked="selectedIds.includes(item.id)"
                @click.stop
                @change="(e) => onToggleSelect(item.id, readCheckboxChecked(e))"
              />
              <div class="test-point-card-title case-card-title">
                <strong :title="item.title">{{ item.title || '未命名案例' }}</strong>
                <small>{{ item.caseNo || item.transactionCode || '待分配编号' }}</small>
              </div>
              <span class="polarity-pill" :class="item.polarity">
                {{ item.polarity === 'negative' ? '反' : '正' }}
              </span>
            </div>
          </article>
        </div>
        <div v-if="showCasePagination" class="case-list-pagination">
          <a-pagination
            size="small"
            :current="apiStore.caseListPage"
            :page-size="apiStore.caseListPageSize"
            :total="apiStore.caseListTotal"
            :show-size-changer="true"
            :page-size-options="pageSizeOptions"
            @change="onCasePageChange"
            @showSizeChange="onCasePageChange"
          />
        </div>
      </div>

      <div class="instruction-editor instruction-editor-panel">
        <div v-if="batchMode && selectedIds.length" class="instruction-editor-shell">
          <div class="instruction-editor-body">
            <div class="editor-hero editor-hero-batch">
              <div>
                <h3>已选 {{ selectedIds.length }} 条案例</h3>
                <p>可批量执行或删除所选案例</p>
              </div>
              <a-tag color="processing">批量模式</a-tag>
            </div>

            <div class="editor-block">
              <div class="editor-block-title">已选案例</div>
              <ul class="batch-case-summary-list">
                <li v-for="row in selectedRows" :key="row.id">
                  <strong :title="row.title">{{ row.title || '未命名案例' }}</strong>
                  <span>{{ row.caseNo || row.transactionCode || '待分配编号' }}</span>
                </li>
                <li
                  v-if="selectedIds.length > selectedRows.length"
                  class="batch-case-summary-more"
                >
                  另有 {{ selectedIds.length - selectedRows.length }} 条在其他分页
                </li>
              </ul>
            </div>
          </div>

          <div class="instruction-editor-footer dynamic-editor-footer action-toolbar">
            <a-button danger :disabled="!selectedIds.length" @click="onBatchDelete">
              <template #icon><DeleteOutlined /></template>
              批量删除
            </a-button>
            <a-button
              type="primary"
              :disabled="!canRunSelected"
              :loading="apiStore.running"
              @click="onRunSelected"
            >
              批量执行
            </a-button>
          </div>
        </div>

        <div v-else-if="showEditor" class="instruction-editor-shell">
          <div class="instruction-editor-body">
            <div class="editor-hero">
              <div class="editor-hero-main">
                <h3>{{ isNewCase ? '新建案例' : form.title || '未命名案例' }}</h3>
                <p>
                  {{ form.caseNo || form.transactionCode || '待分配编号' }}
                  <span v-if="!isNewCase" class="hero-divider">·</span>
                  <span v-if="!isNewCase">{{ statusLabel(form.status) }}</span>
                </p>
              </div>
              <span class="polarity-pill polarity-pill--lg" :class="form.polarity">
                {{ form.polarity === 'negative' ? '反向案例' : '正向案例' }}
              </span>
            </div>

            <div class="editor-block">
              <div class="editor-block-title">基础信息</div>
              <div class="editor-form-grid editor-form-grid--wide">
                <label class="field-label field-label--required">案例名称</label>
                <a-input v-model:value="form.title" placeholder="案例名称" />
                <label class="field-label field-label--required">案例类型</label>
                <a-select v-model:value="form.polarity" :options="polarityOptions" />
                <label class="field-label">案例编号</label>
                <a-input v-model:value="form.caseNo" placeholder="如 PCBS03901001-001" />
                <label class="field-label">交易码</label>
                <a-input v-model:value="form.transactionCode" disabled />
                <label class="field-label">状态</label>
                <a-select v-model:value="form.status" :options="statusOptions" />
                <label class="field-label">创建人</label>
                <a-input v-model:value="form.createdBy" disabled />
                <label class="field-label">负责人</label>
                <a-input v-model:value="form.owner" placeholder="负责人" />
                <label class="field-label">绑定接口</label>
                <a-select
                  v-model:value="form.endpointId"
                  :options="endpointOptions"
                  placeholder="选择接口"
                />
              </div>
            </div>

            <div class="editor-block case-payload-block">
              <div class="case-payload-grid">
                <div class="case-payload-item">
                  <div class="editor-block-title">请求报文</div>
                  <a-textarea
                    v-model:value="form.requestJson"
                    class="editor-textarea case-json-editor"
                    :rows="12"
                    placeholder="JSON：method / path / headers / body"
                  />
                </div>
                <div class="case-payload-item">
                  <div class="editor-block-title">预期结果</div>
                  <a-textarea
                    v-model:value="form.expectedJson"
                    class="editor-textarea case-json-editor"
                    :rows="12"
                    placeholder="JSON：statusCode / bodyAssertions"
                  />
                </div>
              </div>
            </div>

            <div class="editor-block case-meta-block">
              <div class="case-meta-grid">
                <div class="case-meta-item">
                  <div class="editor-block-title">案例描述</div>
                  <a-textarea
                    v-model:value="form.description"
                    class="editor-textarea"
                    :rows="3"
                    placeholder="案例描述"
                  />
                </div>
                <div class="case-meta-item">
                  <div class="editor-block-title">备注</div>
                  <a-textarea
                    v-model:value="form.remark"
                    class="editor-textarea"
                    :rows="3"
                    placeholder="备注"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="instruction-editor-footer dynamic-editor-footer action-toolbar">
            <a-button v-if="!isNewCase" danger @click="onDelete">
              <template #icon><DeleteOutlined /></template>
              删除
            </a-button>
            <a-button v-if="!isNewCase" :disabled="!canRunSingle" @click="onRunOne">
              执行
            </a-button>
            <a-button type="primary" :loading="saving" @click="onSave">
              <template #icon><SaveOutlined /></template>
              保存
            </a-button>
          </div>
        </div>

        <div v-else class="instruction-editor-placeholder">
          <a-empty
            :description="
              batchMode
                ? '请从左侧勾选案例进行批量操作'
                : '请从左侧选择一条案例，或点击「新建案例」'
            "
          />
        </div>
      </div>
    </div>

    <a-empty
      v-else
      class="empty-state"
      description="请先在接口文档中 AI 生成案例"
    />
  </section>

  <ApiEnvironmentMaintainModal v-model:open="envModalOpen" />
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  DeleteOutlined,
  PlusOutlined,
  SaveOutlined,
  SettingOutlined,
} from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import {
  caseForgePageSizeOptionLabels,
  normalizeCaseForgePageSize,
} from '@case-forge/shared';
import type { ApiTestCaseRow } from '@/api/apiTestClient';
import ApiEnvironmentMaintainModal from '@/components/api-test/ApiEnvironmentMaintainModal.vue';
import { useApiTestStore } from '@/stores/apiTest';

const apiStore = useApiTestStore();
const batchMode = ref(false);
const saving = ref(false);
const isNewCase = ref(false);
const envModalOpen = ref(false);
const pageSizeOptions = caseForgePageSizeOptionLabels();

const projectId = computed(() => apiStore.activeProjectId ?? '');
const transactionId = computed(() => apiStore.activeTransactionId ?? '');
const selectedIds = computed(() => apiStore.selectedCaseIds);
const caseLookup = computed(() => {
  const map = new Map<string, ApiTestCaseRow>();
  for (const row of [...apiStore.cases, ...apiStore.runnerCases]) {
    map.set(row.id, row);
  }
  return map;
});
const selectedRows = computed(() =>
  selectedIds.value
    .map((id) => caseLookup.value.get(id))
    .filter((row): row is ApiTestCaseRow => Boolean(row)),
);
const activeCase = computed(() =>
  apiStore.cases.find((item) => item.id === apiStore.activeCaseId) ?? null,
);
const showEditor = computed(
  () => !batchMode.value && (Boolean(activeCase.value) || isNewCase.value),
);
const allSelected = computed(
  () =>
    apiStore.cases.length > 0 &&
    apiStore.cases.every((item) => selectedIds.value.includes(item.id)),
);
const selectionIndeterminate = computed(() => {
  const pageIds = apiStore.cases.map((item) => item.id);
  const selectedOnPage = pageIds.filter((id) => selectedIds.value.includes(id));
  return selectedOnPage.length > 0 && selectedOnPage.length < pageIds.length;
});
const envOptions = computed(() =>
  apiStore.environments.map((env) => ({ label: env.name, value: env.id })),
);
const canRunSelected = computed(
  () => selectedIds.value.length > 0 && apiStore.environments.length > 0,
);
const canRunSingle = computed(() => apiStore.environments.length > 0);
const showCasePagination = computed(() => apiStore.caseListTotal > 0);

const form = reactive({
  endpointId: '',
  title: '',
  caseNo: '',
  description: '',
  remark: '',
  transactionCode: '',
  owner: '',
  createdBy: '',
  polarity: 'positive',
  status: 'ready',
  enabled: true,
  requestJson: '{}',
  expectedJson: '{}',
});

const polarityOptions = [
  { label: '正', value: 'positive' },
  { label: '反', value: 'negative' },
];
const statusOptions = [
  { label: '草稿', value: 'draft' },
  { label: '就绪', value: 'ready' },
  { label: '停用', value: 'disabled' },
];

const endpointOptions = computed(() =>
  (apiStore.apiDoc?.endpoints ?? []).map((e) => ({
    label: `${e.method} ${e.path}`,
    value: e.id,
  })),
);

watch(
  () => apiStore.cases,
  (cases) => {
    if (batchMode.value) return;
    if (isNewCase.value) return;
    if (!cases.length) {
      apiStore.activeCaseId = '';
      return;
    }
    if (!cases.some((item) => item.id === apiStore.activeCaseId)) {
      apiStore.activeCaseId = cases[0]?.id ?? '';
    }
    syncFormFromActiveCase();
  },
  { immediate: true },
);

watch(
  () => apiStore.activeCaseId,
  () => {
    if (isNewCase.value) return;
    syncFormFromActiveCase();
  },
);

watch(
  () => apiStore.selectedEnvironmentId,
  async (environmentId) => {
    const projectId = apiStore.activeProjectId;
    if (projectId && environmentId) {
      await apiStore.refreshEnvironmentServices(projectId, environmentId);
    }
    apiStore.selectedEnvironmentServiceId = '';
  },
);

function onEnvChange() {
  apiStore.selectedEnvironmentServiceId = '';
}

function onCasePageChange(page: number, pageSize: number) {
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;
  const size = normalizeCaseForgePageSize(pageSize);
  const sizeChanged = size !== apiStore.caseListPageSize;
  void apiStore.refreshCases(pid, tid, {
    page: sizeChanged ? 1 : page,
    pageSize: size,
  });
}

function statusLabel(status: string) {
  if (status === 'draft') return '草稿';
  if (status === 'disabled') return '停用';
  return '就绪';
}

function loadForm(row: ApiTestCaseRow) {
  form.endpointId = row.endpointId;
  form.title = row.title;
  form.caseNo = row.caseNo ?? '';
  form.description = row.description ?? '';
  form.remark = row.remark ?? '';
  form.transactionCode =
    row.transactionCode ?? apiStore.activeTransaction?.code ?? '';
  form.owner = row.owner ?? '';
  form.createdBy = row.createdBy ?? '';
  form.polarity = row.polarity;
  form.status = row.status;
  form.enabled = row.enabled;
  form.requestJson = JSON.stringify(row.request, null, 2);
  form.expectedJson = JSON.stringify(row.expected, null, 2);
}

function syncFormFromActiveCase() {
  const row = apiStore.cases.find((item) => item.id === apiStore.activeCaseId);
  if (row) {
    loadForm(row);
  }
}

function selectCase(caseId: string) {
  isNewCase.value = false;
  apiStore.activeCaseId = caseId;
}

function toggleBatchMode() {
  batchMode.value = !batchMode.value;
  if (batchMode.value) {
    apiStore.selectedCaseIds = [];
    isNewCase.value = false;
    return;
  }
  if (apiStore.activeCaseId) {
    apiStore.selectedCaseIds = [apiStore.activeCaseId];
  }
}

function isActiveCard(caseId: string) {
  if (batchMode.value) {
    return selectedIds.value.includes(caseId);
  }
  return caseId === apiStore.activeCaseId && !isNewCase.value;
}

function handleCardClick(caseId: string) {
  if (batchMode.value) {
    const checked = !selectedIds.value.includes(caseId);
    apiStore.toggleCaseSelection(caseId, checked);
    return;
  }
  selectCase(caseId);
}

function toggleSelectAll(event: { target: { checked: boolean } }) {
  const checked = event.target.checked;
  if (checked) {
    const pageIds = apiStore.cases.map((item) => item.id);
    apiStore.selectedCaseIds = [...new Set([...apiStore.selectedCaseIds, ...pageIds])];
    return;
  }
  const pageIdSet = new Set(apiStore.cases.map((item) => item.id));
  apiStore.selectedCaseIds = apiStore.selectedCaseIds.filter((id) => !pageIdSet.has(id));
}

function readCheckboxChecked(event: unknown) {
  const target = (event as { target?: { checked?: boolean } })?.target;
  return Boolean(target?.checked);
}

function onToggleSelect(caseId: string, checked: boolean) {
  apiStore.toggleCaseSelection(caseId, checked);
}

function onCreate() {
  batchMode.value = false;
  isNewCase.value = true;
  apiStore.activeCaseId = '';
  const first = apiStore.apiDoc?.endpoints?.[0];
  form.endpointId = first?.id ?? '';
  form.title = '';
  form.caseNo = '';
  form.description = '';
  form.remark = '';
  form.transactionCode = apiStore.activeTransaction?.code ?? '';
  form.owner = '';
  form.createdBy = '';
  form.polarity = 'positive';
  form.status = 'ready';
  form.enabled = true;
  if (first) {
    form.requestJson = JSON.stringify(
      {
        method: first.method,
        path: first.path,
        headers: { 'Content-Type': 'application/json' },
        body: {},
      },
      null,
      2,
    );
  } else {
    form.requestJson = '{}';
  }
  form.expectedJson = JSON.stringify({ statusCode: 200, statusOnly: true }, null, 2);
}

async function onSave() {
  if (!projectId.value || !transactionId.value) return;
  if (!form.title.trim()) {
    message.warning('请填写案例名称');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      endpointId: form.endpointId,
      title: form.title.trim(),
      caseNo: form.caseNo.trim() || undefined,
      description: form.description,
      remark: form.remark,
      transactionCode: form.transactionCode,
      owner: form.owner,
      polarity: form.polarity,
      status: form.status,
      enabled: form.status !== 'disabled',
      request: JSON.parse(form.requestJson),
      expected: JSON.parse(form.expectedJson),
    };
    const caseId = isNewCase.value ? undefined : apiStore.activeCaseId;
    await apiStore.saveCase(projectId.value, transactionId.value, payload, caseId);
    isNewCase.value = false;
    if (!caseId && apiStore.cases[0]) {
      apiStore.activeCaseId = apiStore.cases[0].id;
    }
  } catch {
    message.error('保存失败，请检查请求报文/预期结果 JSON 格式');
  } finally {
    saving.value = false;
  }
}

async function onDelete() {
  if (!projectId.value || !transactionId.value || !apiStore.activeCaseId) return;
  await apiStore.removeCase(projectId.value, transactionId.value, apiStore.activeCaseId);
  isNewCase.value = false;
}

async function onRunOne() {
  if (!projectId.value || !transactionId.value || !apiStore.activeCaseId) return;
  if (!apiStore.ensureSelectedEnvironment()) {
    message.warning('请先创建并选择执行环境');
    envModalOpen.value = true;
    return;
  }
  const run = await apiStore.executeCases(projectId.value, transactionId.value, [
    apiStore.activeCaseId,
  ]);
  if (run) {
    apiStore.setWorkspaceStage(projectId.value, transactionId.value, 'api-runner');
    await apiStore.loadWorkspaceStage(
      projectId.value,
      transactionId.value,
      'api-runner',
    );
  }
}

async function onRunSelected() {
  if (!projectId.value || !transactionId.value || !selectedIds.value.length) return;
  if (!apiStore.ensureSelectedEnvironment()) {
    message.warning('请先创建并选择执行环境');
    envModalOpen.value = true;
    return;
  }
  const run = await apiStore.executeCases(
    projectId.value,
    transactionId.value,
    [...selectedIds.value],
  );
  if (run) {
    apiStore.setWorkspaceStage(projectId.value, transactionId.value, 'api-runner');
    await apiStore.loadWorkspaceStage(
      projectId.value,
      transactionId.value,
      'api-runner',
    );
  }
}

function onBatchDelete() {
  if (!projectId.value || !transactionId.value || !selectedIds.value.length) return;
  const count = selectedIds.value.length;
  Modal.confirm({
    title: `删除选中的 ${count} 条案例？`,
    content: '删除后不可恢复',
    okType: 'danger',
    okText: '删除',
    onOk: async () => {
      await apiStore.removeCases(
        projectId.value,
        transactionId.value,
        [...selectedIds.value],
      );
    },
  });
}
</script>

<style scoped>
.api-case-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.case-list-toolbar {
  margin: 0 12px 4px;
}

.case-list-selection {
  color: #667085;
  font-size: 12px;
}

.case-list-pagination {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 6px 8px 8px;
  border-top: 1px solid #eaecf0;
}

.case-list-pagination :deep(.ant-pagination) {
  margin: 0;
  font-size: 12px;
}

.case-list-pagination :deep(.ant-pagination-item),
.case-list-pagination :deep(.ant-pagination-prev),
.case-list-pagination :deep(.ant-pagination-next),
.case-list-pagination :deep(.ant-pagination-jump-prev),
.case-list-pagination :deep(.ant-pagination-jump-next) {
  min-width: 24px;
  height: 24px;
  line-height: 22px;
}

.case-list-pagination :deep(.ant-pagination-item a) {
  padding: 0 4px;
}

.case-list-pagination :deep(.ant-pagination-options) {
  margin-inline-start: 4px;
}

.case-list-pagination :deep(.ant-pagination-options-size-changer.ant-select) {
  font-size: 12px;
}

.case-list-pagination :deep(.ant-select-single .ant-select-selector) {
  height: 24px !important;
  padding: 0 8px !important;
}

.case-list-pagination :deep(.ant-select-single .ant-select-selection-item) {
  line-height: 22px !important;
}

.case-card.browse-card .test-point-card-head {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.case-card.batch-card .test-point-card-head {
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.batch-case-summary-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.batch-case-summary-list li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #eaecf0;
  font-size: 13px;
}

.batch-case-summary-list li:last-child {
  border-bottom: none;
}

.batch-case-summary-list strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-case-summary-list span {
  flex-shrink: 0;
  color: #667085;
  font-size: 12px;
}

.batch-case-summary-more {
  color: #667085;
  font-size: 12px;
}

.case-card-title strong {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.45;
}

.case-card-title small {
  color: #667085;
  font-size: 12px;
}

.polarity-pill {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}

.polarity-pill.positive {
  border: 1px solid #abefc6;
  background: #ecfdf3;
  color: #067647;
}

.polarity-pill.negative {
  border: 1px solid #fedf89;
  background: #fffaeb;
  color: #b54708;
}

.polarity-pill--lg {
  min-width: auto;
  padding: 4px 10px;
  font-size: 12px;
}

.hero-divider {
  margin: 0 6px;
  color: #d0d5dd;
}

.editor-form-grid--wide {
  grid-template-columns: 96px minmax(0, 1fr) 96px minmax(0, 1fr);
  gap: 12px 20px;
}

@media (max-width: 1100px) {
  .editor-form-grid--wide {
    grid-template-columns: 96px minmax(0, 1fr);
  }
}

.case-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.case-meta-item {
  min-width: 0;
}

.case-payload-block {
  padding-bottom: 18px;
}

.case-payload-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.case-payload-item {
  min-width: 0;
}

.case-json-editor {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.6;
}

.empty-state {
  margin: 48px 0;
}

@media (max-width: 1100px) {
  .case-meta-grid,
  .case-payload-grid {
    grid-template-columns: 1fr;
  }
}
</style>
