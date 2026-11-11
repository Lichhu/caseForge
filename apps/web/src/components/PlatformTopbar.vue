<template>
  <header class="platform-topbar">
    <nav class="platform-switch" aria-label="平台切换">
      <template
        v-for="platform in platforms"
        :key="platform.id"
      >
        <a-dropdown
          v-if="platform.id === current.id"
          v-model:open="moduleMenuOpen"
          trigger="click"
          placement="bottomLeft"
          overlay-class-name="platform-module-dropdown"
        >
          <button
            type="button"
            class="platform-switch-item active current-platform"
            :class="{ 'is-open': moduleMenuOpen }"
            aria-current="page"
            :aria-label="`${platform.title}，打开模块菜单`"
            :aria-expanded="moduleMenuOpen"
            aria-haspopup="menu"
          >
            <span class="platform-logo">{{ platform.logo }}</span>
            <span class="platform-switch-copy">
              <strong>{{ platform.title }}</strong>
              <small>{{ platform.subtitle }}</small>
            </span>
            <DownOutlined
              class="platform-switch-chevron"
              :class="{ 'is-open': moduleMenuOpen }"
            />
          </button>
          <template #overlay>
            <div
              class="platform-module-menu"
              role="menu"
              :aria-label="`${platform.title}模块`"
            >
              <button
                v-for="module in currentModules"
                :key="module.id"
                type="button"
                class="platform-module-item"
                :class="{ active: module.id === activeModuleId }"
                role="menuitemradio"
                :aria-checked="module.id === activeModuleId"
                @click="switchModule(module)"
              >
                <span class="platform-module-copy">
                  <strong>{{ module.label }}</strong>
                  <span>{{ module.description }}</span>
                </span>
                <CheckOutlined
                  v-if="module.id === activeModuleId"
                  class="platform-module-check"
                />
              </button>
            </div>
          </template>
        </a-dropdown>

        <button
          v-else
          type="button"
          class="platform-switch-item"
          :aria-label="`切换到${platform.title}`"
          @click="switchPlatform(platform)"
        >
          <span class="platform-logo">{{ platform.logo }}</span>
          <span class="platform-switch-copy">
            <strong>{{ platform.title }}</strong>
            <small>{{ platform.subtitle }}</small>
          </span>
          <span class="platform-switch-chevron-spacer" aria-hidden="true" />
        </button>
      </template>
    </nav>

    <div class="platform-account">
      <span class="platform-account-avatar" aria-hidden="true">
        {{ userInitial }}
      </span>
      <span class="platform-account-copy">
        <span class="platform-account-label">当前用户</span>
        <strong class="platform-account-name" :title="auth.user?.userName">
          {{ auth.user?.userName || '未登录' }}
        </strong>
      </span>
      <span class="platform-account-divider" aria-hidden="true" />
      <button
        type="button"
        class="platform-logout"
        :disabled="loggingOut"
        :title="loggingOut ? '正在退出' : '退出登录'"
        @click="logout"
      >
        <LogoutOutlined />
        <span>{{ loggingOut ? '退出中…' : '退出登录' }}</span>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { CheckOutlined, DownOutlined, LogoutOutlined } from '@ant-design/icons-vue';
import { useRoute, useRouter } from 'vue-router';
import {
  PLATFORMS,
  getPlatformByRoute,
  type PlatformMeta,
} from '@/constants/platform';
import { dismissAppMessages } from '@/utils/globalFeedback';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const platforms = PLATFORMS;
const current = computed(() => getPlatformByRoute(route));
const moduleMenuOpen = ref(false);
const loggingOut = ref(false);
const isApiPlatform = computed(() => current.value.id === 'api-test');
const userInitial = computed(() => {
  const name = auth.user?.userName?.trim();
  return name ? name.slice(0, 1).toUpperCase() : '访';
});

interface TopbarModule {
  id: string;
  label: string;
  description: string;
  route: string;
}

const apiModules = [
  {
    id: 'requirement',
    label: '代办',
    description: '待分发、待受理与需求池',
    route: '/api-test/requirement',
  },
  {
    id: 'project',
    label: '需求接口测试',
    description: '接口文档、执行与报表',
    route: '/api-test',
  },
  {
    id: 'case',
    label: '准生产管理',
    description: '准生产案例与执行推送集',
    route: '/api-test/preproduction',
  },
] as const satisfies readonly TopbarModule[];

const activeApiModuleId = computed(() => {
  if (route.path.startsWith('/api-test/requirement')) return 'requirement';
  if (route.path.startsWith('/api-test/preproduction')) return 'case';
  return 'project';
});

const caseForgeModules = [
  {
    id: 'project',
    label: '项目管理',
    description: '需求文档、案例编辑与导出',
    route: '/case-forge',
  },
] as const satisfies readonly TopbarModule[];

const currentModules = computed<readonly TopbarModule[]>(() =>
  isApiPlatform.value ? apiModules : caseForgeModules,
);

const activeModuleId = computed(() =>
  isApiPlatform.value ? activeApiModuleId.value : 'project',
);

function buildPlatformLocation(platform: PlatformMeta) {
  return platform.route;
}

function switchPlatform(platform: PlatformMeta) {
  if (platform.id === current.value.id) {
    return;
  }
  dismissAppMessages();
  window.location.assign(buildPlatformLocation(platform));
}

function switchModule(module: TopbarModule) {
  moduleMenuOpen.value = false;
  if (module.id === activeModuleId.value) return;
  dismissAppMessages();
  void router.push(module.route);
}

