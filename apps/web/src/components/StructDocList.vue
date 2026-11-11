<template>
  <section class="panel document-panel">
    <div class="panel-header">
      <div class="panel-heading-copy">
        <div class="panel-title-line">
          <h2>结构化需求文档</h2>
          <span v-if="store.structDocs.length" class="document-count">
            {{ store.structDocs.length }} 份
          </span>
        </div>
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

    <div
      v-else
      class="struct-doc-table"
      role="table"
      aria-label="结构化需求文档列表"
    >
      <div class="struct-doc-table-head" role="row">
        <span role="columnheader">文档名称</span>
        <span role="columnheader">处理状态</span>
        <span role="columnheader">测试要点</span>
        <span role="columnheader" class="actions-header">操作</span>
      </div>
      <div
        v-for="doc in store.structDocs"
        :key="doc.id"
        class="struct-doc-row"
        :class="{ active: doc.id === store.activeStructDocId }"
        role="row"
        tabindex="0"
        @click="selectDocument(doc)"
        @keydown.enter.prevent="selectDocument(doc)"
        @keydown.space.prevent="selectDocument(doc)"
      >
        <div class="struct-doc-file" role="cell">
          <span class="struct-doc-file-icon">
            <FileTextOutlined />
          </span>
          <span class="struct-doc-file-copy">
            <span class="struct-doc-file-name" :title="doc.reqDocName">
              {{ doc.reqDocName || '未命名文档' }}
            </span>
            <span class="struct-doc-file-hint">点击进入文档编辑</span>
          </span>
        </div>
        <div class="struct-doc-status" role="cell">
          <a-tooltip :title="documentStatus(doc).title">
            <span
              class="document-status"
              :class="`is-${documentStatus(doc).tone}`"
            >
              <span class="document-status-dot" />
              {{ documentStatus(doc).label }}
            </span>
          </a-tooltip>
        </div>
        <div class="struct-doc-points" role="cell">
          <template v-if="doc.parsedTestPointCount != null">
            <strong>{{ doc.parsedTestPointCount }}</strong>
            <span>个</span>
          </template>
          <span v-else class="document-placeholder">—</span>
        </div>
        <div class="struct-doc-actions" role="cell" @click.stop>
          <a-button
            type="primary"
            size="small"
            :loading="doc.structuringStatus === 'processing'"
            :disabled="!doc.canStructure"
            @click="startStructure(doc)"
          >
            {{ doc.structuringStatus === 'completed' ? '重新结构化' : '开始结构化' }}
          </a-button>
          <a-tooltip
            v-if="doc.structuringStatus === 'processing'"
            title="取消当前正在进行的结构化任务"
          >
            <a-button
              type="default"
              size="small"
              @click="cancelStructure(doc)"
            >
              取消
            </a-button>
          </a-tooltip>
          <a-tooltip title="删除文档">
            <a-button
              type="text"
              size="small"
              danger
              class="document-delete"
              :disabled="store.isStructuring"
              @click="confirmDeleteDoc(doc)"
            >
              <template #icon><DeleteOutlined /></template>
            </a-button>
          </a-tooltip>
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

type DocumentStatusTone = 'processing' | 'success' | 'warning' | 'error' | 'idle';

const store = useCaseForgeStore();

function documentStatus(doc: StructDocDetail): {
  label: string;
  tone: DocumentStatusTone;
  title: string;
} {
  if (doc.structuringStatus === 'processing') {
    return {
      label: '结构化中',
      tone: 'processing',
      title: '正在解析并结构化需求文档',
    };
  }
  if (doc.parseWarning) {
    return {
      label: '已完成 · 有警告',
      tone: 'warning',
      title: doc.parseWarning,
    };
  }
  if (doc.structuringStatus === 'completed') {
    return {
      label: '已完成',
      tone: 'success',
      title: '结构化已完成，可进入动态指令',
    };
  }
  if (doc.structuringStatus === 'failed') {
    const cancelled = doc.structuringError?.includes('取消');
    return {
      label: cancelled ? '已取消' : '结构化失败',
      tone: cancelled ? 'warning' : 'error',
      title: doc.structuringError || '结构化失败，请重新尝试',
    };
  }
  return {
    label: '待处理',
    tone: 'idle',
    title: '等待上传或开始结构化',
  };
}

