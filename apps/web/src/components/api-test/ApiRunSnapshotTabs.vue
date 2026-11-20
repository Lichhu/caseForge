<template>
  <div
    class="exec-run-compare"
    :class="{ 'exec-run-compare--dense': dense }"
  >
    <div v-if="showSnapshots !== false" class="exec-run-compare-grid">
      <ApiRunSnapshotPane
        kind="request"
        title="请求"
        hint="实际发出的请求快照"
        :snapshot="requestSnapshot"
      />
      <ApiRunSnapshotPane
        kind="response"
        title="响应"
        hint="服务端返回的响应快照"
        :snapshot="responseSnapshot"
      />
    </div>

    <section class="exec-run-assertions">
      <header class="exec-run-assertions-head">
        <div>
          <strong>断言比对</strong>
          <span v-if="!dense">期望值与实际值并排展示</span>
        </div>
        <div class="exec-run-assert-summary">
          <span class="exec-run-assert-summary-total">
            共 {{ assertionRows.length }} 条
          </span>
          <span class="is-pass">通过 {{ assertionPassedCount }}</span>
          <span class="is-fail">失败 {{ assertionFailedCount }}</span>
        </div>
      </header>
      <div v-if="!assertionRows.length" class="exec-run-assertions-empty">
        本次执行没有断言记录
      </div>
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
            <div class="exec-run-assertion-value">
              <span>期望值</span>
              <code
                v-if="isCompactAssertionValue(assertion.expected)"
                class="exec-run-assertion-inline"
              >
                {{ formatRunSnapshotField(assertion.expected) }}
              </code>
              <pre v-else>{{ formatRunSnapshotField(assertion.expected) }}</pre>
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
            <div class="exec-run-assertion-value">
              <span>实际值</span>
              <code
                v-if="isCompactAssertionValue(assertion.actual)"
                class="exec-run-assertion-inline"
              >
                {{ formatRunSnapshotField(assertion.actual) }}
              </code>
              <pre v-else>{{ formatRunSnapshotField(assertion.actual) }}</pre>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { AssertionValueSource } from "@case-forge/shared";
import { formatRunSnapshotField } from "@/utils/casePayloadFormat.util";
import ApiRunSnapshotPane from "@/components/api-test/ApiRunSnapshotPane.vue";

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

const assertionRows = computed(() => props.assertions ?? []);
const assertionPassedCount = computed(
  () => (props.assertions ?? []).filter((item) => item.passed).length,
);
const assertionFailedCount = computed(
  () => (props.assertions ?? []).filter((item) => !item.passed).length,
);

/** 短标量值直接内联展示，避免每个断言都撑出大段代码块 */
function isCompactAssertionValue(value: unknown): boolean {
  const text = formatRunSnapshotField(value);
  if (!text || text.includes("\n")) return false;
  if (text.startsWith("{") || text.startsWith("[")) return false;
  return text.length <= 48;
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
  align-items: start;
  gap: 20px;
}

.exec-run-assertions {
  min-width: 0;
}

.exec-run-assertions-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0 8px;
  border-bottom: 1px solid #eaecf0;
}

.exec-run-assertions-head > div:first-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.exec-run-assertions-head strong {
  color: #1d2939;
  font-size: 13px;
}

.exec-run-assertions-head span {
  color: #98a2b3;
  font-size: 11px;
}

.exec-run-assert-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.exec-run-assert-summary .exec-run-assert-summary-total {
  color: #667085;
}

.exec-run-assert-summary .is-pass {
  color: #079455;
}

.exec-run-assert-summary .is-fail {
  color: #d92d20;
}

.exec-run-assertions-empty {
  padding: 10px 0;
  color: #98a2b3;
  font-size: 12px;
}

.exec-run-assertion-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0 0;
}

.exec-run-assertion-item {
  padding: 9px 10px;
  border-radius: 8px;
  background: #fafbfc;
}

.exec-run-assertion-item.failed {
  background: #fff6f5;
  box-shadow: inset 2px 0 0 #f97066;
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

.exec-run-assertion-value {
  min-width: 0;
}

.exec-run-assertion-value > span {
  display: block;
  margin-bottom: 4px;
  color: #98a2b3;
  font-size: 11px;
}

.exec-run-assertion-value pre {
  max-height: 160px;
  margin: 0;
  padding: 7px 9px;
  overflow: auto;
  border-radius: 6px;
  background: #fff;
  color: #1d2939;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.exec-run-assertion-inline {
  display: block;
  padding: 5px 9px;
  overflow: hidden;
  border-radius: 6px;
  background: #fff;
  color: #1d2939;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.6;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exec-run-assertion-item.failed
  .exec-run-assertion-value:last-child
  :is(pre, .exec-run-assertion-inline) {
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
}
</style>
