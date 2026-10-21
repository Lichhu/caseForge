<template>
  <aside class="library-sidebar">
    <header class="library-sidebar__head">
      <span class="library-sidebar__title">
        {{ title }}
        <span v-if="count !== undefined" class="library-sidebar__count">{{ count }}</span>
      </span>
      <slot name="actions">
        <a-button type="primary" size="small" @click="emit('create')">
          <template #icon><PlusOutlined /></template>
          {{ createLabel }}
        </a-button>
      </slot>
    </header>
    <div v-if="$slots.tools" class="library-sidebar__tools">
      <slot name="tools" />
    </div>
    <div class="library-sidebar__body">
      <slot />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { PlusOutlined } from "@ant-design/icons-vue";

withDefaults(
  defineProps<{
    title: string;
    count?: number | string;
    createLabel?: string;
  }>(),
  {
    count: undefined,
    createLabel: "新建",
  },
);

const emit = defineEmits<{ create: [] }>();
</script>

<style scoped>
.library-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--cf-border, #e4e7ec);
  border-radius: 12px;
  background: var(--cf-surface-soft, #f8f9fb);
  overflow: hidden;
}

.library-sidebar__head {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 58px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--cf-border, #e4e7ec);
  background: var(--cf-surface, #fff);
}

.library-sidebar__title {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  color: var(--cf-text, #1d2939);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-sidebar__count {
  color: var(--cf-text-muted, #98a2b3);
  font-size: 12px;
  font-weight: 400;
}

.library-sidebar__tools {
  flex: none;
  padding: 12px 12px 0;
}

.library-sidebar__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
}
</style>
