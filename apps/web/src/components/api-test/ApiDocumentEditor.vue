<template>
  <section class="panel document-panel">
    <div class="panel-header document-panel-header">
      <div class="document-panel-intro">
        <h2>接口文档</h2>
        <p class="document-panel-desc">上传并结构化接口文档，可 AI 生成测试案例</p>
        <div v-if="sourceDocName" class="doc-source-row">
          <a
            v-if="apiStore.apiDoc?.sourceDocUrl"
            class="doc-source-link"
            :href="apiStore.apiDoc.sourceDocUrl"
            target="_blank"
            rel="noopener"
            :title="sourceDocName"
          >
            当前文档：{{ sourceDocName }}
          </a>
          <span v-else class="doc-source-name" :title="sourceDocName">
            当前文档：{{ sourceDocName }}
          </span>
        </div>
      </div>
      <div class="toolbar action-toolbar document-panel-toolbar">
        <a-upload
          v-if="!showSmpData"
          :show-upload-list="false"
          :before-upload="onUpload"
          :disabled="apiStore.loading"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        >
          <a-button :loading="apiStore.loading" :disabled="apiStore.loading">
            <template #icon><UploadOutlined /></template>
            {{ sourceDocName ? '重新上传' : '上传文档' }}
          </a-button>
        </a-upload>
        <a-button
          type="primary"
          :disabled="!apiStore.canGenerateCases || apiStore.docReadiness?.ok === false"
          :loading="generatingCases"
          @click="onGenerate"
        >
          <template #icon><ThunderboltOutlined /></template>
          AI 生成案例
        </a-button>
        <a-button @click="historyDrawerOpen = true">
          <template #icon><HistoryOutlined /></template>
          生成历史
        </a-button>
        <a-dropdown v-model:open="moreMenuOpen" trigger="click">
          <a-button>
            更多
            <DownOutlined
              :class="['dropdown-trigger-chevron', { 'is-open': moreMenuOpen }]"
            />
          </a-button>
          <template #overlay>
            <a-menu @click="onMoreMenuClick">
              <a-menu-item key="data-functions">
                <CodeOutlined />
                数据函数
              </a-menu-item>
              <a-menu-item v-if="!showSmpData" key="save" :disabled="!canSave">
                <SaveOutlined />
                手动保存
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </div>

    <a-alert
      v-if="generatingCases"
      type="info"
      show-icon
      class="document-panel-alert"
    >
      <template #message>
        <span>正在后台生成案例，完成后将自动进入案例编辑</span>
        <a-button type="link" size="small" @click="onCancelGenerate">
          取消
        </a-button>
      </template>
    </a-alert>

    <a-alert
      v-if="!showSmpData && apiStore.apiDoc?.structuringStatus === 'failed'"
      type="error"
      show-icon
      :message="apiStore.apiDoc.structuringError"
      class="document-panel-alert"
    />

    <a-alert
      v-if="apiStore.docReadinessMessage"
      type="warning"
      show-icon
      :message="apiStore.docReadinessMessage"
      class="document-panel-alert"
    >
      <template #description>
        <span v-if="apiStore.docReadiness?.endpoints?.length">
          未通过检查的接口：
          <span
            v-for="ep in apiStore.docReadiness.endpoints.filter((e) => !e.ok)"
            :key="ep.endpointId"
            class="readiness-endpoint-tag"
          >
            {{ ep.endpointName }}（{{ ep.message }}）
          </span>
        </span>
      </template>
    </a-alert>

    <div ref="tableScrollRef" class="document-table-scroll">
      <template v-if="showSmpData">
        <div class="smp-doc-source-tag">来源：服管平台</div>
        <SmpDocumentViewer :data="apiStore.apiDoc!.smpData!" />
      </template>
      <template v-else>
        <a-empty
          v-if="!sections.length"
          description="上传 Excel 后将自动结构化，可 AI 生成案例"
        />
        <div
          v-for="(section, sectionIndex) in sections"
          :key="section.title"
          class="doc-section-block"
          :class="{ 'doc-section-block--collapsed': isSectionCollapsed(section.title) }"
        >
          <button
            type="button"
            class="doc-section-title-btn"
            @click="toggleSection(section.title)"
          >
            <span class="doc-section-chevron" aria-hidden="true">
              <RightOutlined v-if="isSectionCollapsed(section.title)" />
              <DownOutlined v-else />
            </span>
            <span class="doc-section-title">{{ section.title }}</span>
          </button>
          <div v-show="!isSectionCollapsed(section.title)" class="doc-section-body">
            <div v-if="section.title === '示例报文'" class="example-message-block">
              <div class="example-message-shell">
                <div class="example-message-actions">
                  <a-button type="link" size="small" :disabled="!hasExampleCursor" @click="openFunctionInsert"><CodeOutlined /> 插入函数</a-button>
                  <a-button
                    type="link"
                    size="small"
                    class="example-message-beautify-btn"
                    :disabled="!exampleMessage.trim()"
                    @click="beautifyExampleMessage"
                  >
                    <template #icon><FormatPainterOutlined /></template>
                    美化
                  </a-button>
                  <a-button
                    type="link"
                    size="small"
                    class="example-message-expand-btn"
                    @click="exampleExpandModalOpen = true"
                  >
                    <template #icon><ExpandOutlined /></template>
                    编辑
                  </a-button>
                </div>
                <textarea
                  v-model="exampleMessage"
                  class="example-message-input"
                  placeholder="可选。填写后将作为 AI 生成案例的报文样例参考。"
                  spellcheck="false"
                  @focus="rememberExampleCursor"
                  @click="rememberExampleCursor"
                  @keyup="rememberExampleCursor"
                  @input="onExampleMessageInput"
                  @blur="onExampleMessageBlur"
                  @paste="onExampleMessagePaste"
                />
              </div>
            </div>
            <div v-else class="api-doc-table-wrap">
              <table class="api-doc-table">
                <thead>
                  <tr>
                    <th
                      v-for="(label, colIndex) in sectionTableHeaders(section)"
                      :key="`${section.title}-head-${colIndex}`"
                    >
                      {{ label }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="record in sectionData[sectionIndex]"
                    :key="record.key"
                  >
                    <td
                      v-for="colKey in sectionTableColumnKeys(section)"
                      :key="`${record.key}-${colKey}`"
                    >
                      <textarea
                        v-model="record[colKey]"
                        class="doc-cell-input"
                        rows="1"
                        @input="onCellInput(sectionIndex, $event)"
                        @blur="handleCellBlur(sectionIndex)"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>

  <ApiCaseGenerateHistoryDrawer
    v-model:open="historyDrawerOpen"
    :project-id="projectId"
    :transaction-id="transactionId"
  />

  <ApiDataFunctionMaintainModal v-model:open="dataFunctionModalOpen" :project-id="apiStore.activeProjectId" />
  <a-modal v-model:open="functionInsertOpen" title="插入数据函数" ok-text="插入" @ok="insertFunctionExpression">
    <a-form layout="vertical">
      <a-form-item label="函数" required><a-select v-model:value="insertFunctionName" :options="functionOptions" /></a-form-item>
      <a-form-item label="参数来源" extra="以 $. 开头，引用当前请求体字段；多个参数用英文逗号分隔">
        <a-input v-model:value="insertFunctionArgs" placeholder="$.Transaction.Header.sysHeader.clientCd" />
      </a-form-item>
      <code>{{ functionInsertPreview }}</code>
    </a-form>
  </a-modal>

  <a-modal
    v-model:open="generateModalOpen"
    title="AI 生成案例"
    :width="800"
    ok-text="开始生成"
    cancel-text="取消"
    :confirm-loading="generatingCases"
    destroy-on-close
    wrap-class-name="api-generate-modal"
    @ok="onConfirmGenerate"
    @cancel="onCloseGenerateModal"
  >
    <div class="generate-modal-body">
      <a-form layout="vertical">
        <div class="generation-profile-grid">
          <a-form-item label="服务属性" required>
            <a-select v-model:value="generationProfile.serviceProperty" :options="servicePropertyOptions" />
          </a-form-item>
          <a-form-item label="通讯方式" required>
            <a-select v-model:value="generationProfile.transport" :options="transportOptions" />
          </a-form-item>
          <a-form-item label="报文类型" required>
            <a-select v-model:value="generationProfile.messageFormat" :options="messageFormatOptions" />
          </a-form-item>
        </div>
        <section class="channel-panel">
          <div class="channel-editor-header">
            <div>
              <strong>渠道数据</strong>
              <span>勾选参与本次生成</span>
            </div>
            <div class="channel-editor-actions">
              <a-input-search
                v-model:value="channelKeyword"
                allow-clear
                class="channel-search"
                placeholder="搜索名称 / clientCd / serviceCd"
              />
              <a-upload
                :show-upload-list="false"
                accept=".xls,.xlsx,.csv"
                :before-upload="importChannels"
              >
                <a-button size="small" type="text" class="channel-add-btn">
                  <template #icon><ImportOutlined /></template>
                </a-button>
              </a-upload>
              <a-button size="small" type="text" class="channel-add-btn" @click="addChannel">
                <template #icon><PlusOutlined /></template>
              </a-button>
            </div>
          </div>
          <div class="channel-editor-columns" aria-hidden="true">
            <span>选择</span><span>渠道名称</span><span>clientCd</span><span>serviceCd</span><span>操作</span>
          </div>
          <div class="channel-editor-list">
            <div
              v-for="channel in filteredChannels"
              :key="channel.id"
              :class="['channel-editor-row', { 'is-selected': selectedChannelIds.includes(channel.id) }]"
            >
            <a-checkbox
              :checked="selectedChannelIds.includes(channel.id)"
              :disabled="!isChannelComplete(channel)"
              @change="toggleChannel(channel.id, $event.target.checked)"
            />
            <a-input v-model:value="channel.name" placeholder="渠道名称" />
            <a-input v-model:value="channel.clientCd" placeholder="clientCd" />
            <a-input v-model:value="channel.serviceCd" placeholder="serviceCd" />
              <a-button type="text" danger aria-label="删除渠道" @click="removeChannel(channel.id)">
                <template #icon><DeleteOutlined /></template>
              </a-button>
            </div>
            <a-empty v-if="channelKeyword && !filteredChannels.length" :image="false" description="未找到匹配渠道" />
          </div>
        </section>
      </a-form>
    </div>
  </a-modal>

  <a-modal
    v-model:open="exampleExpandModalOpen"
    title="编辑示例报文"
    :width="1000"
    :z-index="IMMERSIVE_OVERLAY_Z_INDEX"
    ok-text="完成"
    cancel-text="取消"
    wrap-class-name="example-message-expand-modal-wrap"
    :destroy-on-close="false"
    @ok="onExampleExpandModalOk"
  >
    <div class="example-message-expand-modal">
      <div class="example-message-expand-toolbar">
        <p class="example-message-expand-hint">可选。填写后将作为 AI 生成案例的报文样例参考。</p>
        <div class="expand-toolbar-actions">
          <a-button type="link" size="small" :disabled="!hasExampleCursor" @click="openFunctionInsert"><CodeOutlined /> 插入函数</a-button>
          <a-button type="link" size="small" class="example-message-beautify-btn" :disabled="!exampleMessage.trim()" @click="beautifyExampleMessage">
            <template #icon><FormatPainterOutlined /></template>美化
          </a-button>
        </div>
      </div>
      <textarea
        v-model="exampleMessage"
        class="example-message-expand-input"
        placeholder="可选。填写后将作为 AI 生成案例的报文样例参考。"
        spellcheck="false"
        @focus="rememberExampleCursor"
        @click="rememberExampleCursor"
        @keyup="rememberExampleCursor"
        @input="onExampleMessageInput"
      />
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, reactive, ref, watch } from 'vue';
import {
  DownOutlined,
  DeleteOutlined,
  CodeOutlined,
  ExpandOutlined,
  FormatPainterOutlined,
  HistoryOutlined,
  ImportOutlined,
  PlusOutlined,
  RightOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  UploadOutlined,
} from '@ant-design/icons-vue';
import { Modal, message } from 'ant-design-vue';
import type { MenuProps, UploadProps } from 'ant-design-vue';
import SmpDocumentViewer from '@/components/api-test/SmpDocumentViewer.vue';
import ApiCaseGenerateHistoryDrawer from '@/components/api-test/ApiCaseGenerateHistoryDrawer.vue';
import ApiDataFunctionMaintainModal from '@/components/api-test/ApiDataFunctionMaintainModal.vue';
import { IMMERSIVE_OVERLAY_Z_INDEX } from '@/constants/overlay-z-index';
import { useApiTestStore } from '@/stores/apiTest';
import type { ApiDocGenerationProfile } from '@case-forge/shared';
import * as XLSX from 'xlsx';
import {
  parseApiDocTableText,
  API_DOC_SECTION_TITLES,
  sectionTableColumnKeys,
  sectionTableData,
  sectionTableHeaders,
  serializeApiDocTableText,
  tableDataToRows,
  type ApiDocTableSection,
} from '@/utils/api-doc-table.util';
import {
  beautifyCasePayloadJson,
  beautifyRequestBodyXml,
} from '@/utils/casePayloadFormat.util';
import { randomUuid } from '@/utils/randomUuid';
import { listDataFunctions } from '@/api/apiTestClient';

