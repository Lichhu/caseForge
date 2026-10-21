<template>
  <div class="api-step-editor">
    <div class="case-step-name-field">
      <span>步骤名称</span>
      <a-input v-model:value="editor.name" size="small" placeholder="步骤名称" />
    </div>
    <div class="case-step-detail-tabs">
      <button
        v-for="tab in detailTabs"
        :key="tab.key"
        type="button"
        class="case-editor-main-tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-show="activeTab === 'request'" class="case-editor-panel case-request-panel">
      <div class="case-request-shell">
        <div
          class="case-request-summary case-request-summary--clickable"
          role="button"
          tabindex="0"
          @click="configExpanded = !configExpanded"
          @keydown.enter="configExpanded = !configExpanded"
        >
          <span class="case-request-summary-method">{{ requestMethodLabel }}</span>
          <span class="case-request-summary-url" :title="fullRequestAddress">
            {{ fullRequestAddress || "请选择环境和地址" }}
          </span>
          <span class="case-request-summary-encoding">{{ editor.encoding }}</span>
          <a-button type="text" size="small" @click.stop="configExpanded = !configExpanded">
            {{ configExpanded ? "收起" : "展开" }}
            <DownOutlined :class="['request-config-chevron', { 'is-open': configExpanded }]" />
          </a-button>
        </div>

        <template v-if="configExpanded">
          <div class="case-request-config-block">
            <div class="case-target-bar">
              <div class="case-protocol-field case-protocol-field--target">
                <span class="case-protocol-label">环境</span>
                <a-select
                  v-model:value="editor.environmentId"
                  :options="environmentOptions"
                  :get-popup-container="popupContainer"
                  :dropdown-style="dropdownStyle"
                  size="small"
                  placeholder="选择环境"
                  allow-clear
                  @change="onEnvironmentChange"
                />
              </div>
              <div class="case-protocol-field case-protocol-field--target">
                <span class="case-protocol-label">地址</span>
                <a-select
                  v-model:value="editor.serviceId"
                  :options="serviceOptions"
                  :get-popup-container="popupContainer"
                  :dropdown-style="dropdownStyle"
                  show-search
                  option-filter-prop="searchText"
                  size="small"
                  placeholder="输入名称或地址筛选"
                  allow-clear
                  :disabled="!editor.environmentId"
                  @change="onServiceChange"
                />
              </div>
            </div>
            <div class="case-protocol-bar" :class="`case-protocol-bar--${editor.protocol}`">
              <div class="case-protocol-field case-protocol-field--protocol">
                <span class="case-protocol-label">通讯协议</span>
                <a-select
                  v-model:value="editor.protocol"
                  :options="protocolOptions"
                  :get-popup-container="popupContainer"
                  :dropdown-style="dropdownStyle"
                  size="small"
                  class="case-protocol-select"
                />
              </div>
              <template v-if="editor.protocol === 'http'">
                <div class="case-protocol-field case-protocol-field--method">
                  <span class="case-protocol-label">请求方法</span>
                  <a-select
                    v-model:value="editor.method"
                    :options="methodOptions"
                    :get-popup-container="popupContainer"
                    :dropdown-style="dropdownStyle"
                    size="small"
                    class="case-protocol-select"
                  />
                </div>
                <div class="case-protocol-field case-protocol-field--grow">
                  <span class="case-protocol-label">路径</span>
                  <a-input v-model:value="editor.path" size="small" placeholder="相对路径，按环境与服务拼接 URL" />
                </div>
              </template>
              <div class="case-protocol-field case-protocol-field--encoding">
                <span class="case-protocol-label">编码</span>
                <a-select
                  v-model:value="editor.encoding"
                  :options="encodingOptions"
                  :get-popup-container="popupContainer"
                  :dropdown-style="dropdownStyle"
                  size="small"
                  class="case-protocol-select"
                />
              </div>
            </div>
          </div>
        </template>

        <div class="case-request-toolbar">
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
          <div v-if="editor.protocol === 'http'" class="case-request-view-switch">
            <button type="button" :class="{ active: requestView === 'template' }" @click="requestView = 'template'">模板</button>
            <button type="button" :class="{ active: requestView === 'curl' }" @click="requestView = 'curl'">cURL</button>
          </div>
        </div>

        <div class="case-payload-fields case-payload-fields--body">
          <div v-if="requestView === 'curl' && editor.protocol === 'http'" class="case-curl-panel">
            <div class="case-curl-toolbar">
              <span>终端命令</span>
              <a-button type="link" size="small" @click="copyCurl">
                <template #icon><CopyOutlined /></template>
                复制
              </a-button>
            </div>
            <pre>{{ curlCommand }}</pre>
          </div>
          <template v-else-if="requestTab === 'params'">
            <KeyValueRowsEditor v-model:rows="editor.queryRows" />
          </template>
          <template v-else-if="requestTab === 'headers'">
            <KeyValueRowsEditor v-model:rows="editor.headerRows" />
          </template>
          <template v-else>
            <div class="case-body-panel">
              <div class="case-editor-surface">
                <div class="case-editor-chrome">
                  <div class="case-body-format-bar">
                    <button
                      v-for="item in bodyFormatOptions"
                      :key="item.value"
                      type="button"
                      class="case-body-format-btn"
                      :class="{ active: editor.bodyFormat === item.value }"
                      @click="switchBodyFormat(item.value)"
                    >
                      {{ item.label }}
                    </button>
                  </div>
                  <div class="case-editor-chrome-actions">
                    <a-button
                      type="link"
                      size="small"
                      :disabled="!hasBodyCursor || !sharedVariableOptions.length"
                      @click="openVariableInsert"
                    >
                      <LinkOutlined /> 插入变量
                    </a-button>
                    <a-button type="link" size="small" :disabled="!hasBodyCursor" @click="openFunctionInsert">
                      <CodeOutlined /> 插入函数
                    </a-button>
                    <a-button type="link" size="small" class="case-editor-beautify-btn" @click="beautifyBody">
                      <template #icon><FormatPainterOutlined /></template>
                      美化
                    </a-button>
                  </div>
                </div>
                <div class="case-editor-content">
                  <textarea
                    v-model="editor.body"
                    :class="[
                      'case-payload-textarea',
                      'case-payload-textarea--expand',
                      'case-payload-textarea--in-surface',
                      editor.bodyFormat === 'json' ? 'case-json-editor' : editor.bodyFormat === 'xml' ? 'case-xml-editor' : '',
                    ]"
                    :placeholder="editor.bodyFormat === 'xml' ? '<Transaction />' : editor.bodyFormat === 'json' ? '{}' : '纯文本报文'"
                    spellcheck="false"
                    @focus="rememberBodyCursor"
                    @click="rememberBodyCursor"
                    @keyup="rememberBodyCursor"
                  />
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div v-show="activeTab === 'assertion'" class="case-editor-panel case-assertion-panel">
      <div class="case-assertion-shell">
        <div class="case-assertion-toolbar">
          <div>
            <strong>断言内容（{{ editor.assertionRows.filter((row) => row.type && row.operator).length }}）</strong>
          </div>
          <div class="case-assertion-toolbar-actions">
            <a-button
              type="primary"
              size="small"
              :loading="assertionDebugRunning || generatingAssertions"
              :disabled="!canRunDebug"
              @click="generateAiAssertions"
            >
              <template #icon><RobotOutlined /></template>
              {{ assertionDebugRunning ? "正在请求接口" : generatingAssertions ? "正在生成断言" : "AI 生成断言" }}
            </a-button>
          </div>
        </div>
        <div v-if="assertionError" class="case-assertion-error">{{ assertionError }}</div>
        <AssertionRowsEditor
          v-model:rows="editor.assertionRows"
          :protocol="editor.protocol"
          :project-id="editorProjectId"
          class="case-debug-assertion-editor"
        />
      </div>
    </div>

    <div v-show="activeTab === 'variables'" class="case-editor-panel case-assertion-panel">
      <div class="case-assertion-shell">
        <div class="case-assertion-toolbar">
          <div><strong>变量提取（{{ editor.exports.length }}）</strong></div>
          <div class="case-assertion-toolbar-actions">
            <a-button type="primary" size="small" :loading="debugging" :disabled="!canRunDebug" @click="addExportFromDebug">
              <template #icon><ThunderboltOutlined /></template>
              调试添加
            </a-button>
          </div>
        </div>
        <div class="case-step-response-list">
          <a-table :data-source="editor.exports" :pagination="false" size="small" row-key="rowId">
            <a-table-column title="变量名 *" key="name">
              <template #default="{ record }"><a-input v-model:value="record.name" placeholder="accessToken" /></template>
            </a-table-column>
            <a-table-column title="来源" key="source" :width="110">
              <template #default="{ record }">
                <a-select
                  v-model:value="record.source"
                  size="small"
                  :options="exportSourceOptions"
                  :get-popup-container="popupContainer"
                  :dropdown-style="dropdownStyle"
                />
              </template>
            </a-table-column>
            <a-table-column title="提取表达式" key="expression">
              <template #default="{ record }">
                <a-input v-model:value="record.expression" placeholder="json:$.Transaction... | xml:/Transaction/./." />
              </template>
            </a-table-column>
            <a-table-column title="引用" key="reference" :width="160">
              <template #default="{ record }"><code v-if="record.name">{{ variableReference(record.name) }}</code></template>
            </a-table-column>
            <a-table-column key="action" :width="60" align="center">
              <template #title><a-button type="text" size="small" title="手动添加" @click="addExport"><PlusOutlined /></a-button></template>
              <template #default="{ index }">
                <a-button type="text" size="small" danger title="删除" @click="editor.exports.splice(index, 1)">
                  <MinusOutlined />
                </a-button>
              </template>
            </a-table-column>
          </a-table>
        </div>
        <a-empty
          v-if="!editor.exports.length"
          description="从本步骤请求/响应中提取共享变量，后续步骤用 ${变量名} 引用"
        />
      </div>
    </div>

    <div class="step-editor-footer">
      <div class="step-editor-footer__start">
        <a-button v-if="showDelete" danger :disabled="!canDelete" @click="emit('delete')">
          <template #icon><DeleteOutlined /></template>
          删除
        </a-button>
        <a-button :loading="debugging" :disabled="!canRunDebug" @click="debugStep">
          <template #icon><ThunderboltOutlined /></template>
          调试
        </a-button>
      </div>
      <span class="step-editor-footer__hint">{{ footerHint }}</span>
      <a-button type="primary" :loading="saving" @click="save">保存</a-button>
    </div>

    <a-modal
      v-model:open="variableInsertOpen"
      title="插入变量"
      :z-index="NESTED_OVERLAY_Z_INDEX + 10"
      ok-text="插入"
      @ok="insertVariable"
    >
      <a-form layout="vertical">
        <a-form-item label="变量" required>
          <a-select
            v-model:value="variableName"
            :options="sharedVariableOptions"
            :get-popup-container="popupContainer"
            :dropdown-style="nestedDropdownStyle"
            show-search
          />
        </a-form-item>
        <div class="function-expression-preview">
          <span>引用预览</span>
          <code>{{ variableName ? variableReference(variableName) : "" }}</code>
        </div>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="functionInsertOpen"
      title="插入数据函数"
      :width="680"
      :z-index="NESTED_OVERLAY_Z_INDEX + 10"
      ok-text="插入"
      @ok="insertFunction"
    >
      <a-form layout="vertical">
        <a-form-item label="函数" required>
          <a-select
            v-model:value="functionName"
            :get-popup-container="popupContainer"
            :dropdown-style="nestedDropdownStyle"
            show-search
            :filter-option="filterFunctionOption"
          >
            <a-select-option v-for="item in dataFunctions" :key="item.name" :value="item.name" :label="item.name">
              <span class="function-option-name">{{ item.name }}</span>
              <span v-if="item.description" class="function-option-desc">{{ item.description }}</span>
            </a-select-option>
          </a-select>
        </a-form-item>
        <p v-if="selectedFunction?.description" class="function-description-hint">{{ selectedFunction.description }}</p>
        <div v-if="selectedFunction?.params.length" class="function-argument-list">
          <label v-for="(param, index) in selectedFunction.params" :key="`${param}-${index}`" class="function-argument-row">
            <span :title="param">{{ index + 1 }}. {{ param }}</span>
            <a-auto-complete
              v-model:value="functionArgs[index]"
              :options="functionPathOptions(index)"
              :get-popup-container="popupContainer"
              :dropdown-style="nestedDropdownStyle"
              filter-option
              placeholder="选择或输入参数来源"
            />
          </label>
        </div>
        <a-form-item v-if="selectedFunction?.type === 'sql'" label="结果字段" required>
          <a-auto-complete
            v-model:value="functionField"
            :options="functionFieldOptions"
            :get-popup-container="popupContainer"
            :dropdown-style="nestedDropdownStyle"
            placeholder="选择或输入查询结果字段"
          />
        </a-form-item>
        <div class="function-expression-preview">
          <span>调用预览</span>
          <code>{{ functionPreview }}</code>
        </div>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="debugExportOpen"
      title="从调试添加提取"
      :z-index="NESTED_OVERLAY_Z_INDEX + 10"
      ok-text="添加"
      @ok="confirmDebugExport"
    >
      <a-form layout="vertical">
        <a-form-item label="来源">
          <a-select
            v-model:value="debugExportSource"
            :options="debugExportSourceOptions"
            :get-popup-container="popupContainer"
            :dropdown-style="nestedDropdownStyle"
            @change="syncDebugExportSelection"
          />
        </a-form-item>
        <a-form-item label="字段路径">
          <a-select
            v-model:value="debugExportPath"
            show-search
            :options="debugExportPathOptions"
            :get-popup-container="popupContainer"
            :dropdown-style="nestedDropdownStyle"
            placeholder="选择字段"
          />
        </a-form-item>
        <a-form-item label="变量名">
          <a-input v-model:value="debugExportName" placeholder="accessToken" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="debugResultOpen"
      title="步骤调试结果"
      :width="760"
      :z-index="NESTED_OVERLAY_Z_INDEX + 10"
      :footer="null"
    >
      <div v-if="debugResult" class="step-debug-result">
        <div class="step-debug-summary">
          <a-tag :color="debugResult.error ? 'error' : 'success'">{{ debugResult.error ? "失败" : "成功" }}</a-tag>
          <span>{{ debugResult.durationMs }} ms</span>
          <span>{{ debugResult.bodySize }} bytes</span>
        </div>
        <a-alert v-if="debugResult.error" type="error" :message="debugResult.error" show-icon />
        <pre v-else>{{ JSON.stringify(debugResult.body, null, 2) }}</pre>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import {
  CodeOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  FormatPainterOutlined,
  LinkOutlined,
  MinusOutlined,
  PlusOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons-vue";
import { message, Modal } from "ant-design-vue";
import type {
  ApiCaseRequest,
  ApiCaseStep,
  ApiCaseExport,
  ApiHttpCaseStep,
  ApiTransport,
} from "@case-forge/shared";
import { isHttpStep } from "@case-forge/shared";
import {
  debugRunCase,
  generateAssertions,
  getAssertionGenerateResult,
  getAssertionGenerateStatus,
  listDataFunctions,
} from "@/api/apiTestClient";
import { GLOBAL_LIBRARY_PROJECT_ID } from "@/constants/library";
import { NESTED_OVERLAY_Z_INDEX } from "@/constants/overlay-z-index";
import { useApiTestStore } from "@/stores/apiTest";
import {
  assertionsToRows,
  buildExpectedFromRows,
  type AssertionRow,
} from "@/utils/assertionRows.util";
import {
  beautifyRequestBodyXml,
  createEmptyKeyValueRow,
  httpMethodHasBody,
  type HttpMethod,
  type KeyValueRow,
} from "@/utils/casePayloadFormat.util";
import { copyText } from "@/utils/copyText";
import {
  getDebugResponseIssue,
  parseDebugResponseBody,
  responsePaths,
} from "@/utils/debugResponse.util";
import { messagePathOptions } from "@/utils/messagePathOptions";
import { randomUuid } from "@/utils/randomUuid";
import { dataFunctionFieldOptions } from "@/utils/sqlSelectColumns.util";
import AssertionRowsEditor from "./AssertionRowsEditor.vue";
import KeyValueRowsEditor from "./KeyValueRowsEditor.vue";

type BodyFormat = "json" | "xml" | "text";
type RequestTab = "params" | "body" | "headers";
type RequestView = "template" | "curl";
type EditorTab = "request" | "assertion" | "variables";
type ExportRow = {
  rowId: string;
  name: string;
  source: ApiCaseExport["source"];
  expression: string;
  required: boolean;
};
type StepVariableOption = { label: string; value: string };

const props = withDefaults(
  defineProps<{
    step: ApiCaseStep | null;
    projectId?: string;
    transactionId?: string;
    sharedVariables?: StepVariableOption[];
    saving?: boolean;
    showDelete?: boolean;
    canDelete?: boolean;
    footerHint?: string;
  }>(),
  {
    projectId: "",
    transactionId: "",
    sharedVariables: () => [],
    saving: false,
    showDelete: false,
    canDelete: true,
    footerHint: "",
  },
);

const emit = defineEmits<{
  save: [payload: { name: string; step: ApiHttpCaseStep }];
  delete: [];
}>();

const apiStore = useApiTestStore();
const editorProjectId = computed(
  () => props.projectId || GLOBAL_LIBRARY_PROJECT_ID,
);
const popupContainer = () => document.body;
const nestedDropdownStyle = { zIndex: NESTED_OVERLAY_Z_INDEX + 11 };
const dropdownStyle = { zIndex: NESTED_OVERLAY_Z_INDEX + 1 };
const detailTabs: Array<{ key: EditorTab; label: string }> = [
  { key: "request", label: "请求报文" },
  { key: "assertion", label: "断言" },
  { key: "variables", label: "变量提取" },
];
const protocolOptions = [
  { value: "http", label: "HTTP" },
  { value: "socket", label: "SOCKET" },
];
const methodOptions = ["GET", "POST", "PUT", "PATCH", "DELETE"].map((value) => ({
  value,
  label: value,
}));
const encodingOptions = ["UTF-8", "GBK"].map((value) => ({ value, label: value }));
const bodyFormatOptions: Array<{ value: BodyFormat; label: string }> = [
  { value: "json", label: "JSON" },
  { value: "xml", label: "XML" },
  { value: "text", label: "Text" },
];
const exportSourceOptions = [
  { label: "响应体", value: "body" },
  { label: "请求体", value: "request" },
  { label: "响应头", value: "header" },
  { label: "状态码", value: "status" },
];

const activeTab = ref<EditorTab>("request");
const requestTab = ref<RequestTab>("body");
const requestView = ref<RequestView>("template");
const configExpanded = ref(false);
const editor = reactive({
  name: "",
  environmentId: "",
  serviceId: "",
  targetName: "",
  address: "",
  protocol: "http" as "http" | "socket",
  method: "POST",
  path: "/",
  encoding: "UTF-8",
  bodyFormat: "json" as BodyFormat,
  body: "{}",
  bodyDrafts: { json: "{}", xml: "<Transaction></Transaction>", text: "" } as Record<BodyFormat, string>,
  queryRows: [createEmptyKeyValueRow()] as KeyValueRow[],
  headerRows: [createEmptyKeyValueRow()] as KeyValueRow[],
  assertionRows: [] as AssertionRow[],
  exports: [] as ExportRow[],
});
const originalStep = ref<ApiHttpCaseStep | null>(null);
const lastLoadedStepId = ref("");
const bodyCursor = reactive({ start: 0, end: 0 });
const hasBodyCursor = ref(false);
const debugging = ref(false);
const assertionDebugRunning = ref(false);
const generatingAssertions = ref(false);
const assertionError = ref("");
const debugResult = ref<Awaited<ReturnType<typeof debugRunCase>> | null>(null);
const debugResultOpen = ref(false);

const environmentOptions = computed(() =>
  apiStore.environments
    .filter((item) => item.enabled)
    .map((item) => ({ label: item.name, value: item.id })),
);
const serviceOptions = computed(() =>
  (apiStore.environmentServices[editor.environmentId] ?? [])
    .filter((item) => item.enabled)
    .map((item) => ({
      label: `${item.name}${serviceAddress(item) ? ` · ${serviceAddress(item)}` : ""}`,
      value: item.id,
      searchText: `${item.name} ${serviceAddress(item)}`,
    })),
);
const selectedService = computed(() =>
  (apiStore.environmentServices[editor.environmentId] ?? []).find(
    (item) => item.id === editor.serviceId,
  ),
);
const selectedEnvironment = computed(() =>
  apiStore.environments.find((item) => item.id === editor.environmentId),
);
const sharedVariableOptions = computed(() => {
  const seen = new Set<string>();
  return props.sharedVariables.filter((item) => {
    if (!item.value || seen.has(item.value)) return false;
    seen.add(item.value);
    return true;
  });
});
const canRunDebug = computed(
  () =>
    Boolean(editor.address.trim()) &&
    Boolean(props.projectId) &&
    Boolean(props.transactionId),
);
const requestMethodLabel = computed(() =>
  editor.protocol === "http" ? editor.method : editor.protocol.toUpperCase(),
);
const fullRequestAddress = computed(() => {
  if (editor.protocol !== "http") {
    return (
      serviceAddress(selectedService.value ?? {}) ||
      editor.address.trim()
    );
  }
  const environment = selectedEnvironment.value;
  const service = selectedService.value;
  let baseUrl =
    service?.baseUrl?.trim() ||
    service?.serverAddress?.trim() ||
    environment?.baseUrl?.trim() ||
    editor.address.trim() ||
    "";
  if (!baseUrl) return "";
  if (
    service?.pathPrefix?.trim() &&
    !service.baseUrl?.trim() &&
    !service.serverAddress?.trim()
  ) {
    baseUrl = `${baseUrl.replace(/\/$/, "")}/${service.pathPrefix.replace(/^\//, "")}`;
  }
  const query = new URLSearchParams(
    editor.queryRows
      .filter((row) => row.key.trim())
      .map((row) => [row.key.trim(), row.value]),
  ).toString();
  const url = `${baseUrl.replace(/\/$/, "")}/${(editor.path.trim() || "/").replace(/^\//, "")}`;
  return query ? `${url}?${query}` : url;
});
const curlCommand = computed(() => {
  let request: ApiCaseRequest;
  try {
    request = buildRequest();
  } catch {
    return "";
  }
  const parts = [
    `curl --request ${request.method || "GET"}`,
    shellQuote(fullRequestAddress.value || request.path || "/"),
  ];
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    parts.push(`--header ${shellQuote(`${key}: ${value}`)}`);
  }
  if (request.body !== undefined && request.body !== null && request.body !== "") {
    const body =
      typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body);
    parts.push(`--data-raw ${shellQuote(body)}`);
  }
  return parts.join(" \\\n  ");
});
const requestTabs = computed<Array<{ key: RequestTab; label: string; count: number }>>(() => {
  if (editor.protocol === "http") {
    const tabs: Array<{ key: RequestTab; label: string; count: number }> = [
      { key: "params", label: "Params", count: countFilledRows(editor.queryRows) },
    ];
    if (httpMethodHasBody(editor.method as HttpMethod)) {
      tabs.push({ key: "body", label: "Body", count: 1 });
    }
    tabs.push({ key: "headers", label: "Headers", count: countFilledRows(editor.headerRows) });
    return tabs;
  }
  return [
    { key: "body", label: "Body", count: 1 },
    { key: "headers", label: "Headers", count: countFilledRows(editor.headerRows) },
  ];
});

