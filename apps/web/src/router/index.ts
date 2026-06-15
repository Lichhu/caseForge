import { createRouter, createWebHistory } from 'vue-router';
import ApiTestDashboardView from '@/views/ApiTestDashboardView.vue';
import CaseForgeDashboardView from '@/views/CaseForgeDashboardView.vue';
import { getUserName, syncUserNameFromQuery } from '@/utils/userContext';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: () => ({
        path: '/case-forge',
        query: { userName: getUserName() },
      }),
    },
    {
      path: '/case-forge',
      name: 'case-forge',
      component: CaseForgeDashboardView,
      meta: { platform: 'case-forge', title: '智能生成案例平台' },
    },
    {
      path: '/api-test',
      name: 'api-test',
      component: ApiTestDashboardView,
      meta: { platform: 'api-test', title: '智能接口测试平台' },
    },
  ],
});

router.beforeEach((to) => {
  syncUserNameFromQuery(to.query);

  const userName = getUserName();
  if (to.query.userName === userName) {
    return true;
  }
  return {
    path: to.path,
    query: { ...to.query, userName },
    hash: to.hash,
    replace: true,
  };
});

router.afterEach((to) => {
  const title = (to.meta.title as string) || 'CaseForge';
  document.title = title;
});

export default router;
