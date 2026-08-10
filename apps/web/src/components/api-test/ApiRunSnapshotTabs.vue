<template>
  <a-tabs size="small" class="exec-run-expand-tabs">
    <a-tab-pane key="req" tab="请求">
      <div class="exec-run-snapshot-panel">
        <div v-if="splitSnapshot(requestSnapshot).body" class="exec-run-snapshot-section">
          <div class="exec-run-snapshot-label">报文 Body</div>
          <pre class="exec-run-snapshot exec-run-snapshot--body">{{
            splitSnapshot(requestSnapshot).body
          }}</pre>
        </div>
        <div class="exec-run-snapshot-section">
          <div class="exec-run-snapshot-label">请求信息</div>
          <pre class="exec-run-snapshot exec-run-snapshot--meta">{{
            splitSnapshot(requestSnapshot).meta
          }}</pre>
        </div>
      </div>
    </a-tab-pane>
    <a-tab-pane key="res" tab="响应">
      <div class="exec-run-snapshot-panel">
        <div v-if="splitSnapshot(responseSnapshot).body" class="exec-run-snapshot-section">
          <div class="exec-run-snapshot-label">响应 Body</div>
          <pre class="exec-run-snapshot exec-run-snapshot--body">{{
            splitSnapshot(responseSnapshot).body
          }}</pre>
        </div>
        <div class="exec-run-snapshot-section">
          <div class="exec-run-snapshot-label">响应信息</div>
          <pre class="exec-run-snapshot exec-run-snapshot--meta">{{
            splitSnapshot(responseSnapshot).meta
          }}</pre>
        </div>
      </div>
    </a-tab-pane>
    <a-tab-pane key="assert" tab="断言比对">
      <a-table
        class="exec-run-assert-table"
        size="small"
        :pagination="false"
        :data-source="assertions"
        :columns="assertionColumns"
        row-key="name"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'passed'">
            <span
              class="exec-run-status-pill exec-run-status-pill--sm"
              :class="record.passed ? 'exec-run-status-pill--passed' : 'exec-run-status-pill--failed'"
            >
              {{ record.passed ? '通过' : '失败' }}
            </span>
          </template>
          <template v-else-if="column.key === 'expected' || column.key === 'actual'">
            <pre class="exec-run-assert-value">{{
              formatRunSnapshotField(record[column.key as 'expected' | 'actual'])
            }}</pre>
          </template>
        </template>
      </a-table>
    </a-tab-pane>
  </a-tabs>
</template>

<script setup lang="ts">
import {
  formatRunSnapshotField,
  splitRunSnapshotForDisplay,
} from '@/utils/casePayloadFormat.util';

export interface RunSnapshotAssertion {
  name: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
}

defineProps<{
  requestSnapshot?: unknown;
  responseSnapshot?: unknown;
  assertions?: RunSnapshotAssertion[];
}>();

const assertionColumns = [
  { title: '断言', dataIndex: 'name', key: 'name', width: 120 },
  { title: '断言值', dataIndex: 'expected', key: 'expected' },
  { title: '实际值', dataIndex: 'actual', key: 'actual' },
  { title: '结果', key: 'passed', width: 72 },
];

function splitSnapshot(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return splitRunSnapshotForDisplay(value as Record<string, unknown>);
  }
  return { meta: formatRunSnapshotField(value), body: null as string | null };
}
</script>

<style scoped>
.exec-run-expand-tabs :deep(.ant-tabs-nav) {
  margin-bottom: 8px;
}

.exec-run-expand-tabs :deep(.ant-tabs-content-holder),
.exec-run-expand-tabs :deep(.ant-tabs-content),
.exec-run-expand-tabs :deep(.ant-tabs-tabpane) {
  overflow: visible;
}

.exec-run-snapshot-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.exec-run-snapshot-section {
  min-width: 0;
}

.exec-run-snapshot-label {
  margin-bottom: 6px;
  color: #667085;
  font-size: 12px;
  font-weight: 500;
}

.exec-run-snapshot {
  margin: 0;
  max-height: none;
  padding: 12px 14px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #f9fafb;
  color: #344054;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.exec-run-snapshot--meta {
  max-height: none;
  overflow: visible;
}

.exec-run-snapshot--body {
  display: block;
  width: 100%;
  max-width: 100%;
  max-height: none;
  overflow-x: auto;
  overflow-y: visible;
  background: #fff;
  border-color: #e4e7ec;
  white-space: pre;
  word-break: normal;
}

.exec-run-assert-value {
  max-width: 360px;
  max-height: none;
  margin: 0;
  color: #344054;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.exec-run-assert-table :deep(.ant-table-tbody > tr > td) {
  vertical-align: top;
}

.exec-run-assert-table :deep(.ant-table) {
  border: 1px solid #eef2f6;
  border-radius: 8px;
  overflow: hidden;
}

.exec-run-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
}

.exec-run-status-pill--sm {
  padding: 1px 8px;
  font-size: 11px;
}

.exec-run-status-pill--passed {
  background: #ecfdf3;
  color: #027a48;
}

.exec-run-status-pill--failed,
.exec-run-status-pill--error {
  background: #fef3f2;
  color: #b42318;
}
</style>
