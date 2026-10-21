<template>
  <a-alert
    v-if="!hasUserContext"
    banner
    type="warning"
    show-icon
    message="当前浏览器没有用户上下文，请通过上游平台入口链接进入。"
    class="user-context-warning"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { getUserName } from "@/utils/userContext";

const route = useRoute();
const hasUserContext = computed(() => Boolean(route.fullPath && getUserName()));
</script>

<style scoped>
.user-context-warning {
  flex-shrink: 0;
  margin: 0;
  border-radius: 0;
}
</style>
