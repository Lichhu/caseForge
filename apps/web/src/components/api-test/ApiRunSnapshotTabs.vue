<template>
  <div
    class="exec-run-compare"
    :class="{ 'exec-run-compare--dense': dense }"
  >
    <div v-if="showSnapshots !== false" class="exec-run-compare-grid">
      <section class="exec-run-compare-pane">
        <header class="exec-run-compare-head">
          <div>
            <strong>请求</strong>
            <span>实际发出的请求快照</span>
          </div>
          <a-tag :bordered="false">Request</a-tag>
        </header>
        <div class="exec-run-compare-content">
          <div v-if="requestParts.body" class="exec-run-snapshot-section">
            <div class="exec-run-snapshot-label">请求报文</div>
            <pre class="exec-run-snapshot exec-run-snapshot--body">{{
              requestParts.body
            }}</pre>
          </div>
          <div class="exec-run-snapshot-section">
            <div class="exec-run-snapshot-label">请求信息</div>
            <pre class="exec-run-snapshot exec-run-snapshot--meta">{{
              requestParts.meta
            }}</pre>
          </div>
        </div>
      </section>

      <section class="exec-run-compare-pane">
        <header class="exec-run-compare-head">
          <div>
            <strong>响应</strong>
            <span>服务端返回的响应快照</span>
          </div>
          <a-tag :bordered="false" color="blue">Response</a-tag>
        </header>
        <div class="exec-run-compare-content">
          <div v-if="responseParts.body" class="exec-run-snapshot-section">
            <div class="exec-run-snapshot-label">响应报文</div>
            <pre class="exec-run-snapshot exec-run-snapshot--body">{{
              responseParts.body
            }}</pre>
          </div>
          <div class="exec-run-snapshot-section">
            <div class="exec-run-snapshot-label">响应信息</div>
            <pre class="exec-run-snapshot exec-run-snapshot--meta">{{
              responseParts.meta
            }}</pre>
          </div>
        </div>
      </section>
    </div>

    <section class="exec-run-assertions">
      <header class="exec-run-assertions-head">
        <div>
          <strong>断言比对</strong>
          <span v-if="!dense">期望值与实际值并排展示</span>
        </div>
        <div class="exec-run-assert-summary">
          <span>共 {{ assertionRows.length }} 条</span>
          <span class="is-pass">通过 {{ assertionPassedCount }}</span>
          <span class="is-fail">失败 {{ assertionFailedCount }}</span>
        </div>
      </header>
      <a-empty
        v-if="!assertionRows.length"
        class="exec-run-assertions-empty"
        description="本次执行没有断言记录"
      />
      <div v-else class="exec-run-assertion-list">
        <article
          v-for="(assertion, index) in assertionRows"
          :key="`${assertion.name}-${index}`"
          class="exec-run-assertion-item"
          :class="{ failed: !assertion.passed }"
        >
          <header class="exec-run-assertion-head">
            <span
              class="exec-run-status-pill exec-run-status-pill--sm"
              :class="
                assertion.passed
                  ? 'exec-run-status-pill--passed'
                  : 'exec-run-status-pill--failed'
              "
            >
              {{ assertion.passed ? "通过" : "失败" }}
            </span>
            <strong>{{ assertion.name || `断言 ${index + 1}` }}</strong>
          </header>
          <div class="exec-run-assertion-values">
            <div>
              <span>期望值</span>
              <pre>{{ formatRunSnapshotField(assertion.expected) }}</pre>
              <div
                v-if="assertion.expectedSource"
                class="exec-run-assertion-source"
              >
                <span class="exec-run-assertion-source-label">数据来源</span>
                <a-tooltip
                  :title="
                    assertion.expectedSource.expression ||
                    assertion.expectedSource.label
                  "
                >
                  <span class="exec-run-assertion-source-value">
                    {{ assertion.expectedSource.label }}
                  </span>
                </a-tooltip>
                <code
                  v-if="assertion.expectedSource.expression"
                  class="exec-run-assertion-source-expression"
                  :title="assertion.expectedSource.expression"
                >
                  {{ assertion.expectedSource.expression }}
                </code>
              </div>
            </div>
            <div>
              <span>实际值</span>
              <pre>{{ formatRunSnapshotField(assertion.actual) }}</pre>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AssertionValueSource } from '@case-forge/shared';
import {
  formatRunSnapshotField,
  splitRunSnapshotForDisplay,
} from '@/utils/casePayloadFormat.util';

export interface RunSnapshotAssertion {
  name: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  expectedSource?: AssertionValueSource;
}

const props = withDefaults(
  defineProps<{
    requestSnapshot?: unknown;
    responseSnapshot?: unknown;
    assertions?: RunSnapshotAssertion[];
    showSnapshots?: boolean;
    dense?: boolean;
  }>(),
  {
    // Boolean prop 未传入时 Vue 会转换为 false，这里显式默认展示快照
    showSnapshots: true,
  },
);

