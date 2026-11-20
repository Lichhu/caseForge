<template>
  <section class="exec-snapshot-pane">
    <header class="exec-snapshot-pane-head">
      <div class="exec-snapshot-pane-title">
        <strong>{{ title }}</strong>
        <span>{{ hint }}</span>
      </div>
      <div class="exec-snapshot-pane-actions">
        <a-tooltip title="复制完整快照">
          <a-button
            type="text"
            size="small"
            class="exec-snapshot-copy exec-snapshot-copy--head"
            :disabled="isEmpty"
            @click="onCopyRaw"
          >
            <template #icon><CopyOutlined /></template>
          </a-button>
        </a-tooltip>
        <span
          class="exec-snapshot-pane-badge"
          :class="kind === 'request' ? 'is-request' : 'is-response'"
        >
          {{ kind === "request" ? "Request" : "Response" }}
        </span>
      </div>
    </header>

    <div class="exec-snapshot-pane-body">
      <p v-if="isEmpty" class="exec-snapshot-placeholder">暂无快照数据</p>

      <div v-if="hasSummary" class="exec-snapshot-summary">
        <div class="exec-snapshot-headline">
          <span
            v-if="view.method"
            class="exec-snapshot-method"
            :class="methodTone"
          >
            {{ view.method }}
          </span>
          <span
            v-if="statusLabel"
            class="exec-snapshot-status"
            :class="statusTone"
          >
            <strong>{{ statusLabel }}</strong>
            <em v-if="statusText">{{ statusText }}</em>
          </span>
          <span
            v-if="view.target"
            class="exec-snapshot-target"
            :title="view.target"
          >
            {{ view.target }}
          </span>
        </div>
        <div v-if="view.chips.length" class="exec-snapshot-tags">
          <span
            v-for="chip in view.chips"
            :key="chip.label"
            class="exec-snapshot-tag"
            :title="`${chip.label}：${chip.value}`"
          >
            <em>{{ chip.label }}</em>
            <span>{{ chip.value }}</span>
          </span>
        </div>
      </div>

      <p v-if="view.error" class="exec-snapshot-error">
        <WarningOutlined />
        <span>{{ view.error }}</span>
      </p>

      <section v-if="view.body" class="exec-snapshot-section">
        <header class="exec-snapshot-section-head">
          <span class="exec-snapshot-section-title">{{ bodyLabel }}</span>
          <span class="exec-snapshot-section-info">
            {{ bodySectionInfo }}
          </span>
          <a-tooltip title="复制报文">
            <a-button
              type="text"
              size="small"
              class="exec-snapshot-copy"
              @click="onCopyBody"
            >
              <template #icon><CopyOutlined /></template>
            </a-button>
          </a-tooltip>
        </header>
        <div
          class="exec-snapshot-code"
          :class="{
            'is-collapsed': bodyCollapsed,
            'has-toggle': bodyCollapsible,
          }"
        >
          <div class="exec-snapshot-code-view">
            <pre><code v-html="view.body.highlighted"></code></pre>
            <span
              v-if="bodyCollapsed"
              class="exec-snapshot-code-fade"
              aria-hidden="true"
            />
          </div>
          <button
            v-if="bodyCollapsible"
            type="button"
            class="exec-snapshot-code-more"
            @click="bodyExpanded = !bodyExpanded"
          >
            {{ bodyExpanded ? "收起" : `展开全部 ${view.body.lineCount} 行` }}
          </button>
        </div>
      </section>

      <section
        v-if="view.metaEntryCount"
        class="exec-snapshot-meta"
      >
        <button
          type="button"
          class="exec-snapshot-meta-toggle"
          :aria-expanded="metaOpen"
          @click="metaOpen = !metaOpen"
        >
          <DownOutlined
            class="exec-snapshot-chevron"
            :class="{ 'is-open': metaOpen }"
          />
          <span class="exec-snapshot-meta-title">{{ metaLabel }}</span>
          <span class="exec-snapshot-meta-count">共 {{ view.metaEntryCount }} 项</span>
          <span class="exec-snapshot-meta-action">{{ metaOpen ? "收起" : "展开" }}</span>
        </button>
        <div v-show="metaOpen" class="exec-snapshot-meta-body">
          <div
            v-for="group in view.metaGroups"
            :key="group.key"
            class="exec-snapshot-group"
          >
            <div class="exec-snapshot-group-head">
              <span>{{ group.label }}</span>
              <em>{{ group.entries.length }}</em>
            </div>
            <dl class="exec-snapshot-kv">
              <div
                v-for="(entry, index) in group.entries"
                :key="`${group.key}-${index}`"
                class="exec-snapshot-kv-row"
                :class="{ 'is-block': entry.block }"
              >
                <dt :title="entry.key">{{ entry.key }}</dt>
                <dd :title="entry.block ? undefined : entry.value">{{ entry.value }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { CopyOutlined, DownOutlined, WarningOutlined } from "@ant-design/icons-vue";
import { message } from "ant-design-vue";
import { copyText } from "@/utils/copyText";
import {
  buildRunSnapshotView,
  httpStatusText,
  type RunSnapshotKind,
} from "@/utils/runSnapshotView.util";

const props = defineProps<{
  kind: RunSnapshotKind;
  title: string;
  hint?: string;
  snapshot?: unknown;
}>();

const BODY_PREVIEW_LINES = 16;
const BODY_PREVIEW_CHARS = 1200;
const META_AUTO_OPEN_LIMIT = 8;

const view = computed(() => buildRunSnapshotView(props.snapshot, props.kind));
const bodyExpanded = ref(false);
const metaOpen = ref(false);

watch(
  () => props.snapshot,
  () => {
    bodyExpanded.value = false;
    metaOpen.value =
      view.value.metaEntryCount > 0 &&
      view.value.metaEntryCount <= META_AUTO_OPEN_LIMIT;
  },
  { immediate: true },
);

const hasSummary = computed(
  () =>
    Boolean(view.value.method) ||
    view.value.status !== null ||
    Boolean(view.value.target) ||
    view.value.chips.length > 0,
);

const isEmpty = computed(
  () =>
    !hasSummary.value &&
    !view.value.error &&
    !view.value.body &&
    view.value.metaEntryCount === 0,
);

const statusLabel = computed(() => {
  const status = view.value.status;
  if (status === null) return "";
  return status > 0 ? String(status) : "无状态";
});

const statusText = computed(() => {
  const status = view.value.status;
  return status && status > 0 ? httpStatusText(status) : "";
});

const statusTone = computed(() => {
  const status = view.value.status;
  if (!status || status <= 0) return "is-muted";
  if (status < 300) return "is-success";
  if (status < 400) return "is-info";
  if (status < 500) return "is-warning";
  return "is-danger";
});

const methodTone = computed(() => {
  switch (view.value.method) {
    case "GET":
      return "is-info";
    case "POST":
      return "is-success";
    case "PUT":
    case "PATCH":
      return "is-warning";
    case "DELETE":
      return "is-danger";
    default:
      return "is-muted";
  }
});

const bodyLabel = computed(() => {
  if (view.value.body?.fromSql) return "执行 SQL";
  return props.kind === "request" ? "请求报文" : "响应报文";
});

const bodyLanguageLabel = computed(() => {
  const body = view.value.body;
  if (!body) return "";
  if (body.fromSql) return "";
  return body.language.toUpperCase();
});

const bodySectionInfo = computed(() => {
  const body = view.value.body;
  if (!body) return "";
  return bodyLanguageLabel.value
    ? `${bodyLanguageLabel.value} · ${body.lineCount} 行`
    : `${body.lineCount} 行`;
});

const bodyCollapsible = computed(() => {
  const body = view.value.body;
  if (!body) return false;
  return (
    body.lineCount > BODY_PREVIEW_LINES || body.text.length > BODY_PREVIEW_CHARS
  );
});

const bodyCollapsed = computed(
  () => bodyCollapsible.value && !bodyExpanded.value,
);

const metaLabel = computed(() =>
  props.kind === "request" ? "请求信息" : "响应信息",
);

async function onCopyBody() {
  const body = view.value.body;
  if (!body) return;
  try {
    await copyText(body.text);
    message.success("报文已复制");
  } catch {
    message.error("复制失败");
  }
}

async function onCopyRaw() {
  if (isEmpty.value) return;
  try {
    await copyText(view.value.rawText);
    message.success("完整快照已复制");
  } catch {
    message.error("复制失败");
  }
}
</script>

<style scoped>
.exec-snapshot-pane {
  display: flex;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e4e7ec;
  border-radius: 10px;
  background: #fff;
}

.exec-snapshot-pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border-bottom: 1px solid #eaecf0;
  background: #f8f9fb;
}

