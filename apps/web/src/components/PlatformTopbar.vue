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
        <span class="platform-account-label">
          {{ auth.session?.impersonatedBy ? '代登录用户' : '当前用户' }}
        </span>
        <strong class="platform-account-name" :title="auth.user?.userName">
          {{ auth.user?.userName || '未登录' }}
        </strong>
      </span>
      <span class="platform-account-divider" aria-hidden="true" />
      <button
        v-if="auth.session?.canImpersonate"
        type="button"
        class="platform-account-switch"
        title="切换登录账号"
        @click="openAccountSwitcher"
      >
        <SwapOutlined />
        <span>切换账号</span>
      </button>
      <a-dropdown
        trigger="click"
        placement="bottomRight"
        :disabled="loggingOut"
        overlay-class-name="platform-account-dropdown"
      >
        <button
          type="button"
          class="platform-logout"
          :disabled="loggingOut"
          :title="loggingOut ? '正在退出' : '账号操作'"
          aria-haspopup="menu"
        >
          <UserOutlined />
          <span>{{ loggingOut ? '退出中…' : '账号操作' }}</span>
          <DownOutlined class="platform-logout-caret" />
        </button>
        <template #overlay>
          <a-menu @click="handleAccountMenuClick">
            <a-menu-item v-if="auth.session?.canAudit" key="audit">
              <AuditOutlined />
              <span>登录审计</span>
            </a-menu-item>
            <a-menu-divider v-if="auth.session?.canAudit" />
            <a-menu-item key="logout" :disabled="loggingOut">
              <LogoutOutlined />
              <span>退出登录</span>
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </div>
  </header>

  <a-modal
    v-model:open="accountSwitchOpen"
    title="切换登录账号"
    :footer="null"
    :mask-closable="false"
    width="560px"
    wrap-class-name="account-switch-modal"
  >
    <a-alert
      v-if="auth.session?.impersonatedBy"
      type="warning"
      show-icon
      class="account-switch-current"
      :message="`当前以 ${auth.user?.userName || ''} 身份操作，原始操作人为 ${auth.session.impersonatedBy}`"
    >
      <template #action>
        <a-button
          size="small"
          :loading="exitingImpersonation"
          @click="restoreSystemAccount"
        >
          返回 SYSTEM
        </a-button>
      </template>
    </a-alert>

    <div class="account-switch-search">
      <a-input
        v-model:value="accountKeyword"
        allow-clear
        placeholder="按姓名或账号搜索"
        :disabled="switchingAccount"
      >
        <template #prefix><SearchOutlined /></template>
      </a-input>
    </div>

    <a-spin :spinning="loadingAccounts">
      <div class="account-switch-list" role="listbox" aria-label="可切换账号">
        <button
          v-for="user in accountCandidates"
          :key="user.userName"
          type="button"
          class="account-switch-option"
          role="option"
          :disabled="switchingAccount"
          @click="selectImpersonationUser(user)"
        >
          <span class="account-switch-avatar" aria-hidden="true">
            {{ (user.nickName || user.userName).slice(0, 1).toUpperCase() }}
          </span>
          <span class="account-switch-option-copy">
            <strong>{{ user.nickName || user.userName }}</strong>
            <small>{{ user.userName }}</small>
          </span>
          <SwapOutlined class="account-switch-option-icon" />
        </button>
        <a-empty
          v-if="!loadingAccounts && !accountCandidates.length"
          description="没有匹配的有效账号"
        />
      </div>
    </a-spin>

    <label class="account-switch-reason">
      <span>切换原因（可选，将写入审计日志）</span>
      <a-textarea
        v-model:value="accountSwitchReason"
        :maxlength="200"
        :rows="2"
        placeholder="例如：协助用户排查案例生成问题"
      />
    </label>
    <p class="account-switch-tip">
      切换后，业务数据按目标账号隔离；接口请求日志会同时记录目标账号和原始
      SYSTEM 操作人。
    </p>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  AuditOutlined,
  CheckOutlined,
  DownOutlined,
  LogoutOutlined,
  SearchOutlined,
  SwapOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import { useRoute, useRouter } from 'vue-router';
import type { AuthImpersonationUser } from '@case-forge/shared';
import {
  PLATFORMS,
  getPlatformByRoute,
  type PlatformMeta,
} from '@/constants/platform';
import { dismissAppMessages } from '@/utils/globalFeedback';
import { useAuthStore } from '@/stores/auth';
import { fetchImpersonationUsers } from '@/api/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const platforms = PLATFORMS;
const current = computed(() => getPlatformByRoute(route));
const moduleMenuOpen = ref(false);
const loggingOut = ref(false);
const accountSwitchOpen = ref(false);
const accountKeyword = ref('');
const accountSwitchReason = ref('');
const accountCandidates = ref<AuthImpersonationUser[]>([]);
const loadingAccounts = ref(false);
const switchingAccount = ref(false);
const exitingImpersonation = ref(false);
let accountSearchTimer: ReturnType<typeof setTimeout> | null = null;
let accountLoadSequence = 0;
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