const tableScrollRef = ref<HTMLElement | null>(null);
const EXAMPLE_MESSAGE_MIN_HEIGHT_PX = 160;
const apiStore = useApiTestStore();
const sections = ref<ApiDocTableSection[]>([]);
const sectionData = ref<Record<string, string>[][]>([]);
const exampleMessage = ref('');
const functionInsertOpen = ref(false);
const functionInsertRange = reactive({ start: 0, end: 0 });
const hasExampleCursor = ref(false);
const insertFunctionName = ref('');
const insertFunctionArgs = ref('$.Transaction.Header.sysHeader.clientCd');
const functionOptions = ref<Array<{ label: string; value: string }>>([]);
const functionInsertPreview = computed(() => `\${${insertFunctionName.value || '函数名'}(${insertFunctionArgs.value})}`);
const editorText = ref('');
const autoSaveTimer = ref<number | null>(null);
const generationProfileSaveTimer = ref<number | null>(null);
const syncingFromStore = ref(false);
const panelActive = ref(true);
const generateModalOpen = ref(false);
const exampleExpandModalOpen = ref(false);
const historyDrawerOpen = ref(false);
const moreMenuOpen = ref(false);
const dataFunctionModalOpen = ref(false);
const generationProfile = reactive<ApiDocGenerationProfile>({
  serviceProperty: 'query_non_accounting',
  transport: 'http',
  messageFormat: 'json',
  exampleMessage: '',
  channels: [],
});
const selectedChannelIds = ref<string[]>([]);
const channelKeyword = ref('');
const servicePropertyOptions = [
  ['query_non_accounting', '查询类非涉账'], ['query_accounting', '查询类涉账'],
  ['management_non_accounting', '管理类非涉账'], ['management_accounting', '管理类涉账'],
  ['accounting', '记账类'], ['reversal', '冲正类'], ['file', '文件类'], ['push', '推送类'],
].map(([value, label]) => ({ value, label }));
const transportOptions = [{ value: 'http', label: 'HTTP' }, { value: 'socket', label: 'SOCKET' }];
const messageFormatOptions = [{ value: 'json', label: 'JSON' }, { value: 'xml', label: 'XML' }, { value: 'text', label: 'TEXT' }];
const filteredChannels = computed(() => {
  const keyword = channelKeyword.value.trim().toLowerCase();
  if (!keyword) return generationProfile.channels;
  return generationProfile.channels.filter((channel) =>
    [channel.name, channel.clientCd, channel.serviceCd].some((value) =>
      value.toLowerCase().includes(keyword),
    ),
  );
});
const collapsedSections = reactive(
  new Set<string>(
    API_DOC_SECTION_TITLES.filter((title) => title !== '示例报文'),
  ),
);

