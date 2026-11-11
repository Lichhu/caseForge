<template>
  <main class="login-required">
    <a-result
      status="warning"
      :title="isExplicitLogout ? '已退出登录' : '登录状态已失效'"
      :sub-title="
        ssoConfigured
          ? '请前往统一认证平台。'
          : '未配置统一认证登录入口，请联系管理员。'
      "
    >
      <template #extra>
        <a-button type="primary" :disabled="!ssoConfigured" @click="login">
          前往统一认证登录
        </a-button>
      </template>
    </a-result>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { hasSsoLoginUrl, redirectToSsoLogin } from "@/utils/ssoLogin";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ssoConfigured = hasSsoLoginUrl();
const isExplicitLogout = computed(() => route.query.logout === "1");

function safeReturnPath() {
  const raw = typeof route.query.redirect === "string" ? route.query.redirect : "";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/case-forge";
}

function login() {
  redirectToSsoLogin(safeReturnPath());
}

onMounted(async () => {
  if (auth.isAuthenticated) {
    await router.replace(safeReturnPath());
    return;
  }
  if (!isExplicitLogout.value && ssoConfigured) {
    login();
  }
});
</script>

<style scoped>
.login-required {
  display: grid;
  flex: 1 1 auto;
  min-height: 100vh;
  place-items: center;
  background: var(--cf-canvas);
}
</style>
