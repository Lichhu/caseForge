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
                  :color="caseProfileColor(resolveListItemRequest(item))"
                  size="small"
                >
                  {{ caseProfileLabel(resolveListItemRequest(item)) }}
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
              <div class="case-protocol-bar">
                <div class="case-protocol-field">
                  <span class="case-protocol-label">通讯协议</span>
                  <a-select
                    v-model:value="form.protocol"
                    :options="protocolOptions"
                    class="case-protocol-select"
                  />
                </div>
                <template v-if="form.protocol === 'http'">
                  <div class="case-protocol-field">
                    <span class="case-protocol-label">请求方法</span>
                    <a-select
                      v-model:value="form.httpMethod"
                      :options="httpMethodOptions"
                      class="case-protocol-select"
                    />
                  </div>
                  <div class="case-protocol-field case-protocol-field--grow">
                    <span class="case-protocol-label">路径</span>
                    <a-input
                      v-model:value="form.httpPath"
                      placeholder="请输入相对路径，系统根据环境和服务名进行 URL 拼接"
                    />
                  </div>
                </template>
                <div v-if="form.protocol === 'socket'" class="case-protocol-field">
                  <span class="case-protocol-label">编码</span>
                  <a-select
                    v-model:value="form.socketEncoding"
                    :options="encodingOptions"
                    class="case-protocol-select"
                  />
                </div>
              </div>

              <div class="case-payload-grid">
                <div class="case-payload-item">
                  <div class="editor-block-title-row">
                    <div class="editor-block-title">请求报文</div>
                    <a-button
                      v-if="requestTab === 'body' && canBeautifyBody"
                      type="link"
                      size="small"
                      @click="beautifyRequestJson"
                    >
                      <template #icon><FormatPainterOutlined /></template>
                      美化
                    </a-button>
                  </div>
                  <div class="case-request-tabs">
                    <button
                      v-for="tab in requestTabs"
                      :key="tab.key"
                      type="button"
                      class="case-request-tab"
                      :class="{ active: requestTab === tab.key }"
                      @click="requestTab = tab.key"
                    >
                      {{ tab.label }}
                      <span v-if="tab.count" class="case-request-tab-badge">{{ tab.count }}</span>
                    </button>
                  </div>
                  <div class="case-payload-fields">
                    <template v-if="requestTab === 'params'">
                      <p class="case-payload-hint">Query 参数将拼接到请求 URL 后。</p>
                      <KeyValueRowsEditor v-model:rows="form.queryRows" />
                    </template>
                    <template v-else-if="requestTab === 'headers'">
                      <p class="case-payload-hint">{{ headersTabHint }}</p>
                      <KeyValueRowsEditor v-model:rows="form.headerRows" />
                    </template>
                    <template v-else>
                      <div v-if="form.protocol === 'http'" class="case-body-format-bar">
                        <button
                          v-for="item in bodyFormatOptions"
                          :key="item.value"
                          type="button"
                          class="case-body-format-btn"
                          :class="{
                            active: form.bodyFormat === item.value,
                            disabled: !httpMethodHasBody(form.httpMethod),
                          }"
                          :disabled="!httpMethodHasBody(form.httpMethod)"
                          @click="form.bodyFormat = item.value"
                        >
                          {{ item.label }}
                        </button>
                      </div>
                      <div v-else class="case-body-format-bar">
                        <button
                          v-for="item in bodyFormatOptions"
                          :key="item.value"
                          type="button"
                          class="case-body-format-btn"
                          :class="{ active: form.bodyFormat === item.value }"
                          @click="form.bodyFormat = item.value"
                        >
                          {{ item.label }}
                        </button>
                      </div>
                      <p class="case-payload-hint">{{ bodyTabHint }}</p>
                      <template v-if="!httpMethodHasBody(form.httpMethod) && form.protocol === 'http'">
                        <div class="case-body-empty">GET / HEAD 请求无 Body，请使用 Params 配置查询参数。</div>
                      </template>
                      <template v-else-if="form.bodyFormat === 'json'">
                        <a-textarea
                          v-model:value="form.requestBodyJson"
                          class="editor-textarea case-json-editor case-payload-textarea"
                          placeholder="{}"
                        />
                      </template>
                      <template v-else-if="form.bodyFormat === 'xml'">
                        <a-textarea
                          v-model:value="form.requestBodyXml"
                          class="editor-textarea case-xml-editor case-payload-textarea"
                          placeholder="XML 报文"
                        />
                      </template>
                      <template v-else>
                        <a-textarea
                          v-model:value="form.requestBodyText"
                          class="editor-textarea case-payload-textarea"
                          placeholder="纯文本报文"
                        />
                      </template>
                    </template>
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
                  <a-collapse :bordered="false" class="expected-guide-collapse">
                    <a-collapse-panel key="guide" header="断言说明">
                      <p class="expected-guide-lead">
                        切换协议时会自动带出模板；一般只需改
                        <code>expected</code> 里的具体值，或先执行一次再对照实际响应微调。
                      </p>
                      <div class="expected-guide-section">
                        <div class="expected-guide-label">平台支持的检查项</div>
                        <ul class="expected-guide-list">
                          <li>
                            <code>statusCode</code>：HTTP 状态码，可写单个数字或数组（如
                            <code>200</code> 或 <code>[200, 201]</code>）
                          </li>
                          <li><code>statusOnly: true</code>：只检查状态码，不检查响应体</li>
                          <li>
                            <code>skipStatusCheck: true</code>：跳过状态码（Socket / MQ 用这个）
                          </li>
                          <li><code>maxDurationMs</code>：可选，响应时间上限（毫秒）</li>
                          <li><code>bodyAssertions</code>：响应体断言列表，可写多条</li>
                        </ul>
                      </div>
                      <div class="expected-guide-section">
                        <div class="expected-guide-label">bodyAssertions 支持的类型</div>
                        <ul class="expected-guide-list">
                          <li>
                            <code>contains</code>：响应里<strong>包含</strong>某段文字（XML / 文本最常用）
                          </li>
                          <li><code>equals</code>：与期望值<strong>完全相等</strong></li>
                          <li>
                            <code>jsonPath</code>：按路径取值后相等（JSON 响应，如
                            <code>path: "$.code"</code>）
                          </li>
                          <li><code>matches</code>：符合正则表达式</li>
                        </ul>
                      </div>
                      <div class="expected-guide-section">
                        <div class="expected-guide-label">通过规则</div>
                        <p class="expected-guide-text">
                          配置了哪几条，就要<strong>全部通过</strong>才算案例成功；不是整包响应一一对比。
                        </p>
                      </div>
                      <div class="expected-guide-section">
                        <div class="expected-guide-label">推荐步骤</div>
                        <ol class="expected-guide-steps">
                          <li>保持自动带出的模板，或点击下方「填入示例」</li>
                          <li>先执行一次，在执行报告里看实际响应</li>
                          <li>从响应里挑 1～3 个稳定特征（如 <code>000000</code>、<code>&lt;/Transaction&gt;</code>）写进断言</li>
                          <li>再执行，根据断言明细逐条调整</li>
                        </ol>
                      </div>
                      <div class="expected-guide-section">
                        <div class="expected-guide-label-row">
                          <span class="expected-guide-label">当前协议示例（可直接用）</span>
                          <a-button type="link" size="small" @click="applyExpectedExample">
                            填入示例
                          </a-button>
                        </div>
                        <pre class="expected-guide-example">{{ expectedExampleJson }}</pre>
                      </div>
                    </a-collapse-panel>
                  </a-collapse>
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
import KeyValueRowsEditor from '@/components/api-test/KeyValueRowsEditor.vue';
import {
  beautifyCasePayloadJson,
  beautifyRequestBodyXml,
  buildDefaultExpectedJson,
  buildDefaultHeaderRows,
  createEmptyKeyValueRow,
  defaultContentType,
  defaultEditorState,
  httpMethodHasBody,
  HTTP_METHODS,
  mergeRequestFromEditor,
  resolveEditorMode,
  splitRequestForEditor,
  type CaseBodyFormat,
  type CaseProtocol,
  type HttpMethod,
  type KeyValueRow,
  type SocketRequestMeta,
} from '@/utils/casePayloadFormat.util';

