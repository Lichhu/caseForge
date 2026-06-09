<template>
  <section class="panel document-panel">
    <div class="panel-header">
      <div>
        <h2>接口文档</h2>
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
        <a-button
          type="primary"
          :loading="apiStore.loading"
          :disabled="!apiStore.apiDoc?.sourceDocName || apiStore.loading"
          @click="onStructure"
        >
          <template #icon><BranchesOutlined /></template>
          结构化
        </a-button>
        <a-button :disabled="!canSave" @click="onSave">
          <template #icon><SaveOutlined /></template>
          保存
        </a-button>
      </div>
    </div>

    <a-alert
      v-if="apiStore.apiDoc?.structuringStatus === 'failed'"
      type="error"
      show-icon
      :message="apiStore.apiDoc.structuringError"
      class="document-panel-alert"
    />

    <div class="document-table-scroll">
      <a-empty
        v-if="!sections.length"
        description="上传 Excel 后点击结构化，将在此以表格展示并可编辑"
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
                    rows="2"
                    @input="onTableChange(sectionIndex)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onActivated, onDeactivated, ref, watch } from 'vue';
import { BranchesOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons-vue';
import { Modal, message } from 'ant-design-vue';
import type { UploadProps } from 'ant-design-vue';
import { useApiTestStore } from '@/stores/apiTest';
import {
  parseApiDocTableText,
  sectionTableColumnKeys,
  sectionTableData,
  sectionTableHeaders,
  serializeApiDocTableText,
  tableDataToRows,
  type ApiDocTableSection,
} from '@/utils/api-doc-table.util';

const apiStore = useApiTestStore();
const sections = ref<ApiDocTableSection[]>([]);
const sectionData = ref<Record<string, string>[]>([]);
const editorText = ref('');
const autoSaveTimer = ref<number | null>(null);
const syncingFromStore = ref(false);
const panelActive = ref(true);

onActivated(() => {
  panelActive.value = true;
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
  () => [apiStore.activeProjectId, apiStore.activeTransactionId] as const,
  () => {
    if (autoSaveTimer.value) {
      window.clearTimeout(autoSaveTimer.value);
      autoSaveTimer.value = null;
    }
  },
);

function scheduleAutoSave() {
  if (syncingFromStore.value) return;
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  const saved =
    apiStore.apiDoc?.tempStructuredMarkdown ?? apiStore.apiDoc?.structuredMarkdown ?? '';
  if (!projectId || !transactionId || editorText.value === saved) return;

  if (autoSaveTimer.value) window.clearTimeout(autoSaveTimer.value);
  autoSaveTimer.value = window.setTimeout(() => {
    if (
      apiStore.activeProjectId !== projectId ||
      apiStore.activeTransactionId !== transactionId
    ) {
      return;
    }
    void apiStore.autoSave(projectId, transactionId, editorText.value);
  }, 1200);
}

function onTableChange(sectionIndex: number) {
  if (syncingFromStore.value) return;
  const section = sections.value[sectionIndex];
  if (!section) return;
  section.rows = tableDataToRows(section, sectionData.value[sectionIndex] ?? []);
  editorText.value = serializeApiDocTableText(sections.value);
  scheduleAutoSave();
}

const canSave = computed(() => Boolean(editorText.value.trim()));

const onUpload: UploadProps['beforeUpload'] = (file) => {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) return false;

  if (apiStore.loading) {
    message.warning('结构化进行中，请稍后再上传');
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
      content: '当前交易码已存在接口文档，继续上传将覆盖原文件，是否继续？',
      okText: '覆盖上传',
      cancelText: '取消',
      centered: true,
      onOk: () => apiStore.uploadDocument(projectId, transactionId, file as File, true),
    });
    return false;
  }

  void apiStore.uploadDocument(projectId, transactionId, file as File);
  return false;
};

function onStructure() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) return;

  const hasStructured =
    apiStore.apiDoc?.structuringStatus === 'completed' ||
    Boolean(apiStore.apiDoc?.structuredMarkdown?.trim());

  if (hasStructured) {
    Modal.confirm({
      title: '重新结构化？',
      content: '当前交易码已有结构化结果，重新结构化会覆盖之前的结构化数据，是否继续？',
      okText: '继续结构化',
      cancelText: '取消',
      centered: true,
      onOk: () => apiStore.structureDocument(projectId, transactionId),
    });
    return;
  }

  void apiStore.structureDocument(projectId, transactionId);
}

async function onSave() {
  syncTextFromTables();
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) return;
  await apiStore.saveDocument(projectId, transactionId, editorText.value);
}
</script>

<style scoped>
.doc-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  font-size: 12px;
}

.doc-section-block {
  margin-bottom: 24px;
}

.doc-section-title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 600;
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
  border: 1px solid #f0f0f0;
  vertical-align: top;
}

.api-doc-table th {
  padding: 8px 12px;
  background: #f9fafb;
  color: #667085;
  font-size: 13px;
  font-weight: 500;
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
  min-width: 120px;
  min-height: 52px;
  max-height: 120px;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: #344054;
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  overflow-y: auto;
}

.doc-cell-input:focus {
  outline: none;
  background: #fffbeb;
}
</style>