const requestParts = computed(() => splitSnapshot(props.requestSnapshot));
const responseParts = computed(() => splitSnapshot(props.responseSnapshot));
const assertionRows = computed(() => props.assertions ?? []);
const assertionPassedCount = computed(
  () => (props.assertions ?? []).filter((item) => item.passed).length,
);
const assertionFailedCount = computed(
  () => (props.assertions ?? []).filter((item) => !item.passed).length,
);

function splitSnapshot(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return splitRunSnapshotForDisplay(value as Record<string, unknown>);
  }
  return { meta: formatRunSnapshotField(value), body: null as string | null };
}
</script>

<style scoped>
.exec-run-compare {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.exec-run-compare-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.exec-run-compare-pane,
.exec-run-assertions {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #dfe3e8;
  border-radius: 10px;
  background: #fff;
}

.exec-run-compare-head,
.exec-run-assertions-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid #eaecf0;
  background: #f8f9fb;
}

.exec-run-compare-head > div,
.exec-run-assertions-head > div:first-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.exec-run-compare-head strong,
.exec-run-assertions-head strong {
  color: #1d2939;
  font-size: 13px;
}

.exec-run-compare-head span,
.exec-run-assertions-head span {
  color: #98a2b3;
  font-size: 11px;
}

.exec-run-compare-content {
  display: flex;
  max-height: 360px;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  overflow: auto;
  background: #fff;
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
  padding: 10px 12px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #f9fafb;
  color: #344054;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.exec-run-snapshot--meta {
  max-height: 180px;
  overflow: auto;
}

.exec-run-snapshot--body {
  display: block;
  width: 100%;
  max-width: 100%;
  max-height: 280px;
  overflow: auto;
  background: #fff;
  border-color: #e4e7ec;
  white-space: pre;
  word-break: normal;
}

.exec-run-assert-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.exec-run-assert-summary .is-pass {
  color: #079455;
}

.exec-run-assert-summary .is-fail {
  color: #d92d20;
}

.exec-run-assertions-empty {
  margin: 16px 0;
}

.exec-run-assertion-list {
  display: flex;
  max-height: 420px;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  overflow: auto;
}

.exec-run-assertion-item {
  padding: 10px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fff;
}

.exec-run-assertion-item.failed {
  border-color: #fecdca;
  background: #fffbfa;
}

.exec-run-assertion-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.exec-run-assertion-head strong {
  min-width: 0;
  overflow: hidden;
  color: #344054;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exec-run-assertion-values {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.exec-run-assertion-values > div {
  min-width: 0;
}

.exec-run-assertion-values span {
  display: block;
  margin-bottom: 4px;
  color: #98a2b3;
  font-size: 11px;
}

.exec-run-assertion-values pre {
  max-height: 160px;
  margin: 0;
  padding: 8px 10px;
  overflow: auto;
  border: 1px solid #eaecf0;
  border-radius: 6px;
  background: #f9fafb;
  color: #344054;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.exec-run-assertion-item.failed .exec-run-assertion-values > div:last-child pre {
  border-color: #fecdca;
  background: #fef3f2;
}

.exec-run-assertion-source {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  margin-top: 6px;
  color: #667085;
  font-size: 11px;
  line-height: 1.5;
}

.exec-run-assertion-source-label {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 4px;
  background: #f2f4f7;
  color: #475467;
}

.exec-run-assertion-source-value {
  min-width: 0;
  overflow: hidden;
  color: #175cd3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exec-run-assertion-source-expression {
  flex-basis: 100%;
  min-width: 0;
  overflow: hidden;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f9fafb;
  color: #667085;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.exec-run-compare--dense {
  gap: 6px;
}

.exec-run-compare--dense .exec-run-assertions {
  border-radius: 8px;
}

.exec-run-compare--dense .exec-run-assertions-head {
  padding: 7px 10px;
}

.exec-run-compare--dense .exec-run-assertions-head strong {
  font-size: 12px;
}

.exec-run-compare--dense .exec-run-assert-summary {
  gap: 8px;
  font-size: 11px;
}

.exec-run-compare--dense .exec-run-assertion-list {
  max-height: 240px;
  gap: 6px;
  padding: 8px;
}

.exec-run-compare--dense .exec-run-assertion-item {
  padding: 7px 9px;
  border-radius: 6px;
}

.exec-run-compare--dense .exec-run-assertion-head {
  margin-bottom: 6px;
}

.exec-run-compare--dense .exec-run-assertion-values {
  gap: 8px;
}

.exec-run-compare--dense .exec-run-assertion-values pre {
  max-height: 110px;
  padding: 6px 8px;
  font-size: 11px;
  line-height: 1.45;
}

@media (max-width: 900px) {
  .exec-run-compare-grid,
  .exec-run-assertion-values {
    grid-template-columns: 1fr;
  }

  .exec-run-compare-content {
    max-height: 320px;
  }
}
</style>
