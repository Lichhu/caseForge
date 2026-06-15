<template>
  <header class="platform-topbar">
    <div class="platform-topbar-brand">
      <div class="platform-logo">{{ current.logo }}</div>
      <div>
        <strong>{{ current.title }}</strong>
        <span>{{ current.subtitle }}</span>
      </div>
    </div>
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
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import {
  PLATFORMS,
  getPlatformByRoute,
  type PlatformMeta,
} from '@/constants/platform';
import { dismissAppMessages } from '@/utils/globalFeedback';
import { getUserName } from '@/utils/userContext';

const route = useRoute();
const platforms = PLATFORMS;
const current = computed(() => getPlatformByRoute(route));

function buildPlatformLocation(platform: PlatformMeta) {
  const params = new URLSearchParams({ userName: getUserName() });
  return `${platform.route}?${params.toString()}`;
}

function switchPlatform(platform: PlatformMeta) {
  if (platform.id === current.value.id) {
    return;
  }
  dismissAppMessages();
  window.location.assign(buildPlatformLocation(platform));
}
</script>