watch(
  () => props.step,
  (step) => {
    if (step && isHttpStep(step)) void initEditor(step);
  },
  { immediate: true },
);
watch(
  () => editor.protocol,
  (protocol) => {
    if (protocol === "socket") {
      requestTab.value = "body";
      requestView.value = "template";
    } else {
      requestTab.value = editor.method === "GET" ? "params" : "body";
    }
  },
);
watch(
  () => editor.method,
  (method) => {
    if (editor.protocol !== "http") return;
    requestTab.value = method === "GET" ? "params" : "body";
  },
);

async function initEditor(step: ApiHttpCaseStep) {
  const preserveTab = lastLoadedStepId.value === step.id;
  const previousTab = activeTab.value;
  const previousRequestTab = requestTab.value;
  const previousRequestView = requestView.value;
  const previousConfigExpanded = configExpanded.value;
  const request = step.request;
  const body =
    request.body == null
      ? ""
      : typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body, null, 2);
  const bodyFormat: BodyFormat = request.contentType?.includes("xml")
    ? "xml"
    : request.contentType?.includes("text/plain")
      ? "text"
      : "json";
  const toRows = (record?: Record<string, string | number | boolean>) =>
    Object.entries(record ?? {}).map(([key, value]) => ({
      id: randomUuid(),
      key,
      value: String(value),
    }));
  const queryRows = toRows(request.query);
  const headerRows = toRows(request.headers);
  Object.assign(editor, {
    name: step.name ?? "",
    environmentId: step.target?.environmentId ?? "",
    serviceId: step.target?.environmentServiceId ?? "",
    targetName: step.target?.name ?? "",
    address: step.target?.address ?? "",
    protocol: request.transport === "tcp" ? "socket" : "http",
    method: request.method || "POST",
    path: request.path || "/",
    encoding: request.encoding || request.framing?.encoding || "UTF-8",
    bodyFormat,
    body: body || (bodyFormat === "json" ? "{}" : ""),
    bodyDrafts: {
      json: bodyFormat === "json" ? body : "{}",
      xml: bodyFormat === "xml" ? body : "<Transaction></Transaction>",
      text: bodyFormat === "text" ? body : "",
    },
    queryRows: queryRows.length ? queryRows : [createEmptyKeyValueRow()],
    headerRows: headerRows.length ? headerRows : [createEmptyKeyValueRow()],
    assertionRows: assertionsToRows(step.expected.assertions),
    exports: (step.exports ?? []).map((item) => ({
      rowId: randomUuid(),
      name: item.name,
      source: item.source,
      expression: item.expression ?? "",
      required: item.required ?? false,
    })),
  });
  originalStep.value = step;
  if (preserveTab) {
    activeTab.value = previousTab;
    requestTab.value = previousRequestTab;
    requestView.value = previousRequestView;
    configExpanded.value = previousConfigExpanded;
  } else {
    activeTab.value = "request";
    requestTab.value =
      editor.protocol === "http" && editor.method === "GET" ? "params" : "body";
    requestView.value = "template";
    configExpanded.value = false;
  }
  if (!requestTabs.value.some((tab) => tab.key === requestTab.value)) {
    requestTab.value = requestTabs.value[0]?.key ?? "body";
  }
  lastLoadedStepId.value = step.id;
  assertionError.value = "";
  debugResult.value = null;
  await ensureEnvironments();
  await resolveTarget(step);
}

