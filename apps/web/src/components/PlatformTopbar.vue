<template>
  <header class="platform-topbar">
    <a-dropdown
      v-model:open="moduleMenuOpen"
      trigger="click"
      placement="bottomLeft"
      overlay-class-name="platform-module-dropdown"
    >
      <button
        type="button"
        class="platform-brand-trigger"
        :class="{ 'is-open': moduleMenuOpen }"
        :aria-expanded="moduleMenuOpen"
        aria-haspopup="menu"
      >
        <div class="platform-logo">{{ current.logo }}</div>
        <div class="platform-brand-copy">
          <strong>{{ current.title }}</strong>
          <span>{{ current.subtitle }}</span>
        </div>
        <DownOutlined class="platform-brand-chevron" />
      </button>
      <template #overlay>
        <div
          class="platform-module-menu"
          role="menu"
          :aria-label="`${current.title}模块`"
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
    <nav class="platform-switch" aria-label="平台切换">
      <button
        v-for="platform in platforms"
        :key="platform.id"
        type="button"
        class="platform-switch-item"
        :class="{ active: platform.id === current.id }"
        @click="switchPlatform(platform)"
      >
        {{ platform.title }}
      </button>
    </nav>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { CheckOutlined, DownOutlined } from '@ant-design/icons-vue';
import { useRoute, useRouter } from 'vue-router';
import {
  PLATFORMS,
  getPlatformByRoute,
  type PlatformMeta,
} from '@/constants/platform';
import { dismissAppMessages } from '@/utils/globalFeedback';

const route = useRoute();
const router = useRouter();
const platforms = PLATFORMS;
const current = computed(() => getPlatformByRoute(route));
const moduleMenuOpen = ref(false);
const isApiPlatform = computed(() => current.value.id === 'api-test');

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
</script>

<style scoped>
.platform-brand-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 5px 9px 5px 6px;
  border: 1px solid rgb(255 255 255 / 17%);
  border-radius: 9px;
  background: rgb(255 255 255 / 10%);
  color: #fff;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease;
}

.platform-brand-trigger:hover,
.platform-brand-trigger.is-open {
  border-color: rgb(255 255 255 / 30%);
  background: rgb(255 255 255 / 18%);
}

.platform-brand-trigger:focus-visible {
  outline: 2px solid rgb(255 255 255 / 72%);
  outline-offset: 2px;
}

.platform-brand-copy {
  min-width: 0;
}

.platform-brand-copy strong,
.platform-brand-copy > span {
  display: block;
  line-height: 1.25;
}

.platform-brand-copy strong {
  overflow: hidden;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.platform-brand-copy > span {
  margin-top: 1px;
  overflow: hidden;
  color: rgb(255 255 255 / 76%);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.platform-brand-chevron {
  flex-shrink: 0;
  margin-left: 2px;
  color: rgb(255 255 255 / 72%);
  font-size: 10px;
  transition: transform 0.16s ease;
}

.platform-brand-chevron :deep(svg) {
  display: block;
}

.platform-brand-trigger.is-open .platform-brand-chevron {
  transform: rotate(180deg);
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
</style>