function isSectionCollapsed(title: string) {
  return collapsedSections.has(title);
}

function toggleSection(title: string) {
  if (collapsedSections.has(title)) {
    collapsedSections.delete(title);
    void nextTick(() => {
      resizeAllDocCellInputs();
      resizeExampleMessageInput();
    });
  } else {
    collapsedSections.add(title);
  }
}

function resetSectionCollapseState() {
  collapsedSections.clear();
  for (const title of API_DOC_SECTION_TITLES) {
    if (title !== '示例报文') {
      collapsedSections.add(title);
    }
  }
}

const projectId = computed(() => apiStore.activeProjectId ?? '');
const transactionId = computed(() => apiStore.activeTransactionId ?? '');
const generatingCases = computed(() =>
  transactionId.value
    ? apiStore.isGeneratingCases(transactionId.value)
    : false,
);

const showSmpData = computed(() =>
  apiStore.apiDoc?.source === 'smp' &&
  Boolean(apiStore.apiDoc?.smpData?.callServiceList?.length),
);

const sourceDocName = computed(() => apiStore.apiDoc?.sourceDocName ?? '');

onActivated(() => {
  panelActive.value = true;
  const pid = projectId.value;
  const tid = transactionId.value;
  if (pid && tid) {
    void apiStore.syncCaseGenerateLoading(pid, tid);
  }
  resizeExampleMessageInput();
});