function selectDocument(doc: StructDocDetail) {
  store.selectStructDoc(doc.id);
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

function cancelStructure(doc: StructDocDetail) {
  if (doc.structuringStatus !== 'processing') {
    return;
  }
  Modal.confirm({
    title: '取消结构化？',
    content: '取消后当前结构化任务将终止，已生成的内容可能不完整，是否继续？',
    okText: '继续取消',
    cancelText: '再等等',
    centered: true,
    onOk: () => {
      void store.cancelStructuring(doc.id);
    },
  });
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
.panel-heading-copy {
  min-width: 0;
}

.panel-title-line {
  display: flex;
  align-items: center;
  gap: 9px;
}

.document-count {
  padding: 1px 7px;
  border-radius: 999px;
  background: #f2f4f7;
  color: #667085;
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
}

.empty-state {
  margin-top: 48px;
}

.struct-doc-table {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  margin: 16px 18px 18px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  overflow: auto;
}

.struct-doc-table-head,
.struct-doc-row {
  display: grid;
  grid-template-columns: minmax(300px, 1fr) 180px 108px 250px;
  align-items: center;
  column-gap: 20px;
}

.struct-doc-table-head {
  position: sticky;
  top: 0;
  z-index: 2;
  min-height: 38px;
  padding: 0 18px;
  border-bottom: 1px solid #eaecf0;
  background: #f8f9fb;
  color: #667085;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.actions-header {
  text-align: right;
}

.struct-doc-row {
  min-height: 70px;
  padding: 12px 18px;
  border-bottom: 1px solid #eef1f4;
  background: #fff;
  cursor: pointer;
  outline: none;
  transition:
    background-color 0.14s ease,
    box-shadow 0.14s ease;
}

.struct-doc-row:last-child {
  border-bottom: 0;
}

.struct-doc-row:hover,
.struct-doc-row:focus-visible {
  background: #fafbfc;
}

.struct-doc-row:focus-visible {
  box-shadow: inset 3px 0 0 var(--cf-brand);
}

.struct-doc-row.active {
  background: #fff7f8;
}

.struct-doc-file {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.struct-doc-file-icon {
  display: grid;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid #f0d5da;
  border-radius: 8px;
  background: #fff7f8;
  color: var(--cf-brand);
  font-size: 15px;
}

.struct-doc-file-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 3px;
}

.struct-doc-file-name {
  overflow: hidden;
  color: #1d2939;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.struct-doc-file-hint {
  overflow: hidden;
  color: #98a2b3;
  font-size: 11px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.struct-doc-status {
  min-width: 0;
}

.document-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  color: #475467;
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
}

.document-status-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.document-status.is-processing {
  color: #175cd3;
}

.document-status.is-success {
  color: #027a48;
}

.document-status.is-warning {
  color: #b54708;
}

.document-status.is-error {
  color: #b42318;
}

.document-status.is-idle {
  color: #667085;
}

.struct-doc-points {
  color: #667085;
  font-size: 11px;
  white-space: nowrap;
}

.struct-doc-points strong {
  margin-right: 3px;
  color: #1d2939;
  font-size: 14px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.document-placeholder {
  color: #c0c6cf;
}

.struct-doc-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}

.struct-doc-actions :deep(.ant-btn) {
  min-width: 82px;
  height: 30px;
  padding-inline: 10px;
  border-radius: 6px;
  font-size: 12px;
  box-shadow: none;
}

.struct-doc-actions :deep(.ant-btn-primary) {
  min-width: 96px;
}

.struct-doc-actions :deep(.document-delete) {
  min-width: 30px;
  width: 30px;
  padding: 0;
}

@media (max-width: 1280px) {
  .struct-doc-table-head,
  .struct-doc-row {
    grid-template-columns: minmax(260px, 1fr) 168px 88px 224px;
    column-gap: 14px;
  }
}

@media (max-width: 980px) {
  .struct-doc-table {
    margin: 14px;
  }

  .struct-doc-table-head {
    display: none;
  }

  .struct-doc-row {
    grid-template-areas:
      "file actions"
      "status points";
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px 16px;
    align-items: start;
    padding: 14px;
  }

  .struct-doc-file {
    grid-area: file;
  }

  .struct-doc-status {
    grid-area: status;
  }

  .struct-doc-points {
    grid-area: points;
    justify-self: end;
  }

  .struct-doc-actions {
    grid-area: actions;
  }
}

@media (max-width: 620px) {
  .panel-header {
    align-items: stretch;
    flex-direction: column;
  }

  .struct-doc-row {
    grid-template-areas:
      "file"
      "status"
      "actions";
    grid-template-columns: minmax(0, 1fr);
  }

  .struct-doc-points {
    display: none;
  }

  .struct-doc-actions {
    justify-content: flex-start;
  }
}
</style>
