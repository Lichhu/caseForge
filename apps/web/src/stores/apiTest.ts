import { defineStore } from 'pinia';
import { message } from 'ant-design-vue';
import {
  batchDeleteProjects,
  createProject,
  deleteProject,
  listProjects,
  updateProject,
  type ProjectListItem,
} from '@/api/client';
import {
  autoSaveApiDocument,
  createApiCase,
  createApiEnvironment,
  deleteApiCase,
  deleteApiEnvironment,
  exportApiReport,
  generateApiCases,
  getApiDocument,
  getApiReportSummary,
  getApiRun,
  listApiCases,
  listApiEnvironments,
  listApiRuns,
  runApiCases,
  saveApiDocument,
  structureApiDocument,
  updateApiCase,
  updateApiEnvironment,
  uploadApiDocument,
  downloadBlob,
  type ApiDocDetail,
  type ApiEnvironmentRow,
  type ApiRunDetail,
  type ApiTestCaseRow,
} from '@/api/apiTestClient';

export type ApiWorkspaceStage = 'api-document' | 'api-cases' | 'api-runner' | 'api-report';

const stageKey = (projectId: string) => `case-forge:api-stage:${projectId}`;
const activeProjectKey = 'case-forge:api-active-project';

interface State {
  projects: ProjectListItem[];
  activeProjectId: string;
  apiDoc: ApiDocDetail | null;
  cases: ApiTestCaseRow[];
  environments: ApiEnvironmentRow[];
  runs: ApiRunDetail[];
  activeRun: ApiRunDetail | null;
  selectedCaseIds: string[];
  selectedEnvironmentId: string;
  workspaceStage: ApiWorkspaceStage;
  loading: boolean;
  running: boolean;
}

