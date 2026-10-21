<template>
  <div class="library-empty-state">
    <InboxOutlined />
    <span>{{ text }}</span>
  </div>
</template>

<script setup lang="ts">
import { InboxOutlined } from "@ant-design/icons-vue";

defineProps<{ text: string }>();
</script>

<style scoped>
.library-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 12px;
  color: var(--cf-text-muted, #98a2b3);
  font-size: 12px;
}

.library-empty-state :deep(.anticon) {
  font-size: 24px;
  opacity: 0.4;
}
</style>
