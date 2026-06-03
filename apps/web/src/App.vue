<template>
  <a-config-provider :theme="caseForgeTheme">
    <a-app>
      <router-view />
    </a-app>
  </a-config-provider>
</template>

<script setup lang="ts">
import { caseForgeTheme } from '@/theme/caseForgeTheme';
</script>
