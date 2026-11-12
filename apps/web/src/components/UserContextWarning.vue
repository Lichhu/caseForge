<template>
  <a-alert
    v-if="auth.session?.impersonatedBy"
    banner
    type="warning"
    show-icon
    :message="`当前为代登录状态：正在以 ${auth.user?.userName || ''} 身份操作，原始操作人为 ${auth.session.impersonatedBy}`"
    class="user-context-warning"
  />
  <a-alert
    v-else-if="!hasUserContext"
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
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const auth = useAuthStore();
const hasUserContext = computed(() => Boolean(route.fullPath && getUserName()));
</script>

<style scoped>
.user-context-warning {
  flex-shrink: 0;
  margin: 0;
  border-radius: 0;
}
</style>
