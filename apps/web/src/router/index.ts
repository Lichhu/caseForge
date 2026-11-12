import { createRouter, createWebHistory } from "vue-router";
import {
  rememberPlatform,
  resolvePlatformFromPath,
} from "@/constants/platform";
import { useAuthStore } from "@/stores/auth";

const CaseForgeDashboardView = () =>
  import("@/views/CaseForgeDashboardView.vue");
const ApiTestDashboardView = () => import("@/views/ApiTestDashboardView.vue");
const RequirementPlatformView = () =>
  import("@/views/RequirementPlatformView.vue");
const CaseManagementView = () => import("@/views/CaseManagementView.vue");
const AuthAuditView = () => import("@/views/AuthAuditView.vue");
const LoginRequiredView = () => import("@/views/LoginRequiredView.vue");

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/case-forge",
    },
    {
      path: "/case-forge",
      name: "case-forge",
      component: CaseForgeDashboardView,
      meta: { platform: "case-forge", title: "智能生成案例平台" },
    },
    {
      path: "/api-test",
      name: "api-test",
      component: ApiTestDashboardView,
      meta: { platform: "api-test", title: "智能接口测试平台" },
    },
    { path: "/api-test/cases", redirect: "/api-test/preproduction" },
    {
      path: "/system/auth-audit",
      name: "auth-audit",
      component: AuthAuditView,
      meta: { platform: "case-forge", title: "登录审计", requiresAudit: true },
    },
    {
      path: "/login-required",
      name: "login-required",
      component: LoginRequiredView,
      meta: { title: "统一认证登录" },
    },
    {
      path: "/api-test/preproduction",
      name: "preproduction-management",
      component: CaseManagementView,
      meta: { platform: "api-test", title: "准生产管理" },
    },
    {
      path: "/api-test/requirement",
      name: "requirement-platform",
      component: RequirementPlatformView,
      meta: { platform: "api-test", title: "需求管理" },
    },
  ],
});

router.beforeEach(async (to) => {
  if (typeof to.query.userName !== "undefined") {
    const query = { ...to.query };
    delete query.userName;
    return { path: to.path, query, hash: to.hash, replace: true };
  }
  if (to.name === "login-required") {
    return true;
  }

  const auth = useAuthStore();
  await auth.restore();
  if (!auth.isAuthenticated) {
    return {
      name: "login-required",
      query: { redirect: to.fullPath },
      replace: true,
    };
  }
  if (to.meta.requiresAudit && !auth.session?.canAudit) {
    return { path: "/case-forge", replace: true };
  }
  return true;
});

router.afterEach((to) => {
  const platform = resolvePlatformFromPath(to.path);
  if (platform) {
    rememberPlatform(platform.id);
  }
  const title = (to.meta.title as string) || "CaseForge";
  document.title = title;
});

export default router;
