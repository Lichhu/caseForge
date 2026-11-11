<template>
  <main class="app-frame app-frame--nested" :class="{ 'immersive-mode': immersiveMode, 'is-loading': store.loading }">
    <div class="app-shell">
      <ProjectSidebar platform="case-forge" />
      <section class="main-workspace">
        <header v-if="!immersiveMode" class="topbar">
          <div class="project-heading">
            <h1>{{ cleanProjectTitle(store.activeProject?.title || '智能生成案例平台') }}</h1>
            <p class="project-heading-meta">
              <span v-if="store.activeProject?.requirementNo" class="project-header-no">
                {{ store.activeProject.requirementNo }}
              </span>
              <span class="project-description">
                {{ store.activeProject?.description || '需求文档输入，动态约束生成，案例树编辑导出' }}
              </span>
            </p>
          </div>
          <div class="topbar-actions action-toolbar action-toolbar--compact">
            <a-button :disabled="!store.activeProject" @click="enterImmersiveMode">
              <template #icon><FullscreenOutlined /></template>
              全屏
            </a-button>
          </div>
        </header>

        <nav v-if="!immersiveMode" class="stage-nav" aria-label="功能测试工作区">
          <button
            v-for="stage in stages"
            :key="stage.key"
            type="button"
            class="stage-item"
            :class="{ active: store.workspaceStage === stage.key }"
            :disabled="!canOpenStage(stage.key)"
            :aria-current="store.workspaceStage === stage.key ? 'step' : undefined"
            @click.stop.prevent="switchStage(stage.key)"
          >
            <span class="stage-index">{{ stage.index }}</span>
            <span class="stage-copy">
              <strong>{{ stage.title }}</strong>
              <small>{{ stage.description }}</small>
            </span>
          </button>
        </nav>

        <ImmersiveStageOrb
          v-if="immersiveMode"
          :controls="immersiveControls"
          :stages="stages"
          :active-stage="store.workspaceStage"
          :can-open-stage="(stage) => canOpenStage(stage as WorkspaceStage)"
          @switch-stage="(stage) => switchStage(stage as WorkspaceStage)"
        />

        <div class="stage-workspace" :class="{ 'immersive-stage': immersiveMode }">
          <a-empty
            v-if="!store.activeProject"
            class="empty-state workbench-empty"
            description="请先在左侧新建项目（需填写需求编号 XQxxxx-xxxx-xx）"
          />
          <keep-alive v-else>
            <StructDocList v-if="store.workspaceStage === 'document' && !store.activeStructDoc" />
            <RequirementEditor v-else-if="store.workspaceStage === 'document'" />
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
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { FullscreenOutlined } from '@ant-design/icons-vue';
import ImmersiveStageOrb from '@/components/workspace/ImmersiveStageOrb.vue';
import CaseTreeWorkbench from '@/components/CaseTreeWorkbench.vue';
import ConstraintBuilder from '@/components/ConstraintBuilder.vue';
import ProjectSidebar from '@/components/ProjectSidebar.vue';
import RequirementEditor from '@/components/RequirementEditor.vue';
import StructDocList from '@/components/StructDocList.vue';
import { useImmersiveWorkspace } from '@/composables/useImmersiveWorkspace';
import { useCaseForgeStore, type WorkspaceStage } from '@/stores/caseForge';
import { getUserName } from '@/utils/userContext';

const store = useCaseForgeStore();
const constraintBuilderRef = ref<InstanceType<typeof ConstraintBuilder> | null>(null);
const immersiveControls = useImmersiveWorkspace();
const {
  immersiveMode,
  enterImmersiveMode,
  exitImmersiveMode,
  scheduleViewportRefresh,
  bindImmersiveListeners,
  unbindImmersiveListeners,
} = immersiveControls;

const stages = [
  { key: 'document' as const, index: '01', title: '结构化需求文档', shortTitle: '文档', description: '上传、清洗、编辑 Markdown' },
  { key: 'constraints' as const, index: '02', title: '动态指令', shortTitle: '指令', description: '功能点列表、逐条动态指令' },
  { key: 'workbench' as const, index: '03', title: '案例编辑台', shortTitle: '编辑', description: '在线编辑案例树，导出 Excel / XMind' },
];

function canOpenStage(stage: WorkspaceStage) {
  if (stage === 'document') return true;
  return store.structDocs.some((d) => d.canEnterDynamicInstruct);
}