onDeactivated(() => {
  panelActive.value = false;
  syncExampleMessageToText();
  void flushAutoSave();
});

function loadFromText(text: string) {
  syncingFromStore.value = true;
  const parsed = parseApiDocTableText(text);
  if (!parsed.some((section) => section.title === '示例报文') && !showSmpData.value) {
    parsed.push({ title: '示例报文', rows: [], freeText: '' });
  }
  const exampleSection = parsed.find((section) => section.title === '示例报文');
  exampleMessage.value = exampleSection?.freeText ?? '';
  hasExampleCursor.value = false;
  sections.value = parsed;
  sectionData.value = sections.value.map((section) => sectionTableData(section));
  editorText.value = serializeApiDocTableText(parsed);
  resetSectionCollapseState();
  syncingFromStore.value = false;
  resizeAllDocCellInputs();
  resizeExampleMessageInput();
}

function onExampleMessageInput(event: Event) {
  const el = event.target;
  if (el instanceof HTMLTextAreaElement && el.classList.contains('example-message-input')) {
    autoResizeExampleTextarea(el);
  }
  syncExampleMessageToText();
  scheduleAutoSave();
}

function onExampleMessageBlur() {
  syncExampleMessageToText();
  void flushAutoSave({ notify: true });
}

async function openFunctionInsert() {
  if (!hasExampleCursor.value) return;
  const rows = await listDataFunctions(projectId.value);
  functionOptions.value = rows.map((item) => ({ label: item.name, value: item.name }));
  insertFunctionName.value ||= functionOptions.value[0]?.value ?? '';
  functionInsertOpen.value = true;
}

function rememberExampleCursor(event: Event) {
  const input = event.target as HTMLTextAreaElement;
  functionInsertRange.start = input.selectionStart;
  functionInsertRange.end = input.selectionEnd;
  hasExampleCursor.value = true;
}

function insertFunctionExpression() {
  if (!insertFunctionName.value) return message.warning('请选择函数');
  const expression = functionInsertPreview.value;
  exampleMessage.value = `${exampleMessage.value.slice(0, functionInsertRange.start)}${expression}${exampleMessage.value.slice(functionInsertRange.end)}`;
  functionInsertOpen.value = false;
  syncExampleMessageToText();
  scheduleAutoSave();
  resizeExampleMessageInput();
  void nextTick(() => {
    const input = resolveExampleMessageInput();
    const cursor = functionInsertRange.start + expression.length;
    input?.focus();
    input?.setSelectionRange(cursor, cursor);
  });
}