const apiStore = useApiTestStore();
const batchMode = ref(false);
const saving = ref(false);
const isNewCase = ref(false);
const syncingForm = ref(false);
const requestTab = ref<'params' | 'body' | 'headers'>('body');
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

const editingPreviewRequest = computed((): ApiCaseRequest => {
  try {
    return mergeRequestFromEditor({
      mode: requestEditorMode.value,
      protocol: form.protocol,
      bodyFormat: form.bodyFormat,
      httpMethod: form.httpMethod,
      httpPath: form.httpPath,
      headerRows: form.headerRows,
      queryRows: form.queryRows,
      socketEncoding: form.socketEncoding,
      requestBodyText: form.requestBodyText,
      requestBodyJson: form.requestBodyJson,
      requestJson: form.requestJson,
      requestMetaJson: form.requestMetaJson,
      requestTcpMeta: form.requestTcpMeta,
      requestBodyXml: form.requestBodyXml,
    });
  } catch {
    return {
      method: form.protocol === 'http' ? form.httpMethod : '',
      path: form.protocol === 'http' ? form.httpPath : '',
      transport:
        form.protocol === 'socket' ? 'tcp' : form.protocol === 'mq' ? 'mq' : 'http',
    };
  }
});

function resolveListItemRequest(item: ApiTestCaseRow): ApiCaseRequest {
  if (batchMode.value || !showEditor.value || isNewCase.value) {
    return item.request;
  }
  if (item.id === apiStore.activeCaseId) {
    return editingPreviewRequest.value;
  }
  return item.request;
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
  protocol: 'http' as CaseProtocol,
  bodyFormat: 'json' as CaseBodyFormat,
  httpMethod: 'POST' as HttpMethod,
  httpPath: '',
  headerRows: [createEmptyKeyValueRow()] as KeyValueRow[],
  queryRows: [createEmptyKeyValueRow()] as KeyValueRow[],
  socketEncoding: 'UTF-8',
  requestBodyText: '',
  requestBodyJson: '{}',
  requestJson: '',
  requestMetaJson: '',
  requestTcpMeta: null as SocketRequestMeta | null,
  requestBodyXml: '',
  expectedJson: '{}',
});