.exec-snapshot-pane-title {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.exec-snapshot-pane-title strong {
  color: #1d2939;
  font-size: 13px;
}

.exec-snapshot-pane-title span {
  color: #98a2b3;
  font-size: 11px;
}

.exec-snapshot-pane-badge {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.6;
}

.exec-snapshot-pane-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
}

.exec-snapshot-copy--head {
  margin-left: 0;
  color: #98a2b3;
}

.exec-snapshot-pane-badge.is-request {
  background: #eff4ff;
  color: #175cd3;
}

.exec-snapshot-pane-badge.is-response {
  background: #ecfdf3;
  color: #027a48;
}

.exec-snapshot-pane-body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 12px;
}

.exec-snapshot-placeholder {
  margin: 0;
  padding: 6px 0;
  color: #98a2b3;
  font-size: 12px;
}

.exec-snapshot-summary {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.exec-snapshot-headline {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.exec-snapshot-method,
.exec-snapshot-status {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 5px;
  padding: 1px 7px;
  border-radius: 5px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.7;
}

.exec-snapshot-method.is-info,
.exec-snapshot-status.is-info {
  background: #eff4ff;
  color: #175cd3;
}

.exec-snapshot-method.is-success,
.exec-snapshot-status.is-success {
  background: #ecfdf3;
  color: #027a48;
}

.exec-snapshot-method.is-warning,
.exec-snapshot-status.is-warning {
  background: #fffaeb;
  color: #b54708;
}

.exec-snapshot-method.is-danger,
.exec-snapshot-status.is-danger {
  background: #fef3f2;
  color: #b42318;
}

.exec-snapshot-method.is-muted,
.exec-snapshot-status.is-muted {
  background: #f2f4f7;
  color: #667085;
}

.exec-snapshot-status em {
  color: inherit;
  font-size: 10.5px;
  font-style: normal;
  font-weight: 500;
  opacity: 0.75;
}

.exec-snapshot-target {
  min-width: 0;
  flex: 1 1 160px;
  padding: 1px 6px;
  overflow: hidden;
  border-radius: 4px;
  background: #f8f9fb;
  color: #344054;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 11.5px;
  line-height: 1.7;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.exec-snapshot-tags {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 4px 6px;
}

.exec-snapshot-tag {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  gap: 4px;
  padding: 0 6px;
  border: 1px solid #eaecf0;
  border-radius: 4px;
  background: #fcfcfd;
  color: #475467;
  font-size: 11px;
  line-height: 1.65;
}

.exec-snapshot-tag em {
  flex-shrink: 0;
  color: #98a2b3;
  font-style: normal;
}

.exec-snapshot-tag span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exec-snapshot-error {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  padding: 7px 10px;
  border: 1px solid #fecdca;
  border-radius: 6px;
  background: #fef3f2;
  color: #b42318;
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.exec-snapshot-section {
  min-width: 0;
}

.exec-snapshot-section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.exec-snapshot-section-title {
  color: #475467;
  font-size: 12px;
  font-weight: 600;
}

.exec-snapshot-section-info {
  color: #98a2b3;
  font-size: 11px;
}

.exec-snapshot-copy {
  margin-left: auto;
  color: #98a2b3;
}

.exec-snapshot-code {
  position: relative;
}

.exec-snapshot-code-view {
  position: relative;
  overflow: hidden;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fbfcfe;
}

.exec-snapshot-code.is-collapsed .exec-snapshot-code-view {
  max-height: 252px;
}

.exec-snapshot-code.has-toggle .exec-snapshot-code-view {
  border-radius: 8px 8px 0 0;
}

.exec-snapshot-code-view pre {
  margin: 0;
  padding: 10px 12px;
  overflow-x: hidden;
  color: #344054;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.7;
  tab-size: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.exec-snapshot-code-fade {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 48px;
  background: linear-gradient(180deg, rgba(251, 252, 254, 0), #fbfcfe 80%);
  pointer-events: none;
}

.exec-snapshot-code-more {
  display: block;
  width: 100%;
  margin-top: -1px;
  padding: 5px 0;
  border: 1px solid #eaecf0;
  border-top: 0;
  border-radius: 0 0 8px 8px;
  background: #f8f9fb;
  color: #475467;
  cursor: pointer;
  font-size: 11.5px;
  line-height: 1.6;
  transition: background 0.15s ease, color 0.15s ease;
}

.exec-snapshot-code-more:hover {
  background: #eef2f6;
  color: #1d2939;
}

.exec-snapshot-code-more {
  display: block;
  width: 100%;
  padding: 5px 0;
  border: 1px solid #eaecf0;
  border-top: 0;
  border-radius: 0 0 8px 8px;
  background: #f8f9fb;
  color: #475467;
  cursor: pointer;
  font-size: 11.5px;
  line-height: 1.6;
  transition: background 0.15s ease, color 0.15s ease;
}

.exec-snapshot-code-more:hover {
  background: #eef2f6;
  color: #1d2939;
}

.exec-snapshot-meta {
  min-width: 0;
}

.exec-snapshot-meta-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 6px;
  padding: 6px 9px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fcfcfd;
  color: #475467;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.6;
  text-align: left;
  transition: background 0.15s ease;
}

.exec-snapshot-meta-toggle:hover {
  background: #f8f9fb;
}

.exec-snapshot-chevron {
  flex-shrink: 0;
  color: #98a2b3;
  font-size: 10px;
  transform: rotate(-90deg);
  transition: transform 0.15s ease;
}

.exec-snapshot-chevron.is-open {
  transform: rotate(0);
}

.exec-snapshot-meta-title {
  color: #344054;
  font-weight: 600;
}

.exec-snapshot-meta-count {
  color: #98a2b3;
  font-size: 11px;
}

.exec-snapshot-meta-action {
  margin-left: auto;
  flex-shrink: 0;
  color: #98a2b3;
  font-size: 11px;
}

.exec-snapshot-meta-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
}

.exec-snapshot-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  color: #667085;
  font-size: 11px;
  font-weight: 600;
}

.exec-snapshot-group-head em {
  padding: 0 5px;
  border-radius: 999px;
  background: #f2f4f7;
  color: #667085;
  font-size: 10px;
  font-style: normal;
  font-weight: 500;
}

.exec-snapshot-kv {
  margin: 0;
  overflow: hidden;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}

.exec-snapshot-kv-row {
  display: grid;
  grid-template-columns: minmax(88px, 32%) minmax(0, 1fr);
  gap: 10px;
  padding: 4px 9px;
  background: #fff;
}

.exec-snapshot-kv-row + .exec-snapshot-kv-row {
  border-top: 1px solid #f2f4f7;
}

.exec-snapshot-kv-row:nth-child(even) {
  background: #fcfcfd;
}

.exec-snapshot-kv-row dt {
  overflow: hidden;
  color: #667085;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 11.5px;
  line-height: 1.7;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exec-snapshot-kv-row dd {
  min-width: 0;
  margin: 0;
  color: #1d2939;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 11.5px;
  line-height: 1.7;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.exec-snapshot-kv-row.is-block {
  grid-template-columns: 1fr;
  gap: 3px;
  padding-top: 7px;
  padding-bottom: 7px;
}

.exec-snapshot-kv-row.is-block dd {
  max-height: 220px;
  padding: 7px 9px;
  overflow: auto;
  border-left: 2px solid #e4e7ec;
  border-radius: 4px;
  background: #f9fafb;
  color: #344054;
  font-size: 11.5px;
}

.exec-snapshot-code :deep(.tok-key) {
  color: #8c1f3d;
}

.exec-snapshot-code :deep(.tok-string) {
  color: #067647;
}

.exec-snapshot-code :deep(.tok-number) {
  color: #b54708;
}

.exec-snapshot-code :deep(.tok-literal) {
  color: #6941c6;
}

.exec-snapshot-code :deep(.tok-null) {
  color: #98a2b3;
}

.exec-snapshot-code :deep(.tok-punct) {
  color: #667085;
}

.exec-snapshot-code :deep(.tok-tag) {
  color: #175cd3;
}

.exec-snapshot-code :deep(.tok-attr) {
  color: #b54708;
}

.exec-snapshot-code :deep(.tok-comment) {
  color: #98a2b3;
}
</style>
