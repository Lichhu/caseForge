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
          {{ batchMode ? '退出批量' : '批量删除' }}
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
                <a-tag
                  class="case-transport-tag"
                  :color="caseProfileColor(item.request)"
                  size="small"
                >
                  {{ caseProfileLabel(item.request) }}
                </a-tag>
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
                <p>确认后可批量删除所选案例</p>
              </div>
              <a-tag color="processing">批量删除</a-tag>
            </div>

            <div class="editor-block">
              <div class="editor-block-title">已选案例</div>
              <ul class="batch-case-summary-list">
                <li v-for="row in selectedRows" :key="row.id" class="batch-case-summary-item">
                  <strong class="batch-case-summary-title" :title="row.title">
                    {{ row.title || '未命名案例' }}
                  </strong>
                  <a-tag
                    class="batch-case-summary-tag"
                    size="small"
                    :color="caseProfileColor(row.request)"
                  >
                    {{ caseProfileLabel(row.request) }}
                  </a-tag>
                  <span class="batch-case-summary-no">
                    {{ row.caseNo || row.transactionCode || '待分配编号' }}
                  </span>
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

            <div class="editor-block case-payload-block">
              <div class="case-payload-grid">
                <div class="case-payload-item">
                  <div class="editor-block-title-row">
                    <div class="editor-block-title">请求报文</div>
                    <a-button type="link" size="small" @click="beautifyRequestJson">
                      <template #icon><FormatPainterOutlined /></template>
                      美化
                    </a-button>
                  </div>
                  <p class="case-payload-hint">{{ requestPayloadHint }}</p>
                  <div class="case-payload-fields">
                    <template v-if="requestEditorMode === 'tcp-xml'">
                      <a-textarea
                        v-model:value="form.requestBodyXml"
                        class="editor-textarea case-xml-editor case-payload-textarea"
                        placeholder="XML 报文"
                      />
                    </template>
                    <template v-else-if="requestEditorMode === 'http-xml'">
                      <div class="request-split-label">HTTP 配置（JSON）</div>
                      <a-textarea
                        v-model:value="form.requestMetaJson"
                        class="editor-textarea case-json-editor case-payload-textarea--meta"
                        :rows="5"
                        placeholder="method / path / headers ..."
                      />
                      <div class="request-split-label">报文体（XML）</div>
                      <a-textarea
                        v-model:value="form.requestBodyXml"
                        class="editor-textarea case-xml-editor case-payload-textarea"
                        placeholder="XML 报文"
                      />
                    </template>
                    <a-textarea
                      v-else
                      v-model:value="form.requestJson"
                      class="editor-textarea case-json-editor case-payload-textarea"
                      placeholder="JSON：method / path / headers / body"
                    />
                  </div>
                </div>
                <div class="case-payload-item">
                  <div class="editor-block-title-row">
                    <div class="editor-block-title">预期结果</div>
                    <a-button type="link" size="small" @click="beautifyExpectedJson">
                      <template #icon><FormatPainterOutlined /></template>
                      美化
                    </a-button>
                  </div>
                  <p class="case-payload-hint">{{ expectedPayloadHint }}</p>
                  <div class="case-payload-fields">
                    <a-textarea
                      v-model:value="form.expectedJson"
                      class="editor-textarea case-json-editor case-payload-textarea"
                      placeholder="JSON：statusCode / bodyAssertions"
                    />
                  </div>
                </div>
              </div>
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
                ? '请从左侧勾选要删除的案例'
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
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  DeleteOutlined,
  FormatPainterOutlined,
  PlusOutlined,
  SaveOutlined,
} from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import {
  caseForgePageSizeOptionLabels,
  executionProfileBadgeColor,
  normalizeCaseForgePageSize,
  resolveExecutionProfile,
} from '@case-forge/shared';
import type { ApiCaseRequest } from '@case-forge/shared';
import type { ApiTestCaseRow } from '@/api/apiTestClient';
import { useApiTestStore } from '@/stores/apiTest';
import {
  beautifyCasePayloadJson,
  beautifyRequestBodyXml,
  mergeRequestFromEditor,
  splitRequestForEditor,
  type RequestEditorMode,
  type TcpRequestMeta,
} from '@/utils/casePayloadFormat.util';

const apiStore = useApiTestStore();
const batchMode = ref(false);
const saving = ref(false);
const isNewCase = ref(false);
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
const showCasePagination = computed(() => apiStore.caseListTotal > 0);

function caseProfileLabel(request: ApiCaseRequest) {
  return resolveExecutionProfile(request).label;
}

function caseProfileColor(request: ApiCaseRequest) {
  return executionProfileBadgeColor(resolveExecutionProfile(request).transport);
}

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
  requestEditorMode: 'json' as RequestEditorMode,
  requestJson: '{}',
  requestMetaJson: '',
  requestTcpMeta: null as TcpRequestMeta | null,
  requestBodyXml: '',
  expectedJson: '{}',
});

const requestEditorMode = computed(() => form.requestEditorMode);