export const useApiTestStore = defineStore('apiTest', {
  state: (): State => ({
    projects: [],
    activeProjectId: localStorage.getItem(activeProjectKey) ?? '',
    apiDoc: null,
    cases: [],
    environments: [],
    runs: [],
    activeRun: null,
    selectedCaseIds: [],
    selectedEnvironmentId: '',
    workspaceStage: 'api-document',
    loading: false,
    running: false,
  }),
  getters: {
    activeProject(state): ProjectListItem | null {
      return state.projects.find((p) => p.id === state.activeProjectId) ?? null;
    },
    canEnterCases: (state) =>
      Boolean(state.apiDoc?.canEnterCases) || state.cases.length > 0,
    canEnterRunner: (state) =>
      (Boolean(state.apiDoc?.canEnterRunner) || state.cases.some((item) => item.enabled)) &&
      state.cases.some((item) => item.enabled),
  },
  actions: {
    async bootstrap() {
      this.loading = true;
      try {
        await this.refreshProjects();
        const saved = this.activeProjectId;
        const target =
          saved && this.projects.some((p) => p.id === saved)
            ? saved
            : this.projects[0]?.id;
        if (target) {
          await this.selectProject(target);
        } else {
          await this.newProject();
        }
      } finally {
        this.loading = false;
      }
    },
    async refreshProjects() {
      this.projects = await listProjects('api-test');
    },
    async newProject() {
      const project = await createProject({
        title: `接口测试项目 ${this.projects.length + 1}`,
        platform: 'api-test',
      });
      this.activeProjectId = project.id;
      localStorage.setItem(activeProjectKey, project.id);
      this.apiDoc = null;
      this.cases = [];
      this.runs = [];
      this.workspaceStage = 'api-document';
      await this.refreshProjects();
      await this.loadWorkspace(project.id);
    },
    async removeProject(projectId: string) {
      await deleteProject(projectId);
      await this.refreshProjects();
      if (this.activeProjectId === projectId) {
        const next = this.projects[0];
        if (next) {
          await this.selectProject(next.id);
        } else {
          this.activeProjectId = '';
          localStorage.removeItem(activeProjectKey);
          this.apiDoc = null;
          this.cases = [];
          this.runs = [];
        }
      }
    },
    async removeProjects(projectIds: string[]) {
      await batchDeleteProjects(projectIds);
      await this.refreshProjects();
      if (projectIds.includes(this.activeProjectId)) {
        const next = this.projects[0];
        if (next) await this.selectProject(next.id);
        else {
          this.activeProjectId = '';
          this.apiDoc = null;
        }
      }
    },
    async updateProjectInfo(
      projectId: string,
      payload: { title?: string; description?: string },
    ) {
      await updateProject(projectId, payload);
      await this.refreshProjects();
    },
    restoreStage(projectId: string) {
      const saved = localStorage.getItem(stageKey(projectId)) as ApiWorkspaceStage | null;
      if (saved) this.workspaceStage = saved;
    },
    setWorkspaceStage(projectId: string, stage: ApiWorkspaceStage) {
      this.workspaceStage = stage;
      localStorage.setItem(stageKey(projectId), stage);
    },
    async selectProject(projectId: string) {
      this.activeProjectId = projectId;
      localStorage.setItem(activeProjectKey, projectId);
      await this.loadWorkspace(projectId);
    },
    async loadWorkspace(projectId: string) {
      this.loading = true;
      try {
        this.restoreStage(projectId);
        const [cases, envs, runs] = await Promise.all([
          listApiCases(projectId),
          listApiEnvironments(projectId),
          listApiRuns(projectId),
        ]);
        this.cases = cases;
        this.environments = envs;
        this.runs = runs;
        try {
          this.apiDoc = await getApiDocument(projectId);
        } catch {
          this.apiDoc = null;
          message.error('接口文档加载失败，案例与执行数据已加载，请刷新页面或重启 API');
        }
        const defaultEnv = envs.find((item) => item.isDefault) ?? envs[0];
        if (defaultEnv) this.selectedEnvironmentId = defaultEnv.id;
      } finally {
        this.loading = false;
      }
    },
    async uploadDocument(projectId: string, file: File, force = false) {
      this.apiDoc = await uploadApiDocument(projectId, file, force);
      message.success('接口文档已上传');
    },
    async structureDocument(projectId: string) {
      this.loading = true;
      try {
        this.apiDoc = await structureApiDocument(projectId);
        message.success('接口文档结构化完成');
      } finally {
        this.loading = false;
      }
    },
    async saveDocument(projectId: string, markdown: string) {
      if (!this.apiDoc) return;
      this.apiDoc = await saveApiDocument(projectId, {
        structuredMarkdown: markdown,
        endpoints: this.apiDoc.endpoints,
      });
      message.success('接口文档已保存');
    },
    async autoSave(projectId: string, markdown: string) {
      this.apiDoc = await autoSaveApiDocument(projectId, markdown);
    },
    async refreshCases(projectId: string) {
      this.cases = await listApiCases(projectId);
    },
    async generateCases(projectId: string, endpointIds?: string[]) {
      const result = await generateApiCases(projectId, endpointIds);
      await this.refreshCases(projectId);
      message.success(`已生成 ${result.count} 条案例`);
    },
    async saveCase(projectId: string, payload: Record<string, unknown>, caseId?: string) {
      if (caseId) {
        await updateApiCase(projectId, caseId, payload);
      } else {
        await createApiCase(projectId, payload);
      }
      await this.refreshCases(projectId);
      message.success('案例已保存');
    },
    async removeCase(projectId: string, caseId: string) {
      await deleteApiCase(projectId, caseId);
      this.selectedCaseIds = this.selectedCaseIds.filter((id) => id !== caseId);
      await this.refreshCases(projectId);
    },
    toggleCaseSelection(caseId: string, checked: boolean) {
      if (checked) {
        if (!this.selectedCaseIds.includes(caseId)) {
          this.selectedCaseIds.push(caseId);
        }
      } else {
        this.selectedCaseIds = this.selectedCaseIds.filter((id) => id !== caseId);
      }
    },
    async refreshEnvironments(projectId: string) {
      this.environments = await listApiEnvironments(projectId);
    },
    async saveEnvironment(projectId: string, payload: Record<string, unknown>, id?: string) {
      if (id) {
        await updateApiEnvironment(projectId, id, payload);
      } else {
        await createApiEnvironment(projectId, payload);
      }
      await this.refreshEnvironments(projectId);
      message.success('环境已保存');
    },
    async removeEnvironment(projectId: string, id: string) {
      await deleteApiEnvironment(projectId, id);
      await this.refreshEnvironments(projectId);
    },
    async executeCases(projectId: string, caseIds: string[]) {
      if (!this.selectedEnvironmentId) {
        message.warning('请先选择执行环境');
        return;
      }
      this.running = true;
      try {
        const run = await runApiCases(projectId, {
          caseIds,
          environmentId: this.selectedEnvironmentId,
          concurrency: 5,
        });
        this.activeRun = run;
        this.runs = await listApiRuns(projectId);
        message.success(`执行完成：通过 ${run.passedCount} / ${run.totalCount}`);
        return run;
      } finally {
        this.running = false;
      }
    },
    async loadRun(projectId: string, runId: string) {
      this.activeRun = await getApiRun(projectId, runId);
    },
    async loadReportSummary(projectId: string, runId?: string) {
      return getApiReportSummary(projectId, runId);
    },
    async exportReport(projectId: string, runId: string, format: 'xlsx' | 'pdf') {
      const blob = await exportApiReport(projectId, runId, format);
      downloadBlob(blob, `api-test-${runId}.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
    },
  },
});
