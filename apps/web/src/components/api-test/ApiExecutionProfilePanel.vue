<template>
  <div class="execution-profile-panel" :class="{ compact, warning: !!profile.unsupportedReason }">
    <div class="execution-profile-head">
      <span class="execution-profile-title">{{ title }}</span>
      <a-tag :color="badgeColor">{{ profile.label }}</a-tag>
    </div>
    <p class="execution-profile-summary">{{ profile.summary }}</p>
    <dl v-if="!compact" class="execution-profile-details">
      <div v-if="profile.httpMethod" class="execution-profile-row">
        <dt>HTTP 方法</dt>
        <dd>{{ profile.httpMethod }}</dd>
      </div>
      <div v-if="profile.contentType" class="execution-profile-row">
        <dt>Content-Type</dt>
        <dd>{{ profile.contentType }}</dd>
      </div>
      <div v-if="profile.encoding" class="execution-profile-row">
        <dt>报文编码</dt>
        <dd>{{ profile.encoding }}</dd>
      </div>
      <div v-if="profile.framing" class="execution-profile-row">
        <dt>TCP 组包</dt>
        <dd>{{ profile.framing }}</dd>
      </div>
      <div class="execution-profile-row">
        <dt>目标地址</dt>
        <dd>{{ profile.targetHint }}</dd>
      </div>
      <div class="execution-profile-row">
        <dt>预期断言</dt>
        <dd>{{ profile.assertionHint }}</dd>
      </div>
    </dl>
    <a-alert
      v-if="profile.unsupportedReason"
      type="warning"
      show-icon
      :message="profile.unsupportedReason"
      class="execution-profile-alert"
    />
    <a-alert
      v-else-if="profile.transport === 'tcp'"
      type="info"
      show-icon
      message="TCP 执行将按 GBK 编码 + 8 位长度前缀发送 XML，响应读到 </Transaction> 为止"
      class="execution-profile-alert"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ApiCaseExpected, ApiCaseRequest } from '@case-forge/shared';
import {
  executionProfileBadgeColor,
  resolveExecutionProfile,
} from '@case-forge/shared';

const props = withDefaults(
  defineProps<{
    request: ApiCaseRequest;
    expected?: ApiCaseExpected;
    envAddress?: string;
    title?: string;
    compact?: boolean;
  }>(),
  {
    title: '执行方式',
    compact: false,
  },
);

const profile = computed(() =>
  resolveExecutionProfile(props.request, {
    envAddress: props.envAddress,
    expected: props.expected,
  }),
);

const badgeColor = computed(() => executionProfileBadgeColor(profile.value.transport));
</script>

<style scoped>
.execution-profile-panel {
  padding: 12px 14px;
  border: 1px solid var(--cf-border, #e8e8e8);
  border-radius: 8px;
  background: var(--cf-surface-muted, #fafafa);
}

.execution-profile-panel.warning {
  border-color: #ffd591;
  background: #fffbe6;
}

.execution-profile-panel.compact {
  padding: 10px 12px;
}

.execution-profile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.execution-profile-title {
  font-size: 13px;
  font-weight: 600;
}

.execution-profile-summary {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--cf-text-secondary, #666);
}

.execution-profile-details {
  margin: 0;
  display: grid;
  gap: 6px;
}

.execution-profile-row {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 8px;
  font-size: 12px;
}

.execution-profile-row dt {
  margin: 0;
  color: var(--cf-text-secondary, #888);
}

.execution-profile-row dd {
  margin: 0;
  word-break: break-all;
  font-family: 'SFMono-Regular', Consolas, monospace;
}

.execution-profile-alert {
  margin-top: 8px;
}

.execution-profile-alert :deep(.ant-alert-message) {
  font-size: 12px;
}
</style>
