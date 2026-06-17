import { defineStore } from "pinia";
import { message } from "ant-design-vue";
import {
  DEFAULT_PROJECT_PAGE_SIZE,
  DEFAULT_CASE_FORGE_PAGE_SIZE,
  normalizeProjectPageSize,
  normalizeCaseForgePageSize,
} from "@case-forge/shared";
import {
  batchDeleteProjects,
  createProject,
  createScenarioLibraryItem,
  deleteProject,
  deleteScenarioLibraryItem,
  listProjects,
  listScenarioLibrary,
  updateProject,
  updateScenarioLibraryItem,
  type ProjectListItem,
  type ScenarioLibraryItem,
  type ScenarioLibraryPayload,
} from "@/api/client";
import {
  autoSaveApiDocument,
  createApiCase,
  createApiEnvironment,
  createApiEnvironmentService,
  createApiExecutionSet,
  createApiTransaction,
  deleteApiCase,
  deleteApiEnvironment,
  deleteApiEnvironmentService,
  deleteApiExecutionSet,
  batchDeleteApiTransactions,
  exportApiReport,
  generateApiCases,
  getApiCaseGenerateStatus,
  type ApiCaseGenerateQueueStatus,
  getApiDocument,
  getApiReportSummary,
  getApiRun,
  listApiCases,
  listAllApiCases,
  listApiEnvironments,
  listApiEnvironmentServices,
  listApiExecutionSets,
  listApiRuns,
  listApiTransactions,
  replaceApiExecutionSetCases,
  runApiCases,
  runApiExecutionSet,
  saveApiDocument,
  saveApiDocumentGeneration,
  structureApiDocument,
  updateApiCase,
  updateApiEnvironment,
  updateApiEnvironmentService,
  updateApiTransaction,
  uploadApiDocument,
  downloadBlob,
  type ApiDocDetail,
  type ApiEnvironmentRow,
  type ApiEnvironmentServiceRow,
  type ApiExecutionSetRow,
  type ApiRunDetail,
  type ApiTestCaseRow,
  type ApiTransactionRow,
} from "@/api/apiTestClient";
import {
  applyScenarioLibraryItemInPlace,
  normalizeScenarioLibraryItem,
} from "@/utils/scenarioLibrary";
import {
  getRecentWorkspaceEntry,
  removeApiTestProjectWorkspaceEntries,
  removeRecentWorkspaceEntry,
  setRecentWorkspaceEntry,
  syncLegacyWorkspaceRegistry,
  WORKSPACE_STAGE_REGISTRY,
} from "@/utils/workspaceStageStorage";

const API_CASE_GENERATE_POLL_DELAYS_MS = [
  2000, 3000, 5000, 8000, 10000, 15000, 20000, 30000,
];
const API_CASE_GENERATE_POLL_EXTENDED_DELAYS_MS = [
  30000, 45000, 60000, 90000, 120000,
];

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export type ApiWorkspaceStage =
  | "api-document"
  | "api-cases"
  | "api-runner"
  | "api-report";

const stageKey = (projectId: string, transactionId: string) =>
  `case-forge:api-stage:${projectId}:${transactionId}`;
const activeProjectKey = "case-forge:api-active-project";
const activeTransactionKey = (projectId: string) =>
  `case-forge:api-active-transaction:${projectId}`;

interface State {
  projects: ProjectListItem[];
  projectListPage: number;
  projectListPageSize: number;
  projectListTotal: number;
  projectListKeyword: string;
  activeProjectId: string;
  transactions: ApiTransactionRow[];
  activeTransactionId: string;
  apiDoc: ApiDocDetail | null;
  cases: ApiTestCaseRow[];
  runnerCases: ApiTestCaseRow[];
  caseListPage: number;
  caseListPageSize: number;
  caseListTotal: number;
  environments: ApiEnvironmentRow[];
  environmentServices: Record<string, ApiEnvironmentServiceRow[]>;
  executionSets: ApiExecutionSetRow[];
  executionSetListPage: number;
  executionSetListPageSize: number;
  executionSetListTotal: number;
  activeExecutionSetId: string;
  activeExecutionSet: ApiExecutionSetRow | null;
  runs: ApiRunDetail[];
  activeRun: ApiRunDetail | null;
  selectedCaseIds: string[];
  activeCaseId: string;
  selectedEnvironmentId: string;
  selectedEnvironmentServiceId: string;
  workspaceStage: ApiWorkspaceStage;
  loading: boolean;
  stageLoading: boolean;
  generatingCaseTransactionIds: string[];
  _caseGeneratePollers: Record<string, boolean>;
  running: boolean;
  apiScenarios: ScenarioLibraryItem[];
}

