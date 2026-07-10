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
              <a-menu-item key="scenario">
                <SettingOutlined />
                场景配置
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
                <textarea
                  v-model="exampleMessage"
                  class="example-message-input"
                  placeholder="可选。填写后将作为 AI 生成案例的报文样例参考。"
                  spellcheck="false"
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

  <ScenarioMaintainModal v-model:open="scenarioModalOpen" scope="api" />

  <ApiCaseGenerateHistoryDrawer
    v-model:open="historyDrawerOpen"
    :project-id="projectId"
    :transaction-id="transactionId"
  />

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
      <a-alert
        v-if="apiStore.apiDoc?.caseCount"
        type="warning"
        show-icon
        class="generate-modal-alert"
        message="将基于当前接口文档与场景约束重新生成案例，不会自动删除已有案例。"
      />
      <p class="generate-modal-hint">场景提示词为可选项，不选择也可直接开始生成。</p>
      <ScenarioPromptPicker
        v-model:prompt-ids="generatePromptIds"
        scope="api"
        optional
        embedded
      />
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, reactive, ref, watch } from 'vue';
import {
  DownOutlined,
  FormatPainterOutlined,
  HistoryOutlined,
  RightOutlined,
  SaveOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UploadOutlined,
} from '@ant-design/icons-vue';
import { Modal, message } from 'ant-design-vue';
import type { MenuProps, UploadProps } from 'ant-design-vue';
import ScenarioMaintainModal from '@/components/ScenarioMaintainModal.vue';
import ScenarioPromptPicker from '@/components/ScenarioPromptPicker.vue';
import SmpDocumentViewer from '@/components/api-test/SmpDocumentViewer.vue';
import ApiCaseGenerateHistoryDrawer from '@/components/api-test/ApiCaseGenerateHistoryDrawer.vue';
import { useApiTestStore } from '@/stores/apiTest';
import { filterSelectablePromptIds, collectDefaultPromptIds } from '@/utils/scenarioLibrary';
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

const tableScrollRef = ref<HTMLElement | null>(null);
const EXAMPLE_MESSAGE_MIN_HEIGHT_PX = 160;
const apiStore = useApiTestStore();
const sections = ref<ApiDocTableSection[]>([]);
const sectionData = ref<Record<string, string>[][]>([]);
const exampleMessage = ref('');
const editorText = ref('');
const autoSaveTimer = ref<number | null>(null);
const syncingFromStore = ref(false);
const panelActive = ref(true);
const scenarioModalOpen = ref(false);
const generateModalOpen = ref(false);
const historyDrawerOpen = ref(false);
const moreMenuOpen = ref(false);
const docPromptIds = ref<string[]>([]);
const generatePromptIds = ref<string[]>([]);
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
  void ensureScenarioLibrary();
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
  if (el instanceof HTMLTextAreaElement) {
    autoResizeExampleTextarea(el);
  }
  syncExampleMessageToText();
  scheduleAutoSave();
}

function onExampleMessageBlur() {
  syncExampleMessageToText();
  void flushAutoSave({ notify: true });
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

watch(
  () => apiStore.apiDoc?.generationPromptIds,
  (next) => {
    if (!panelActive.value) return;
    docPromptIds.value = filterSelectablePromptIds(
      apiStore.apiScenarios,
      next ?? [],
    );
  },
  { immediate: true },
);

watch(
  () => [apiStore.activeProjectId, apiStore.activeTransactionId] as const,
  () => {
    if (autoSaveTimer.value) {
      window.clearTimeout(autoSaveTimer.value);
      autoSaveTimer.value = null;
    }
    void ensureScenarioLibrary();
  },
);

watch(
  () => apiStore.apiScenarios,
  () => {
    docPromptIds.value = filterSelectablePromptIds(
      apiStore.apiScenarios,
      docPromptIds.value,
    );
  },
  { deep: true },
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

async function ensureScenarioLibrary() {
  if (!apiStore.apiScenarios.length) {
    await apiStore.loadApiScenarioLibrary();
  }
}

function openScenarioModal() {
  void ensureScenarioLibrary().then(() => {
    scenarioModalOpen.value = true;
  });
}

const onMoreMenuClick: MenuProps['onClick'] = ({ key }) => {
  if (key === 'scenario') {
    openScenarioModal();
    return;
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

  await ensureScenarioLibrary();
  const saved = filterSelectablePromptIds(
    apiStore.apiScenarios,
    docPromptIds.value,
  );
  generatePromptIds.value = saved.length
    ? saved
    : collectDefaultPromptIds(apiStore.apiScenarios);
  generateModalOpen.value = true;
}

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

  docPromptIds.value = [...generatePromptIds.value];
  apiStore.markCaseGenerateStarted(tid);
  generateModalOpen.value = false;

  void (async () => {
    try {
      await apiStore.saveDocumentGenerationPrompts(pid, tid, docPromptIds.value);
      runGenerate(pid, tid);
    } catch {
      apiStore.markCaseGenerateEnded(tid);
      message.error('启动案例生成失败，请稍后重试');
    }
  })();
}

function runGenerate(pid: string, tid: string) {
  void apiStore.generateCases(pid, tid, {
    promptIds: [...docPromptIds.value],
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
  min-height: 0;
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

.example-message-beautify-btn {
  position: absolute;
  top: 2px;
  right: 4px;
  z-index: 1;
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
