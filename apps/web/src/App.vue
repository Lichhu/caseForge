<template>
  <a-config-provider :theme="caseForgeTheme" :locale="zhCN">
    <a-app>
      <router-view />
    </a-app>
  </a-config-provider>
</template>

<script setup lang="ts">
import zhCN from 'ant-design-vue/locale/zh_CN';
import { caseForgeTheme } from '@/theme/caseForgeTheme';
</script>
