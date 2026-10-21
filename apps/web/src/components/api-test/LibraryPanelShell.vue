<template>
  <a-drawer
    v-if="!embedded"
    v-model:open="open"
    :title="title"
    placement="right"
    :width="width"
    :z-index="zIndex"
    :body-style="drawerBodyStyle"
    :destroy-on-close="destroyOnClose"
    @close="emit('close')"
  >
    <slot />
  </a-drawer>
  <div v-else class="library-panel-content">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    title: string;
    width?: string;
    zIndex: number;
    bodyPadding?: string;
    embedded?: boolean;
    destroyOnClose?: boolean;
  }>(),
  {
    width: "min(1240px, 84vw)",
    bodyPadding: "20px 28px 24px",
    embedded: false,
    destroyOnClose: false,
  },
);

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ close: [] }>();
const drawerBodyStyle = computed(() => ({ padding: props.bodyPadding }));
</script>

<style scoped>
.library-panel-content {
  height: 100%;
  min-height: 0;
}
</style>
