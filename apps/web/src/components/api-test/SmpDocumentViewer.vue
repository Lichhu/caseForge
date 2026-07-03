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
                v-for="key in callServiceMetaKeys(item as Record<string, unknown>)"
                :key="key"
                :label="key"
              >
                <span v-if="isNested((item as Record<string, unknown>)[key])" class="smp-nested-value">
                  <pre>{{ formatJson((item as Record<string, unknown>)[key]) }}</pre>
                </span>
                <span v-else class="smp-text-value">{{ formatValue((item as Record<string, unknown>)[key]) }}</span>
              </a-descriptions-item>
            </a-descriptions>
            <div
              v-if="hasCallServiceFieldLists(item as Record<string, unknown>)"
              class="smp-field-lists"
            >
              <a-row :gutter="16" class="smp-field-list-row">
                <a-col
                  v-for="fieldKey in CALL_SERVICE_REQUEST_LIST_KEYS"
                  :key="fieldKey"
                  :xs="24"
                  :lg="12"
                >
                  <div class="smp-field-list-block">
                    <div class="smp-field-list-title">{{ callServiceListLabel(fieldKey) }}</div>
                    <pre class="smp-json-body">{{
                      formatJson((item as Record<string, unknown>)[fieldKey])
                    }}</pre>
                  </div>
                </a-col>
              </a-row>
              <a-row :gutter="16" class="smp-field-list-row">
                <a-col
                  v-for="fieldKey in CALL_SERVICE_RESPONSE_LIST_KEYS"
                  :key="fieldKey"
                  :xs="24"
                  :lg="12"
                >
                  <div class="smp-field-list-block">
                    <div class="smp-field-list-title">{{ callServiceListLabel(fieldKey) }}</div>
                    <pre class="smp-json-body">{{
                      formatJson((item as Record<string, unknown>)[fieldKey])
                    }}</pre>
                  </div>
                </a-col>
              </a-row>
            </div>
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
            <a-row :gutter="16" class="smp-test-payload-row">
              <a-col :xs="24" :lg="12">
                <div class="smp-json-block">
                  <div class="smp-json-block-title">请求报文</div>
                  <pre class="smp-json-body">{{ formatJsonBody((item as Record<string, unknown>).requestBody) }}</pre>
                </div>
              </a-col>
              <a-col :xs="24" :lg="12">
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

const CALL_SERVICE_LIST_KEYS = [
  'requestHeadList',
  'requestBodyList',
  'responseHeadList',
  'responseBodyList',
] as const;

const CALL_SERVICE_REQUEST_LIST_KEYS = [
  'requestHeadList',
  'requestBodyList',
] as const;

const CALL_SERVICE_RESPONSE_LIST_KEYS = [
  'responseHeadList',
  'responseBodyList',
] as const;

const CALL_SERVICE_LIST_KEY_SET = new Set<string>(CALL_SERVICE_LIST_KEYS);

function callServiceMetaKeys(item: Record<string, unknown>): string[] {
  const priority = [
    'serviceCode',
    'tranCode',
    'serviceCname',
    'descript',
    'systemName',
    'callMethod',
    'messageType',
    'serviceType',
    'serviceAttribute',
    'systemId',
    'bus',
  ];
  const ordered = priority.filter((key) => key in item && !CALL_SERVICE_LIST_KEY_SET.has(key));
  const rest = Object.keys(item).filter(
    (key) => !priority.includes(key) && !CALL_SERVICE_LIST_KEY_SET.has(key),
  );
  return [...ordered, ...rest];
}

function hasCallServiceFieldLists(item: Record<string, unknown>): boolean {
  return CALL_SERVICE_LIST_KEYS.some((key) => key in item);
}

function callServiceListLabel(key: (typeof CALL_SERVICE_LIST_KEYS)[number]): string {
  const labels: Record<(typeof CALL_SERVICE_LIST_KEYS)[number], string> = {
    requestHeadList: 'requestHeadList',
    requestBodyList: 'requestBodyList',
    responseHeadList: 'responseHeadList',
    responseBodyList: 'responseBodyList',
  };
  return labels[key];
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

.smp-test-payload-row {
  margin-bottom: 16px;
  row-gap: 16px;
}

.smp-test-payload-row :deep(.ant-col) {
  display: flex;
  min-width: 0;
}

.smp-json-block {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  margin-bottom: 0;
}

.smp-json-block-title {
  margin-bottom: 6px;
  color: #667085;
  font-size: 12px;
  font-weight: 500;
}

.smp-json-body {
  flex: 1;
  margin: 0;
  padding: 12px;
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

.smp-nested-value {
  display: block;
  width: 100%;
  min-width: 0;
}

.smp-nested-value pre {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 8px;
  overflow: visible;
  border-radius: 4px;
  background: #f9fafb;
  color: #667085;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.smp-call-service-card :deep(.ant-descriptions-item-content),
.smp-call-service-card :deep(.ant-descriptions-item-label) {
  vertical-align: top;
}

.smp-field-lists {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f2f4f7;
}

.smp-field-list-row {
  row-gap: 16px;
}

.smp-field-list-row + .smp-field-list-row {
  margin-top: 16px;
}

.smp-field-list-row :deep(.ant-col) {
  display: flex;
  min-width: 0;
}

.smp-field-list-block {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.smp-field-list-title {
  margin-bottom: 8px;
  color: #344054;
  font-size: 12px;
  font-weight: 600;
}

.smp-field-list-block .smp-json-body {
  flex: 1;
  max-height: none;
  overflow: visible;
}

.smp-test-meta {
  margin-top: 12px;
}

.smp-doc-empty {
  padding: 48px 0;
}
</style>
