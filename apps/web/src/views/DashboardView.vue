<template>
  <main class="app-frame" :class="{ 'immersive-mode': immersiveMode, 'is-loading': store.loading }">
      <header v-if="!immersiveMode" class="app-header">
        <div class="app-header-brand">
          <div class="app-logo">CF</div>
          <div>
            <strong>智能生成案例平台</strong>
            <span>银行测试案例生成工具</span>
          </div>
        </div>
      </header>

      <div class="app-shell">
        <ProjectSidebar v-if="!immersiveMode" />
        <section class="main-workspace">
          <header v-if="!immersiveMode" class="topbar">
            <div>
              <h1>{{ cleanProjectTitle(store.activeProject?.title || '智能案例生成平台') }}</h1>
              <p>{{ store.activeProject?.description || '需求文档输入，动态约束生成，案例树编辑导出' }}</p>
            </div>
            <div class="topbar-actions action-toolbar action-toolbar--compact">
              <a-button :disabled="!store.activeProject" @click="enterImmersiveMode">
                <template #icon><FullscreenOutlined /></template>
                全屏
              </a-button>
            </div>
          </header>

          <nav v-if="!immersiveMode" class="stage-nav" aria-label="项目工作区">
            <button
              v-for="stage in stages"
              :key="stage.key"
              type="button"
              class="stage-item"
              :class="{ active: store.workspaceStage === stage.key }"
              :disabled="!canOpenStage(stage.key)"
              @click.stop.prevent="switchStage(stage.key)"
            >
              <span class="stage-index">{{ stage.index }}</span>
              <span>
                <strong>{{ stage.title }}</strong>
                <small>{{ stage.description }}</small>
              </span>
            </button>
          </nav>

          <div
            v-if="immersiveMode"
            class="immersive-orb"
            :class="{
              open: immersiveDockOpen,
              dragging: orbDragging,
              'panel-right': orbPanelRight,
              'panel-below': orbPanelBelow,
            }"
            :style="immersiveOrbStyle"
            @mouseenter="openImmersiveDock"
            @mouseleave="closeImmersiveDock"
          >
            <div v-show="immersiveDockOpen" class="immersive-orb-panel" aria-label="纯享编辑控制">
              <button
                v-for="stage in stages"
                :key="stage.key"
                type="button"
                class="immersive-orb-stage"
                :class="{ active: store.workspaceStage === stage.key }"
                :disabled="!canOpenStage(stage.key)"
                :title="stage.title"
                :aria-label="stage.title"
                @click.stop.prevent="switchStage(stage.key)"
              >
                <span>{{ stage.index }}</span>
                <strong>{{ stage.shortTitle }}</strong>
              </button>
              <button type="button" class="immersive-orb-exit" title="退出全屏" aria-label="退出全屏" @click="exitImmersiveMode">
                <FullscreenExitOutlined />
                <strong>退出</strong>
              </button>
            </div>
            <button
              type="button"
              class="immersive-orb-trigger"
              :aria-expanded="immersiveDockOpen"
              aria-label="打开纯享编辑控制"
              @pointerdown="startOrbDrag"
              @click="toggleImmersiveDock"
            >
              <FullscreenOutlined />
            </button>
          </div>

          <div class="stage-workspace" :class="{ 'immersive-stage': immersiveMode }">
            <keep-alive>
              <RequirementEditor v-if="store.workspaceStage === 'document'" />
              <ConstraintBuilder
                v-else-if="store.workspaceStage === 'constraints'"
                ref="constraintBuilderRef"
              />
              <CaseTreeWorkbench v-else />
            </keep-alive>
          </div>
        </section>
      </div>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons-vue';
import CaseTreeWorkbench from '@/components/CaseTreeWorkbench.vue';
import ConstraintBuilder from '@/components/ConstraintBuilder.vue';
import ProjectSidebar from '@/components/ProjectSidebar.vue';
import RequirementEditor from '@/components/RequirementEditor.vue';
import { useCaseForgeStore, type WorkspaceStage } from '@/stores/caseForge';
import { configureAppMessage, dismissAppMessages } from '@/utils/globalFeedback';

const store = useCaseForgeStore();
const constraintBuilderRef = ref<InstanceType<typeof ConstraintBuilder> | null>(null);
const immersiveMode = ref(false);
const immersiveDockOpen = ref(false);
const orbDragging = ref(false);
const orbSuppressClick = ref(false);
const orbCloseTimer = ref<number | null>(null);
const orbPosition = ref({ x: 0, y: 0 });
const orbDragState = ref({
  pointerId: 0,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
  moved: false,
});

const orbSize = 54;
const orbMargin = 12;

const stages: Array<{
  key: WorkspaceStage;
  index: string;
  title: string;
  shortTitle: string;
  description: string;
}> = [
  {
    key: 'document',
    index: '01',
    title: '结构化需求文档',
    shortTitle: '文档',
    description: '上传、清洗、编辑 Markdown',
  },
  {
    key: 'constraints',
    index: '02',
    title: '动态指令',
    shortTitle: '指令',
    description: '功能点列表、逐条动态指令',
  },
  {
    key: 'workbench',
    index: '03',
    title: '案例编辑台',
    shortTitle: '编辑',
    description: '生成、编辑、导出 XMind',
  },
];

