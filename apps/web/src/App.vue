<template>
  <a-config-provider :theme="caseForgeTheme" :locale="zhCN">
    <a-app>
      <div
        v-if="isPlatformRoute"
        class="platform-layout"
        :class="`platform-layout--${current.id}`"
      >
        <PlatformTopbar />
        <UserContextWarning />
        <router-view />
      </div>
    </a-app>
  </a-config-provider>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import zhCN from 'ant-design-vue/locale/zh_CN';
import PlatformTopbar from '@/components/PlatformTopbar.vue';
import UserContextWarning from '@/components/UserContextWarning.vue';
import { getPlatformByRoute } from '@/constants/platform';
import { caseForgeTheme } from '@/theme/caseForgeTheme';
import { configureAppMessage, dismissAppMessages } from '@/utils/globalFeedback';

const route = useRoute();
const isPlatformRoute = computed(
  () =>
    route.name === 'case-forge' ||
    route.name === 'api-test' ||
    route.name === 'requirement-platform' ||
    route.name === 'preproduction-management' ||
    route.name === 'case-management',
);
const current = computed(() => getPlatformByRoute(route));

watch(
  () => route.fullPath,
  () => {
    dismissAppMessages();
    configureAppMessage();
  },
);
</script>
