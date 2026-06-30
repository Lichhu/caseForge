<template>
  <main class="app-frame app-frame--nested" :class="{ 'immersive-mode': immersiveMode, 'is-loading': store.loading }">
    <div class="app-shell">
      <ProjectSidebar platform="case-forge" />
      <section class="main-workspace">
        <header v-if="!immersiveMode" class="topbar">
          <div>
            <h1>{{ cleanProjectTitle(store.activeProject?.title || '智能生成案例平台') }}</h1>
            <p>
              <span v-if="store.activeProject?.requirementNo" class="project-header-no">
                {{ store.activeProject.requirementNo }}
              </span>
              <span>{{ store.activeProject?.description || '需求文档输入，动态约束生成，案例树编辑导出' }}</span>
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
            @click.stop.prevent="switchStage(stage.key)"
          >
            <span class="stage-index">{{ stage.index }}</span>
            <span>
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
  void store.bootstrap();
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

.project-header-no {
  display: inline-block;
  margin-right: 8px;
  padding: 0 8px;
  border-radius: 4px;
  background: #fff5f6;
  color: var(--cf-brand);
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
}
</style>