const immersiveOrbStyle = computed(() => ({
  left: `${orbPosition.value.x}px`,
  top: `${orbPosition.value.y}px`,
  right: 'auto',
  bottom: 'auto',
}));

const orbPanelRight = computed(() => orbPosition.value.x < 260);
const orbPanelBelow = computed(() => orbPosition.value.y < 320);

function canOpenStage(stage: WorkspaceStage) {
  if (stage === 'document') return true;
  return Boolean(store.structDoc?.canEnterDynamicInstruct);
}

function switchStage(stage: WorkspaceStage) {
  if (!canOpenStage(stage)) return;
  store.setWorkspaceStage(stage);
  scheduleViewportRefresh();
}

async function openScenarioMaintenance() {
  if (!canOpenStage('constraints')) {
    return;
  }
  if (store.workspaceStage !== 'constraints') {
    switchStage('constraints');
  }
  await nextTick();
  constraintBuilderRef.value?.openScenarioModal();
}

async function enterImmersiveMode() {
  dismissAppMessages();
  immersiveMode.value = true;
  immersiveDockOpen.value = true;
  resetOrbPosition();
  await nextTick();
  configureAppMessage();
  scheduleViewportRefresh();
}

async function exitImmersiveMode() {
  dismissAppMessages();
  immersiveMode.value = false;
  immersiveDockOpen.value = false;
  await nextTick();
  configureAppMessage();
  scheduleViewportRefresh();
}

function scheduleViewportRefresh() {
  window.requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

function resetOrbPosition() {
  orbPosition.value = clampOrbPosition({
    x: window.innerWidth - orbSize - 22,
    y: window.innerHeight - orbSize - 22,
  });
}

function startOrbDrag(event: PointerEvent) {
  if (event.button !== 0) return;
  orbDragging.value = true;
  orbDragState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: orbPosition.value.x,
    originY: orbPosition.value.y,
    moved: false,
  };
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', moveOrbDrag);
  window.addEventListener('pointerup', stopOrbDrag);
}

function moveOrbDrag(event: PointerEvent) {
  if (!orbDragging.value || event.pointerId !== orbDragState.value.pointerId) return;
  const deltaX = event.clientX - orbDragState.value.startX;
  const deltaY = event.clientY - orbDragState.value.startY;
  if (Math.abs(deltaX) + Math.abs(deltaY) > 4) {
    orbDragState.value.moved = true;
  }
  orbPosition.value = clampOrbPosition({
    x: orbDragState.value.originX + deltaX,
    y: orbDragState.value.originY + deltaY,
  });
}

function stopOrbDrag(event: PointerEvent) {
  if (event.pointerId !== orbDragState.value.pointerId) return;
  orbDragging.value = false;
  orbSuppressClick.value = orbDragState.value.moved;
  window.removeEventListener('pointermove', moveOrbDrag);
  window.removeEventListener('pointerup', stopOrbDrag);
}

function toggleImmersiveDock() {
  if (orbSuppressClick.value) {
    orbSuppressClick.value = false;
    return;
  }
  immersiveDockOpen.value = !immersiveDockOpen.value;
}

function openImmersiveDock() {
  cancelOrbClose();
  immersiveDockOpen.value = true;
}

function closeImmersiveDock() {
  if (orbDragging.value) return;
  cancelOrbClose();
  orbCloseTimer.value = window.setTimeout(() => {
    immersiveDockOpen.value = false;
    orbCloseTimer.value = null;
  }, 420);
}

function cancelOrbClose() {
  if (orbCloseTimer.value === null) return;
  window.clearTimeout(orbCloseTimer.value);
  orbCloseTimer.value = null;
}

function clampOrbPosition(position: { x: number; y: number }) {
  return {
    x: Math.min(Math.max(position.x, orbMargin), window.innerWidth - orbSize - orbMargin),
    y: Math.min(Math.max(position.y, orbMargin), window.innerHeight - orbSize - orbMargin),
  };
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && immersiveMode.value) {
    exitImmersiveMode();
  }
}

function handleResize() {
  orbPosition.value = clampOrbPosition(orbPosition.value);
}

function cleanProjectTitle(title: string) {
  return (
    title
      .replace(/^#+\s*/, '')
      .replace(/^[：:\s·。|]+/, '')
      .replace(/\s+-\s+测试分析$/, '')
      .replace(/\s+-\s+测试案例$/, '')
      .replace(/\.(docx?|md)$/i, '')
      .trim() || '未命名项目'
  );
}

onMounted(() => {
  store.bootstrap();
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('resize', handleResize);
  resetOrbPosition();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('pointermove', moveOrbDrag);
  window.removeEventListener('pointerup', stopOrbDrag);
  cancelOrbClose();
});
</script>

<style scoped>
.app-frame.is-loading .stage-workspace {
  opacity: 0.96;
  pointer-events: none;
}
</style>