const requestEditorMode = computed(() =>
  resolveEditorMode(form.protocol, form.bodyFormat),
);

const protocolOptions = [
  { label: 'HTTP', value: 'http' },
  { label: 'Socket', value: 'socket' },
  { label: 'MQ', value: 'mq' },
];

const httpMethodOptions = HTTP_METHODS.map((method) => ({
  label: method,
  value: method,
}));

const bodyFormatOptions = [
  { label: 'JSON', value: 'json' as CaseBodyFormat },
  { label: 'XML', value: 'xml' as CaseBodyFormat },
  { label: 'Text', value: 'text' as CaseBodyFormat },
];

const encodingOptions = [
  { label: 'UTF-8', value: 'UTF-8' },
  { label: 'GBK', value: 'GBK' },
];

function countFilledRows(rows: KeyValueRow[]) {
  return rows.filter((row) => row.key.trim()).length;
}

const requestTabs = computed(() => {
  if (form.protocol === 'http') {
    return [
      { key: 'params' as const, label: 'Params', count: countFilledRows(form.queryRows) },
      { key: 'body' as const, label: 'Body', count: httpMethodHasBody(form.httpMethod) ? 1 : 0 },
      { key: 'headers' as const, label: 'Headers', count: countFilledRows(form.headerRows) },
    ];
  }
  return [
    { key: 'headers' as const, label: 'Headers', count: countFilledRows(form.headerRows) },
    { key: 'body' as const, label: 'Body', count: 1 },
  ];
});

const canBeautifyBody = computed(
  () =>
    httpMethodHasBody(form.httpMethod) || form.protocol !== 'http',
);

const headersTabHint = computed(() => {
  if (form.protocol === 'http') return '配置请求头，如 Content-Type、Authorization 等。';
  if (form.protocol === 'socket') return '配置 Socket 通讯头信息（键值对）。';
  return '配置 MQ 消息头信息（键值对）。';
});

const bodyTabHint = computed(() => {
  if (form.protocol === 'http') {
    return `${form.httpMethod} 请求 Body，格式选择 JSON / XML / Text。`;
  }
  if (form.protocol === 'socket') {
    return form.bodyFormat === 'xml'
      ? 'Socket 报文体；GBK 编码时自动附加 8 位长度前缀。'
      : `Socket 报文体，格式为 ${form.bodyFormat.toUpperCase()}。`;
  }
  return `MQ 消息体，格式为 ${form.bodyFormat.toUpperCase()}。`;
});

