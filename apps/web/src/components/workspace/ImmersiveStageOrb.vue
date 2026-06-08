<template>
  <div
    class="immersive-orb"
    :class="{
      open: unref(props.controls.immersiveDockOpen),
      dragging: unref(props.controls.orbDragging),
      'panel-right': unref(props.controls.orbPanelRight),
      'panel-below': unref(props.controls.orbPanelBelow),
    }"
    :style="unref(props.controls.immersiveOrbStyle)"
    @mouseenter="controls.openImmersiveDock"
    @mouseleave="controls.closeImmersiveDock"
  >
    <div v-show="unref(props.controls.immersiveDockOpen)" class="immersive-orb-panel" aria-label="纯享编辑控制">
      <button
        v-for="stage in stages"
        :key="stage.key"
        type="button"
        class="immersive-orb-stage"
        :class="{ active: activeStage === stage.key }"
        :disabled="!canOpenStage(stage.key)"
        :title="stage.title"
        :aria-label="stage.title"
        @click.stop.prevent="emit('switch-stage', stage.key)"
      >
        <span>{{ stage.index }}</span>
        <strong>{{ stage.shortTitle }}</strong>
      </button>
      <button type="button" class="immersive-orb-exit" title="退出全屏" @click="controls.exitImmersiveMode">
        <FullscreenExitOutlined />
        <strong>退出</strong>
      </button>
    </div>
    <button
      type="button"
      class="immersive-orb-trigger"
      :aria-expanded="unref(props.controls.immersiveDockOpen)"
      aria-label="打开纯享编辑控制"
      @pointerdown="controls.startOrbDrag"
      @click="controls.toggleImmersiveDock"
    >
      <FullscreenOutlined />
    </button>
  </div>
</template>

<script setup lang="ts">
import { unref } from 'vue';
import { FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons-vue';
import type { useImmersiveWorkspace } from '@/composables/useImmersiveWorkspace';

const props = defineProps<{
  controls: ReturnType<typeof useImmersiveWorkspace>;
  stages: Array<{ key: string; index: string; title: string; shortTitle: string }>;
  activeStage: string;
  canOpenStage: (stage: string) => boolean;
}>();

const emit = defineEmits<{ (e: 'switch-stage', stage: string): void }>();
</script>