async function ensureEnvironments() {
  if (!props.projectId || apiStore.environments.length) return;
  try {
    await apiStore.refreshEnvironments(props.projectId);
  } catch {
    // 环境加载失败不阻断步骤内容编辑。
  }
}

async function loadServices(environmentId: string) {
  if (!environmentId || !props.projectId) return;
  if (apiStore.environmentServices[environmentId]) return;
  try {
    await apiStore.refreshEnvironmentServices(props.projectId, environmentId);
  } catch {
    // 保持手工地址可编辑。
  }
}

async function resolveTarget(step: ApiHttpCaseStep) {
  const target = step.target;
  if (target?.environmentId) {
    await loadServices(target.environmentId);
    if (target.environmentServiceId) {
      editor.serviceId = target.environmentServiceId;
    }
    return;
  }
  if (!target?.address) return;
  for (const environment of apiStore.environments) {
    await loadServices(environment.id);
    const service = (apiStore.environmentServices[environment.id] ?? []).find((item) => {
      const address = serviceAddress(item);
      return (
        address === target.address &&
        (!target.name || item.name === target.name)
      );
    });
    if (service) {
      editor.environmentId = environment.id;
      editor.serviceId = service.id;
      editor.targetName = service.name;
      editor.address = serviceAddress(service);
      return;
    }
  }
}