const expectedPayloadHint = computed(() => {
  if (form.protocol === 'http') {
    if (form.bodyFormat === 'xml') {
      return '可配置 statusCode 与 bodyAssertions，断言响应 XML 节点或文本内容。';
    }
    return '可配置 statusCode 与 bodyAssertions，断言响应 JSON 字段或 HTTP 状态。';
  }
  if (form.protocol === 'socket' || form.protocol === 'mq') {
    if (form.bodyFormat === 'xml') {
      return '断言响应 XML 中的 bizResCode / bizResText 等节点，无需配置 HTTP 状态码。';
    }
    return '断言响应报文业务码或关键字段，无需配置 HTTP 状态码。';
  }
  return '可配置 statusCode 与 bodyAssertions。';
});

const expectedExampleJson = computed(() =>
  buildDefaultExpectedJson(form.protocol, form.bodyFormat, form.polarity),
);

function applyExpectedExample() {
  form.expectedJson = expectedExampleJson.value;
  message.success('已填入当前协议的断言示例');
}

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
  () => form.protocol,
  (protocol) => {
    if (syncingForm.value) return;
    requestTab.value = protocol === 'http' ? 'params' : 'headers';
  },
);

watch(
  () => [form.protocol, form.bodyFormat] as const,
  ([protocol, bodyFormat], oldValue) => {
    if (syncingForm.value || !oldValue) return;
    const [oldProtocol, oldBodyFormat] = oldValue;
    if (protocol === oldProtocol && protocol === 'http' && bodyFormat !== oldBodyFormat) {
      const rows = [...form.headerRows];
      const ctIndex = rows.findIndex(
        (row) => row.key.trim().toLowerCase() === 'content-type',
      );
      if (ctIndex >= 0) {
        rows[ctIndex] = {
          ...rows[ctIndex],
          value: defaultContentType(bodyFormat),
        };
        form.headerRows = rows;
      }
      form.expectedJson = buildDefaultExpectedJson(
        protocol,
        bodyFormat,
        form.polarity,
      );
      return;
    }
    form.headerRows = buildDefaultHeaderRows(protocol, bodyFormat);
    form.expectedJson = buildDefaultExpectedJson(
      protocol,
      bodyFormat,
      form.polarity,
    );
    if (protocol === 'socket' && bodyFormat === 'xml') {
      form.socketEncoding = 'GBK';
    } else if (protocol === 'socket') {
      form.socketEncoding = 'UTF-8';
    }
  },
);

watch(
  () => form.httpMethod,
  (method) => {
    if (!httpMethodHasBody(method) && requestTab.value === 'body') {
      requestTab.value = 'params';
    }
  },
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
  form.protocol = split.protocol;
  form.bodyFormat = split.bodyFormat;
  form.httpMethod = split.httpMethod;
  form.httpPath = split.httpPath;
  form.headerRows = split.headerRows;
  form.queryRows = split.queryRows;
  form.socketEncoding = split.socketEncoding;
  form.requestBodyText = split.requestBodyText;
  form.requestBodyJson = split.requestBodyJson;
  form.requestJson = split.requestJson;
  form.requestMetaJson = split.requestMetaJson;
  form.requestTcpMeta = split.requestTcpMeta;
  form.requestBodyXml = split.requestBodyXml;
  requestTab.value = split.protocol === 'http' ? 'params' : 'headers';
}

function loadForm(row: ApiTestCaseRow) {
  syncingForm.value = true;
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
  syncingForm.value = false;
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
  if (form.bodyFormat === 'xml') {
    form.requestBodyXml = beautifyRequestBodyXml(form.requestBodyXml);
    message.success('请求报文已美化');
    return;
  }
  if (form.bodyFormat === 'json') {
    try {
      form.requestBodyJson = beautifyCasePayloadJson(form.requestBodyJson);
      message.success('请求报文已美化');
    } catch {
      message.error('JSON 不是合法格式，无法美化');
    }
    return;
  }
  message.info('纯文本报文无需美化');
}

function beautifyExpectedJson() {
  beautifyJsonField('expectedJson', '预期结果');
}