const requestPayloadHint = computed(() => {
  if (requestEditorMode.value === 'tcp-xml') {
    return 'TCP 连接地址在环境中配置；此处编辑 XML 报文体（GBK 编码 + 8 位长度前缀）。';
  }
  if (requestEditorMode.value === 'http-xml') {
    return 'HTTP 配置与 XML 报文体分开展示；Body 为实际上送的业务报文。';
  }
  return 'JSON 格式，包含 method、path、headers 与 body 业务参数。';
});

const expectedPayloadHint = computed(() => {
  if (requestEditorMode.value === 'tcp-xml') {
    return '断言响应 XML 中的 bizResCode / bizResText 等节点，无需配置 HTTP 状态码。';
  }
  if (requestEditorMode.value === 'http-xml') {
    return '可配置 statusCode 与 bodyAssertions，断言响应 XML 节点或文本内容。';
  }
  return '可配置 statusCode 与 bodyAssertions，断言响应 JSON 字段或 HTTP 状态。';
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

function applyRequestToForm(request: ApiTestCaseRow['request']) {
  const split = splitRequestForEditor(request);
  form.requestEditorMode = split.mode;
  form.requestJson = split.requestJson;
  form.requestMetaJson = split.requestMetaJson;
  form.requestTcpMeta = split.requestTcpMeta;
  form.requestBodyXml = split.requestBodyXml;
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
  applyRequestToForm(row.request);
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

function beautifyJsonField(field: 'requestJson' | 'expectedJson', label: string) {
  try {
    form[field] = beautifyCasePayloadJson(form[field]);
    message.success(`${label}已美化`);
  } catch {
    message.error(`${label}不是合法 JSON，无法美化`);
  }
}

function beautifyRequestJson() {
  if (requestEditorMode.value === 'tcp-xml') {
    form.requestBodyXml = beautifyRequestBodyXml(form.requestBodyXml);
    message.success('请求报文已美化');
    return;
  }
  if (requestEditorMode.value === 'http-xml') {
    try {
      form.requestMetaJson = beautifyCasePayloadJson(form.requestMetaJson);
      form.requestBodyXml = beautifyRequestBodyXml(form.requestBodyXml);
      message.success('请求报文已美化');
    } catch {
      message.error('HTTP 配置不是合法 JSON，无法美化');
    }
    return;
  }
  beautifyJsonField('requestJson', '请求报文');
}

function beautifyExpectedJson() {
  beautifyJsonField('expectedJson', '预期结果');
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
    applyRequestToForm({
      method: first.method,
      path: first.path,
      headers: { 'Content-Type': 'application/json' },
      body: {},
    });
  } else {
    form.requestEditorMode = 'json';
    form.requestJson = '{}';
    form.requestMetaJson = '';
    form.requestTcpMeta = null;
    form.requestBodyXml = '';
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
      request: mergeRequestFromEditor({
        mode: form.requestEditorMode,
        requestJson: form.requestJson,
        requestMetaJson: form.requestMetaJson,
        requestTcpMeta: form.requestTcpMeta,
        requestBodyXml: form.requestBodyXml,
      }),
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

function onDelete() {
  if (!projectId.value || !transactionId.value || !apiStore.activeCaseId) return;
  const row = activeCase.value;
  const label = row?.title || row?.caseNo || '该案例';
  Modal.confirm({
    title: '删除案例？',
    content: `确定删除「${label}」？删除后不可恢复，执行集关联也会一并移除。`,
    okType: 'danger',
    okText: '删除',
    cancelText: '取消',
    onOk: async () => {
      await apiStore.removeCase(
        projectId.value,
        transactionId.value,
        apiStore.activeCaseId,
      );
      isNewCase.value = false;
    },
  });
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

.batch-case-summary-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 108px 132px;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #eaecf0;
  font-size: 13px;
}

.batch-case-summary-list li:last-child {
  border-bottom: none;
}

.batch-case-summary-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-case-summary-tag {
  margin: 0;
  justify-self: start;
}

.batch-case-summary-no {
  justify-self: end;
  text-align: right;
  color: #667085;
  font-size: 12px;
  white-space: nowrap;
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

.case-transport-tag {
  margin-top: 4px;
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
  align-items: stretch;
}

.case-payload-item {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.case-payload-hint {
  margin: 0 0 8px;
  min-height: 3em;
  font-size: 12px;
  line-height: 1.5;
  color: #667085;
}

.case-payload-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 320px;
}

.case-payload-textarea {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.case-payload-textarea:deep(textarea.ant-input) {
  flex: 1;
  min-height: 280px;
  resize: vertical;
}

.case-payload-textarea--meta {
  flex: none;
}

.case-payload-textarea--meta:deep(textarea.ant-input) {
  flex: none;
  min-height: 0;
}

.editor-block-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.editor-block-title-row .editor-block-title {
  margin-bottom: 0;
}

.editor-block-title-row :deep(.ant-btn-link) {
  height: auto;
  padding: 0;
  font-size: 12px;
}

.case-json-editor {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.6;
}

.case-xml-editor {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre;
}

.request-split-label {
  margin: 8px 0 4px;
  font-size: 12px;
  color: var(--cf-text-secondary, #666);
}

.request-split-label:first-of-type {
  margin-top: 0;
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