async function logout() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  try {
    await auth.logout();
    await router.replace({
      name: 'login-required',
      query: { logout: '1', redirect: route.fullPath },
    });
  } finally {
    loggingOut.value = false;
  }
}
</script>

<style scoped>
.platform-topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  height: 56px;
  padding: 0 20px;
  box-shadow: 0 1px 2px rgb(16 24 40 / 14%);
}

.platform-switch {
  display: grid;
  grid-template-columns: repeat(2, clamp(198px, 11.5vw, 210px));
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 42px;
  padding: 3px;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 10px;
  background: rgb(255 255 255 / 7%);
  justify-self: start;
}

.platform-switch-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-width: 0;
  height: 34px;
  overflow: hidden;
  padding: 0 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: rgb(255 255 255 / 84%);
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color 0.14s ease,
    background-color 0.14s ease;
}

.platform-switch-item:hover:not(.active) {
  background: rgb(255 255 255 / 10%);
  color: #fff;
}

.platform-switch-item:focus-visible {
  outline: 2px solid rgb(255 255 255 / 72%);
  outline-offset: 2px;
}

.platform-switch-item .platform-logo {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: rgb(255 255 255 / 14%);
  font-size: 10px;
}

.platform-switch-item.active {
  background: #fff;
  color: var(--cf-brand-hover);
  box-shadow: 0 1px 2px rgb(16 24 40 / 10%);
}

.platform-switch-item.active .platform-logo {
  background: var(--cf-brand);
  color: #fff;
}

.platform-switch-copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}

.platform-switch-copy strong,
.platform-switch-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.platform-switch-copy strong {
  color: rgb(255 255 255 / 94%);
  font-size: 13px;
  font-weight: 700;
}

.platform-switch-copy small {
  margin-top: 1px;
  color: rgb(255 255 255 / 62%);
  font-size: 10px;
}

.platform-switch-item.active .platform-switch-copy strong {
  color: #1d2939;
}

.platform-switch-item.active .platform-switch-copy small {
  color: #667085;
}

.platform-switch-chevron,
.platform-switch-chevron-spacer {
  flex: 0 0 10px;
  width: 10px;
}

.platform-switch-chevron {
  margin-left: 1px;
  color: #98a2b3;
  font-size: 10px;
  transition: transform 0.16s ease;
}

.platform-switch-chevron :deep(svg) {
  display: block;
}

.platform-switch-chevron.is-open {
  transform: rotate(180deg);
}

.platform-account-divider {
  flex: 0 0 auto;
  width: 1px;
  height: 22px;
  background: rgb(255 255 255 / 20%);
}

.platform-module-menu {
  display: grid;
  width: 300px;
  padding: 7px;
  border: 1px solid #e4e7ec;
  border-radius: 12px;
  background: #fff;
  box-shadow:
    0 14px 34px rgb(16 24 40 / 16%),
    0 2px 6px rgb(16 24 40 / 6%);
}

.platform-module-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #1d2939;
  text-align: left;
  cursor: pointer;
}

.platform-module-item:hover,
.platform-module-item.active {
  background: #f5f6f8;
}

.platform-module-item:focus-visible {
  outline: 2px solid rgb(182 15 45 / 28%);
  outline-offset: -2px;
}

.platform-module-copy {
  min-width: 0;
}

.platform-module-copy strong,
.platform-module-copy span {
  display: block;
}

.platform-module-copy strong {
  color: #1d2939;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
}

.platform-module-copy span {
  margin-top: 2px;
  color: #667085;
  font-size: 12px;
  line-height: 1.4;
}

.platform-module-check {
  flex-shrink: 0;
  color: #344054;
  font-size: 16px;
}

.platform-account {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-self: end;
  gap: 9px;
}

.platform-account-avatar {
  display: grid;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 24%);
  border-radius: 50%;
  background: rgb(255 255 255 / 14%);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.platform-account-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}

.platform-account-label {
  color: rgb(255 255 255 / 58%);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.06em;
}

.platform-account-name {
  max-width: 150px;
  overflow: hidden;
  margin-top: 2px;
  color: rgb(255 255 255 / 94%);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.platform-logout {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: rgb(255 255 255 / 82%);
  font-size: 12px;
  cursor: pointer;
  transition:
    color 0.14s ease,
    border-color 0.14s ease,
    background-color 0.14s ease;
}

.platform-logout:hover:not(:disabled) {
  border-color: rgb(255 255 255 / 18%);
  background: rgb(255 255 255 / 12%);
  color: #fff;
}

.platform-logout:focus-visible {
  outline: 2px solid rgb(255 255 255 / 72%);
  outline-offset: 2px;
}

.platform-logout:disabled {
  cursor: wait;
  opacity: 0.65;
}

@media (max-width: 980px) {
  .platform-topbar {
    gap: 16px;
    padding-inline: 16px;
  }

  .platform-switch {
    grid-template-columns: repeat(2, 190px);
  }

  .platform-account-copy,
  .platform-account-divider {
    display: none;
  }
}

@media (max-width: 720px) {
  .platform-switch-copy small {
    display: none;
  }

  .platform-switch-item {
    padding-inline: 8px;
    font-size: 12px;
  }

  .platform-switch {
    grid-template-columns: repeat(2, 160px);
  }

  .platform-logout span {
    display: none;
  }

  .platform-logout {
    width: 30px;
    justify-content: center;
    padding: 0;
  }
}

@media (max-width: 520px) {
  .platform-switch-copy {
    display: none;
  }

  .platform-switch {
    grid-template-columns: repeat(2, 64px);
  }
}
</style>