export const useApiTestStore = defineStore("apiTest", {
  state: (): State => ({
    projects: [],
    projectListPage: 1,
    projectListPageSize: DEFAULT_PROJECT_PAGE_SIZE,
    projectListTotal: 0,
    projectListKeyword: "",
    activeProjectId: localStorage.getItem(activeProjectKey) ?? "",
    transactions: [],
    activeTransactionId: "",
    apiDoc: null,
    cases: [],
    runnerCases: [],
    caseListPage: 1,
    caseListPageSize: DEFAULT_CASE_FORGE_PAGE_SIZE,
    caseListTotal: 0,
    environments: [],
    environmentServices: {},
    executionSets: [],
    executionSetListPage: 1,
    executionSetListPageSize: DEFAULT_CASE_FORGE_PAGE_SIZE,
    executionSetListTotal: 0,
    activeExecutionSetId: "",
    activeExecutionSet: null,
    runs: [],
    activeRun: null,
    selectedCaseIds: [],
    activeCaseId: "",
    selectedEnvironmentId: "",
    selectedEnvironmentServiceId: "",
    workspaceStage: "api-document",
    loading: false,
    stageLoading: false,
    generatingCaseTransactionIds: [],
    _caseGeneratePollers: {},
    running: false,
    apiScenarios: [],
  }),
  getters: {
    activeProject(state): ProjectListItem | null {
      return state.projects.find((p) => p.id === state.activeProjectId) ?? null;
    },
    activeTransaction(state): ApiTransactionRow | null {
      return (
        state.transactions.find(
          (item) => item.id === state.activeTransactionId,
        ) ?? null
      );
    },
    inTransactionWorkspace: (state) =>
      Boolean(state.activeProjectId && state.activeTransactionId),
    canEnterCases: (state) => {
      if (state.cases.length > 0 || state.runnerCases.length > 0) {
        return true;
      }
      if ((state.apiDoc?.caseCount ?? 0) > 0) {
        return true;
      }
      return Boolean(state.apiDoc?.canEnterCases);
    },
    canGenerateCases: (state) => Boolean(state.apiDoc?.canGenerateCases),
    canEnterRunner: (state) => {
      const pool =
        state.runnerCases.length > 0 ? state.runnerCases : state.cases;
      if (pool.length) {
        return pool.some((item) => item.enabled);
      }
      return Boolean(state.apiDoc?.canEnterRunner);
    },
    transactionRuns(state): ApiRunDetail[] {
      return state.runs.filter((run) => {
        if (state.activeExecutionSetId) {
          return run.executionSetId === state.activeExecutionSetId;
        }
        if (run.transactionId) {
          return run.transactionId === state.activeTransactionId;
        }
        return true;
      });
    },
  },
  actions: {
    async bootstrap() {
      syncLegacyWorkspaceRegistry(
        WORKSPACE_STAGE_REGISTRY.apiTestStage,
        "case-forge:api-stage:",
      );
      syncLegacyWorkspaceRegistry(
        WORKSPACE_STAGE_REGISTRY.apiTestTransaction,
        "case-forge:api-active-transaction:",
      );
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
    async refreshProjects(options?: {
      page?: number;
      size?: number;
      keyword?: string;
      resetPage?: boolean;
    }) {
      if (options?.keyword !== undefined) {
        this.projectListKeyword = options.keyword;
      }
      if (options?.size !== undefined) {
        this.projectListPageSize = normalizeProjectPageSize(options.size);
      }
      if (options?.resetPage) {
        this.projectListPage = 1;
      } else if (options?.page !== undefined) {
        this.projectListPage = Math.max(1, options.page);
      }

      const fetchPage = async (page: number) =>
        listProjects({
          platform: "api-test",
          page,
          size: this.projectListPageSize,
          input: this.projectListKeyword,
        });

      let result = await fetchPage(this.projectListPage);
      this.projectListTotal = result.count;
      const maxPage = Math.max(
        1,
        Math.ceil(result.count / this.projectListPageSize) || 1,
      );
      if (this.projectListPage > maxPage) {
        this.projectListPage = maxPage;
        result = await fetchPage(maxPage);
      }
      this.projects = result.rows;
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
        platform: "api-test",
      });
      this.activeProjectId = project.id;
      localStorage.setItem(activeProjectKey, project.id);
      this.clearTransactionWorkspace();
      await this.refreshProjects({ resetPage: true, keyword: "" });
      await this.selectProject(project.id, false);
    },
    clearTransactionWorkspace() {
      this.activeTransactionId = "";
      this.apiDoc = null;
      this.cases = [];
      this.runnerCases = [];
      this.caseListPage = 1;
      this.caseListPageSize = DEFAULT_CASE_FORGE_PAGE_SIZE;
      this.caseListTotal = 0;
      this.environments = [];
      this.environmentServices = {};
      this.executionSets = [];
      this.executionSetListPage = 1;
      this.executionSetListPageSize = DEFAULT_CASE_FORGE_PAGE_SIZE;
      this.executionSetListTotal = 0;
      this.activeExecutionSetId = "";
      this.activeExecutionSet = null;
      this.runs = [];
      this.activeRun = null;
      this.selectedCaseIds = [];
      this.activeCaseId = "";
      this.selectedEnvironmentId = "";
      this.selectedEnvironmentServiceId = "";
      this.workspaceStage = "api-document";
    },
    async removeProject(projectId: string) {
      await deleteProject(projectId);
      removeApiTestProjectWorkspaceEntries(projectId);
      await this.refreshProjects();
      if (this.activeProjectId === projectId) {
        const next = this.projects[0];
        if (next) {
          await this.selectProject(next.id, false);
        } else {
          this.activeProjectId = "";
          localStorage.removeItem(activeProjectKey);
          this.transactions = [];
          this.clearTransactionWorkspace();
        }
      }
    },
    async removeProjects(projectIds: string[]) {
      await batchDeleteProjects(projectIds);
      projectIds.forEach((projectId) =>
        removeApiTestProjectWorkspaceEntries(projectId),
      );
      await this.refreshProjects();
      if (projectIds.includes(this.activeProjectId)) {
        const next = this.projects[0];
        if (next) await this.selectProject(next.id, false);
        else {
          this.activeProjectId = "";
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
      const saved = getRecentWorkspaceEntry(
        WORKSPACE_STAGE_REGISTRY.apiTestStage,
        stageKey(projectId, transactionId),
      );
      const validStages: ApiWorkspaceStage[] = [
        "api-document",
        "api-cases",
        "api-runner",
        "api-report",
      ];
      this.workspaceStage = validStages.includes(saved as ApiWorkspaceStage)
        ? (saved as ApiWorkspaceStage)
        : "api-document";
    },
    setWorkspaceStage(
      projectId: string,
      transactionId: string,
      stage: ApiWorkspaceStage,
    ) {
      this.workspaceStage = stage;
      setRecentWorkspaceEntry(
        WORKSPACE_STAGE_REGISTRY.apiTestStage,
        stageKey(projectId, transactionId),
        stage,
      );
    },
    async selectProject(projectId: string, restoreTransaction = true) {
      this.activeProjectId = projectId;
      localStorage.setItem(activeProjectKey, projectId);
      this.clearTransactionWorkspace();
      await this.refreshTransactions(projectId);
      if (restoreTransaction) {
        const savedTx = getRecentWorkspaceEntry(
          WORKSPACE_STAGE_REGISTRY.apiTestTransaction,
          activeTransactionKey(projectId),
        );
        if (savedTx && this.transactions.some((item) => item.id === savedTx)) {
          await this.selectTransaction(savedTx);
        }
      }
    },
    async refreshTransactions(projectId: string) {
      this.transactions = await listApiTransactions(projectId);
    },
    async createTransaction(payload: {
      code: string;
      name: string;
      description?: string;
    }) {
      if (!this.activeProjectId) return;
      const row = await createApiTransaction(this.activeProjectId, payload);
      await this.refreshTransactions(this.activeProjectId);
      await this.selectTransaction(row.id);
      message.success("交易码已创建");
    },
    async updateTransactionInfo(
      transactionId: string,
      payload: { code: string; name: string; description?: string },
    ) {
      if (!this.activeProjectId) return;
      await updateApiTransaction(this.activeProjectId, transactionId, payload);
      await this.refreshTransactions(this.activeProjectId);
      message.success("交易码已更新");
    },
    async removeTransaction(transactionId: string) {
      await this.removeTransactions([transactionId]);
    },
    async removeTransactions(transactionIds: string[]) {
      if (!this.activeProjectId) return;
      const ids = [...new Set(transactionIds.filter(Boolean))];
      if (!ids.length) return;
      const result = await batchDeleteApiTransactions(
        this.activeProjectId,
        ids,
      );
      await this.refreshTransactions(this.activeProjectId);
      for (const transactionId of ids) {
        removeRecentWorkspaceEntry(
          WORKSPACE_STAGE_REGISTRY.apiTestStage,
          stageKey(this.activeProjectId, transactionId),
        );
      }
      if (ids.includes(this.activeTransactionId)) {
        this.clearTransactionWorkspace();
        removeRecentWorkspaceEntry(
          WORKSPACE_STAGE_REGISTRY.apiTestTransaction,
          activeTransactionKey(this.activeProjectId),
        );
      }
      message.success(`已删除 ${result.count} 条交易码`);
    },
    async selectTransaction(transactionId: string) {
      if (!this.activeProjectId) return;
      this.activeTransactionId = transactionId;
      setRecentWorkspaceEntry(
        WORKSPACE_STAGE_REGISTRY.apiTestTransaction,
        activeTransactionKey(this.activeProjectId),
        transactionId,
      );
      await this.loadTransactionWorkspace(this.activeProjectId, transactionId);
    },
    exitTransactionWorkspace() {
      if (!this.activeProjectId) return;
      this.clearTransactionWorkspace();
      removeRecentWorkspaceEntry(
        WORKSPACE_STAGE_REGISTRY.apiTestTransaction,
        activeTransactionKey(this.activeProjectId),
      );
    },
    async loadTransactionWorkspace(projectId: string, transactionId: string) {
      this.restoreStage(projectId, transactionId);
      this.apiDoc = null;
      this.cases = [];
      this.runnerCases = [];
      this.caseListPage = 1;
      this.caseListPageSize = DEFAULT_CASE_FORGE_PAGE_SIZE;
      this.caseListTotal = 0;
      this.environments = [];
      this.environmentServices = {};
      this.executionSets = [];
      this.executionSetListPage = 1;
      this.executionSetListPageSize = DEFAULT_CASE_FORGE_PAGE_SIZE;
      this.executionSetListTotal = 0;
      this.activeExecutionSetId = "";
      this.activeExecutionSet = null;
      this.runs = [];
      this.activeRun = null;
      this.selectedCaseIds = [];
      this.activeCaseId = "";
      this.selectedEnvironmentId = "";
      this.selectedEnvironmentServiceId = "";
      await this.loadWorkspaceStage(
        projectId,
        transactionId,
        this.workspaceStage,
      );
    },
    async loadWorkspaceStage(
      projectId: string,
      transactionId: string,
      stage: ApiWorkspaceStage = this.workspaceStage,
    ) {
      this.stageLoading = true;
      try {
        switch (stage) {
          case "api-document":
            await this.loadDocumentStage(projectId, transactionId);
            break;
          case "api-cases":
            await this.loadCasesStage(projectId, transactionId);
            break;
          case "api-runner":
            await this.loadRunnerStage(projectId, transactionId);
            break;
          case "api-report":
            await this.loadReportStage(projectId);
            break;
        }
      } finally {
        this.stageLoading = false;
      }
    },
    async loadDocumentStage(projectId: string, transactionId: string) {
      try {
        this.apiDoc = await getApiDocument(projectId, transactionId);
      } catch {
        this.apiDoc = null;
        message.error("接口文档加载失败，请刷新页面或重启 API");
      }
      await this.loadApiScenarioLibrary().catch(() => undefined);
    },
    async loadCasesStage(projectId: string, transactionId: string) {
      const doc = this.apiDoc
        ? this.apiDoc
        : await getApiDocument(projectId, transactionId).catch(() => null);
      if (doc) {
        this.apiDoc = doc;
      }
      await this.refreshCases(projectId, transactionId, { resetPage: true });
    },
    async loadRunnerStage(projectId: string, transactionId: string) {
      const [doc, _, envs] = await Promise.all([
        this.apiDoc
          ? Promise.resolve(this.apiDoc)
          : getApiDocument(projectId, transactionId).catch(() => null),
        this.refreshRunnerCases(projectId, transactionId),
        listApiEnvironments(projectId),
        this.refreshExecutionSets(projectId, transactionId, {
          resetPage: true,
        }),
      ]);
      if (doc) {
        this.apiDoc = doc;
      }
      this.environments = envs;
      this.ensureSelectedEnvironment();
      this.selectedEnvironmentServiceId = "";
    },
    async loadReportStage(projectId: string) {
      const transactionId = this.activeTransactionId;
      const [doc, runs] = await Promise.all([
        this.apiDoc
          ? Promise.resolve(this.apiDoc)
          : transactionId
            ? getApiDocument(projectId, transactionId).catch(() => null)
            : Promise.resolve(null),
        listApiRuns(projectId),
      ]);
      if (doc) {
        this.apiDoc = doc;
      }
      this.runs = runs;
      if (
        this.activeRun &&
        !this.runs.some((run) => run.id === this.activeRun?.id)
      ) {
        this.activeRun = null;
      }
    },
    async uploadDocument(
      projectId: string,
      transactionId: string,
      file: File,
      force = false,
    ) {
      this.loading = true;
      try {
        this.apiDoc = await uploadApiDocument(
          projectId,
          transactionId,
          file,
          force,
        );
        this.apiDoc = await structureApiDocument(projectId, transactionId);
        message.success("接口文档已上传并完成结构化");
      } finally {
        this.loading = false;
      }
    },
    async structureDocument(projectId: string, transactionId: string) {
      this.loading = true;
      try {
        this.apiDoc = await structureApiDocument(projectId, transactionId);
        message.success("接口文档结构化完成");
      } finally {
        this.loading = false;
      }
    },
    async saveDocument(
      projectId: string,
      transactionId: string,
      markdown: string,
    ) {
      if (!this.apiDoc) return;
      this.apiDoc = await saveApiDocument(projectId, transactionId, {
        structuredMarkdown: markdown,
        endpoints: this.apiDoc.endpoints,
      });
      message.success("接口文档已保存");
    },
    async autoSave(
      projectId: string,
      transactionId: string,
      markdown: string,
      options?: { successMessage?: string },
    ) {
      this.apiDoc = await autoSaveApiDocument(
        projectId,
        transactionId,
        markdown,
      );
      if (options?.successMessage) {
        message.success(options.successMessage);
      }
    },
    async refreshCases(
      projectId: string,
      transactionId: string,
      options?: { page?: number; pageSize?: number; resetPage?: boolean },
    ) {
      if (options?.resetPage) {
        this.caseListPage = 1;
      }
      const page = options?.page ?? this.caseListPage;
      const pageSize = normalizeCaseForgePageSize(
        options?.pageSize ?? this.caseListPageSize,
      );
      const result = await listApiCases(projectId, transactionId, {
        page,
        pageSize,
      });
      const maxPage = Math.max(1, Math.ceil(result.count / pageSize) || 1);
      if (result.count > 0 && page > maxPage) {
        await this.refreshCases(projectId, transactionId, {
          page: maxPage,
          pageSize,
        });
        return;
      }
      this.cases = result.rows;
      this.caseListTotal = result.count;
      this.caseListPage = result.page;
      this.caseListPageSize = result.pageSize;
      if (
        this.activeCaseId &&
        !this.cases.some((item) => item.id === this.activeCaseId)
      ) {
        this.activeCaseId = this.cases[0]?.id ?? "";
      }
    },
    async refreshRunnerCases(projectId: string, transactionId: string) {
      this.runnerCases = await listAllApiCases(projectId, transactionId);
    },
    async generateCases(
      projectId: string,
      transactionId: string,
      options?: {
        endpointIds?: string[];
        promptIds?: string[];
        /** 生成成功后是否进入案例编辑，默认 true */
        navigateToCases?: boolean;
      },
    ) {
      this.markCaseGenerateStarted(transactionId);
      if (this._caseGeneratePollers[transactionId]) {
        return getApiCaseGenerateStatus(projectId, transactionId);
      }
      this._caseGeneratePollers = {
        ...this._caseGeneratePollers,
        [transactionId]: true,
      };
      try {
        await generateApiCases(projectId, transactionId, options);
        const status = await this.pollApiCaseGenerateOutcome(
          projectId,
          transactionId,
        );
        if (status.phase === "completed") {
          if (this.activeTransactionId === transactionId) {
            this.apiDoc = await getApiDocument(projectId, transactionId).catch(
              () => this.apiDoc,
            );
            await this.refreshCases(projectId, transactionId, {
              resetPage: true,
            });
            if (this.cases[0]?.id) {
              this.activeCaseId = this.cases[0].id;
            }
          }
          const count = status.resultCount ?? 0;
          const shouldNavigate =
            (options?.navigateToCases ?? true) && count > 0;
          if (shouldNavigate) {
            this.setWorkspaceStage(projectId, transactionId, "api-cases");
            if (
              this.activeProjectId === projectId &&
              this.activeTransactionId === transactionId
            ) {
              await this.loadWorkspaceStage(
                projectId,
                transactionId,
                "api-cases",
              );
            }
            message.success(`已生成 ${count} 条案例，已进入案例编辑`);
          } else if (count > 0) {
            message.success(`已生成 ${count} 条案例`);
          } else {
            message.success("案例生成已完成");
          }
          return status;
        }
        if (status.phase === "failed" || status.phase === "cancelled") {
          message.error(
            status.errorMessage?.trim() || "案例生成失败，请稍后重试",
          );
        }
        return status;
      } finally {
        this.markCaseGenerateEnded(transactionId);
        const { [transactionId]: _removed, ...rest } =
          this._caseGeneratePollers;
        this._caseGeneratePollers = rest;
      }
    },
    async pollApiCaseGenerateOutcome(
      projectId: string,
      transactionId: string,
    ): Promise<ApiCaseGenerateQueueStatus> {
      const delays = [
        ...API_CASE_GENERATE_POLL_DELAYS_MS,
        ...API_CASE_GENERATE_POLL_EXTENDED_DELAYS_MS,
      ];
      for (const delay of delays) {
        await sleep(delay);
        const status = await getApiCaseGenerateStatus(projectId, transactionId);
        if (
          status.phase === "completed" ||
          status.phase === "failed" ||
          status.phase === "cancelled"
        ) {
          return status;
        }
      }
      return getApiCaseGenerateStatus(projectId, transactionId);
    },
    async saveDocumentGenerationPrompts(
      projectId: string,
      transactionId: string,
      promptIds: string[],
    ) {
      this.apiDoc = await saveApiDocumentGeneration(
        projectId,
        transactionId,
        promptIds,
      );
    },
    isGeneratingCases(transactionId: string) {
      return this.generatingCaseTransactionIds.includes(transactionId);
    },
    markCaseGenerateStarted(transactionId: string) {
      if (!this.generatingCaseTransactionIds.includes(transactionId)) {
        this.generatingCaseTransactionIds = [
          ...this.generatingCaseTransactionIds,
          transactionId,
        ];
      }
    },
    markCaseGenerateEnded(transactionId: string) {
      this.generatingCaseTransactionIds =
        this.generatingCaseTransactionIds.filter((id) => id !== transactionId);
    },
    async syncCaseGenerateLoading(projectId: string, transactionId: string) {
      try {
        const status = await getApiCaseGenerateStatus(projectId, transactionId);
        if (status.phase === "queued" || status.phase === "running") {
          this.markCaseGenerateStarted(transactionId);
          if (!this._caseGeneratePollers[transactionId]) {
            void this.waitCaseGenerateFinish(projectId, transactionId);
          }
        }
      } catch {
        // ignore status probe errors
      }
    },
    async waitCaseGenerateFinish(projectId: string, transactionId: string) {
      if (this._caseGeneratePollers[transactionId]) {
        return;
      }
      this._caseGeneratePollers = {
        ...this._caseGeneratePollers,
        [transactionId]: true,
      };
      try {
        const status = await this.pollApiCaseGenerateOutcome(
          projectId,
          transactionId,
        );
        if (
          status.phase === "completed" &&
          this.activeTransactionId === transactionId
        ) {
          this.apiDoc = await getApiDocument(projectId, transactionId).catch(
            () => this.apiDoc,
          );
          await this.refreshCases(projectId, transactionId, {
            resetPage: true,
          });
        } else if (status.phase === "failed" || status.phase === "cancelled") {
          message.error(
            status.errorMessage?.trim() || "案例生成失败，请稍后重试",
          );
        }
      } finally {
        this.markCaseGenerateEnded(transactionId);
        const { [transactionId]: _removed, ...rest } =
          this._caseGeneratePollers;
        this._caseGeneratePollers = rest;
      }
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
      await Promise.all([
        this.refreshCases(projectId, transactionId),
        this.refreshRunnerCases(projectId, transactionId),
      ]);
      message.success("案例已保存");
    },
    async removeCase(projectId: string, transactionId: string, caseId: string) {
      await deleteApiCase(projectId, transactionId, caseId);
      this.selectedCaseIds = this.selectedCaseIds.filter((id) => id !== caseId);
      if (this.activeCaseId === caseId) {
        this.activeCaseId = "";
      }
      await Promise.all([
        this.refreshCases(projectId, transactionId),
        this.refreshRunnerCases(projectId, transactionId),
        this.refreshExecutionSets(projectId, transactionId),
      ]);
    },
    async removeCases(
      projectId: string,
      transactionId: string,
      caseIds: string[],
    ) {
      if (!caseIds.length) return;
      for (const caseId of caseIds) {
        await deleteApiCase(projectId, transactionId, caseId);
      }
      this.selectedCaseIds = this.selectedCaseIds.filter(
        (id) => !caseIds.includes(id),
      );
      if (caseIds.includes(this.activeCaseId)) {
        this.activeCaseId = "";
      }
      await Promise.all([
        this.refreshCases(projectId, transactionId),
        this.refreshRunnerCases(projectId, transactionId),
        this.refreshExecutionSets(projectId, transactionId),
      ]);
      message.success(`已删除 ${caseIds.length} 条案例`);
    },
    toggleCaseSelection(caseId: string, checked: boolean) {
      if (checked) {
        if (!this.selectedCaseIds.includes(caseId)) {
          this.selectedCaseIds.push(caseId);
        }
      } else {
        this.selectedCaseIds = this.selectedCaseIds.filter(
          (id) => id !== caseId,
        );
      }
    },
    async refreshEnvironments(projectId: string) {
      this.environments = await listApiEnvironments(projectId);
      this.ensureSelectedEnvironment();
    },
    /** 确保已选中有效环境；无环境时返回 false */
    ensureSelectedEnvironment(): boolean {
      if (!this.environments.length) {
        this.selectedEnvironmentId = "";
        return false;
      }
      const current = this.environments.find(
        (item) => item.id === this.selectedEnvironmentId,
      );
      if (current?.enabled) {
        return true;
      }
      const fallback =
        this.environments.find((item) => item.isDefault && item.enabled) ??
        this.environments.find((item) => item.enabled) ??
        this.environments[0];
      this.selectedEnvironmentId = fallback?.id ?? "";
      return Boolean(this.selectedEnvironmentId);
    },
    async saveEnvironment(
      projectId: string,
      payload: Record<string, unknown>,
      id?: string,
    ) {
      if (id) {
        await updateApiEnvironment(projectId, id, payload);
      } else {
        await createApiEnvironment(projectId, payload);
      }
      await this.refreshEnvironments(projectId);
      message.success("环境已保存");
    },
    async removeEnvironment(projectId: string, id: string) {
      await deleteApiEnvironment(projectId, id);
      delete this.environmentServices[id];
      await this.refreshEnvironments(projectId);
    },
    async refreshEnvironmentServices(projectId: string, environmentId: string) {
      this.environmentServices[environmentId] =
        await listApiEnvironmentServices(projectId, environmentId);
    },
    async saveEnvironmentService(
      projectId: string,
      environmentId: string,
      payload: Record<string, unknown>,
      serviceId?: string,
    ) {
      if (serviceId) {
        await updateApiEnvironmentService(
          projectId,
          environmentId,
          serviceId,
          payload,
        );
      } else {
        await createApiEnvironmentService(projectId, environmentId, payload);
      }
      await this.refreshEnvironmentServices(projectId, environmentId);
      message.success("环境服务已保存");
    },
    async removeEnvironmentService(
      projectId: string,
      environmentId: string,
      serviceId: string,
    ) {
      await deleteApiEnvironmentService(projectId, environmentId, serviceId);
      await this.refreshEnvironmentServices(projectId, environmentId);
    },
    async refreshExecutionSets(
      projectId: string,
      transactionId: string,
      options?: { page?: number; pageSize?: number; resetPage?: boolean },
    ) {
      if (options?.resetPage) {
        this.executionSetListPage = 1;
      }
      const page = options?.page ?? this.executionSetListPage;
      const pageSize = normalizeCaseForgePageSize(
        options?.pageSize ?? this.executionSetListPageSize,
      );
      const result = await listApiExecutionSets(projectId, transactionId, {
        page,
        pageSize,
      });
      const maxPage = Math.max(1, Math.ceil(result.count / pageSize) || 1);
      if (result.count > 0 && page > maxPage) {
        await this.refreshExecutionSets(projectId, transactionId, {
          page: maxPage,
          pageSize,
        });
        return;
      }
      this.executionSets = result.rows;
      this.executionSetListTotal = result.count;
      this.executionSetListPage = result.page;
      this.executionSetListPageSize = result.pageSize;

      if (this.activeExecutionSetId) {
        const found = result.rows.find(
          (item) => item.id === this.activeExecutionSetId,
        );
        if (found) {
          this.activeExecutionSet = found;
        }
      } else if (result.rows[0]) {
        this.selectExecutionSet(result.rows[0].id);
      } else {
        this.activeExecutionSet = null;
      }
    },
    selectExecutionSet(setId: string) {
      this.activeExecutionSetId = setId;
      const found =
        this.executionSets.find((item) => item.id === setId) ??
        (this.activeExecutionSet?.id === setId
          ? this.activeExecutionSet
          : null);
      if (found) {
        this.activeExecutionSet = found;
      }
    },
    async createExecutionSet(
      projectId: string,
      transactionId: string,
      payload: { name: string; description?: string },
    ) {
      const set = await createApiExecutionSet(
        projectId,
        transactionId,
        payload,
      );
      await this.refreshExecutionSets(projectId, transactionId, {
        resetPage: true,
      });
      this.activeExecutionSetId = set.id;
      this.activeExecutionSet = {
        ...set,
        caseCount: 0,
        caseIds: [],
      };
      message.success("执行集已创建");
    },
    async removeExecutionSet(
      projectId: string,
      transactionId: string,
      setId: string,
    ) {
      await deleteApiExecutionSet(projectId, transactionId, setId);
      if (this.activeExecutionSetId === setId) {
        this.activeExecutionSetId = "";
        this.activeExecutionSet = null;
        this.activeRun = null;
      }
      await this.refreshExecutionSets(projectId, transactionId);
      message.success("执行集已删除");
    },
    async removeExecutionSets(
      projectId: string,
      transactionId: string,
      setIds: string[],
    ) {
      if (!setIds.length) return;
      for (const setId of setIds) {
        await deleteApiExecutionSet(projectId, transactionId, setId);
      }
      if (setIds.includes(this.activeExecutionSetId)) {
        this.activeExecutionSetId = "";
        this.activeExecutionSet = null;
        this.activeRun = null;
      }
      await this.refreshExecutionSets(projectId, transactionId);
      message.success(`已删除 ${setIds.length} 个执行集`);
    },
    async replaceExecutionSetCases(
      projectId: string,
      transactionId: string,
      setId: string,
      caseIds: string[],
    ) {
      const result = await replaceApiExecutionSetCases(
        projectId,
        transactionId,
        setId,
        caseIds,
      );
      const nextCaseIds = result.caseIds;
      const patch = {
        caseIds: nextCaseIds,
        caseCount: result.caseCount,
      };
      if (this.activeExecutionSet?.id === setId) {
        this.activeExecutionSet = {
          ...this.activeExecutionSet,
          ...patch,
        };
      }
      const index = this.executionSets.findIndex((set) => set.id === setId);
      if (index >= 0) {
        this.executionSets[index] = {
          ...this.executionSets[index],
          ...patch,
        };
      }
      await this.refreshExecutionSets(projectId, transactionId);
      message.success("执行集案例已更新");
    },
    async runExecutionSet(
      projectId: string,
      transactionId: string,
      setId: string,
      options: {
        environmentId: string;
        environmentServiceId?: string;
        encoding: string;
        concurrency?: number;
      },
    ) {
      this.running = true;
      try {
        const run = await runApiExecutionSet(projectId, transactionId, setId, {
          environmentId: options.environmentId,
          environmentServiceId: options.environmentServiceId,
          encoding: options.encoding,
          concurrency: options.concurrency ?? 5,
        });
        this.selectedEnvironmentId = options.environmentId;
        this.selectedEnvironmentServiceId = options.environmentServiceId ?? "";
        this.activeRun = run;
        this.runs = await listApiRuns(projectId);
        await this.refreshExecutionSets(projectId, transactionId);
        message.success(
          `执行完成：通过 ${run.passedCount} / ${run.totalCount}`,
        );
        return run;
      } finally {
        this.running = false;
      }
    },
    async executeCases(
      projectId: string,
      transactionId: string,
      caseIds: string[],
    ) {
      if (!this.selectedEnvironmentId) {
        message.warning("请先选择执行环境");
        return;
      }
      this.running = true;
      try {
        const run = await runApiCases(projectId, transactionId, {
          caseIds,
          environmentId: this.selectedEnvironmentId,
          environmentServiceId: this.selectedEnvironmentServiceId || undefined,
          concurrency: 5,
        });
        this.activeRun = run;
        this.runs = await listApiRuns(projectId);
        message.success(
          `执行完成：通过 ${run.passedCount} / ${run.totalCount}`,
        );
        return run;
      } finally {
        this.running = false;
      }
    },
    async loadRun(projectId: string, runId: string) {
      this.activeRun = await getApiRun(projectId, runId);
    },
    async loadReportSummary(
      projectId: string,
      transactionId: string,
      runId?: string,
    ) {
      return getApiReportSummary(projectId, transactionId, runId);
    },
    async loadApiScenarioLibrary() {
      const scenarios = await listScenarioLibrary("api");
      this.apiScenarios = scenarios.map((item) =>
        normalizeScenarioLibraryItem(item),
      );
    },
    async saveApiScenario(
      item: Partial<ScenarioLibraryPayload> & {
        id?: string;
        name: string;
        description: string;
        category: string;
        isActive: boolean;
      },
      options?: { successMessage?: string; silent?: boolean },
    ) {
      const saved = item.id
        ? await updateScenarioLibraryItem(item.id, {
            name: item.name,
            description: item.description,
            category: item.category,
            isActive: item.isActive,
            ...(item.prompts !== undefined ? { prompts: item.prompts } : {}),
          })
        : await createScenarioLibraryItem({
            scope: "api",
            name: item.name,
            description: item.description,
            category: item.category,
            isActive: item.isActive,
            prompts: item.prompts ?? [],
          });
      const normalized = normalizeScenarioLibraryItem(saved);
      const index = this.apiScenarios.findIndex(
        (scenario) => scenario.id === normalized.id,
      );
      if (index >= 0) {
        applyScenarioLibraryItemInPlace(this.apiScenarios[index], normalized);
      } else {
        this.apiScenarios.unshift(normalized);
      }
      if (!options?.silent) {
        message.success(options?.successMessage ?? "已保存");
      }
      return normalized;
    },
    async deleteApiScenario(id: string) {
      await deleteScenarioLibraryItem(id);
      this.apiScenarios = this.apiScenarios.filter((item) => item.id !== id);
      message.success("场景库已删除");
    },
    async exportReport(
      projectId: string,
      transactionId: string,
      runId: string,
      format: "xlsx" | "pdf",
    ) {
      const blob = await exportApiReport(
        projectId,
        transactionId,
        runId,
        format,
      );
      downloadBlob(
        blob,
        `api-test-${runId}.${format === "pdf" ? "pdf" : "xlsx"}`,
      );
    },
  },
});
