<template>
  <div class="smp-document-viewer">
    <div v-if="!hasData" class="smp-doc-empty">
      <a-empty description="暂无服管平台数据" />
    </div>

    <template v-else>
      <section
        v-if="data.callServiceList.length"
        class="smp-doc-section"
      >
        <h3 class="smp-doc-section-title">服务调用信息</h3>
        <div class="smp-call-service-list">
          <a-card
            v-for="(item, index) in data.callServiceList"
            :key="`call-${index}`"
            class="smp-call-service-card"
            size="small"
          >
            <template #title>
              <div class="smp-card-title">
                <span class="smp-card-title-code">
                  {{ (item as Record<string, unknown>).serviceCode || (item as Record<string, unknown>).tranCode || '-' }}
                </span>
                <span class="smp-card-title-name">
                  {{ (item as Record<string, unknown>).serviceCname || (item as Record<string, unknown>).descript || '服务调用信息' }}
                </span>
              </div>
            </template>
            <a-descriptions :column="2" size="small" bordered>
              <a-descriptions-item
                v-for="key in callServiceKeys(item as Record<string, unknown>)"
                :key="key"
                :label="key"
              >
                <span v-if="isNested((item as Record<string, unknown>)[key])" class="smp-nested-value">
                  <pre>{{ formatJson((item as Record<string, unknown>)[key]) }}</pre>
                </span>
                <span v-else class="smp-text-value">{{ formatValue((item as Record<string, unknown>)[key]) }}</span>
              </a-descriptions-item>
            </a-descriptions>
          </a-card>
        </div>
      </section>

      <section
        v-if="data.serviceTestList.length"
        class="smp-doc-section"
      >
        <h3 class="smp-doc-section-title">接口测试信息</h3>
        <div class="smp-test-info-list">
          <a-card
            v-for="(item, index) in data.serviceTestList"
            :key="`test-${index}`"
            class="smp-test-info-card"
            size="small"
          >
            <div class="smp-test-info-header">
              <a-tag color="blue">{{ (item as Record<string, unknown>).requestMethod || '—' }}</a-tag>
              <span class="smp-test-info-url">{{ (item as Record<string, unknown>).requestUrl || '—' }}</span>
            </div>
            <a-row :gutter="16">
              <a-col :span="24">
                <div class="smp-json-block">
                  <div class="smp-json-block-title">请求报文</div>
                  <pre class="smp-json-body">{{ formatJsonBody((item as Record<string, unknown>).requestBody) }}</pre>
                </div>
              </a-col>
            </a-row>
            <a-row :gutter="16">
              <a-col :span="24">
                <div class="smp-json-block">
                  <div class="smp-json-block-title">响应报文</div>
                  <pre class="smp-json-body">{{ formatJsonBody((item as Record<string, unknown>).responseBody) }}</pre>
                </div>
              </a-col>
            </a-row>
            <a-descriptions :column="4" size="small" class="smp-test-meta" bordered>
              <a-descriptions-item label="requestEncoding">{{ formatValue((item as Record<string, unknown>).requestEncoding) }}</a-descriptions-item>
              <a-descriptions-item label="requestMessageType">{{ formatValue((item as Record<string, unknown>).requestMessageType) }}</a-descriptions-item>
              <a-descriptions-item label="responseEncoding">{{ formatValue((item as Record<string, unknown>).responseEncoding) }}</a-descriptions-item>
              <a-descriptions-item label="responstMessageType">{{ formatValue((item as Record<string, unknown>).responstMessageType) }}</a-descriptions-item>
            </a-descriptions>
          </a-card>
        </div>
      </section>

      <section
        v-if="data.approvalInfoList.length"
        class="smp-doc-section"
      >
        <h3 class="smp-doc-section-title">变更信息</h3>
        <a-table
          :columns="approvalColumns"
          :data-source="data.approvalInfoList as Record<string, unknown>[]"
          :pagination="false"
          size="small"
          :scroll="{ x: 'max-content' }"
        >
          <template #bodyCell="{ column, record }">
            <span v-if="isNested(record[column.key])" class="smp-nested-value">
              <pre>{{ formatJson(record[column.key]) }}</pre>
            </span>
            <span v-else class="smp-text-value">{{ formatValue(record[column.key]) }}</span>
          </template>
        </a-table>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SmpDocumentData } from '@/api/apiTestClient';

const props = defineProps<{
  data: SmpDocumentData;
}>();

const hasData = computed(() =>
  props.data.callServiceList.length > 0 ||
  props.data.serviceTestList.length > 0 ||
  props.data.approvalInfoList.length > 0,
);

const approvalColumns = computed(() => {
  const rows = props.data.approvalInfoList as Record<string, unknown>[];
  if (!rows.length) return [];
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return keys.map((key) => ({ title: key, key, dataIndex: key }));
});

function callServiceKeys(item: Record<string, unknown>): string[] {
  const priority = ['serviceCode', 'tranCode', 'serviceCname', 'descript', 'systemName', 'callMethod', 'messageType', 'serviceType', 'serviceAttribute', 'systemId', 'bus'];
  const ordered = priority.filter((key) => key in item);
  const rest = Object.keys(item).filter((key) => !priority.includes(key));
  return [...ordered, ...rest];
}

function isNested(value: unknown): boolean {
  return value !== null && value !== undefined && (typeof value === 'object' || Array.isArray(value));
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  return String(value);
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return '—';
  return JSON.stringify(value, null, 2);
}

function formatJsonBody(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  try {
    return JSON.stringify(JSON.parse(value as string), null, 2);
  } catch {
    return String(value);
  }
}
</script>

<style scoped>
.smp-document-viewer {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 8px 0;
}

.smp-doc-section-title {
  margin: 0 0 12px;
  color: #1d2939;
  font-size: 14px;
  font-weight: 600;
}

.smp-call-service-list,
.smp-test-info-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.smp-card-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.smp-card-title-code {
  color: #175cd3;
  font-size: 13px;
  font-weight: 600;
}

.smp-card-title-name {
  color: #101828;
  font-size: 13px;
  font-weight: 500;
}

.smp-test-info-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f2f4f7;
}

.smp-test-info-url {
  color: #344054;
  font-size: 13px;
  word-break: break-all;
}

.smp-json-block {
  margin-bottom: 16px;
}

.smp-json-block-title {
  margin-bottom: 6px;
  color: #667085;
  font-size: 12px;
  font-weight: 500;
}

.smp-json-body {
  max-height: 240px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  border-radius: 6px;
  background: #f9fafb;
  color: #344054;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.smp-text-value {
  color: #344054;
  white-space: pre-wrap;
  word-break: break-word;
}

.smp-nested-value pre {
  max-width: 360px;
  max-height: 200px;
  margin: 0;
  padding: 8px;
  overflow: auto;
  border-radius: 4px;
  background: #f9fafb;
  color: #667085;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.smp-test-meta {
  margin-top: 12px;
}

.smp-doc-empty {
  padding: 48px 0;
}
</style>
