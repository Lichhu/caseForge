<template>
  <div class="platform-layout" :class="`platform-layout--${current.id}`">
    <header class="platform-topbar">
      <div class="platform-topbar-brand">
        <div class="platform-logo">{{ current.logo }}</div>
        <div>
          <strong>{{ current.title }}</strong>
          <span>{{ current.subtitle }}</span>
        </div>
      </div>
      <nav class="platform-switch" aria-label="平台切换">
        <RouterLink
          v-for="platform in platforms"
          :key="platform.id"
          :to="{ path: platform.route, query: platformQuery }"
          class="platform-switch-item"
          :class="{ active: platform.id === current.id }"
        >
          {{ platform.title }}
        </RouterLink>
      </nav>
    </header>
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { PLATFORMS, getPlatformByRoute } from '@/constants/platform';
import { getUserName } from '@/utils/userContext';

const route = useRoute();
const platforms = PLATFORMS;
const current = computed(() => getPlatformByRoute(route.path));
const platformQuery = computed(() => ({ userName: getUserName() }));
</script>
