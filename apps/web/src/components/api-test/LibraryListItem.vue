<template>
  <button
    type="button"
    class="library-list-item"
    :class="{ 'is-active': active }"
    :title="name"
    @click="emit('select')"
  >
    <span class="library-list-item__icon" :class="`is-${iconTone}`">
      <slot name="icon">
        <ApiOutlined />
      </slot>
    </span>
    <span class="library-list-item__main">
      <strong>{{ name }}</strong>
      <small v-if="meta">{{ meta }}</small>
    </span>
    <span v-if="$slots.trailing" class="library-list-item__trailing">
      <slot name="trailing" />
    </span>
  </button>
</template>

<script setup lang="ts">
import { ApiOutlined } from "@ant-design/icons-vue";

withDefaults(
  defineProps<{
    name: string;
    meta?: string;
    active?: boolean;
    iconTone?: "brand" | "blue" | "neutral";
  }>(),
  {
    meta: "",
    active: false,
    iconTone: "brand",
  },
);

const emit = defineEmits<{ select: [] }>();
</script>

<style scoped>
.library-list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.library-list-item:hover {
  border-color: var(--cf-border, #e4e7ec);
  background: rgb(255 255 255 / 72%);
}

.library-list-item.is-active {
  border-color: var(--cf-brand-border, #e7b8c0);
  background: var(--cf-surface, #fff);
  box-shadow: 0 2px 6px rgb(182 15 45 / 7%);
}

.library-list-item__icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  font-size: 15px;
}

.library-list-item__icon.is-brand {
  background: var(--cf-brand-soft, #fff5f6);
  color: var(--cf-brand, #b60f2d);
}

.library-list-item__icon.is-blue {
  background: #eff6ff;
  color: #2563eb;
}

.library-list-item__icon.is-neutral {
  background: #f0f2f5;
  color: var(--cf-text-secondary, #667085);
}

.library-list-item__main {
  flex: 1;
  min-width: 0;
}

.library-list-item__main strong,
.library-list-item__main small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-list-item__main strong {
  color: var(--cf-text, #1d2939);
  font-size: 13px;
  font-weight: 600;
}

.library-list-item__main small {
  margin-top: 3px;
  color: var(--cf-text-muted, #98a2b3);
  font-size: 12px;
}

.library-list-item__trailing {
  display: inline-flex;
  flex: none;
  align-items: center;
}
</style>