function serviceAddress(service: {
  serverAddress?: string;
  baseUrl?: string;
  host?: string;
  port?: number;
}) {
  return (
    service.serverAddress?.trim() ||
    service.baseUrl?.trim() ||
    (service.host && service.port ? `${service.host}:${service.port}` : "")
  );
}

async function onEnvironmentChange() {
  editor.serviceId = "";
  editor.targetName = "";
  editor.address = "";
  if (editor.environmentId) {
    delete apiStore.environmentServices[editor.environmentId];
    await loadServices(editor.environmentId);
  }
}

function onServiceChange() {
  if (!selectedService.value) return;
  editor.targetName = selectedService.value.name;
  editor.address = serviceAddress(selectedService.value);
  editor.protocol = selectedService.value.transport === "tcp" ? "socket" : "http";
}

function rememberBodyCursor(event: Event) {
  const input = event.target as HTMLTextAreaElement;
  bodyCursor.start = input.selectionStart;
  bodyCursor.end = input.selectionEnd;
  hasBodyCursor.value = true;
}

function switchBodyFormat(format: BodyFormat) {
  editor.bodyDrafts[editor.bodyFormat] = editor.body;
  editor.bodyFormat = format;
  editor.body = editor.bodyDrafts[format];
}

function beautifyBody() {
  try {
    editor.body =
      editor.bodyFormat === "json"
        ? JSON.stringify(JSON.parse(editor.body), null, 2)
        : beautifyRequestBodyXml(editor.body);
  } catch {
    message.warning("报文格式不正确");
  }
}

