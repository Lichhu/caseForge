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
  createApiTransaction,
  deleteApiCase,
  deleteApiEnvironment,
  batchDeleteApiTransactions,
  exportApiReport,
  generateApiCases,
  getApiDocument,
  getApiReportSummary,
  getApiRun,
  listApiCases,
  listApiEnvironments,
  listApiRuns,
  listApiTransactions,
  runApiCases,
  saveApiDocument,
  structureApiDocument,
  updateApiCase,
  updateApiEnvironment,
  updateApiTransaction,
  uploadApiDocument,
  downloadBlob,
  type ApiDocDetail,
  type ApiEnvironmentRow,
  type ApiRunDetail,
  type ApiTestCaseRow,
  type ApiTransactionRow,
} from '@/api/apiTestClient';

export type ApiWorkspaceStage = 'api-document' | 'api-cases' | 'api-runner' | 'api-report';

const stageKey = (projectId: string, transactionId: string) =>
  `case-forge:api-stage:${projectId}:${transactionId}`;
const activeProjectKey = 'case-forge:api-active-project';
const activeTransactionKey = (projectId: string) =>
  `case-forge:api-active-transaction:${projectId}`;

interface State {
  projects: ProjectListItem[];
  activeProjectId: string;
  transactions: ApiTransactionRow[];
  activeTransactionId: string;
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
    transactions: [],
    activeTransactionId: '',
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
    activeTransaction(state): ApiTransactionRow | null {
      return state.transactions.find((item) => item.id === state.activeTransactionId) ?? null;
    },
    inTransactionWorkspace: (state) => Boolean(state.activeProjectId && state.activeTransactionId),
    canEnterCases: (state) =>
      Boolean(state.apiDoc?.canEnterCases) || state.cases.length > 0,
    canEnterRunner: (state) =>
      (Boolean(state.apiDoc?.canEnterRunner) || state.cases.some((item) => item.enabled)) &&
      state.cases.some((item) => item.enabled),
    transactionRuns(state): ApiRunDetail[] {
      const caseIds = new Set(state.cases.map((item) => item.id));
      return state.runs.filter((run) =>
        (run.items ?? []).some((item) => caseIds.has(item.caseId)),
      );
    },
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
          await this.selectProject(target, true);
        }
      } finally {
        this.loading = false;
      }
    },
    async refreshProjects() {
      this.projects = await listProjects('api-test');
    },
    async newProject(payload: {
      title: string;
      requirementNo: string;
      description?: string;
    }) {
      const project = await createProject({
        title: payload.title,
        requirementNo: payload.requirementNo,
        description: payload.description,
        platform: 'api-test',
      });
      this.activeProjectId = project.id;
      localStorage.setItem(activeProjectKey, project.id);
      this.clearTransactionWorkspace();
      await this.refreshProjects();
      await this.selectProject(project.id, false);
    },
    clearTransactionWorkspace() {
      this.activeTransactionId = '';
      this.apiDoc = null;
      this.cases = [];
      this.runs = [];
      this.activeRun = null;
      this.selectedCaseIds = [];
      this.workspaceStage = 'api-document';
    },
    async removeProject(projectId: string) {
      await deleteProject(projectId);
      await this.refreshProjects();
      if (this.activeProjectId === projectId) {
        const next = this.projects[0];
        if (next) {
          await this.selectProject(next.id, false);
        } else {
          this.activeProjectId = '';
          localStorage.removeItem(activeProjectKey);
          this.transactions = [];
          this.clearTransactionWorkspace();
        }
      }
    },
    async removeProjects(projectIds: string[]) {
      await batchDeleteProjects(projectIds);
      await this.refreshProjects();
      if (projectIds.includes(this.activeProjectId)) {
        const next = this.projects[0];
        if (next) await this.selectProject(next.id, false);
        else {
          this.activeProjectId = '';
          this.transactions = [];
          this.clearTransactionWorkspace();
        }
      }
    },
    async updateProjectInfo(
      projectId: string,
      payload: { title?: string; description?: string; requirementNo?: string },
    ) {
      await updateProject(projectId, payload);
      await this.refreshProjects();
    },
    restoreStage(projectId: string, transactionId: string) {
      const saved = localStorage.getItem(
        stageKey(projectId, transactionId),
      ) as ApiWorkspaceStage | null;
      this.workspaceStage = saved ?? 'api-document';
    },
    setWorkspaceStage(projectId: string, transactionId: string, stage: ApiWorkspaceStage) {
      this.workspaceStage = stage;
      localStorage.setItem(stageKey(projectId, transactionId), stage);
    },
    async selectProject(projectId: string, restoreTransaction = true) {
      this.activeProjectId = projectId;
      localStorage.setItem(activeProjectKey, projectId);
      this.clearTransactionWorkspace();
      await this.refreshTransactions(projectId);
      if (restoreTransaction) {
        const savedTx = localStorage.getItem(activeTransactionKey(projectId));
        if (savedTx && this.transactions.some((item) => item.id === savedTx)) {
          await this.selectTransaction(savedTx);
        }
      }
    },
    async refreshTransactions(projectId: string) {
      this.transactions = await listApiTransactions(projectId);
    },
    async createTransaction(payload: { code: string; name: string; description?: string }) {
      if (!this.activeProjectId) return;
      const row = await createApiTransaction(this.activeProjectId, payload);
      await this.refreshTransactions(this.activeProjectId);
      await this.selectTransaction(row.id);
      message.success('交易码已创建');
    },
    async updateTransactionInfo(
      transactionId: string,
      payload: { code: string; name: string; description?: string },
    ) {
      if (!this.activeProjectId) return;
      await updateApiTransaction(this.activeProjectId, transactionId, payload);
      await this.refreshTransactions(this.activeProjectId);
      message.success('交易码已更新');
    },
    async removeTransaction(transactionId: string) {
      await this.removeTransactions([transactionId]);
    },
    async removeTransactions(transactionIds: string[]) {
      if (!this.activeProjectId) return;
      const ids = [...new Set(transactionIds.filter(Boolean))];
      if (!ids.length) return;
      const result = await batchDeleteApiTransactions(this.activeProjectId, ids);
      await this.refreshTransactions(this.activeProjectId);
      if (ids.includes(this.activeTransactionId)) {
        this.clearTransactionWorkspace();
        localStorage.removeItem(activeTransactionKey(this.activeProjectId));
      }
      message.success(`已删除 ${result.count} 条交易码`);
    },
    async selectTransaction(transactionId: string) {
      if (!this.activeProjectId) return;
      this.activeTransactionId = transactionId;
      localStorage.setItem(activeTransactionKey(this.activeProjectId), transactionId);
      await this.loadTransactionWorkspace(this.activeProjectId, transactionId);
    },
    exitTransactionWorkspace() {
      if (!this.activeProjectId) return;
      this.clearTransactionWorkspace();
      localStorage.removeItem(activeTransactionKey(this.activeProjectId));
    },
    async loadTransactionWorkspace(projectId: string, transactionId: string) {
      this.loading = true;
      try {
        this.restoreStage(projectId, transactionId);
        const [cases, envs, runs] = await Promise.all([
          listApiCases(projectId, transactionId),
          listApiEnvironments(projectId),
          listApiRuns(projectId),
        ]);
        this.cases = cases;
        this.environments = envs;
        this.runs = runs;
        this.selectedCaseIds = [];
        try {
          this.apiDoc = await getApiDocument(projectId, transactionId);
        } catch {
          this.apiDoc = null;
          message.error('接口文档加载失败，请刷新页面或重启 API');
        }
        const defaultEnv = envs.find((item) => item.isDefault) ?? envs[0];
        if (defaultEnv) this.selectedEnvironmentId = defaultEnv.id;
      } finally {
        this.loading = false;
      }
    },
    async uploadDocument(projectId: string, transactionId: string, file: File, force = false) {
      this.loading = true;
      try {
        this.apiDoc = await uploadApiDocument(projectId, transactionId, file, force);
        message.success('接口文档已上传');
      } finally {
        this.loading = false;
      }
    },
    async structureDocument(projectId: string, transactionId: string) {
      this.loading = true;
      try {
        this.apiDoc = await structureApiDocument(projectId, transactionId);
        message.success('接口文档结构化完成');
      } finally {
        this.loading = false;
      }
    },
    async saveDocument(projectId: string, transactionId: string, markdown: string) {
      if (!this.apiDoc) return;
      this.apiDoc = await saveApiDocument(projectId, transactionId, {
        structuredMarkdown: markdown,
        endpoints: this.apiDoc.endpoints,
      });
      message.success('接口文档已保存');
    },
    async autoSave(projectId: string, transactionId: string, markdown: string) {
      this.apiDoc = await autoSaveApiDocument(projectId, transactionId, markdown);
    },
    async refreshCases(projectId: string, transactionId: string) {
      this.cases = await listApiCases(projectId, transactionId);
    },
    async generateCases(projectId: string, transactionId: string, endpointIds?: string[]) {
      const result = await generateApiCases(projectId, transactionId, endpointIds);
      await this.refreshCases(projectId, transactionId);
      message.success(`已生成 ${result.count} 条案例`);
    },
    async saveCase(
      projectId: string,
      transactionId: string,
      payload: Record<string, unknown>,
      caseId?: string,
    ) {
      if (caseId) {
        await updateApiCase(projectId, transactionId, caseId, payload);
      } else {
        await createApiCase(projectId, transactionId, payload);
      }
      await this.refreshCases(projectId, transactionId);
      message.success('案例已保存');
    },
    async removeCase(projectId: string, transactionId: string, caseId: string) {
      await deleteApiCase(projectId, transactionId, caseId);
      this.selectedCaseIds = this.selectedCaseIds.filter((id) => id !== caseId);
      await this.refreshCases(projectId, transactionId);
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
    async executeCases(projectId: string, transactionId: string, caseIds: string[]) {
      if (!this.selectedEnvironmentId) {
        message.warning('请先选择执行环境');
        return;
      }
      this.running = true;
      try {
        const run = await runApiCases(projectId, transactionId, {
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
    async loadReportSummary(projectId: string, transactionId: string, runId?: string) {
      return getApiReportSummary(projectId, transactionId, runId);
    },
    async exportReport(
      projectId: string,
      transactionId: string,
      runId: string,
      format: 'xlsx' | 'pdf',
    ) {
      const blob = await exportApiReport(projectId, transactionId, runId, format);
      downloadBlob(blob, `api-test-${runId}.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
    },
  },
});
