<template>
  <section class="panel document-panel">
    <div class="panel-header">
      <div>
        <h2>结构化需求文档</h2>
        <p>选择或新建需求文档，进入文档进行上传、结构化、编辑与保存</p>
      </div>
      <div class="toolbar action-toolbar">
        <a-upload
          :show-upload-list="false"
          :before-upload="handleUpload"
          :disabled="store.isStructuring"
          accept=".doc,.docx,.md"
        >
          <a-button type="primary" :disabled="store.isStructuring">
            <template #icon><UploadOutlined /></template>
            上传新文档
          </a-button>
        </a-upload>
      </div>
    </div>

    <a-empty
      v-if="!store.structDocs.length"
      class="empty-state workbench-empty"
      description="暂无需求文档，点击右上角上传"
    />

    <div v-else class="struct-doc-list">
      <div
        v-for="doc in store.structDocs"
        :key="doc.id"
        class="struct-doc-card"
        :class="{ active: doc.id === store.activeStructDocId }"
        @click="store.selectStructDoc(doc.id)"
      >
        <div class="struct-doc-card-main">
          <div class="struct-doc-card-title">
            <FileTextOutlined />
            <span :title="doc.reqDocName">{{ doc.reqDocName || '未命名文档' }}</span>
          </div>
          <div class="struct-doc-card-meta">
            <a-tag
              v-if="doc.structuringStatus === 'processing'"
              color="processing"
              size="small"
            >结构化中</a-tag>
            <a-tag
              v-else-if="doc.structuringStatus === 'completed'"
              color="success"
              size="small"
            >已结构化</a-tag>
            <a-tooltip
              v-else-if="doc.structuringStatus === 'failed'"
              :title="doc.structuringError || '结构化失败'"
            >
              <a-tag color="error" size="small">结构化失败</a-tag>
            </a-tooltip>
            <a-tag v-else color="default" size="small">待上传/结构化</a-tag>
          </div>
        </div>
        <div class="struct-doc-card-actions" @click.stop>
          <a-button
            type="primary"
            size="small"
            :loading="doc.structuringStatus === 'processing'"
            :disabled="!doc.canStructure"
            @click="startStructure(doc)"
          >
            结构化
          </a-button>
          <a-button
            type="text"
            size="small"
            danger
            :disabled="store.isStructuring"
            @click="confirmDeleteDoc(doc)"
          >
            <template #icon><DeleteOutlined /></template>
          </a-button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { UploadOutlined, FileTextOutlined, DeleteOutlined } from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import { useCaseForgeStore } from '@/stores/caseForge';
import type { StructDocDetail } from '@/api/client';
import {
  MAX_REQUIREMENT_DOC_SIZE_BYTES,
  MAX_REQUIREMENT_DOC_SIZE_MB,
} from '@case-forge/shared';

const store = useCaseForgeStore();

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

function startStructure(doc: StructDocDetail) {
  if (!doc.canStructure) {
    if (doc.structuringStatus === 'processing') {
      message.info('结构化任务进行中，请稍候');
      return;
    }
    message.warning('请先上传需求文档后再进行结构化');
    return;
  }
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
      onOk: () => {
        store.selectStructDoc(doc.id);
        void store.submitRequirement();
      },
    });
    return;
  }
  store.selectStructDoc(doc.id);
  void store.submitRequirement();
}

function confirmDeleteDoc(doc: StructDocDetail) {
  Modal.confirm({
    title: '删除文档',
    content: `确定删除「${doc.reqDocName || '未命名文档'}」？删除后不可恢复。`,
    okText: '删除',
    cancelText: '取消',
    okType: 'danger',
    centered: true,
    onOk: async () => {
      await store.deleteStructDoc(doc.id);
    },
  });
}
</script>

<style scoped>
.empty-state {
  margin-top: 48px;
}

.struct-doc-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  padding: 16px 0;
}

.struct-doc-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  transition: box-shadow 0.12s ease, border-color 0.12s ease;
}

.struct-doc-card:hover,
.struct-doc-card.active {
  border-color: var(--cf-brand);
  box-shadow: 0 2px 8px rgba(199, 28, 34, 0.08);
}

.struct-doc-card-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.struct-doc-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: #1d2939;
  overflow: hidden;
}

.struct-doc-card-title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.struct-doc-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.struct-doc-card-link {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--cf-brand);
}

.struct-doc-card-link a {
  color: inherit;
}

.struct-doc-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