function countFilledRows(rows: KeyValueRow[]) {
  return rows.filter((row) => row.key.trim()).length;
}

function toRecord(rows: KeyValueRow[]) {
  return Object.fromEntries(
    rows
      .filter((row) => row.key.trim())
      .map((row) => [row.key.trim(), row.value]),
  );
}

function buildRequest(): ApiCaseRequest {
  const body =
    editor.bodyFormat === "json"
      ? JSON.parse(editor.body || "{}")
      : editor.body;
  return {
    method: editor.protocol === "socket" ? "POST" : editor.method,
    path: editor.protocol === "socket" ? "" : editor.path || "/",
    transport: editor.protocol === "socket" ? "tcp" : "http",
    contentType:
      editor.bodyFormat === "json"
        ? "application/json"
        : editor.bodyFormat === "xml"
          ? "application/xml"
          : "text/plain",
    encoding: editor.encoding,
    query: editor.protocol === "http" ? toRecord(editor.queryRows) : undefined,
    headers: toRecord(editor.headerRows),
    body,
    bodyText: editor.body,
  };
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

async function copyCurl() {
  if (!curlCommand.value) return message.warning("请求配置不完整");
  await copyText(curlCommand.value);
  message.success("cURL 已复制");
}

function variableReference(name: string) {
  return `{{${name}}}`;
}

const variableInsertOpen = ref(false);
const variableName = ref("");
function openVariableInsert() {
  variableName.value = sharedVariableOptions.value[0]?.value ?? "";
  variableInsertOpen.value = true;
}
function insertVariable() {
  if (!variableName.value) return message.warning("请选择变量");
  const expression = variableReference(variableName.value);
  editor.body = `${editor.body.slice(0, bodyCursor.start)}${expression}${editor.body.slice(bodyCursor.end)}`;
  variableInsertOpen.value = false;
}

const functionInsertOpen = ref(false);
const dataFunctions = ref<Awaited<ReturnType<typeof listDataFunctions>>>([]);
const functionName = ref("");
const functionArgs = ref<string[]>([]);
const functionField = ref("");
const selectedFunction = computed(() =>
  dataFunctions.value.find((item) => item.name === functionName.value),
);
const functionFieldOptions = computed(() =>
  dataFunctionFieldOptions(selectedFunction.value?.config).map((value) => ({
    value,
  })),
);
const functionPreview = computed(() => {
  const call = `\${${functionName.value || "函数名"}(${functionArgs.value.join(", ")})`;
  if (selectedFunction.value?.type !== "sql") return `${call}}`;
  const field = functionField.value.trim();
  return `${call}.${field || "字段"}}`;
});
watch(selectedFunction, (fn) => {
  functionArgs.value = (fn?.params ?? []).map(
    (_, index) => functionArgs.value[index] ?? "",
  );
  functionField.value = "";
});
function functionPathOptions(index: number) {
  const keyword = (functionArgs.value[index] ?? "").trim().toLowerCase();
  return messagePathOptions(editor.body).filter(
    (item) => !keyword || item.value.toLowerCase().includes(keyword),
  );
}
function filterFunctionOption(input: string, option: { value?: unknown }) {
  const keyword = input.trim().toLowerCase();
  if (!keyword) return true;
  const item = dataFunctions.value.find((row) => row.name === option.value);
  if (!item) return false;
  return (
    item.name.toLowerCase().includes(keyword) ||
    (item.description ?? "").toLowerCase().includes(keyword)
  );
}
async function openFunctionInsert() {
  if (!hasBodyCursor.value) return;
  try {
    dataFunctions.value = await listDataFunctions(editorProjectId.value);
    functionName.value ||= dataFunctions.value[0]?.name ?? "";
    functionArgs.value = (selectedFunction.value?.params ?? []).map(
      (_, index) => functionArgs.value[index] ?? "",
    );
    functionField.value = "";
    functionInsertOpen.value = true;
  } catch (error) {
    message.error(error instanceof Error ? error.message : "加载数据函数失败");
  }
}
function insertFunction() {
  if (!functionName.value) return message.warning("请选择函数");
  if (selectedFunction.value?.type === "sql" && !functionField.value.trim()) {
    return message.warning("请选择结果字段");
  }
  const expression = functionPreview.value;
  editor.body = `${editor.body.slice(0, bodyCursor.start)}${expression}${editor.body.slice(bodyCursor.end)}`;
  functionInsertOpen.value = false;
}

function targetPayload() {
  return {
    name: editor.targetName || selectedService.value?.name || "",
    address: editor.address.trim(),
    environmentId: editor.environmentId || undefined,
    environmentServiceId: editor.serviceId || undefined,
  };
}

function buildStep(): ApiHttpCaseStep | null {
  const name = editor.name.trim();
  if (!name) {
    message.warning("请填写步骤名称");
    return null;
  }
  if (editor.exports.some((item) => !item.name.trim())) {
    message.warning("变量提取的变量名不能为空");
    return null;
  }
  let request: ApiCaseRequest;
  try {
    request = buildRequest();
  } catch {
    message.error("请求报文不是合法 JSON");
    return null;
  }
  const base: ApiHttpCaseStep = originalStep.value ?? {
    id: randomUuid(),
    name,
    request,
    expected: {},
    exports: [],
  };
  return {
    ...base,
    name,
    target: { ...(base.target ?? {}), ...targetPayload() },
    request: { ...base.request, ...request },
    expected: buildExpectedFromRows(editor.assertionRows),
    exports: editor.exports
      .filter((item) => item.name.trim())
      .map((item) => ({
        name: item.name.trim(),
        source: item.source,
        expression:
          item.source === "status" ? undefined : item.expression.trim(),
        required: item.required,
      })),
  };
}

function save() {
  const step = buildStep();
  if (step) emit("save", { name: step.name, step });
}

async function runDebug() {
  if (!canRunDebug.value || !props.projectId || !props.transactionId) {
    message.warning("请先选择环境和地址");
    return null;
  }
  let request: ApiCaseRequest;
  try {
    request = buildRequest();
  } catch {
    message.error("请求报文不是合法 JSON");
    return null;
  }
  try {
    return await debugRunCase(props.projectId, props.transactionId, {
      request,
      expected: buildExpectedFromRows(editor.assertionRows),
      target: targetPayload(),
      environmentId: editor.environmentId || undefined,
      environmentServiceId: editor.serviceId || undefined,
      encoding: editor.encoding,
    });
  } catch (error) {
    message.error(error instanceof Error ? error.message : "调试失败");
    return null;
  }
}

async function debugStep() {
  debugging.value = true;
  try {
    const result = await runDebug();
    if (result) {
      debugResult.value = result;
      debugResultOpen.value = true;
    }
  } finally {
    debugging.value = false;
  }
}

async function generateAiAssertions() {
  if (!canRunDebug.value || !props.projectId || !props.transactionId) {
    message.warning("请先选择环境和地址");
    return;
  }
  assertionError.value = "";
  assertionDebugRunning.value = true;
  try {
    const result = await runDebug();
    if (!result) return;
    const responseIssue = getDebugResponseIssue(result);
    if (responseIssue) throw new Error(result.error || responseIssue);
    if (editor.assertionRows.some((row) => Boolean(row.type && row.operator))) {
      const confirmed = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: "响应获取成功，覆盖已有断言？",
          content: "AI 生成的断言将整段替换当前断言。",
          okText: "生成并替换",
          cancelText: "保留原断言",
          centered: true,
          closable: true,
          maskClosable: true,
          zIndex: NESTED_OVERLAY_Z_INDEX + 10,
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!confirmed) return;
    }
    generatingAssertions.value = true;
    const transport = editor.protocol === "socket" ? "tcp" : "http";
    const messageFormat =
      editor.bodyFormat === "xml"
        ? "xml"
        : editor.bodyFormat === "text"
          ? "text"
          : "json";
    const job = await generateAssertions(props.projectId, props.transactionId, {
      transport,
      messageFormat,
      polarity: "positive",
      statusCode: result.statusCode,
      headers: result.headers,
      body: result.body,
    });
    while (true) {
      const status = await getAssertionGenerateStatus(
        props.projectId,
        props.transactionId,
        undefined,
        job.jobId,
      );
      if (status.phase === "completed") break;
      if (status.phase === "failed" || status.phase === "cancelled") {
        throw new Error(status.errorMessage || "AI 生成断言失败");
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    const { assertions } = await getAssertionGenerateResult(
      props.projectId,
      props.transactionId,
      undefined,
      job.jobId,
    );
    editor.assertionRows = assertionsToRows(assertions);
    message.success("断言已生成");
  } catch (error) {
    assertionError.value = `请求未成功，未调用 AI：${
      error instanceof Error ? error.message : "请检查请求配置"
    }`;
  } finally {
    assertionDebugRunning.value = false;
    generatingAssertions.value = false;
  }
}

function addExport() {
  editor.exports.push({
    rowId: randomUuid(),
    name: "",
    source: "body",
    expression: "",
    required: true,
  });
}

const debugExportOpen = ref(false);
const debugExportPath = ref("");
const debugExportName = ref("");
const debugExportSource = ref<"body" | "request">("body");
const debugExportSourceOptions = [
  { label: "响应体", value: "body" },
  { label: "请求体", value: "request" },
];
const debugResponsePathOptions = ref<Array<{ label: string; value: string }>>([]);
const debugRequestPathOptions = ref<Array<{ label: string; value: string }>>([]);
const debugExportPathOptions = computed(() =>
  debugExportSource.value === "request"
    ? debugRequestPathOptions.value
    : debugResponsePathOptions.value,
);
async function addExportFromDebug() {
  debugging.value = true;
  try {
    const result = await runDebug();
    if (!result) return;
    const responsePathList = responsePaths(parseDebugResponseBody(result.body));
    const requestPathList = responsePaths(parseDebugResponseBody(result.requestBody));
    if (result.error && !requestPathList.length) {
      return message.warning(`调试请求失败：${result.error}`);
    }
    if (!responsePathList.length && !requestPathList.length) {
      return message.warning("请求/响应体中没有识别到 JSON 或 XML 字段");
    }
    debugResponsePathOptions.value = responsePathList.map((value) => ({ label: value, value }));
    debugRequestPathOptions.value = requestPathList.map((value) => ({ label: value, value }));
    debugExportSource.value = responsePathList.length ? "body" : "request";
    syncDebugExportSelection();
    debugExportOpen.value = true;
  } finally {
    debugging.value = false;
  }
}
function syncDebugExportSelection() {
  debugExportPath.value = debugExportPathOptions.value[0]?.value ?? "";
  const pathParts = debugExportPath.value
    .split(/[./[\]]/)
    .filter((item) => item && item !== "text()");
  debugExportName.value = pathParts[pathParts.length - 1] ?? "";
}
function confirmDebugExport() {
  if (!debugExportPath.value || !debugExportName.value.trim()) {
    return message.warning("请选择字段并填写变量名");
  }
  if (
    editor.exports.some(
      (item) => item.name.trim() === debugExportName.value.trim(),
    )
  ) {
    return message.warning("变量名已存在，请换一个");
  }
  editor.exports.push({
    rowId: randomUuid(),
    name: debugExportName.value.trim(),
    source: debugExportSource.value,
    expression: debugExportPath.value,
    required: true,
  });
  debugExportOpen.value = false;
}
</script>

<style scoped>
.api-step-editor {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.case-step-name-field { display: grid; gap: 6px; margin-bottom: 12px; }
.case-step-name-field :deep(.ant-input) { height: 30px; }
.case-step-detail-tabs { display: flex; margin-bottom: 12px; border-bottom: 1px solid #eaecf0; }
.case-editor-main-tab {
  position: relative;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: #667085;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.case-editor-main-tab.active { color: #7f1d1d; font-weight: 600; }
.case-editor-main-tab.active::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: #7f1d1d;
}
.case-editor-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.case-request-panel { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.case-request-shell {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid #eaecf0;
  background: #fff;
}
.case-assertion-shell { border: 1px solid #eaecf0; background: #fff; }
.case-assertion-panel .case-assertion-shell {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.case-request-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 6px 12px;
  border-bottom: 1px solid #eaecf0;
  background: #fafbfc;
}
.case-request-summary--clickable { cursor: pointer; user-select: none; }
.case-request-summary--clickable:hover { background: #f2f4f7; }
.case-request-summary-method { color: #b50930; font-weight: 700; }
.case-request-summary-url {
  overflow: hidden;
  color: #344054;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.case-request-summary-encoding { color: #667085; font-size: 12px; }
.request-config-chevron { margin-left: 4px; transition: transform 0.2s; }
.request-config-chevron.is-open { transform: rotate(180deg); }
.case-request-config-block { background: #fafbfc; }
.case-target-bar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 10px 12px;
  border-bottom: 1px solid #eaecf0;
}
.case-protocol-field--target :deep(.ant-select) { width: 100%; }
.case-protocol-bar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid #f2f4f7;
  flex-shrink: 0;
}
.case-protocol-bar--http .case-protocol-field--grow { grid-row: 2; grid-column: 2; }
.case-protocol-bar--http .case-protocol-field--encoding { grid-row: 2; grid-column: 1; }
.case-protocol-field {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.case-protocol-label { font-size: 12px; color: #667085; text-align: right; white-space: nowrap; }
.case-protocol-select { width: 100%; min-width: 0; }
.case-request-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  border-bottom: 1px solid #f2f4f7;
  flex-shrink: 0;
}
.case-request-tabs { display: flex; gap: 2px; min-width: 0; }
.case-request-tab {
  position: relative;
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: #667085;
  font-size: 12px;
  cursor: pointer;
}
.case-request-tab.active { color: #7f1d1d; font-weight: 600; }
.case-request-tab.active::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: #7f1d1d;
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
.case-request-view-switch { display: flex; margin-left: auto; border: 1px solid #d0d5dd; }
.case-request-view-switch button {
  height: 26px;
  padding: 0 12px;
  border: 0;
  border-right: 1px solid #d0d5dd;
  background: #fff;
  color: #475467;
  cursor: pointer;
}
.case-request-view-switch button:last-child { border-right: 0; }
.case-request-view-switch button.active { background: #b50930; color: #fff; }
.case-curl-panel { display: flex; min-height: 320px; flex-direction: column; border: 1px solid #eaecf0; background: #fff; }
.case-curl-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid #eaecf0;
  background: #f9fafb;
  color: #475467;
  font-size: 12px;
}
.case-curl-panel pre {
  flex: 1;
  margin: 0;
  padding: 14px;
  overflow: auto;
  color: #1d2939;
  font: 12px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
.case-payload-fields { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: hidden; }
.case-payload-fields--body { display: flex; flex: 1; min-height: 0; padding: 12px; }
.case-body-panel { display: flex; flex: 1; flex-direction: column; gap: 6px; min-width: 0; min-height: 0; overflow: hidden; }
.case-editor-surface {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid #eaecf0;
  background: #fff;
}
.case-editor-chrome {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid #f2f4f7;
  background: #fafbfc;
}
.case-editor-chrome-actions { display: flex; flex-shrink: 0; align-items: center; gap: 2px; }
.case-editor-content { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: hidden; }
.case-editor-beautify-btn { flex-shrink: 0; height: auto; padding: 0 4px; font-size: 12px; }
.case-body-format-bar { display: inline-flex; overflow: hidden; border: 1px solid #d0d5dd; background: #fff; }
.case-body-format-btn {
  padding: 2px 10px;
  border: none;
  border-right: 1px solid #d0d5dd;
  border-radius: 0;
  background: #fff;
  color: #475467;
  font-size: 11px;
  line-height: 20px;
  cursor: pointer;
}
.case-body-format-btn:last-child { border-right: none; }
.case-body-format-btn.active { background: #7f1d1d; color: #fff; }
.case-editor-surface .case-payload-textarea--in-surface {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 160px;
  padding: 8px 10px;
  overflow: auto;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  resize: none;
}
.case-payload-textarea--expand { display: block; width: 100%; box-sizing: border-box; }
.case-payload-textarea--expand.case-xml-editor { white-space: pre; }
.case-json-editor { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 12px; line-height: 1.6; }
.case-xml-editor { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 12px; line-height: 1.5; }
.case-assertion-toolbar {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid #f2f4f7;
}
.case-assertion-toolbar-actions { display: flex; flex: 1; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; }
.case-assertion-error {
  margin: 12px 12px 0;
  padding: 8px 10px;
  border: 1px solid #fecdca;
  background: #fef3f2;
  color: #b42318;
  font-size: 12px;
}
.case-debug-assertion-editor { flex: 1; min-height: 0; max-height: none; margin: 12px; overflow: auto; }
.case-assertion-panel { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.case-step-response-list { flex: 1; min-height: 0; max-height: none; overflow: auto; }
.case-step-response-list :deep(.ant-table) { min-width: 640px; }
.step-editor-footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid #eaecf0;
}
.step-editor-footer__start { display: flex; align-items: center; gap: 8px; }
.step-editor-footer__hint { flex: 1; color: #98a2b3; font-size: 12px; line-height: 1.4; }
.step-debug-result { display: grid; gap: 12px; }
.step-debug-summary { display: flex; align-items: center; gap: 12px; color: #606875; }
.step-debug-result pre {
  max-height: 480px;
  overflow: auto;
  padding: 12px;
  border: 1px solid #e1e4e9;
  background: #fafbfc;
  white-space: pre-wrap;
}
.function-option-name { font-weight: 500; }
.function-option-desc { margin-left: 8px; color: #98a2b3; font-size: 12px; }
.function-description-hint { margin: -8px 0 12px; color: var(--cf-text-secondary, #667085); font-size: 12px; }
.function-argument-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; max-height: 300px; margin-bottom: 16px; padding-right: 4px; overflow-y: auto; }
.function-argument-row { display: grid; gap: 5px; min-width: 0; }
.function-argument-row > span { overflow: hidden; color: var(--cf-text-secondary, #667085); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.function-expression-preview { display: grid; gap: 5px; padding: 10px 12px; border-radius: 6px; background: var(--cf-surface-soft, #f8f9fb); }
.function-expression-preview > span { color: var(--cf-text-muted, #98a2b3); font-size: 11px; }
.function-expression-preview code { overflow-wrap: anywhere; }

@media (max-width: 900px) {
  .case-request-summary { grid-template-columns: auto minmax(0, 1fr) auto; }
  .case-request-summary-encoding { display: none; }
  .case-target-bar,
  .case-protocol-bar { grid-template-columns: 1fr; }
  .function-argument-list { grid-template-columns: 1fr; }
}
</style>
