<template>
  <section class="panel document-panel">
    <div class="panel-header">
      <div>
        <h2>接口文档</h2>
        <p class="document-panel-desc">上传并结构化接口文档，可 AI 生成测试案例</p>
        <div v-if="apiStore.apiDoc?.sourceDocName" class="doc-links">
          <a
            v-if="apiStore.apiDoc.sourceDocUrl"
            :href="apiStore.apiDoc.sourceDocUrl"
            target="_blank"
            rel="noopener"
          >
            接口文档：{{ apiStore.apiDoc.sourceDocName }}
          </a>
        </div>
      </div>
      <div class="toolbar action-toolbar">
        <a-upload
          :show-upload-list="false"
          :before-upload="onUpload"
          :disabled="apiStore.loading"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        >
          <a-button :loading="apiStore.loading" :disabled="apiStore.loading">
            <template #icon><UploadOutlined /></template>
            上传
          </a-button>
        </a-upload>
        <a-button @click="openScenarioModal">
          <template #icon><SettingOutlined /></template>
          场景
        </a-button>
        <a-button
          type="primary"
          :disabled="!apiStore.canGenerateCases || apiStore.docReadiness?.ok === false"
          :loading="generatingCases"
          @click="onGenerate"
        >
          <template #icon><ThunderboltOutlined /></template>
          AI 生成案例
        </a-button>
        <a-button v-if="!showSmpData" :disabled="!canSave" @click="onSave">
          <template #icon><SaveOutlined /></template>
          保存
        </a-button>
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
        <div v-for="(section, sectionIndex) in sections" :key="section.title" class="doc-section-block">
          <h3 class="doc-section-title">{{ section.title }}</h3>
          <div class="api-doc-table-wrap">
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
      </template>
    </div>
  </section>

  <ScenarioMaintainModal v-model:open="scenarioModalOpen" scope="api" />

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
import { computed, nextTick, onActivated, onDeactivated, ref, watch } from 'vue';
import {
  SaveOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UploadOutlined,
} from '@ant-design/icons-vue';
import { Modal, message } from 'ant-design-vue';
import type { UploadProps } from 'ant-design-vue';
import ScenarioMaintainModal from '@/components/ScenarioMaintainModal.vue';
import ScenarioPromptPicker from '@/components/ScenarioPromptPicker.vue';
import SmpDocumentViewer from '@/components/api-test/SmpDocumentViewer.vue';
import { useApiTestStore } from '@/stores/apiTest';
import { filterSelectablePromptIds, collectDefaultPromptIds } from '@/utils/scenarioLibrary';
import {
  parseApiDocTableText,
  sectionTableColumnKeys,
  sectionTableData,
  sectionTableHeaders,
  serializeApiDocTableText,
  tableDataToRows,
  type ApiDocTableSection,
} from '@/utils/api-doc-table.util';

const tableScrollRef = ref<HTMLElement | null>(null);
const apiStore = useApiTestStore();
const sections = ref<ApiDocTableSection[]>([]);
const sectionData = ref<Record<string, string>[][]>([]);
const editorText = ref('');
const autoSaveTimer = ref<number | null>(null);
const syncingFromStore = ref(false);
const panelActive = ref(true);
const scenarioModalOpen = ref(false);
const generateModalOpen = ref(false);
const docPromptIds = ref<string[]>([]);
const generatePromptIds = ref<string[]>([]);

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

onActivated(() => {
  panelActive.value = true;
  void ensureScenarioLibrary();
  const pid = projectId.value;
  const tid = transactionId.value;
  if (pid && tid) {
    void apiStore.syncCaseGenerateLoading(pid, tid);
  }
});

onDeactivated(() => {
  panelActive.value = false;
});

function loadFromText(text: string) {
  syncingFromStore.value = true;
  sections.value = parseApiDocTableText(text);
  sectionData.value = sections.value.map((section) => sectionTableData(section));
  editorText.value = text;
  syncingFromStore.value = false;
  resizeAllDocCellInputs();
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
  editorText.value = serializeApiDocTableText(nextSections);
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
  editorText.value = serializeApiDocTableText(sections.value);
  scheduleAutoSave();
}

function handleCellBlur(sectionIndex: number) {
  if (syncingFromStore.value) return;
  const section = sections.value[sectionIndex];
  if (!section) return;
  section.rows = tableDataToRows(section, sectionData.value[sectionIndex] ?? []);
  editorText.value = serializeApiDocTableText(sections.value);
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
      await runGenerate(pid, tid);
    } catch {
      apiStore.markCaseGenerateEnded(tid);
      message.error('启动案例生成失败，请稍后重试');
    }
  })();
}

async function runGenerate(pid: string, tid: string) {
  await apiStore.generateCases(pid, tid, {
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
.document-panel-desc {
  margin: 4px 0 0;
  color: #667085;
  font-size: 13px;
}

.doc-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  font-size: 12px;
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
  padding: 0 12px 12px;
}

.doc-section-block {
  margin-bottom: 12px;
}

.doc-section-title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
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
