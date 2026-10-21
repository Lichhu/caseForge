<template>
  <a-input v-model:value="keyword" class="library-search" :placeholder="placeholder" allow-clear>
    <template #prefix>
      <SearchOutlined />
    </template>
  </a-input>
</template>

<script setup lang="ts">
import { SearchOutlined } from "@ant-design/icons-vue";

withDefaults(defineProps<{ placeholder?: string }>(), {
  placeholder: "搜索",
});

const keyword = defineModel<string>({ default: "" });
</script>

<style scoped>
.library-search {
  width: 100%;
}

.library-search :deep(.ant-input-affix-wrapper) {
  border-radius: 8px;
  background: var(--cf-surface, #fff);
}

.library-search :deep(.anticon) {
  color: var(--cf-text-muted, #98a2b3);
  font-size: 13px;
}
</style>
