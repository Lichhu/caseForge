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

    <a-tabs v-model:active-key="activeTab" size="small" class="document-panel-tabs">
      <a-tab-pane key="edit" tab="编辑">
        <a-textarea
          v-model:value="editorText"
          class="markdown-editor"
          :auto-size="false"
          placeholder="上传 Excel（xls/xlsx）后点击结构化，或在此编辑结构化 Markdown"
        />
      </a-tab-pane>
      <a-tab-pane key="preview" tab="预览">
        <div v-if="activeTab === 'preview'" class="document-preview-scroll">
          <article class="markdown-preview" v-html="previewHtml" />
        </div>
      </a-tab-pane>
    </a-tabs>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MarkdownIt from 'markdown-it';
import { BranchesOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons-vue';
import { Modal, message } from 'ant-design-vue';
import type { UploadProps } from 'ant-design-vue';
import { useApiTestStore } from '@/stores/apiTest';

const apiStore = useApiTestStore();
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
const activeTab = ref('edit');
const editorText = ref('');
const autoSaveTimer = ref<number | null>(null);

watch(
  () => apiStore.apiDoc?.tempStructuredMarkdown ?? apiStore.apiDoc?.structuredMarkdown,
  (value) => {
    const next = value || '';
    if (next === editorText.value) {
      return;
    }
    if (autoSaveTimer.value) {
      window.clearTimeout(autoSaveTimer.value);
      autoSaveTimer.value = null;
    }
    editorText.value = next;
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

watch(editorText, (value) => {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  const saved =
    apiStore.apiDoc?.tempStructuredMarkdown ?? apiStore.apiDoc?.structuredMarkdown ?? '';
  if (!projectId || !transactionId || value === saved) {
    return;
  }
  if (autoSaveTimer.value) {
    window.clearTimeout(autoSaveTimer.value);
  }
  autoSaveTimer.value = window.setTimeout(() => {
    if (
      apiStore.activeProjectId !== projectId ||
      apiStore.activeTransactionId !== transactionId
    ) {
      return;
    }
    void apiStore.autoSave(projectId, transactionId, value);
  }, 1200);
});

const previewHtml = ref('');
let previewRenderTimer: ReturnType<typeof setTimeout> | undefined;

function renderPreviewNow() {
  previewHtml.value = md.render(editorText.value || '');
}

watch(activeTab, (tab) => {
  if (tab === 'preview') {
    renderPreviewNow();
  }
});

watch(editorText, () => {
  if (activeTab.value !== 'preview') {
    return;
  }
  if (previewRenderTimer !== undefined) {
    clearTimeout(previewRenderTimer);
  }
  previewRenderTimer = setTimeout(() => {
    previewRenderTimer = undefined;
    renderPreviewNow();
  }, 280);
});

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
</style>
