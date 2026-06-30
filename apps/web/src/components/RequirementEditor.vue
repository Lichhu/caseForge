<template>
  <section class="panel document-panel">
    <div class="panel-header">
      <div>
        <h2>结构化需求文档</h2>
        <div v-if="store.activeStructDoc?.reqDocName" class="doc-links">
          <a v-if="store.activeStructDoc.reqDocUrl" :href="store.activeStructDoc.reqDocUrl" target="_blank" rel="noopener">
            需求文档：{{ store.activeStructDoc.reqDocName }}
          </a>
          <a
            v-if="store.activeStructDoc.structDocUrl && store.activeStructDoc.structuredDocName"
            :href="store.activeStructDoc.structDocUrl"
            target="_blank"
            rel="noopener"
          >
            结构化文档：{{ store.activeStructDoc.structuredDocName }}
          </a>
        </div>
      </div>
      <div class="toolbar action-toolbar">
        <a-button @click="store.backToDocList()">
          <template #icon><ArrowLeftOutlined /></template>
          返回
        </a-button>
        <a-upload
          :show-upload-list="false"
          :before-upload="handleUpload"
          :disabled="store.isStructuring"
          accept=".doc,.docx,.md"
        >
          <a-button :disabled="store.isStructuring">
            <template #icon><UploadOutlined /></template>
            上传
          </a-button>
        </a-upload>
        <a-button
          type="primary"
          :loading="store.activeStructDoc?.structuringStatus === 'processing'"
          :disabled="!store.activeStructDoc?.canStructure"
          @click="handleStructure"
        >
          <template #icon><BranchesOutlined /></template>
          结构化
        </a-button>
        <a-button @click="store.saveDocument(editorText)" :disabled="!canSave">
          <template #icon><SaveOutlined /></template>
          保存
        </a-button>
      </div>
    </div>

    <a-alert
      v-if="store.activeStructDoc?.structuringStatus === 'processing'"
      class="document-panel-alert"
      type="info"
      show-icon
    >
      <template #message>
        <span>正在后台结构化需求文档，关闭或切换页面不影响任务执行</span>
        <a-button type="link" size="small" class="cancel-structure-btn" @click="store.cancelStructuring()">
          取消
        </a-button>
      </template>
    </a-alert>

    <a-tabs v-model:active-key="activeTab" size="small" class="document-panel-tabs">
      <a-tab-pane key="edit" tab="编辑">
        <a-textarea
          v-model:value="editorText"
          class="markdown-editor"
          :auto-size="false"
          placeholder="上传需求文档后点击结构化，或在此编辑结构化 Markdown"
          @blur="handleEditorBlur"
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
import { message, Modal } from 'ant-design-vue';
import {
  ArrowLeftOutlined,
  BranchesOutlined,
  SaveOutlined,
  UploadOutlined,
} from '@ant-design/icons-vue';
import {
  MAX_REQUIREMENT_DOC_SIZE_BYTES,
  MAX_REQUIREMENT_DOC_SIZE_MB,
} from '@case-forge/shared';
import { useCaseForgeStore } from '@/stores/caseForge';

const store = useCaseForgeStore();
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
const activeTab = ref('edit');
const editorText = ref('');
const autoSaveTimer = ref<number | null>(null);

watch(
  () => store.activeStructDoc?.tempStructDoc,
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
  () => store.activeProject?.id,
  () => {
    if (autoSaveTimer.value) {
      window.clearTimeout(autoSaveTimer.value);
      autoSaveTimer.value = null;
    }
  },
);

watch(editorText, () => {
  scheduleAutoSave();
});

function scheduleAutoSave() {
  const projectId = store.activeProject?.id;
  if (!projectId || editorText.value === store.activeStructDoc?.tempStructDoc) {
    return;
  }
  if (autoSaveTimer.value) {
    window.clearTimeout(autoSaveTimer.value);
  }
  autoSaveTimer.value = window.setTimeout(() => {
    autoSaveTimer.value = null;
    void flushAutoSave();
  }, 1200);
}

function handleEditorBlur() {
  void flushAutoSave({ notify: true });
}

async function flushAutoSave(options?: { notify?: boolean }) {
  if (autoSaveTimer.value) {
    window.clearTimeout(autoSaveTimer.value);
    autoSaveTimer.value = null;
  }
  const projectId = store.activeProject?.id;
  const value = editorText.value;
  if (!projectId || value === store.activeStructDoc?.tempStructDoc) {
    return;
  }
  try {
    await store.autoSaveDocument(value, projectId, {
      successMessage: options?.notify ? '已自动保存' : undefined,
    });
  } catch (error) {
    message.error((error as Error)?.message || '自动保存失败');
  }
}

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

function handleStructure() {
  const doc = store.activeStructDoc;
  if (!doc) return;
  const hasStructured =
    doc.structuringStatus === 'completed' ||
    (doc.structuringStatus !== 'failed' && Boolean(doc.canEnterDynamicInstruct));
  if (hasStructured) {
    Modal.confirm({
      title: '重新结构化？',
      content: '当前文档已有结构化结果，重新结构化会覆盖之前的结构化数据，是否继续？',
      okText: '继续结构化',
      cancelText: '取消',
      centered: true,
      onOk: () => store.submitRequirement(),
    });
    return;
  }
  void store.submitRequirement();
}

function handleUpload(file: File) {
  if (store.isStructuring) {
    message.warning('结构化进行中，请稍后再上传');
    return false;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['doc', 'docx', 'md'].includes(extension)) {
    message.error('仅支持上传 doc、docx 或 md 格式的需求文档');
    return false;
  }

  if (file.size > MAX_REQUIREMENT_DOC_SIZE_BYTES) {
    message.error(
      `需求文档大小不能超过 ${MAX_REQUIREMENT_DOC_SIZE_MB}MB，请将文档拆分后分批上传，每个拆分部分作为单独的结构化文档处理。`,
    );
    return false;
  }

  void store.uploadRequirementFile(file);
  return false;
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

.cancel-structure-btn {
  margin-left: 8px;
  padding: 0;
  height: auto;
}

</style>