async function switchStage(stage: WorkspaceStage) {
  if (!canOpenStage(stage)) return;
  if (stage !== 'document' && !store.activeStructDoc) {
    const first = store.structDocs.find((d) => d.canEnterDynamicInstruct);
    if (first) {
      store.selectStructDoc(first.id);
    }
  }
  await store.setWorkspaceStage(stage, { refresh: true });
  scheduleViewportRefresh();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && immersiveMode.value) {
    exitImmersiveMode();
  }
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
  if (getUserName()) {
    void store.bootstrap();
  }
  bindImmersiveListeners(handleKeydown);
});

onBeforeUnmount(() => {
  if (immersiveMode.value) {
    void exitImmersiveMode();
  }
  unbindImmersiveListeners(handleKeydown);
});
</script>

<style scoped>
.app-frame--nested {
  flex: 1;
  min-height: 0;
}

.app-frame.is-loading .stage-workspace {
  opacity: 0.96;
  pointer-events: none;
}

.main-workspace {
  padding: 20px 24px 24px;
}

.topbar {
  align-items: center;
  min-height: 52px;
  margin-bottom: 14px;
}

.project-heading {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.topbar h1 {
  max-width: 960px;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.015em;
  line-height: 1.3;
}

.project-heading-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-top: 6px !important;
}

.project-header-no {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid #f0d5da;
  border-radius: 5px;
  background: #fff8f9;
  color: var(--cf-brand);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 20px;
}

.project-description {
  overflow: hidden;
  min-width: 0;
  color: #667085;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-nav {
  gap: 0;
  margin-bottom: 16px;
  padding: 5px;
  border: 1px solid #e4e7ec;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 2px rgb(16 24 40 / 4%);
}

.stage-item {
  position: relative;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 9px;
  min-height: 52px;
  padding: 8px 14px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  box-shadow: none;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;
}

.stage-item:not(:last-child)::after {
  position: absolute;
  top: 14px;
  right: 0;
  bottom: 14px;
  width: 1px;
  background: #eaecf0;
  content: "";
}

.stage-item:hover:not(:disabled):not(.active) {
  border-color: transparent;
  background: #f8f9fb;
}

.stage-item.active {
  border-color: transparent;
  background: #fff4f6;
  box-shadow: inset 0 0 0 1px rgb(182 15 45 / 12%);
}

.stage-index {
  width: 30px;
  height: 30px;
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  background: #f8f9fb;
  color: #667085;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.stage-item.active .stage-index {
  border-color: var(--cf-brand);
  background: var(--cf-brand);
}

.stage-copy {
  min-width: 0;
}

.stage-item strong {
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
}

.stage-item small {
  margin-top: 2px;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-item:disabled .stage-copy {
  opacity: 0.7;
}

.stage-workspace :deep(.panel) {
  border-color: #e7eaf0;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgb(16 24 40 / 4%);
}

.stage-workspace :deep(.document-panel > .panel-header) {
  padding: 20px 22px 18px;
}

/* 侧栏去掉筛选区、列表区与项目卡的三层嵌套，改用一条连续表面 */
:deep(.project-filter-panel) {
  padding: 0 2px 10px;
  border: 0;
  border-bottom: 1px solid #eef1f4;
  border-radius: 0;
  background: transparent;
}

:deep(.project-list-shell) {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

:deep(.project-item) {
  border-color: transparent;
  border-radius: 6px;
  background: transparent;
}

:deep(.project-item:hover:not(.active)) {
  border-color: transparent;
  background: #f7f8fa;
  box-shadow: none;
}

:deep(.project-item.active) {
  border-color: #f0d5da;
  background: #fff7f8;
  box-shadow: none;
}

:deep(.project-list-pagination) {
  padding-inline: 2px;
}

@media (max-width: 1100px) {
  .main-workspace {
    padding: 18px 20px 20px;
  }

  .stage-item {
    padding-inline: 10px;
  }
}

@media (max-width: 820px) {
  .main-workspace {
    padding: 16px;
  }

  .topbar {
    align-items: flex-start;
  }

  .stage-nav {
    grid-template-columns: 1fr;
  }

  .stage-item:not(:last-child)::after {
    top: auto;
    right: 12px;
    bottom: 0;
    left: 12px;
    width: auto;
    height: 1px;
  }
}
</style>