function onExampleExpandModalOk() {
  syncExampleMessageToText();
  void flushAutoSave({ notify: true });
  exampleExpandModalOpen.value = false;
  resizeExampleMessageInput();
}

function detectExampleMessageFormat(text: string): 'json' | 'xml' | 'text' {
  const trimmed = text.trim();
  if (!trimmed) return 'text';
  if (trimmed.startsWith('<') || trimmed.includes('<?xml')) return 'xml';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  return 'text';
}

function beautifyExampleMessage() {
  const raw = exampleMessage.value.trim();
  if (!raw) {
    message.info('示例报文为空');
    return;
  }
  const format = detectExampleMessageFormat(raw);
  try {
    if (format === 'xml') {
      exampleMessage.value = beautifyRequestBodyXml(raw);
    } else if (format === 'json') {
      exampleMessage.value = beautifyCasePayloadJson(raw);
    } else {
      message.info('纯文本示例报文无需美化');
      return;
    }
    syncExampleMessageToText();
    scheduleAutoSave();
    message.success('示例报文已美化');
    resizeExampleMessageInput();
  } catch {
    message.error('报文格式不正确，无法美化');
  }
}

function onExampleMessagePaste(event: Event) {
  const el = event.target;
  if (!(el instanceof HTMLTextAreaElement)) return;
  void nextTick(() => {
    void nextTick(() => {
      autoResizeExampleTextarea(el);
    });
  });
}

function resolveExampleMessageInput(): HTMLTextAreaElement | null {
  return (
    tableScrollRef.value?.querySelector('textarea.example-message-input') ?? null
  );
}

function autoResizeExampleTextarea(el: HTMLTextAreaElement) {
  el.style.height = '0px';
  const nextHeight = Math.max(EXAMPLE_MESSAGE_MIN_HEIGHT_PX, el.scrollHeight);
  el.style.height = `${nextHeight}px`;
}

function resizeExampleMessageInput() {
  void nextTick(() => {
    void nextTick(() => {
      const el = resolveExampleMessageInput();
      if (el) {
        autoResizeExampleTextarea(el);
      }
    });
  });
}

function syncExampleMessageToText() {
  const hasExampleSection = sections.value.some(
    (section) => section.title === '示例报文',
  );
  const nextSections = hasExampleSection
    ? sections.value.map((section) => {
        if (section.title === '示例报文') {
          return { ...section, freeText: exampleMessage.value };
        }
        return section;
      })
    : [
        ...sections.value,
        { title: '示例报文', rows: [], freeText: exampleMessage.value },
      ];
  sections.value = nextSections;
  editorText.value = serializeApiDocTableText(nextSections);
}