const activeModuleId = computed(() => {
  if (route.path.startsWith('/system/')) return '';
  return isApiPlatform.value ? activeApiModuleId.value : 'project';
});

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

function handleAccountMenuClick({ key }: { key: string | number }) {
  if (key === 'audit') {
    dismissAppMessages();
    void router.push('/system/auth-audit');
    return;
  }
  if (key === 'logout') {
    void logout();
  }
}

function openAccountSwitcher() {
  accountKeyword.value = '';
  accountSwitchReason.value = '';
  accountSwitchOpen.value = true;
  void loadAccountCandidates();
}

async function loadAccountCandidates() {
  const sequence = ++accountLoadSequence;
  loadingAccounts.value = true;
  try {
    const users = await fetchImpersonationUsers(
      accountKeyword.value.trim(),
    );
    if (sequence === accountLoadSequence) {
      accountCandidates.value = users;
    }
  } catch (error) {
    if (sequence === accountLoadSequence) {
      accountCandidates.value = [];
      message.error(
        error instanceof Error ? error.message : '加载可切换账号失败',
      );
    }
  } finally {
    if (sequence === accountLoadSequence) {
      loadingAccounts.value = false;
    }
  }
}

async function selectImpersonationUser(user: AuthImpersonationUser) {
  if (switchingAccount.value) return;
  switchingAccount.value = true;
  try {
    await auth.switchUser(user.userName, accountSwitchReason.value);
    await auth.refresh();
    window.location.reload();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '切换账号失败');
  } finally {
    switchingAccount.value = false;
  }
}

async function restoreSystemAccount() {
  if (exitingImpersonation.value) return;
  exitingImpersonation.value = true;
  try {
    await auth.exitImpersonatedSession();
    await auth.refresh();
    window.location.reload();
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '退出代登录失败',
    );
  } finally {
    exitingImpersonation.value = false;
  }
}

watch(accountKeyword, () => {
  if (!accountSwitchOpen.value) return;
  if (accountSearchTimer) clearTimeout(accountSearchTimer);
  accountSearchTimer = setTimeout(() => {
    void loadAccountCandidates();
  }, 250);
});

onBeforeUnmount(() => {
  if (accountSearchTimer) clearTimeout(accountSearchTimer);
});
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

.platform-account-switch,
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

.platform-account-switch:hover:not(:disabled),
.platform-logout:hover:not(:disabled) {
  border-color: rgb(255 255 255 / 18%);
  background: rgb(255 255 255 / 12%);
  color: #fff;
}

.platform-account-switch:focus-visible,
.platform-logout:focus-visible {
  outline: 2px solid rgb(255 255 255 / 72%);
  outline-offset: 2px;
}

.platform-logout-caret {
  font-size: 9px;
  opacity: 0.7;
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

.platform-logout:disabled {
  cursor: wait;
  opacity: 0.65;
}

.account-switch-current {
  margin-bottom: 16px;
}

.account-switch-search {
  margin-bottom: 12px;
}

.account-switch-list {
  display: grid;
  max-height: 330px;
  min-height: 120px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid #e4e7ec;
  border-radius: 10px;
  background: #fcfcfd;
}

.account-switch-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #1d2939;
  text-align: left;
  cursor: pointer;
}

.account-switch-option:hover:not(:disabled) {
  background: #f2f4f7;
}

.account-switch-option:focus-visible {
  outline: 2px solid rgb(182 15 45 / 28%);
  outline-offset: -2px;
}

.account-switch-option:disabled {
  cursor: wait;
  opacity: 0.62;
}

.account-switch-avatar {
  display: grid;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 50%;
  background: #fce7ec;
  color: var(--cf-brand);
  font-size: 12px;
  font-weight: 700;
}

.account-switch-option-copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.account-switch-option-copy strong,
.account-switch-option-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-switch-option-copy strong {
  color: #1d2939;
  font-size: 13px;
  font-weight: 600;
}

.account-switch-option-copy small {
  margin-top: 2px;
  color: #667085;
  font-size: 11px;
}

.account-switch-option-icon {
  flex: 0 0 auto;
  color: #98a2b3;
}

.account-switch-reason {
  display: grid;
  gap: 6px;
  margin-top: 16px;
  color: #475467;
  font-size: 12px;
}

.account-switch-tip {
  margin: 10px 0 0;
  color: #667085;
  font-size: 12px;
  line-height: 1.55;
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
  .platform-account-divider,
  .platform-account-switch span {
    display: none;
  }

  .platform-account-switch {
    width: 30px;
    justify-content: center;
    padding: 0;
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

  .platform-logout span,
  .platform-logout-caret {
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
