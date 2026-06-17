<template>
  <main class="app-frame app-frame--nested" :class="{ 'immersive-mode': immersiveMode, 'is-loading': apiStore.loading || apiStore.stageLoading }">
    <div class="app-shell">
      <ProjectSidebar platform="api-test" />
      <section class="main-workspace">
        <header v-if="!immersiveMode" class="topbar">
          <div>
            <h1>{{ headerTitle }}</h1>
            <p>{{ headerSubtitle }}</p>
          </div>
          <div class="topbar-actions action-toolbar action-toolbar--compact">
            <a-button
              v-if="apiStore.inTransactionWorkspace"
              @click="apiStore.exitTransactionWorkspace()"
            >
              返回
            </a-button>
            <a-button
              v-if="apiStore.inTransactionWorkspace"
              @click="enterImmersiveMode"
            >
              <template #icon><FullscreenOutlined /></template>
              全屏
            </a-button>
          </div>
        </header>

        <nav
          v-if="apiStore.inTransactionWorkspace && !immersiveMode"
          class="stage-nav stage-nav--four"
          aria-label="接口测试工作区"
        >
          <button
            v-for="stage in stages"
            :key="stage.key"
            type="button"
            class="stage-item"
            :class="{ active: apiStore.workspaceStage === stage.key }"
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
          v-if="immersiveMode && apiStore.inTransactionWorkspace"
          :controls="immersiveControls"
          :stages="stages"
          :active-stage="apiStore.workspaceStage"
          :can-open-stage="canOpenStage"
          @switch-stage="switchStage"
        />

        <div class="stage-workspace" :class="{ 'immersive-stage': immersiveMode }">
          <a-empty
            v-if="!apiStore.activeProjectId"
            class="empty-state workbench-empty"
            description="请先在左侧新建项目（需填写需求编号 XQxxxx-xxxx-xx）"
          />
          <ApiTransactionList v-else-if="!apiStore.inTransactionWorkspace" />
          <keep-alive v-else>
            <ApiDocumentEditor v-if="apiStore.workspaceStage === 'api-document'" />
            <ApiCaseWorkbench v-else-if="apiStore.workspaceStage === 'api-cases'" />
            <ApiTestRunner v-else-if="apiStore.workspaceStage === 'api-runner'" />
            <ApiTestReport v-else />
          </keep-alive>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { FullscreenOutlined } from '@ant-design/icons-vue';
import ApiCaseWorkbench from '@/components/api-test/ApiCaseWorkbench.vue';
import ApiDocumentEditor from '@/components/api-test/ApiDocumentEditor.vue';
import ApiTestReport from '@/components/api-test/ApiTestReport.vue';
import ApiTestRunner from '@/components/api-test/ApiTestRunner.vue';
import ApiTransactionList from '@/components/api-test/ApiTransactionList.vue';
import ImmersiveStageOrb from '@/components/workspace/ImmersiveStageOrb.vue';
import ProjectSidebar from '@/components/ProjectSidebar.vue';
import { useImmersiveWorkspace } from '@/composables/useImmersiveWorkspace';
import { useApiTestStore, type ApiWorkspaceStage } from '@/stores/apiTest';

const apiStore = useApiTestStore();
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
  { key: 'api-document' as const, index: '01', title: '接口文档', shortTitle: '文档', description: '上传、结构化与 AI 生成' },
  { key: 'api-cases' as const, index: '02', title: '案例编辑', shortTitle: '案例', description: '手工编辑与维护' },
  { key: 'api-runner' as const, index: '03', title: '执行平台', shortTitle: '执行', description: '环境中心、批量执行与比对' },
  { key: 'api-report' as const, index: '04', title: '结果报表', shortTitle: '报表', description: '统计图表、Excel/PDF 导出' },
];

const headerTitle = computed(() => {
  if (apiStore.activeTransaction) {
    return `${apiStore.activeTransaction.code} · ${apiStore.activeTransaction.name}`;
  }
  if (apiStore.activeProject) {
    return cleanProjectTitle(apiStore.activeProject.title);
  }
  return '智能接口测试平台';
});

const headerSubtitle = computed(() => {
  if (apiStore.inTransactionWorkspace) {
    return '接口文档 → 案例编辑 → 执行平台 → 结果报表';
  }
  if (apiStore.activeProject) {
    const no = apiStore.activeProject.requirementNo;
    return no ? `${no} · 选择交易码进入测试流程` : '选择交易码进入测试流程';
  }
  return '以需求为维度管理接口测试';
});

function canOpenStage(stage: ApiWorkspaceStage | string) {
  if (stage === 'api-document') return true;
  if (stage === 'api-cases') return Boolean(apiStore.canEnterCases);
  if (stage === 'api-runner') return Boolean(apiStore.canEnterRunner);
  if (stage === 'api-report') {
    return Boolean(apiStore.canEnterCases) || apiStore.transactionRuns.length > 0;
  }
  return false;
}

async function switchStage(stage: string) {
  if (!canOpenStage(stage)) return;
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (projectId && transactionId) {
    const nextStage = stage as ApiWorkspaceStage;
    apiStore.setWorkspaceStage(projectId, transactionId, nextStage);
    await apiStore.loadWorkspaceStage(projectId, transactionId, nextStage);
  }
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
      .replace(/\.(docx?|md|xlsx?)$/i, '')
      .trim() || '未命名项目'
  );
}

onMounted(async () => {
  await apiStore.bootstrap();
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
</style>