function autoResizeTextarea(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function resizeAllDocCellInputs() {
  void nextTick(() => {
    tableScrollRef.value
      ?.querySelectorAll('textarea.doc-cell-input')
      .forEach((el) => autoResizeTextarea(el as HTMLTextAreaElement));
  });
}

function onCellInput(sectionIndex: number, event: Event) {
  autoResizeTextarea(event.target as HTMLTextAreaElement);
  onTableChange(sectionIndex);
}

function syncTextFromTables() {
  const nextSections = sections.value.map((section, index) => ({
    ...section,
    rows: tableDataToRows(section, sectionData.value[index] ?? []),
  }));
  sections.value = nextSections;
  syncExampleMessageToText();
}

watch(
  () => [projectId.value, transactionId.value] as const,
  ([pid, tid]) => {
    if (!panelActive.value || !pid || !tid) return;
    void apiStore.syncCaseGenerateLoading(pid, tid);
  },
);

watch(
  () => apiStore.apiDoc?.tempStructuredMarkdown ?? apiStore.apiDoc?.structuredMarkdown,
  (value) => {
    if (!panelActive.value) return;
    const next = value || '';
    if (next === editorText.value) return;
    if (autoSaveTimer.value) {
      window.clearTimeout(autoSaveTimer.value);
      autoSaveTimer.value = null;
    }
    loadFromText(next);
  },
  { immediate: true },
);

watch(exampleMessage, () => {
  resizeExampleMessageInput();
});

watch(() => apiStore.apiDoc?.generationProfile, (next) => {
  if (!next) return;
  Object.assign(generationProfile, next, { channels: next.channels.map((channel) => ({ ...channel })) });
}, { immediate: true, deep: true });

watch(
  generationProfile,
  () => {
    if (syncingFromStore.value || !projectId.value || !transactionId.value) return;
    if (generationProfileSaveTimer.value) {
      window.clearTimeout(generationProfileSaveTimer.value);
      generationProfileSaveTimer.value = null;
    }
    if (
      !generationProfile.exampleMessage.trim() ||
      generationProfile.channels.some((channel) => !isChannelComplete(channel))
    ) return;
    if (
      JSON.stringify(generationProfile) ===
      JSON.stringify(apiStore.apiDoc?.generationProfile)
    ) return;
    const saveProjectId = projectId.value;
    const saveTransactionId = transactionId.value;
    generationProfileSaveTimer.value = window.setTimeout(() => {
      generationProfileSaveTimer.value = null;
      if (
        !panelActive.value ||
        saveProjectId !== projectId.value ||
        saveTransactionId !== transactionId.value
      ) return;
      void apiStore
        .saveDocumentGenerationPrompts(saveProjectId, saveTransactionId, {
          ...generationProfile,
          channels: generationProfile.channels.map((channel) => ({ ...channel })),
        })
        .catch((error) => {
          if (saveProjectId === projectId.value && saveTransactionId === transactionId.value) {
            message.error((error as Error)?.message || '渠道数据自动保存失败');
          }
        });
    }, 1200);
  },
  { deep: true },
);

watch(
  () => [apiStore.activeProjectId, apiStore.activeTransactionId] as const,
  () => {
    if (autoSaveTimer.value) {
      window.clearTimeout(autoSaveTimer.value);
      autoSaveTimer.value = null;
    }
    if (generationProfileSaveTimer.value) {
      window.clearTimeout(generationProfileSaveTimer.value);
      generationProfileSaveTimer.value = null;
    }
  },
);


function scheduleAutoSave() {
  if (syncingFromStore.value) return;
  const pid = projectId.value;
  const tid = transactionId.value;
  const saved =
    apiStore.apiDoc?.tempStructuredMarkdown ?? apiStore.apiDoc?.structuredMarkdown ?? '';
  if (!pid || !tid || editorText.value === saved) return;

  if (autoSaveTimer.value) window.clearTimeout(autoSaveTimer.value);
  autoSaveTimer.value = window.setTimeout(() => {
    autoSaveTimer.value = null;
    void flushAutoSave();
  }, 1200);
}

async function flushAutoSave(options?: { notify?: boolean }) {
  if (autoSaveTimer.value) {
    window.clearTimeout(autoSaveTimer.value);
    autoSaveTimer.value = null;
  }
  if (syncingFromStore.value) return;
  const pid = projectId.value;
  const tid = transactionId.value;
  const saved =
    apiStore.apiDoc?.tempStructuredMarkdown ?? apiStore.apiDoc?.structuredMarkdown ?? '';
  if (!pid || !tid || editorText.value === saved) return;

  try {
    await apiStore.autoSave(pid, tid, editorText.value, {
      successMessage: options?.notify ? '已自动保存' : undefined,
    });
  } catch (error) {
    message.error((error as Error)?.message || '自动保存失败');
  }
}

function onTableChange(sectionIndex: number) {
  if (syncingFromStore.value) return;
  const section = sections.value[sectionIndex];
  if (!section) return;
  section.rows = tableDataToRows(section, sectionData.value[sectionIndex] ?? []);
  syncTextFromTables();
  scheduleAutoSave();
}

function handleCellBlur(sectionIndex: number) {
  if (syncingFromStore.value) return;
  const section = sections.value[sectionIndex];
  if (!section) return;
  section.rows = tableDataToRows(section, sectionData.value[sectionIndex] ?? []);
  syncTextFromTables();
  void flushAutoSave({ notify: true });
}

const canSave = computed(() => Boolean(editorText.value.trim()));

const onMoreMenuClick: MenuProps['onClick'] = ({ key }) => {
  moreMenuOpen.value = false;
  if (key === 'data-functions') {
    dataFunctionModalOpen.value = true;
  }
  if (key === 'save') {
    void onSave();
  }
};

const onUpload: UploadProps['beforeUpload'] = (file) => {
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return false;

  if (apiStore.loading) {
    message.warning('文档处理中，请稍后再上传');
    return false;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['xls', 'xlsx'].includes(extension)) {
    message.warning('仅支持上传 xls、xlsx 格式的接口文档');
    return false;
  }

  if (apiStore.apiDoc?.sourceDocName) {
    Modal.confirm({
      title: '重新上传接口文档？',
      content: '继续上传将覆盖原文件并重新结构化，已有案例需重新 AI 生成，是否继续？',
      okText: '覆盖上传',
      cancelText: '取消',
      centered: true,
      onOk: () => apiStore.uploadDocument(pid, tid, file as File, true),
    });
    return false;
  }

  void apiStore.uploadDocument(pid, tid, file as File);
  return false;
};

async function onGenerate() {
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;

  generationProfile.exampleMessage = exampleMessage.value.trim();
  selectedChannelIds.value = selectedChannelIds.value.filter((id) => generationProfile.channels.some((channel) => channel.id === id));
  generateModalOpen.value = true;
}

function addChannel() {
  generationProfile.channels.push({ id: randomUuid(), name: '', clientCd: '', serviceCd: '' });
}

async function importChannels(file: File) {
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error('文件中没有工作表');
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const imported = rows.map((row) => ({
      id: randomUuid(),
      name: String(row['渠道名称'] ?? row.name ?? row.channelName ?? '').trim(),
      clientCd: String(row.clientCd ?? row['客户端代码'] ?? '').trim(),
      serviceCd: String(row.serviceCd ?? row['服务代码'] ?? '').trim(),
    })).filter(isChannelComplete);
    if (!imported.length) throw new Error('未识别到完整的渠道名称、clientCd、serviceCd');
    const keys = new Set(generationProfile.channels.map((channel) =>
      `${channel.name}\u0000${channel.clientCd}\u0000${channel.serviceCd}`,
    ));
    const added = imported.filter((channel) => {
      const key = `${channel.name}\u0000${channel.clientCd}\u0000${channel.serviceCd}`;
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
    generationProfile.channels.push(...added);
    message.success(`已导入 ${added.length} 条渠道${added.length < imported.length ? '，重复项已忽略' : ''}`);
  } catch (error) {
    message.error((error as Error).message || '渠道导入失败');
  }
  return false;
}

function removeChannel(id: string) {
  const index = generationProfile.channels.findIndex((channel) => channel.id === id);
  if (index < 0) return;
  const [removed] = generationProfile.channels.splice(index, 1);
  if (removed) selectedChannelIds.value = selectedChannelIds.value.filter((id) => id !== removed.id);
}

function toggleChannel(id: string, checked: boolean) {
  const channel = generationProfile.channels.find((item) => item.id === id);
  if (checked && (!channel || !isChannelComplete(channel))) return;
  selectedChannelIds.value = checked
    ? [...new Set([...selectedChannelIds.value, id])]
    : selectedChannelIds.value.filter((channelId) => channelId !== id);
}

function isChannelComplete(channel: ApiDocGenerationProfile['channels'][number]) {
  return Boolean(channel.name.trim() && channel.clientCd.trim() && channel.serviceCd.trim());
}

watch(
  () => generationProfile.channels.map((channel) => [channel.id, channel.name, channel.clientCd, channel.serviceCd]),
  () => {
    selectedChannelIds.value = selectedChannelIds.value.filter((id) => {
      const channel = generationProfile.channels.find((item) => item.id === id);
      return Boolean(channel && isChannelComplete(channel));
    });
  },
  { deep: true },
);

function onCloseGenerateModal() {
  generateModalOpen.value = false;
}

function onCancelGenerate() {
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;
  void apiStore.cancelCaseGenerate(pid, tid);
}

function onConfirmGenerate() {
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;

  generationProfile.exampleMessage = exampleMessage.value.trim();
  if (!generationProfile.exampleMessage) {
    message.warning('请先填写示例报文');
    return;
  }
  if (generationProfile.channels.some((channel) => !channel.name.trim() || !channel.clientCd.trim() || !channel.serviceCd.trim())) {
    message.warning('请完整填写渠道名称、clientCd 和 serviceCd');
    return;
  }
  apiStore.markCaseGenerateStarted(tid);
  generateModalOpen.value = false;

  void (async () => {
    try {
      await apiStore.saveDocumentGenerationPrompts(pid, tid, {
        ...generationProfile,
        channels: generationProfile.channels.map((channel) => ({ ...channel })),
      });
      runGenerate(pid, tid);
    } catch {
      apiStore.markCaseGenerateEnded(tid);
      message.error('启动案例生成失败，请稍后重试');
    }
  })();
}

function runGenerate(pid: string, tid: string) {
  void apiStore.generateCases(pid, tid, {
    channelIds: [...selectedChannelIds.value],
    navigateToCases: true,
  });
}

async function onSave() {
  syncTextFromTables();
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;
  await apiStore.saveDocument(pid, tid, editorText.value);
}
</script>

<style scoped>
.document-panel-header {
  align-items: flex-start;
}

.document-panel-intro {
  min-width: 0;
}

.document-panel-toolbar {
  flex-shrink: 0;
}

.document-panel-desc {
  margin: 4px 0 0;
  color: #667085;
  font-size: 13px;
}

.doc-source-row {
  margin-top: 8px;
  min-width: 0;
  max-width: 100%;
  font-size: 12px;
  line-height: 1.5;
}

.doc-source-link,
.doc-source-name {
  display: block;
  overflow: hidden;
  color: #667085;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-source-link:hover {
  color: var(--cf-brand, #b60f2d);
}

.generate-modal-alert {
  margin-bottom: 12px;
}

.generate-modal-hint {
  margin: 0 0 12px;
  color: #667085;
  font-size: 13px;
  line-height: 1.5;
}

.document-panel-alert {
  margin: 12px 12px 0;
}

.document-panel-alert :deep(.ant-alert-message) {
  display: flex;
  align-items: center;
  gap: 8px;
}

.readiness-endpoint-tag {
  margin-right: 8px;
  color: #d48806;
}

.generate-modal-body {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: calc(100vh - 260px);
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.generation-profile-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.channel-editor-columns,
.channel-editor-row {
  display: grid;
  align-items: center;
  gap: 8px;
}

.channel-panel {
  overflow: hidden;
  border: 1px solid #e4e7ec;
  border-radius: 10px;
  background: #fff;
}

.channel-editor-list {
  max-height: min(320px, 38vh);
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.channel-search {
  width: 260px;
}

.channel-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  background: #f9fafb;
}

.channel-editor-header strong,
.channel-editor-header span {
  display: block;
}

.channel-editor-header span {
  margin-top: 2px;
  color: #667085;
  font-size: 12px;
}

.channel-editor-actions {
  display: flex;
  gap: 8px;
}

.channel-add-btn {
  color: #475467;
  font-weight: 500;
}

.channel-add-btn:hover {
  background: #f2f4f7;
  color: var(--cf-brand, #b60f2d);
}

.channel-editor-columns,
.channel-editor-row {
  grid-template-columns: 42px minmax(150px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) 42px;
}

.channel-editor-columns {
  padding: 7px 12px;
  border-top: 1px solid #eaecf0;
  border-bottom: 1px solid #eaecf0;
  color: #667085;
  font-size: 12px;
}

.channel-editor-row {
  padding: 7px 12px;
  border-bottom: 1px solid #f0f1f3;
}

.channel-editor-row:last-child {
  border-bottom: 0;
}

.channel-editor-row.is-selected {
  background: #fff6f7;
}

@media (max-width: 720px) {
  .generation-profile-grid,
  .channel-editor-row {
    grid-template-columns: 1fr;
  }

  .channel-editor-columns {
    display: none;
  }

  .channel-editor-header,
  .channel-editor-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .channel-search {
    width: 100%;
  }
}

.generate-modal-body :deep(.scenario-prompt-picker--embedded) {
  flex: 1 1 auto;
  min-height: 0;
}

.document-table-scroll {
  padding: 16px 12px 12px;
}

.doc-section-block {
  margin-bottom: 12px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}

.doc-section-block--collapsed {
  margin-bottom: 8px;
}

.doc-section-title-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: #f9fafb;
  color: #344054;
  text-align: left;
  cursor: pointer;
}

.doc-section-title-btn:hover {
  background: #f2f4f7;
}

.doc-section-chevron {
  display: inline-flex;
  flex-shrink: 0;
  width: 14px;
  color: #667085;
  font-size: 11px;
}

.doc-section-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}

.doc-section-body {
  padding: 0 10px 10px;
}

.doc-section-body .api-doc-table-wrap {
  margin-top: 0;
}

.doc-section-body .example-message-block {
  padding-top: 8px;
}

.example-message-shell {
  position: relative;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
}

.example-message-shell:focus-within {
  border-color: var(--cf-brand, #b60f2d);
  background: #fffbeb;
}

.example-message-actions {
  position: absolute;
  top: 2px;
  right: 4px;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 2px;
}

.example-message-beautify-btn,
.example-message-expand-btn {
  height: auto;
  padding: 0 4px;
  font-size: 12px;
}

.example-message-input {
  box-sizing: border-box;
  display: block;
  width: 100%;
  min-height: 160px;
  padding: 30px 10px 10px;
  border: none;
  border-radius: 0;
  background: transparent;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.5;
  overflow-x: auto;
  overflow-y: hidden;
  resize: none;
  field-sizing: content;
}

.example-message-input:focus {
  outline: none;
}

.example-message-hint {
  margin: 0;
  color: #667085;
  font-size: 12px;
  line-height: 1.5;
}

.example-message-expand-modal {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.example-message-expand-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #98a2b3;
}

.example-message-expand-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.expand-toolbar-actions { display: flex; align-items: center; gap: 2px; }

.example-message-expand-input {
  box-sizing: border-box;
  width: 100%;
  min-height: min(68vh, 720px);
  max-height: 72vh;
  padding: 12px 14px;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  background: #fff;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.55;
  resize: vertical;
  overflow: auto;
}

.example-message-expand-input:focus {
  outline: none;
  border-color: var(--cf-brand, #b60f2d);
  box-shadow: 0 0 0 2px rgb(182 15 45 / 8%);
}

.api-doc-table-wrap {
  overflow-x: auto;
}

.api-doc-table {
  width: 100%;
  min-width: max-content;
  border-collapse: collapse;
  table-layout: auto;
  background: #fff;
}

.api-doc-table th,
.api-doc-table td {
  border: 1px solid #eef2f6;
  vertical-align: top;
}

.api-doc-table th {
  padding: 6px 10px;
  background: #f9fafb;
  color: #667085;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}

.api-doc-table td {
  padding: 4px;
  background: #fff;
}

.doc-cell-input {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-width: 100px;
  min-height: 32px;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: #344054;
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: hidden;
  resize: none;
}

.api-doc-table td:first-child .doc-cell-input {
  min-width: 220px;
}

.doc-cell-input:focus {
  outline: none;
  background: #fffbeb;
}

.smp-doc-source-tag {
  display: inline-block;
  margin: 12px 0 6px;
  padding: 4px 12px;
  border-radius: 4px;
  background: #eff8ff;
  color: #175cd3;
  font-size: 12px;
}
</style>
