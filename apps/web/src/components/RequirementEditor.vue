<template>
  <section class="panel document-panel">
    <div class="panel-header">
      <div>
        <h2>结构化需求文档</h2>
        <div v-if="store.structDoc?.reqDocName" class="doc-links">
          <a v-if="store.structDoc.reqDocUrl" :href="store.structDoc.reqDocUrl" target="_blank" rel="noopener">
            需求文档：{{ store.structDoc.reqDocName }}
          </a>
          <a
            v-if="store.structDoc.structDocUrl && store.structDoc.structuredDocName"
            :href="store.structDoc.structDocUrl"
            target="_blank"
            rel="noopener"
          >
            结构化文档：{{ store.structDoc.structuredDocName }}
          </a>
        </div>
      </div>
      <div class="toolbar action-toolbar">
        <a-upload
          :show-upload-list="false"
          :before-upload="handleUpload"
          :disabled="store.isStructuring"
          accept=".doc,.docx"
        >
          <a-button :disabled="store.isStructuring">
            <template #icon><UploadOutlined /></template>
            上传
          </a-button>
        </a-upload>
        <a-button
          type="primary"
          :loading="store.isStructuring"
          :disabled="!store.structDoc?.canStructure && !store.isStructuring"
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
      v-if="store.isStructuring"
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
import { BranchesOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons-vue';
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
  () => store.structDoc?.tempStructDoc,
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

watch(editorText, (value) => {
  const projectId = store.activeProject?.id;
  if (!projectId || value === store.structDoc?.tempStructDoc) {
    return;
  }
  if (autoSaveTimer.value) {
    window.clearTimeout(autoSaveTimer.value);
  }
  autoSaveTimer.value = window.setTimeout(() => {
    if (store.activeProject?.id !== projectId) {
      return;
    }
    void store.autoSaveDocument(value, projectId);
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

function handleStructure() {
  const hasStructured =
    Boolean(store.structDoc?.canEnterDynamicInstruct) ||
    store.structDoc?.structuringStatus === 'completed';
  if (hasStructured) {
    Modal.confirm({
      title: '重新结构化？',
      content: '当前项目已有结构化结果，重新结构化会覆盖之前的结构化数据，是否继续？',
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
  if (!extension || !['doc', 'docx'].includes(extension)) {
    return false;
  }

  if (file.size > MAX_REQUIREMENT_DOC_SIZE_BYTES) {
    message.error(`需求文档大小不能超过 ${MAX_REQUIREMENT_DOC_SIZE_MB}MB`);
    return false;
  }

  if (store.structDoc?.reqDocName) {
    Modal.confirm({
      title: '重新上传需求文档？',
      content: '当前项目已存在需求文档，重新上传需要重新结构化并重新保存，建议新建项目操作。是否继续？',
      okText: '继续上传',
      cancelText: '取消',
      onOk: () => store.uploadRequirementFile(file, true),
    });
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
