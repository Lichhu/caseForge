<template>
  <section class="panel document-panel">
    <div class="panel-header">
      <div>
        <h2>接口文档</h2>
        <p v-if="apiStore.apiDoc?.sourceDocName" class="doc-meta">
          已上传：{{ apiStore.apiDoc.sourceDocName }}
          <a
            v-if="apiStore.apiDoc.sourceDocUrl"
            :href="apiStore.apiDoc.sourceDocUrl"
            target="_blank"
            rel="noopener"
          >查看原文件</a>
        </p>
      </div>
      <div class="toolbar action-toolbar">
        <a-upload :show-upload-list="false" :before-upload="onUpload" accept=".xls,.xlsx,.doc,.docx,.md,.markdown,.txt">
          <a-button :loading="apiStore.loading"><template #icon><UploadOutlined /></template>上传</a-button>
        </a-upload>
        <a-button type="primary" :loading="apiStore.loading" :disabled="!apiStore.apiDoc?.sourceDocName" @click="onStructure">
          <template #icon><BranchesOutlined /></template>结构化
        </a-button>
        <a-button :disabled="!editorText.trim()" @click="onSave"><template #icon><SaveOutlined /></template>保存</a-button>
      </div>
    </div>
    <a-alert v-if="apiStore.apiDoc?.structuringStatus === 'failed'" type="error" show-icon :message="apiStore.apiDoc.structuringError" class="document-panel-alert" />
    <a-textarea v-model:value="editorText" class="markdown-editor" placeholder="上传 Excel/Word/Markdown 后点击结构化，或在此编辑接口清单 Markdown" />
    <div v-if="apiStore.apiDoc?.endpoints?.length" class="endpoint-preview">
      <h3>已识别接口（{{ apiStore.apiDoc.endpoints.length }}）</h3>
      <a-table size="small" :pagination="false" :data-source="apiStore.apiDoc.endpoints" :columns="endpointColumns" row-key="id" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { BranchesOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons-vue';
import type { UploadProps } from 'ant-design-vue';
import { useApiTestStore } from '@/stores/apiTest';

const apiStore = useApiTestStore();
const editorText = ref('');

const endpointColumns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '方法', dataIndex: 'method', width: 80 },
  { title: '路径', dataIndex: 'path' },
];

watch(
  () => apiStore.apiDoc,
  (doc) => {
    editorText.value =
      doc?.tempStructuredMarkdown ?? doc?.structuredMarkdown ?? '';
  },
  { immediate: true },
);

const projectId = computed(() => apiStore.activeProjectId ?? '');

const onUpload: UploadProps['beforeUpload'] = async (file) => {
  if (!projectId.value) return false;
  await apiStore.uploadDocument(projectId.value, file as File);
  return false;
};

async function onStructure() {
  if (!projectId.value) return;
  await apiStore.structureDocument(projectId.value);
}

async function onSave() {
  if (!projectId.value) return;
  await apiStore.saveDocument(projectId.value, editorText.value);
}
</script>

<style scoped>
.doc-meta { margin: 4px 0 0; color: var(--cf-muted, #64748b); font-size: 13px; }
.doc-meta a { margin-left: 8px; }
.endpoint-preview { margin-top: 16px; }
.endpoint-preview h3 { font-size: 14px; margin-bottom: 8px; }
</style>