function onCreate() {
  batchMode.value = false;
  isNewCase.value = true;
  apiStore.activeCaseId = '';
  syncingForm.value = true;
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
    const split = defaultEditorState('http', 'json', first);
    form.protocol = split.protocol;
    form.bodyFormat = split.bodyFormat;
    form.httpMethod = 'POST';
    form.httpPath = first.path || '';
    form.headerRows = split.headerRows;
    form.queryRows = split.queryRows;
    form.socketEncoding = split.socketEncoding;
    form.requestBodyText = split.requestBodyText;
    form.requestBodyJson = split.requestBodyJson;
    form.requestJson = split.requestJson;
    form.requestMetaJson = split.requestMetaJson;
    form.requestTcpMeta = split.requestTcpMeta;
    form.requestBodyXml = split.requestBodyXml;
  } else {
    const split = defaultEditorState();
    form.protocol = split.protocol;
    form.bodyFormat = split.bodyFormat;
    form.httpMethod = split.httpMethod;
    form.httpPath = split.httpPath;
    form.headerRows = split.headerRows;
    form.queryRows = split.queryRows;
    form.socketEncoding = split.socketEncoding;
    form.requestBodyText = split.requestBodyText;
    form.requestBodyJson = split.requestBodyJson;
    form.requestJson = split.requestJson;
    form.requestMetaJson = split.requestMetaJson;
    form.requestTcpMeta = split.requestTcpMeta;
    form.requestBodyXml = split.requestBodyXml;
  }
  requestTab.value = 'params';
  form.expectedJson = buildDefaultExpectedJson(
    form.protocol,
    form.bodyFormat,
    form.polarity,
  );
  syncingForm.value = false;
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
        mode: requestEditorMode.value,
        protocol: form.protocol,
        bodyFormat: form.bodyFormat,
        httpMethod: form.httpMethod,
        httpPath: form.httpPath,
        headerRows: form.headerRows,
        queryRows: form.queryRows,
        socketEncoding: form.socketEncoding,
        requestBodyText: form.requestBodyText,
        requestBodyJson: form.requestBodyJson,
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
  grid-template-columns: minmax(0, 1fr) 140px 132px;
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

.case-protocol-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #f9fafb;
}

.case-protocol-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.case-protocol-field--grow {
  flex: 1;
  min-width: 220px;
}

.case-protocol-label {
  flex-shrink: 0;
  font-size: 12px;
  color: #667085;
  white-space: nowrap;
}

.case-protocol-select {
  min-width: 108px;
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
  min-height: 1.5em;
  font-size: 12px;
  line-height: 1.5;
  color: #667085;
}

.expected-guide-collapse {
  margin-bottom: 8px;
  background: #f9fafb;
  border-radius: 6px;
}

.expected-guide-collapse :deep(.ant-collapse-header) {
  padding: 8px 12px !important;
  font-size: 12px;
  color: #475467;
}

.expected-guide-collapse :deep(.ant-collapse-content-box) {
  padding: 0 12px 12px !important;
}

.expected-guide-lead {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.6;
  color: #475467;
}

.expected-guide-section + .expected-guide-section {
  margin-top: 10px;
}

.expected-guide-label,
.expected-guide-label-row .expected-guide-label {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #344054;
}

.expected-guide-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.expected-guide-list,
.expected-guide-steps {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.6;
  color: #475467;
}

.expected-guide-list li + li,
.expected-guide-steps li + li {
  margin-top: 4px;
}

.expected-guide-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #475467;
}

.expected-guide-example {
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  font-size: 11px;
  line-height: 1.5;
  color: #344054;
  background: #fff;
  border: 1px solid #eaecf0;
  border-radius: 6px;
}

.expected-guide-lead code,
.expected-guide-list code,
.expected-guide-steps code {
  padding: 1px 4px;
  font-size: 11px;
  background: #f2f4f7;
  border-radius: 4px;
}

.case-request-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  border-bottom: 1px solid #eaecf0;
}

.case-request-tab {
  position: relative;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: #667085;
  font-size: 13px;
  cursor: pointer;
}

.case-request-tab.active {
  color: #7f1d1d;
  font-weight: 600;
}

.case-request-tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: #7f1d1d;
  border-radius: 2px 2px 0 0;
}

.case-request-tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 999px;
  background: #eaecf0;
  color: #475467;
  font-size: 11px;
  font-weight: 500;
}

.case-body-format-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.case-body-format-btn {
  padding: 4px 10px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #475467;
  font-size: 12px;
  cursor: pointer;
}

.case-body-format-btn.active {
  border-color: #7f1d1d;
  background: #7f1d1d;
  color: #fff;
}

.case-body-format-btn.disabled,
.case-body-format-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.case-body-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 240px;
  border: 1px dashed #d0d5dd;
  border-radius: 8px;
  color: #667085;
  font-size: 13px;
  text-align: center;
  padding: 16px;
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
