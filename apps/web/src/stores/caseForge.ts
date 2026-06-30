import { defineStore } from "pinia";
import { message } from "ant-design-vue";
import type {
  CaseForgeProject,
  CaseTreeNode,
  GenerationRun,
  GenerationRunSummary,
} from "@case-forge/shared";
import {
  cloneCaseTree,
  DEFAULT_CASE_FORGE_PAGE_SIZE,
  DEFAULT_PROJECT_PAGE_SIZE,
  normalizeCaseForgePageSize,
  normalizeProjectPageSize,
} from "@case-forge/shared";
import {
  autoSaveStructDoc,
  batchSaveDynamicTestPointInstruction,
  cancelCaseGenerate,
  createProject,
  createScenarioLibraryItem,
  batchDeleteProjects,
  createDynamicTestPoint,
  deleteDynamicTestPoints,
  deleteProject,
  deleteStructDoc,
  deleteScenarioLibraryItem,
  generateCases,
  getDynamicTestPointInstruction,
  getDynamicTestPointMeta,
  getGenerateQueueStatus,
  fetchProjectDetail,
  getProjectStructDocs,
  getStructDoc,
  getRun,
  listRunSummaries,
  listDynamicTestPoints,
  listGeneratingDynamicTestPoints,
  listProjects,
  listScenarioLibrary,
  regenerateNode,
  saveDynamicTestPointInstruction,
  saveRunTree,
  saveStructDocTestPoints,
  cancelStructureRequirement,
  structureRequirement,
  updateDynamicTestPointDefinition,
  updateProject,
  updateScenarioLibraryItem,
  uploadStructDocRequirement,
  type ProjectListItem,
  type PromptLibraryItem,
  type ScenarioLibraryPayload,
  type ScenarioLibraryItem,
  type StructDocDetail,
  type TestPointInstructionItem,
  type TestPointSummaryItem,
  type CaseGenerateQueueItemStatus,
} from "@/api/client";
import {
  DEFAULT_TEST_POINT_PAGE_SIZE,
  mergeTestPointInstruction,
  toTestPointSummary,
} from "@/utils/testPointMerge";
import {
  isTestPointDefinitionComplete,
  testPointDefinitionLabel,
} from "@/utils/testPointDefinition";
import {
  getRecentWorkspaceEntry,
  removeRecentWorkspaceEntry,
  setRecentWorkspaceEntry,
  syncLegacyWorkspaceRegistry,
  WORKSPACE_STAGE_REGISTRY,
} from "@/utils/workspaceStageStorage";

export type WorkspaceStage = "document" | "constraints" | "workbench";

/** 前端报错后轮询服务端真实状态（AI 生成可能仍在进行） */
const GENERATE_POLL_DELAYS_MS = [
  2000, 3000, 5000, 8000, 10000, 15000, 20000, 30000,
];
/** 长任务追加轮询：避免尚未完成却被误标为失败 */
const GENERATE_POLL_EXTENDED_DELAYS_MS = [
  30000, 30000, 45000, 60000, 60000, 90000, 90000, 120000,
];
const GENERATE_QUEUE_POLL_INTERVAL_MS = 3000;

type DynamicWorkspaceLoadOptions = {
  /** 默认 true；仅刷新测试要点列表时可设为 false */
  refreshScenarios?: boolean;
  /** 仅在进入项目等时机恢复「遗留生成中」状态，避免生成期间反复轮询 */
  recoverOrphans?: boolean;
};

let inFlightDynamicWorkspaceLoad: Promise<void> | null = null;
let inFlightTestPointsRefresh: Promise<void> | null = null;
let generateQueuePollTimer: ReturnType<typeof setInterval> | null = null;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

interface State {
  projects: ProjectListItem[];
  projectListPage: number;
  projectListPageSize: number;
  projectListTotal: number;
  projectListKeyword: string;
  activeProject: CaseForgeProject | null;
  /** 案例运行摘要（不含案例树），编辑台按需 GET .../runs/:runId 拉整树 */
  runSummaries: GenerationRunSummary[];
  structDocs: StructDocDetail[];
  activeStructDocId: string | null;
  activeStructDoc: StructDocDetail | null;
  activeRun: GenerationRun | null;
  /** 已加载完整案例树的 runId */
  activeRunTreeLoadedForId: string | null;
  activeRunLoading: boolean;
  selectedNodeId: string;
  workspaceStage: WorkspaceStage;
  loading: boolean;
  structuringPollTimer: ReturnType<typeof setInterval> | null;
  structuringPollProjectId: string | null;
  scenarios: ScenarioLibraryItem[];
  testPoints: TestPointSummaryItem[];
  testPointTotal: number;
  testPointListPage: number;
  testPointListPageSize: number;
  testPointSystemFilter: string;
  testPointSystems: string[];
  testPointFeatureModuleFilter: string;
  testPointFeatureModules: string[];
  testPointDefinitionSamples: TestPointSummaryItem[];
  testPointDetails: Record<string, TestPointInstructionItem>;
  testPointDetailLoadingIds: string[];
  selectedTestPointIds: string[];
  /** 本地新增但尚未保存到后端的测试要点 ID */
  newTestPointIds: string[];
  /** 当前前端正在请求生成的测试要点 ID，用于区分「真在生成」与「卡住」 */
  generatingTestPointIds: string[];
  /** 批量生成进度（非阻塞提示，不用 message.loading 遮罩） */
  batchGenerateProgress: { finished: number; total: number } | null;
  /** 案例树保存中（仅编辑台保存按钮，不锁整个工作区） */
  treeSaving: boolean;
  /** 已为该测试要点启动的结果轮询（防止 load 时重复开多条 poll） */
  pollingGenerateTestPointIds: string[];
  /** 案例生成队列 ETA（按测试要点 ID 索引） */
  generateQueueByTestPointId: Record<string, CaseGenerateQueueItemStatus>;
}

const stageStoragePrefix = "case-forge:workspace-stage:";

export const useCaseForgeStore = defineStore("caseForge", {
  state: (): State => ({
    projects: [],
    projectListPage: 1,
    projectListPageSize: DEFAULT_PROJECT_PAGE_SIZE,
    projectListTotal: 0,
    projectListKeyword: "",
    activeProject: null,
    runSummaries: [],
    structDocs: [],
    activeStructDocId: null,
    activeStructDoc: null,
    activeRun: null,
    activeRunTreeLoadedForId: null,
    activeRunLoading: false,
    selectedNodeId: "",
    workspaceStage: "document",
    loading: false,
    structuringPollTimer: null,
    structuringPollProjectId: null,
    scenarios: [],
    testPoints: [],
    testPointTotal: 0,
    testPointListPage: 1,
    testPointListPageSize: DEFAULT_TEST_POINT_PAGE_SIZE,
    testPointSystemFilter: "",
    testPointSystems: [],
    testPointFeatureModuleFilter: "",
    testPointFeatureModules: [],
    testPointDefinitionSamples: [],
    testPointDetails: {},
    testPointDetailLoadingIds: [],
    selectedTestPointIds: [],
    newTestPointIds: [],
    generatingTestPointIds: [],
    batchGenerateProgress: null,
    treeSaving: false,
    pollingGenerateTestPointIds: [],
    generateQueueByTestPointId: {},
  }),
  getters: {
    isStructuring(state): boolean {
      return state.structDocs.some((d) => d.structuringStatus === "processing");
    },
    activeStructDoc(state): StructDocDetail | null {
      if (!state.activeStructDocId) return null;
      return (
        state.structDocs.find((d) => d.id === state.activeStructDocId) ?? null
      );
    },
    selectedNode(state): CaseTreeNode | null {
      if (!state.activeRun || !state.selectedNodeId) {
        return null;
      }
      return findNode(state.activeRun.tree, state.selectedNodeId);
    },
    mergedTestPoint(state) {
      return (testPointId: string): TestPointInstructionItem | null => {
        const summary =
          state.testPoints.find((item) => item.id === testPointId) ||
          state.testPointDefinitionSamples.find(
            (item) => item.id === testPointId,
          ) ||
          null;
        return mergeTestPointInstruction(
          summary,
          state.testPointDetails[testPointId],
        );
      };
    },
    hasTestPointsInProject(state): boolean {
      return state.testPointDefinitionSamples.length > 0;
    },
    primaryRunSummary(state) {
      return state.runSummaries[0] ?? null;
    },
    hasProjectRuns(state): boolean {
      return state.runSummaries.length > 0;
    },
    workbenchTitle(state): string {
      return (
        state.activeRun?.tree.title ??
        state.runSummaries[0]?.title ??
        "在线编辑案例树并导出"
      );
    },
  },
  actions: {
    async bootstrap() {
      syncLegacyWorkspaceRegistry(
        WORKSPACE_STAGE_REGISTRY.caseForgeProject,
        stageStoragePrefix,
      );
      this.loading = true;
      try {
        await this.refreshProjects();
        if (this.projects.length) {
          await this.selectProject(this.projects[0].id);
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
          platform: "case-forge",
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
    /** 刷新侧边栏列表，使当前编辑项目按 updatedAt 排到最前 */
    async bumpSidebarProjectOrder(projectId?: string) {
      const id = projectId ?? this.activeProject?.id;
      if (!id) {
        return;
      }
      await this.refreshProjects();
    },
    async newProject(payload?: {
      title?: string;
      description?: string;
      requirementNo?: string;
    }) {
      this.stopStructuringPoll();
      const project = await createProject({
        ...payload,
        platform: "case-forge",
      });
      this.activeProject = project;
      this.runSummaries = [];
      this.structDocs = [];
      this.activeStructDocId = null;
      this.activeStructDoc = null;
      this.activeRun = null;
      this.activeRunTreeLoadedForId = null;
      this.selectedNodeId = "";
      this.scenarios = [];
      this.resetTestPointWorkspaceState();
      this.setWorkspaceStage("document");
      await this.refreshProjects({ resetPage: true, keyword: "" });
    },
    async selectProject(projectId: string) {
      this.stopStructuringPoll();
      if (this.activeProject?.id !== projectId) {
        this.structDocs = [];
        this.runSummaries = [];
        this.activeRun = null;
        this.activeRunTreeLoadedForId = null;
        this.selectedNodeId = "";
        this.resetTestPointWorkspaceState();
      }
      this.activeStructDocId = null;
      this.activeStructDoc = null;
      this.workspaceStage = "document";
      saveProjectStage(projectId, "document");
      await this.fetchActiveProject(projectId);
      await this.ensureStructDocGate(projectId);
      await this.refreshWorkspaceStageData(this.workspaceStage, {
        recoverOrphans: true,
      });
    },
    applyActiveProject(project: CaseForgeProject) {
      this.activeProject = project;
    },
    async fetchActiveProject(projectId: string) {
      const project = await fetchProjectDetail(projectId);
      this.applyActiveProject(project);
      return project;
    },
    /** 阶段切换门槛：轻量 struct-doc（不含测试要点列表） */
    async ensureStructDocGate(projectId: string) {
      if (
        this.activeProject?.id === projectId &&
        this.structDocs.length &&
        this.structDocs.every((d) => d.canEnterDynamicInstruct !== undefined)
      ) {
        return;
      }
      const docs = await getProjectStructDocs(projectId, {
        includeTestPoints: false,
      });
      if (this.activeProject?.id === projectId) {
        this.structDocs = docs;
      }
    },
    syncActiveRunWithSummaries() {
      const summary = this.runSummaries[0] ?? null;
      if (!summary) {
        this.activeRun = null;
        this.activeRunTreeLoadedForId = null;
        this.selectedNodeId = "";
        return;
      }
      if (this.activeRunTreeLoadedForId !== summary.id) {
        this.activeRun = null;
        this.activeRunTreeLoadedForId = null;
        this.selectedNodeId = "";
      }
    },
    async refreshRunSummaries(projectId?: string) {
      const id = projectId ?? this.activeProject?.id;
      if (!id) {
        this.runSummaries = [];
        return [];
      }
      this.runSummaries = await listRunSummaries(id);
      return this.runSummaries;
    },
    async loadActiveRun(options?: { force?: boolean; runId?: string }) {
      const project = this.activeProject;
      const projectId = project?.id;
      if (!projectId || !project) {
        this.activeRun = null;
        this.activeRunTreeLoadedForId = null;
        return null;
      }
      const summary =
        (options?.runId
          ? this.runSummaries.find((run) => run.id === options.runId)
          : this.primaryRunSummary) ?? null;
      if (!summary) {
        this.activeRun = null;
        this.activeRunTreeLoadedForId = null;
        this.selectedNodeId = "";
        return null;
      }
      const needsLoad =
        options?.force ||
        !this.activeRun ||
        this.activeRun.id !== summary.id ||
        this.activeRunTreeLoadedForId !== summary.id;
      if (!needsLoad) {
        return this.activeRun;
      }
      this.activeRunLoading = true;
      try {
        const run = await getRun(projectId, summary.id);
        if (!run?.tree?.id) {
          throw new Error("案例树数据无效，请稍后重试");
        }
        const prevSelectedNodeId = this.selectedNodeId;
        this.activeRun = run;
        this.activeRunTreeLoadedForId = summary.id;
        if (prevSelectedNodeId && findNode(run.tree, prevSelectedNodeId)) {
          this.selectedNodeId = prevSelectedNodeId;
        } else {
          this.selectedNodeId = run.tree.id;
        }
        return run;
      } catch (error) {
        this.activeRun = null;
        this.activeRunTreeLoadedForId = null;
        throw error;
      } finally {
        this.activeRunLoading = false;
      }
    },
    async loadScenarioLibrary() {
      const scenarios = await listScenarioLibrary("case");
      this.scenarios = scenarios.map((scenario) =>
        normalizeScenarioLibraryItem(scenario),
      );
    },
    /** 仅刷新测试要点列表（轻量，不拉场景库、不触发 orphan 恢复） */
    async refreshTestPoints(options?: { force?: boolean; page?: number }) {
      if (inFlightTestPointsRefresh && !options?.force) {
        return inFlightTestPointsRefresh;
      }
      const task = this.applyTestPointsFromServer({
        page: options?.page,
      }).finally(() => {
        if (inFlightTestPointsRefresh === task) {
          inFlightTestPointsRefresh = null;
        }
      });
      inFlightTestPointsRefresh = task;
      return task;
    },
    resetTestPointWorkspaceState() {
      this.testPoints = [];
      this.testPointTotal = 0;
      this.testPointListPage = 1;
      this.testPointSystemFilter = "";
      this.testPointSystems = [];
      this.testPointFeatureModuleFilter = "";
      this.testPointFeatureModules = [];
      this.testPointDefinitionSamples = [];
      this.testPointDetails = {};
      this.testPointDetailLoadingIds = [];
      this.selectedTestPointIds = [];
      this.newTestPointIds = [];
    },
    async loadTestPointWorkspaceMeta() {
      if (!this.activeProject) {
        this.testPointSystems = [];
        this.testPointFeatureModules = [];
        this.testPointDefinitionSamples = [];
        return;
      }
      const meta = await getDynamicTestPointMeta(this.activeProject.id);
      this.testPointSystems = meta.systems;
      this.testPointFeatureModules = meta.featureModules;
      this.testPointDefinitionSamples = meta.definitionSamples;
    },
    async setTestPointSystemFilter(system: string) {
      this.testPointSystemFilter = system;
      if (system && this.testPointFeatureModuleFilter) {
        const valid = this.testPointDefinitionSamples.some(
          (item) =>
            item.system.trim() === system &&
            item.featureModule === this.testPointFeatureModuleFilter,
        );
        if (!valid) {
          this.testPointFeatureModuleFilter = "";
        }
      }
      await this.refreshTestPoints({ force: true, page: 1 });
    },
    async setTestPointFeatureModuleFilter(featureModule: string) {
      this.testPointFeatureModuleFilter = featureModule;
      await this.refreshTestPoints({ force: true, page: 1 });
    },
    async clearTestPointListFilters() {
      this.testPointSystemFilter = "";
      this.testPointFeatureModuleFilter = "";
      await this.refreshTestPoints({ force: true, page: 1 });
    },
    async setTestPointListPage(page: number) {
      this.testPointListPage = Math.max(1, page);
      await this.refreshTestPoints({
        force: true,
        page: this.testPointListPage,
      });
    },
    async setTestPointListPageSize(pageSize: number) {
      this.testPointListPageSize = normalizeCaseForgePageSize(pageSize);
      this.testPointListPage = 1;
      await this.refreshTestPoints({ force: true, page: 1 });
    },
    /** 增删改后校正筛选、页码与列表，避免停留在空页或误隐藏工作区 */
    async reconcileTestPointListAfterMutation() {
      await this.loadTestPointWorkspaceMeta();

      if (!this.testPointDefinitionSamples.length) {
        this.resetTestPointWorkspaceState();
        return;
      }

      if (this.testPointSystemFilter || this.testPointFeatureModuleFilter) {
        await this.refreshTestPoints({
          force: true,
          page: this.testPointListPage,
        });
        if (!this.testPointTotal) {
          this.testPointSystemFilter = "";
          this.testPointFeatureModuleFilter = "";
          await this.refreshTestPoints({ force: true, page: 1 });
        }
      } else {
        await this.refreshTestPoints({
          force: true,
          page: this.testPointListPage,
        });
      }

      if (this.testPointTotal <= 0) {
        return;
      }

      const maxPage = Math.max(
        1,
        Math.ceil(this.testPointTotal / this.testPointListPageSize),
      );
      if (this.testPointListPage > maxPage || !this.testPoints.length) {
        await this.refreshTestPoints({ force: true, page: maxPage });
      }
    },
    async ensureTestPointDetail(testPointId: string) {
      if (this.testPointDetails[testPointId]) {
        return this.testPointDetails[testPointId];
      }
      if (this.testPointDetailLoadingIds.includes(testPointId)) {
        return this.mergedTestPoint(testPointId);
      }
      this.testPointDetailLoadingIds = [
        ...this.testPointDetailLoadingIds,
        testPointId,
      ];
      try {
        const detail = await getDynamicTestPointInstruction(testPointId);
        this.testPointDetails[testPointId] = detail;
        this.patchTestPointSummary(detail);
        return detail;
      } finally {
        this.testPointDetailLoadingIds = this.testPointDetailLoadingIds.filter(
          (id) => id !== testPointId,
        );
      }
    },
    patchTestPointSummary(
      partial: Partial<TestPointSummaryItem> & { id: string },
    ) {
      if (this.testPointDetails[partial.id]) {
        this.testPointDetails[partial.id] = {
          ...this.testPointDetails[partial.id],
          ...partial,
        };
      }
      const merged = mergeTestPointInstruction(
        this.testPoints.find((item) => item.id === partial.id) ||
          this.testPointDefinitionSamples.find(
            (item) => item.id === partial.id,
          ),
        this.testPointDetails[partial.id],
      );
      if (!merged) {
        return;
      }
      const summary = toTestPointSummary({
        ...merged,
        ...partial,
      });
      const pageIndex = this.testPoints.findIndex(
        (item) => item.id === partial.id,
      );
      if (pageIndex >= 0) {
        this.testPoints.splice(pageIndex, 1, {
          ...this.testPoints[pageIndex],
          ...summary,
        });
      }
      const sampleIndex = this.testPointDefinitionSamples.findIndex(
        (item) => item.id === partial.id,
      );
      if (sampleIndex >= 0) {
        this.testPointDefinitionSamples.splice(sampleIndex, 1, {
          ...this.testPointDefinitionSamples[sampleIndex],
          system: summary.system,
          systemDesc: summary.systemDesc,
          featureModule: summary.featureModule,
          featureDesc: summary.featureDesc,
          testPoint: summary.testPoint,
          testPointDesc: summary.testPointDesc,
        });
      }
    },
    /** 保存定义后立即更新列表（避免等待被生成任务占用的 refresh，导致弹窗关不掉） */
    applyLocalTestPointDefinitions(
      definitions: Array<{
        id?: string;
        system?: string;
        systemDesc?: string;
        featureModule?: string;
        featureDesc?: string;
        testPoint?: string;
        testPointDesc?: string;
      }>,
    ) {
      const defById = new Map(
        definitions
          .filter((item): item is typeof item & { id: string } =>
            Boolean(item.id),
          )
          .map((item) => [item.id, item]),
      );
      this.testPoints = this.testPoints
        .filter((item) => defById.has(item.id))
        .map((item) => {
          const def = defById.get(item.id)!;
          return {
            ...item,
            system: def.system ?? item.system,
            systemDesc: def.systemDesc ?? item.systemDesc,
            featureModule: def.featureModule ?? item.featureModule,
            featureDesc: def.featureDesc ?? item.featureDesc,
            testPoint: def.testPoint ?? item.testPoint,
            testPointDesc: def.testPointDesc ?? item.testPointDesc,
          };
        });
      this.selectedTestPointIds = this.selectedTestPointIds.filter((id) =>
        this.testPoints.some((item) => item.id === id),
      );
    },
    async applyTestPointsFromServer(options?: { page?: number }) {
      if (!this.activeProject) {
        this.resetTestPointWorkspaceState();
        return;
      }
      // 刷新时丢弃未保存的本地新增项
      const newIds = this.newTestPointIds;
      if (newIds.length) {
        newIds.forEach((id) => delete this.testPointDetails[id]);
        this.newTestPointIds = [];
        this.selectedTestPointIds = this.selectedTestPointIds.filter(
          (id) => !newIds.includes(id),
        );
      }
      const page = options?.page ?? this.testPointListPage;
      const result = await listDynamicTestPoints({
        projectId: this.activeProject.id,
        page,
        pageSize: this.testPointListPageSize,
        system: this.testPointSystemFilter || undefined,
        featureModule: this.testPointFeatureModuleFilter || undefined,
      });
      this.testPoints = result.items;
      this.testPointTotal = result.total;
      this.testPointListPage = result.page;
      this.testPointSystems = result.systems;
      this.testPointFeatureModules = result.featureModules;
      this.selectedTestPointIds = this.selectedTestPointIds.filter((id) =>
        this.testPoints.some((item) => item.id === id),
      );
    },
    async loadDynamicWorkspace(options?: DynamicWorkspaceLoadOptions) {
      if (inFlightDynamicWorkspaceLoad) {
        return inFlightDynamicWorkspaceLoad;
      }
      inFlightDynamicWorkspaceLoad = (async () => {
        if (options?.refreshScenarios !== false) {
          await this.loadScenarioLibrary();
        }
        await Promise.all([
          this.loadTestPointWorkspaceMeta(),
          this.refreshTestPoints({ force: true, page: 1 }),
        ]);
        if (options?.recoverOrphans) {
          await this.recoverOrphanedGeneratingStatus();
        }
      })().finally(() => {
        inFlightDynamicWorkspaceLoad = null;
      });
      return inFlightDynamicWorkspaceLoad;
    },
    async setWorkspaceStage(
      stage: WorkspaceStage,
      options?: { refresh?: boolean },
    ) {
      if (
        stage === "constraints" &&
        !this.structDocs.some((d) => d.canEnterDynamicInstruct)
      ) {
        message.warning("请先保存结构化需求文档后再进入动态指令");
        stage = "document";
      }
      this.workspaceStage = stage;
      if (this.activeProject) {
        setRecentWorkspaceEntry(
          WORKSPACE_STAGE_REGISTRY.caseForgeProject,
          `${stageStoragePrefix}${this.activeProject.id}`,
          stage,
        );
      }
      if (options?.refresh) {
        await this.refreshWorkspaceStageData(stage, { recoverOrphans: false });
      } else if (stage === "workbench") {
        await this.loadActiveRun({ force: true });
      }
    },
    /** 按当前阶段只拉本阶段相关接口 */
    async refreshWorkspaceStageData(
      stage: WorkspaceStage,
      options?: { recoverOrphans?: boolean },
    ) {
      if (!this.activeProject) {
        return;
      }
      const projectId = this.activeProject.id;
      try {
        switch (stage) {
          case "document": {
            this.structDocs = await getProjectStructDocs(projectId);
            if (
              this.structDocs.some((d) => d.structuringStatus === "processing")
            ) {
              this.startStructuringPoll(projectId);
            } else if (this.structuringPollProjectId === projectId) {
              this.stopStructuringPoll();
            }
            break;
          }
          case "constraints": {
            this.structDocs = await getProjectStructDocs(projectId, {
              includeTestPoints: false,
            });
            await this.loadDynamicWorkspace({
              recoverOrphans: options?.recoverOrphans ?? false,
            });
            this.syncGenerateQueuePolling();
            break;
          }
          case "workbench": {
            const prevRunId = this.activeRun?.id;
            const prevSelectedNodeId = this.selectedNodeId;
            await this.refreshRunSummaries(projectId);
            this.syncActiveRunWithSummaries();
            await this.loadActiveRun({ force: true });
            if (
              this.activeRun &&
              prevRunId === this.activeRun.id &&
              prevSelectedNodeId &&
              findNode(this.activeRun.tree, prevSelectedNodeId)
            ) {
              this.selectedNodeId = prevSelectedNodeId;
            }
            break;
          }
        }
      } catch (error) {
        message.warning(
          (error as Error)?.message || "刷新页面数据失败，请稍后重试",
        );
      }
    },
    async removeProject(projectId: string) {
      await deleteProject(projectId);
      removeRecentWorkspaceEntry(
        WORKSPACE_STAGE_REGISTRY.caseForgeProject,
        `${stageStoragePrefix}${projectId}`,
      );
      await this.refreshProjects();
      if (this.activeProject?.id === projectId) {
        const next = this.projects[0];
        if (next) {
          await this.selectProject(next.id);
        } else {
          this.activeProject = null;
          this.runSummaries = [];
          this.activeRun = null;
          this.activeRunTreeLoadedForId = null;
          this.scenarios = [];
          this.resetTestPointWorkspaceState();
          this.selectedNodeId = "";
          this.workspaceStage = "document";
        }
      }
      message.success("项目已删除");
    },
    async updateProjectInfo(
      projectId: string,
      payload: { title?: string; description?: string; requirementNo?: string },
    ) {
      await updateProject(projectId, payload);
      await this.refreshProjects();
      if (this.activeProject?.id === projectId) {
        this.activeProject = {
          ...this.activeProject,
          title: payload.title ?? this.activeProject.title,
          description: payload.description ?? this.activeProject.description,
        };
      }
      message.success("项目已更新");
    },
    async removeProjects(projectIds: string[]) {
      const ids = [...new Set(projectIds)];
      if (!ids.length) return;
      try {
        await batchDeleteProjects(ids);
      } catch {
        const results = await Promise.allSettled(
          ids.map((projectId) => deleteProject(projectId)),
        );
        const failedCount = results.filter(
          (result) => result.status === "rejected",
        ).length;
        if (failedCount) {
          message.warning(`${failedCount} 个项目删除失败，请稍后重试`);
        }
      }
      ids.forEach((projectId) =>
        removeRecentWorkspaceEntry(
          WORKSPACE_STAGE_REGISTRY.caseForgeProject,
          `${stageStoragePrefix}${projectId}`,
        ),
      );
      await this.refreshProjects();
      if (this.activeProject && ids.includes(this.activeProject.id)) {
        const next = this.projects[0];
        if (next) {
          await this.selectProject(next.id);
        } else {
          this.activeProject = null;
          this.runSummaries = [];
          this.activeRun = null;
          this.activeRunTreeLoadedForId = null;
          this.scenarios = [];
          this.resetTestPointWorkspaceState();
          this.selectedNodeId = "";
          this.workspaceStage = "document";
        }
      }
      message.success(`已删除 ${ids.length} 个项目`);
    },
    async submitRequirement() {
      if (!this.activeProject) return;
      const doc = this.activeStructDoc;
      if (!doc?.canStructure) {
        if (doc?.structuringStatus === "processing") {
          message.info("结构化任务进行中，请稍候");
          return;
        }
        message.warning("请先上传需求文档后再进行结构化");
        return;
      }
      try {
        const updated = await structureRequirement(
          this.activeProject.id,
          doc.id,
        );
        this.patchActiveStructDoc(updated);
        this.startStructuringPoll(this.activeProject.id);
        message.info("已开始结构化，完成后将自动更新文档");
      } catch (error) {
        message.error((error as Error)?.message || "启动结构化失败");
      }
    },
    async cancelStructuring(docId?: string) {
      if (!this.activeProject) return;
      const doc = docId
        ? this.structDocs.find((item) => item.id === docId)
        : this.activeStructDoc;
      if (!doc) return;
      try {
        const updated = await cancelStructureRequirement(
          this.activeProject.id,
          doc.id,
        );
        this.patchActiveStructDoc(updated);
        this.stopStructuringPoll();
        if (updated.structuringStatus === "failed") {
          message.warning(updated.structuringError || "已取消结构化");
        }
      } catch (error) {
        message.error((error as Error)?.message || "取消结构化失败");
      }
    },
    stopStructuringPoll() {
      if (this.structuringPollTimer) {
        clearInterval(this.structuringPollTimer);
        this.structuringPollTimer = null;
      }
      this.structuringPollProjectId = null;
    },
    startStructuringPoll(projectId: string) {
      this.stopStructuringPoll();
      this.structuringPollProjectId = projectId;
      void this.pollStructDocStatus(projectId);
      this.structuringPollTimer = setInterval(() => {
        if (
          typeof document !== "undefined" &&
          document.visibilityState === "hidden"
        ) {
          return;
        }
        void this.pollStructDocStatus(projectId);
      }, 4000);
    },
    async pollStructDocStatus(projectId: string) {
      if (this.structuringPollProjectId !== projectId) {
        return;
      }
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      try {
        const docs = await getProjectStructDocs(projectId);
        if (this.activeProject?.id === projectId) {
          this.structDocs = docs;
          const active =
            docs.find((d) => d.id === this.activeStructDocId) ?? null;
          this.activeStructDoc = active;
        }
        const anyProcessing = docs.some(
          (d) => d.structuringStatus === "processing",
        );
        if (!anyProcessing) {
          this.stopStructuringPoll();
          if (this.activeProject?.id !== projectId) {
            return;
          }
          const completed = docs.some(
            (d) => d.structuringStatus === "completed",
          );
          const failed = docs.find((d) => d.structuringStatus === "failed");
          if (completed) {
            await this.loadDynamicWorkspace();
            await this.bumpSidebarProjectOrder(projectId);
            const completedDocs = docs.filter(
              (d) => d.structuringStatus === "completed",
            );
            const zeroParseDoc = completedDocs.find(
              (d) =>
                d.parseWarning ||
                (d.parsedTestPointCount != null && d.parsedTestPointCount === 0),
            );
            if (zeroParseDoc?.parseWarning) {
              message.warning(
                `${zeroParseDoc.reqDocName || "需求文档"}：${zeroParseDoc.parseWarning}`,
              );
            } else {
              const totalPoints = completedDocs.reduce(
                (sum, d) => sum + (d.parsedTestPointCount ?? 0),
                0,
              );
              message.success(
                totalPoints > 0
                  ? `需求文档已结构化，解析到 ${totalPoints} 个测试要点`
                  : "需求文档已结构化",
              );
            }
          } else if (failed) {
            message.error(failed.structuringError || "结构化失败，请稍后重试");
          }
        }
      } catch {
        // 轮询失败时保持 processing 状态，下次继续
      }
    },
    async uploadRequirementFile(file: File) {
      if (!this.activeProject) return;
      this.loading = true;
      try {
        const projectId = this.activeProject.id;
        const uploaded = await uploadStructDocRequirement(projectId, file);
        await this.refreshProjects();
        if (this.activeProject?.id === projectId) {
          await this.fetchActiveProject(projectId);
          this.structDocs = [...this.structDocs, uploaded];
          this.activeStructDocId = uploaded.id;
          this.activeStructDoc = uploaded;
          if (this.workspaceStage === "constraints") {
            await this.loadDynamicWorkspace();
          }
        }
        message.success("需求文档已上传");
      } catch (error) {
        message.error((error as Error)?.message || "上传需求文档失败");
        throw error;
      } finally {
        this.loading = false;
      }
    },
    selectStructDoc(structDocId: string) {
      const doc = this.structDocs.find((d) => d.id === structDocId);
      if (!doc) return;
      this.activeStructDocId = structDocId;
      this.activeStructDoc = doc;
    },
    backToDocList() {
      this.activeStructDocId = null;
      this.activeStructDoc = null;
      this.stopStructuringPoll();
    },
    async deleteStructDoc(structDocId: string) {
      if (!this.activeProject) return;
      await deleteStructDoc(this.activeProject.id, structDocId);
      this.structDocs = this.structDocs.filter((d) => d.id !== structDocId);
      if (this.activeStructDocId === structDocId) {
        this.activeStructDocId = null;
        this.activeStructDoc = null;
      }
      if (this.activeStructDoc?.id) {
        await this.loadTestPointWorkspaceMeta();
        await this.refreshTestPoints({ force: true });
      } else {
        this.resetTestPointWorkspaceState();
      }
      await this.refreshProjects();
    },
    patchActiveStructDoc(doc: StructDocDetail | null) {
      if (!doc) {
        this.activeStructDoc = null;
        return;
      }
      this.activeStructDoc = doc;
      this.structDocs = this.structDocs.map((d) => (d.id === doc.id ? doc : d));
    },
    patchStructDocFromPoll(doc: StructDocDetail | null) {
      this.patchActiveStructDoc(doc);
    },
    async autoSaveDocument(
      markdown: string,
      projectId?: string,
      options?: { successMessage?: string },
    ) {
      const targetProjectId = projectId ?? this.activeProject?.id;
      if (!targetProjectId || this.activeProject?.id !== targetProjectId) {
        return;
      }
      const structDocId = this.activeStructDoc?.id;
      if (!structDocId) return;
      const structDoc = await autoSaveStructDoc(targetProjectId, structDocId, {
        tempStructDoc: markdown,
      });
      if (this.activeProject?.id === targetProjectId) {
        this.patchActiveStructDoc(structDoc);
      }
      if (options?.successMessage) {
        message.success(options.successMessage);
      }
      await this.bumpSidebarProjectOrder(targetProjectId);
    },
    async saveDocument(markdown: string) {
      if (!this.activeProject) return;
      const doc = this.activeStructDoc;
      if (!doc?.canSave && !markdown.trim()) {
        message.warning("请先结构化需求文档后再保存");
        return;
      }
      if (!doc) {
        message.warning("请先上传需求文档");
        return;
      }
      // 不传 testPoints，由后端从 Markdown 解析；已存在的测试要点（按项目 + 内容）保留，仅新增缺失项
      const saved = await saveStructDocTestPoints(
        this.activeProject.id,
        doc.id,
        {
          tempStructDoc: markdown,
        },
      );
      this.patchActiveStructDoc(saved);
      await this.loadDynamicWorkspace();
      this.setWorkspaceStage("constraints");
      if (this.testPointTotal > 0 && this.testPoints[0]) {
        this.selectedTestPointIds = [this.testPoints[0].id];
      }
      message.success("结构化文档已保存");
      await this.bumpSidebarProjectOrder();
    },
    markGeneratingTestPoints(testPointIds: string[]) {
      const next = new Set(this.generatingTestPointIds);
      testPointIds.forEach((id) => next.add(id));
      this.generatingTestPointIds = [...next];
    },
    unmarkGeneratingTestPoints(testPointIds: string[]) {
      const remove = new Set(testPointIds);
      this.generatingTestPointIds = this.generatingTestPointIds.filter(
        (id) => !remove.has(id),
      );
    },
    /** 取消单条测试要点的案例生成 */
    async cancelTestPointGenerate(testPointId: string) {
      if (!this.activeProject) {
        return;
      }
      const row = this.mergedTestPoint(testPointId);
      const label = row?.testPoint || "测试要点";
      const projectId = this.activeProject.id;

      this.unmarkGeneratingTestPoints([testPointId]);
      this.pollingGenerateTestPointIds =
        this.pollingGenerateTestPointIds.filter((id) => id !== testPointId);

      try {
        await cancelCaseGenerate(projectId, [testPointId]);
        await this.refreshRunSummaries(projectId);
        this.syncActiveRunWithSummaries();
        if (
          this.primaryRunSummary &&
          this.activeRunTreeLoadedForId === this.primaryRunSummary.id
        ) {
          await this.loadActiveRun({ force: true });
        }
        const updated = await getDynamicTestPointInstruction(testPointId);
        this.replaceTestPoint(updated);
        message.info(`已取消「${label}」的案例生成`);
      } catch (error) {
        if (row) {
          this.replaceTestPoint({
            ...row,
            status: row.status === "生成完成" ? "再编辑" : "已编辑",
          });
        }
        message.error((error as Error)?.message || "取消生成失败");
      }
    },
    /** 从服务端拉取测试要点生成状态（单条详情，不刷新整表） */
    async fetchGenerateOutcome(testPointId: string) {
      try {
        const row = await getDynamicTestPointInstruction(testPointId);
        this.replaceTestPoint(row);
        if (row.status === "生成完成") {
          return "completed" as const;
        }
        if (row.status === "生成中") {
          return "pending" as const;
        }
        if (row.status === "生成失败") {
          return "failed" as const;
        }
        return "unknown" as const;
      } catch {
        return "unknown" as const;
      }
    },
    scheduleGeneratePoll(
      testPointId: string,
      testPointLabel: string,
      projectId: string,
    ) {
      if (this.pollingGenerateTestPointIds.includes(testPointId)) {
        return;
      }
      this.pollingGenerateTestPointIds = [
        ...this.pollingGenerateTestPointIds,
        testPointId,
      ];
      this.startGenerateQueuePolling([testPointId]);
      void this.pollGenerateOutcome(
        testPointId,
        testPointLabel,
        projectId,
      ).finally(() => {
        this.pollingGenerateTestPointIds =
          this.pollingGenerateTestPointIds.filter((id) => id !== testPointId);
        this.syncGenerateQueuePolling();
      });
    },
    startGenerateQueuePolling(testPointIds?: string[]) {
      const ids = testPointIds?.length
        ? [...new Set(testPointIds)]
        : [
            ...new Set([
              ...this.generatingTestPointIds,
              ...this.pollingGenerateTestPointIds,
              ...this.testPoints
                .filter((item) => item.status === "生成中")
                .map((item) => item.id),
            ]),
          ];
      if (!ids.length) {
        this.stopGenerateQueuePolling();
        return;
      }
      void this.refreshGenerateQueueStatus(ids);
      if (generateQueuePollTimer) {
        return;
      }
      generateQueuePollTimer = window.setInterval(() => {
        void this.syncGenerateQueuePolling();
      }, GENERATE_QUEUE_POLL_INTERVAL_MS);
    },
    syncGenerateQueuePolling() {
      const ids = [
        ...new Set([
          ...this.generatingTestPointIds,
          ...this.pollingGenerateTestPointIds,
          ...this.testPoints
            .filter((item) => item.status === "生成中")
            .map((item) => item.id),
        ]),
      ];
      if (!ids.length) {
        this.stopGenerateQueuePolling();
        return;
      }
      void this.refreshGenerateQueueStatus(ids);
    },
    stopGenerateQueuePolling() {
      if (generateQueuePollTimer) {
        window.clearInterval(generateQueuePollTimer);
        generateQueuePollTimer = null;
      }
      this.generateQueueByTestPointId = {};
    },
    async refreshGenerateQueueStatus(testPointIds: string[]) {
      if (!this.activeProject || !testPointIds.length) {
        return;
      }
      try {
        const status = await getGenerateQueueStatus(
          this.activeProject.id,
          testPointIds,
        );
        const next: Record<string, CaseGenerateQueueItemStatus> = {
          ...this.generateQueueByTestPointId,
        };
        for (const id of testPointIds) {
          delete next[id];
        }
        for (const item of status.items) {
          next[item.testPointId] = item;
        }
        this.generateQueueByTestPointId = next;
      } catch {
        // 队列状态查询失败时不打断生成流程
      }
    },
    async markGenerateFailed(testPointId: string) {
      await this.saveTestPointInstruction(
        testPointId,
        { status: "生成失败" },
        { silent: true },
      );
    },
    async applyGenerateCompletion(
      testPointId: string,
      testPointLabel: string,
      projectId: string,
    ) {
      const updated = await getDynamicTestPointInstruction(testPointId);
      this.replaceTestPoint(updated);
      try {
        await this.refreshRunSummaries(projectId);
        this.syncActiveRunWithSummaries();
        await this.loadActiveRun({ force: true });
        this.selectedNodeId = this.activeRun?.tree.id || "";
        await this.fetchActiveProject(projectId);
      } catch {
        // 刷新项目失败时仍以列表状态为准
      }
      message.success(`「${testPointLabel}」案例已生成`);
      if (this.hasProjectRuns) {
        await this.setWorkspaceStage("workbench");
      }
    },
    async applyGenerateFailure(testPointId: string, testPointLabel: string) {
      const updated = await getDynamicTestPointInstruction(testPointId);
      this.replaceTestPoint(updated);
      message.error(
        `「${testPointLabel}」生成失败：${updated.generateError?.trim() || "请稍后重试"}`,
      );
    },
    async pollGenerateOutcome(
      testPointId: string,
      testPointLabel: string,
      projectId: string,
    ) {
      const delays = [
        ...GENERATE_POLL_DELAYS_MS,
        ...GENERATE_POLL_EXTENDED_DELAYS_MS,
      ];
      for (const delay of delays) {
        await sleep(delay);
        if (this.activeProject?.id !== projectId) {
          return;
        }
        const outcome = await this.fetchGenerateOutcome(testPointId);
        if (outcome === "completed") {
          this.unmarkGeneratingTestPoints([testPointId]);
          await this.applyGenerateCompletion(
            testPointId,
            testPointLabel,
            projectId,
          );
          return;
        }
        if (outcome === "failed") {
          this.unmarkGeneratingTestPoints([testPointId]);
          await this.applyGenerateFailure(testPointId, testPointLabel);
          return;
        }
        if (outcome === "unknown") {
          this.unmarkGeneratingTestPoints([testPointId]);
          return;
        }
      }
      if (this.activeProject?.id !== projectId) {
        return;
      }
      const outcome = await this.fetchGenerateOutcome(testPointId);
      if (outcome === "completed") {
        this.unmarkGeneratingTestPoints([testPointId]);
        await this.applyGenerateCompletion(
          testPointId,
          testPointLabel,
          projectId,
        );
        return;
      }
      if (outcome === "failed") {
        this.unmarkGeneratingTestPoints([testPointId]);
        await this.applyGenerateFailure(testPointId, testPointLabel);
        return;
      }
      if (outcome === "unknown") {
        this.unmarkGeneratingTestPoints([testPointId]);
      }
    },
    /** 进入项目时：对无前端请求的「生成中」启动轮询等待服务端完成 */
    async recoverOrphanedGeneratingStatus() {
      if (!this.activeProject) {
        return;
      }
      const generating = await listGeneratingDynamicTestPoints(
        this.activeProject.id,
      );
      const orphans = generating.filter(
        (item) =>
          !this.generatingTestPointIds.includes(item.id) &&
          !this.pollingGenerateTestPointIds.includes(item.id),
      );
      if (!orphans.length) {
        return;
      }
      const projectId = this.activeProject.id;
      orphans.forEach((item) => {
        this.patchTestPointSummary({ id: item.id, status: "生成中" });
      });
      this.startGenerateQueuePolling(orphans.map((item) => item.id));
      for (const item of orphans) {
        this.scheduleGeneratePoll(item.id, item.testPoint, projectId);
      }
    },
    schedulePollForGenerating(testPointIds: string[]) {
      if (!this.activeProject) {
        return;
      }
      const projectId = this.activeProject.id;
      for (const id of testPointIds) {
        const row = this.mergedTestPoint(id);
        if (row?.status === "生成中") {
          this.scheduleGeneratePoll(id, row.testPoint, projectId);
        }
      }
    },
    async generate(testPointIds?: string[]) {
      if (!this.activeProject) return;
      const explicitIds = testPointIds?.length
        ? [...new Set(testPointIds)]
        : undefined;
      const candidateIds = explicitIds?.length
        ? explicitIds
        : this.selectedTestPointIds.length
          ? [...new Set(this.selectedTestPointIds)]
          : [];
      const selectedIds = explicitIds?.length
        ? candidateIds
        : candidateIds.filter((id) => {
            const row = this.mergedTestPoint(id);
            return row && row.status !== "生成中";
          });
      if (!selectedIds.length) {
        message.warning("请先选择可生成的测试要点");
        return;
      }
      const incomplete = selectedIds
        .map((id) => this.mergedTestPoint(id))
        .filter((row): row is TestPointInstructionItem => Boolean(row))
        .filter((row) => !isTestPointDefinitionComplete(row));
      if (incomplete.length) {
        const sample = incomplete
          .map((row) => testPointDefinitionLabel(row))
          .slice(0, 3)
          .join("、");
        message.warning(
          incomplete.length === 1
            ? `「${sample}」的系统、功能模块、测试要点未填写完整，无法生成`
            : `${incomplete.length} 条测试要点（如 ${sample}）的基础信息未填写完整，无法生成`,
        );
        this.unmarkGeneratingTestPoints(selectedIds);
        return;
      }
      if (selectedIds.length === 1) {
        await this.generateOneTestPoint(selectedIds[0]);
        return;
      }

      const projectId = this.activeProject.id;
      this.markGeneratingTestPoints(selectedIds);
      try {
        await generateCases(projectId, { testPointIds: selectedIds });
        selectedIds.forEach((id) => {
          this.patchTestPointSummary({ id, status: "生成中" });
        });
        this.startGenerateQueuePolling(selectedIds);
        this.schedulePollForGenerating(selectedIds);
        message.info(
          `已为 ${selectedIds.length} 条测试要点提交生成任务，可在列表中查看排队与预计耗时`,
        );
      } catch (error) {
        message.error((error as Error)?.message || "批量生成提交失败");
      } finally {
        this.unmarkGeneratingTestPoints(selectedIds);
      }
    },
    async generateOneTestPoint(
      testPointId: string,
      options?: { deferSidebarRefresh?: boolean; quiet?: boolean },
    ) {
      if (!this.activeProject) return;
      const current = this.mergedTestPoint(testPointId);
      if (!current) {
        return;
      }
      if (
        current.status === "生成中" &&
        !this.generatingTestPointIds.includes(testPointId)
      ) {
        this.scheduleGeneratePoll(
          testPointId,
          current.testPoint,
          this.activeProject.id,
        );
        return;
      }
      this.markGeneratingTestPoints([testPointId]);
      const projectId = this.activeProject.id;
      try {
        await generateCases(projectId, {
          testPointIds: [testPointId],
        });
        this.patchTestPointSummary({ id: testPointId, status: "生成中" });
        this.scheduleGeneratePoll(testPointId, current.testPoint, projectId);
        if (!options?.quiet) {
          message.info(
            `「${current.testPoint}」已提交生成，可在列表中查看排队与预计耗时`,
          );
        }
      } catch (error) {
        message.error((error as Error)?.message || "提交生成失败");
      } finally {
        this.unmarkGeneratingTestPoints([testPointId]);
      }
    },
    async saveTestPointBundle(
      testPointIds: string[],
      payload: {
        definition?: {
          system: string;
          systemDesc: string;
          featureModule: string;
          featureDesc: string;
          testPoint: string;
          testPointDesc: string;
        };
        instruction: {
          promptIds: string[];
          naturalText: string;
          status: TestPointInstructionItem["status"];
          isFull: boolean;
          isAppend: boolean;
        };
      },
    ) {
      if (!this.activeProject || !testPointIds.length) return testPointIds;
      if (payload.definition) {
        const { system, featureModule, testPoint } = payload.definition;
        if (!system.trim() || !featureModule.trim() || !testPoint.trim()) {
          message.warning("系统、功能模块、测试要点均不能为空");
          return testPointIds;
        }
      }

      let finalIds = [...testPointIds];

      if (payload.definition && testPointIds.length === 1) {
        const isNew = this.newTestPointIds.includes(testPointIds[0]);
        if (isNew) {
          if (!this.activeStructDoc?.id) {
            message.warning("请先选择结构化文档");
            return testPointIds;
          }
          const real = await createDynamicTestPoint({
            projectId: this.activeProject.id,
            structDocId: this.activeStructDoc.id,
            system: payload.definition.system,
            systemDesc: payload.definition.systemDesc,
            featureModule: payload.definition.featureModule,
            featureDesc: payload.definition.featureDesc,
            testPoint: payload.definition.testPoint,
            testPointDesc: payload.definition.testPointDesc,
          });
          this.replaceNewTestPointWithReal(testPointIds[0], real);
          finalIds = [real.id];
        } else {
          await updateDynamicTestPointDefinition(
            testPointIds[0],
            payload.definition,
          );
        }
        await this.loadTestPointWorkspaceMeta();
      }

      if (finalIds.length === 1) {
        await this.saveTestPointInstruction(finalIds[0], payload.instruction, {
          silent: true,
        });
      } else {
        const rows = await this.batchSaveTestPointInstruction(
          {
            testPointIds: finalIds,
            ...payload.instruction,
          },
          { silent: true },
        );
        if (!rows.length) {
          return finalIds;
        }
      }
      message.success("测试要点已保存");
      return finalIds;
    },
    async saveTree(options?: { successMessage?: string }) {
      if (!this.activeProject || !this.activeRun) return;
      this.treeSaving = true;
      try {
        const runId = this.activeRun.id;
        const mindMapExtras = this.activeRun.mindMapExtras;
        const treeSnapshot = cloneCaseTree(this.activeRun.tree);
        const saved = await saveRunTree(
          this.activeProject.id,
          runId,
          treeSnapshot,
          mindMapExtras,
        );
        const latestTree = this.activeRun.tree;
        this.activeRun = {
          ...this.activeRun,
          ...saved,
          tree: latestTree,
        };
        const index = this.runSummaries.findIndex(
          (run) => run.id === this.activeRun?.id,
        );
        if (index >= 0) {
          this.runSummaries[index] = {
            ...this.runSummaries[index],
            title: latestTree.title || this.runSummaries[index].title,
          };
        }
        message.success(options?.successMessage ?? "案例树已保存");
        await this.bumpSidebarProjectOrder();
      } catch (error) {
        message.error((error as Error)?.message || "保存案例树失败");
        throw error;
      } finally {
        this.treeSaving = false;
      }
    },
    async regenerateSelected(
      instruction: string,
      mode: "append" | "replace" | "complete",
    ) {
      if (!this.activeProject || !this.activeRun || !this.selectedNodeId)
        return;
      await regenerateNode(this.activeProject.id, {
        runId: this.activeRun.id,
        nodeId: this.selectedNodeId,
        instruction,
        mode,
      });
      await this.refreshRunSummaries(this.activeProject.id);
      this.syncActiveRunWithSummaries();
      await this.loadActiveRun({ force: true });
      message.success("局部生成完成");
      await this.bumpSidebarProjectOrder();
    },
    async saveTestPointInstruction(
      testPointId: string,
      payload: Partial<
        Pick<
          TestPointInstructionItem,
          "promptIds" | "naturalText" | "status" | "isFull" | "isAppend"
        >
      >,
      options?: { silent?: boolean },
    ) {
      const updated = await saveDynamicTestPointInstruction(
        testPointId,
        payload,
      );
      this.replaceTestPoint(updated);
      if (!options?.silent) {
        message.success("测试要点约束已保存");
      }
      await this.bumpSidebarProjectOrder();
      return updated;
    },
    async batchSaveTestPointInstruction(
      payload: {
        testPointIds: string[];
        promptIds?: string[];
        naturalText?: string;
        status?: TestPointInstructionItem["status"];
        isFull?: boolean;
        isAppend?: boolean;
      },
      options?: { silent?: boolean },
    ) {
      const incomplete = payload.testPointIds
        .map((id) => this.mergedTestPoint(id))
        .filter((row): row is TestPointInstructionItem => Boolean(row))
        .filter((row) => !isTestPointDefinitionComplete(row));
      if (incomplete.length) {
        const sample = incomplete
          .map((row) => testPointDefinitionLabel(row))
          .slice(0, 3)
          .join("、");
        message.warning(
          incomplete.length === 1
            ? `「${sample}」的系统、功能模块、测试要点未填写完整，无法保存`
            : `${incomplete.length} 条测试要点（如 ${sample}）的基础信息未填写完整，无法保存`,
        );
        return [];
      }
      const rows = await batchSaveDynamicTestPointInstruction(payload);
      rows.forEach((row) => this.replaceTestPoint(row));
      if (!options?.silent) {
        message.success(`已保存 ${rows.length} 条测试要点约束`);
      }
      await this.bumpSidebarProjectOrder();
      return rows;
    },
    async createTestPoint(payload?: {
      system?: string;
      systemDesc?: string;
      featureModule?: string;
      featureDesc?: string;
      testPoint?: string;
      testPointDesc?: string;
    }) {
      if (!this.activeProject || !this.activeStructDoc?.id) {
        return null;
      }
      const tempId = createTempTestPointId();
      const now = new Date().toISOString();
      const created: TestPointSummaryItem = {
        id: tempId,
        projectId: this.activeProject.id,
        structDocId: this.activeStructDoc.id,
        system: payload?.system ?? "",
        systemDesc: payload?.systemDesc ?? "",
        featureModule: payload?.featureModule ?? "",
        featureDesc: payload?.featureDesc ?? "",
        testPoint: payload?.testPoint ?? "",
        testPointDesc: payload?.testPointDesc ?? "",
        status: "待编辑",
        generateError: "",
        createdAt: now,
        updatedAt: now,
      };
      this.testPoints.unshift(created);
      this.testPointTotal += 1;
      this.newTestPointIds.push(tempId);
      this.testPointDetails[tempId] = {
        ...created,
        naturalText: "",
        isFull: true,
        isAppend: false,
        promptIds: [],
        prompts: [],
      };
      return created;
    },
    discardNewTestPoints(testPointIds: string[]) {
      const ids = testPointIds.filter((id) =>
        this.newTestPointIds.includes(id),
      );
      if (!ids.length) {
        return;
      }
      this.testPoints = this.testPoints.filter(
        (item) => !ids.includes(item.id),
      );
      this.testPointTotal = Math.max(0, this.testPointTotal - ids.length);
      ids.forEach((id) => {
        delete this.testPointDetails[id];
      });
      this.newTestPointIds = this.newTestPointIds.filter(
        (id) => !ids.includes(id),
      );
      this.selectedTestPointIds = this.selectedTestPointIds.filter(
        (id) => !ids.includes(id),
      );
    },
    replaceNewTestPointWithReal(
      tempId: string,
      realItem: TestPointSummaryItem,
    ) {
      const index = this.testPoints.findIndex((item) => item.id === tempId);
      if (index >= 0) {
        this.testPoints.splice(index, 1, { ...realItem });
      }
      if (this.testPointDetails[tempId]) {
        this.testPointDetails[realItem.id] = {
          ...this.testPointDetails[tempId],
          ...realItem,
          id: realItem.id,
        };
        delete this.testPointDetails[tempId];
      }
      if (this.selectedTestPointIds.includes(tempId)) {
        this.selectedTestPointIds = this.selectedTestPointIds.map((id) =>
          id === tempId ? realItem.id : id,
        );
      }
      this.newTestPointIds = this.newTestPointIds.filter((id) => id !== tempId);
    },
    async deleteTestPoints(
      testPointIds: string[],
      options?: { successMessage?: string },
    ) {
      if (!testPointIds.length) {
        return;
      }
      const newIds = testPointIds.filter((id) =>
        this.newTestPointIds.includes(id),
      );
      const realIds = testPointIds.filter(
        (id) => !this.newTestPointIds.includes(id),
      );

      if (newIds.length) {
        this.discardNewTestPoints(newIds);
      }

      if (realIds.length) {
        await deleteDynamicTestPoints(realIds);
        realIds.forEach((id) => {
          delete this.testPointDetails[id];
          this.generatingTestPointIds = this.generatingTestPointIds.filter(
            (item) => item !== id,
          );
          this.pollingGenerateTestPointIds =
            this.pollingGenerateTestPointIds.filter((item) => item !== id);
        });
        this.selectedTestPointIds = this.selectedTestPointIds.filter(
          (id) => !realIds.includes(id),
        );
        await this.reconcileTestPointListAfterMutation();
      }

      message.success(
        options?.successMessage ??
          (testPointIds.length > 1
            ? `已删除 ${testPointIds.length} 条测试要点`
            : "已删除测试要点"),
      );
      await this.bumpSidebarProjectOrder();
    },
    async saveTestPointDefinitions(
      testPoints: Array<{
        id?: string;
        system?: string;
        systemDesc?: string;
        featureModule?: string;
        featureDesc?: string;
        testPoint?: string;
        testPointDesc?: string;
      }>,
      options?: { successMessage?: string },
    ) {
      if (!this.activeProject) return;
      const removedIds = new Set(
        this.testPoints
          .filter((item) => !testPoints.some((next) => next.id === item.id))
          .map((item) => item.id),
      );
      removedIds.forEach((id) => {
        this.generatingTestPointIds = this.generatingTestPointIds.filter(
          (item) => item !== id,
        );
        this.pollingGenerateTestPointIds =
          this.pollingGenerateTestPointIds.filter((item) => item !== id);
      });
      const hasNewWithoutId = testPoints.some((item) => !item.id);
      const structDocId = this.activeStructDoc?.id;
      if (!structDocId) {
        message.warning("请先选择结构化文档");
        return;
      }
      await saveStructDocTestPoints(this.activeProject.id, structDocId, {
        testPoints,
      });
      if (hasNewWithoutId) {
        await this.loadTestPointWorkspaceMeta();
        await this.refreshTestPoints({ force: true, page: 1 });
      } else {
        this.applyLocalTestPointDefinitions(testPoints);
        await this.loadTestPointWorkspaceMeta();
        await this.refreshTestPoints({ force: true });
      }
      message.success(options?.successMessage ?? "测试要点已保存");
      await this.bumpSidebarProjectOrder();
    },
    async saveScenario(
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
            scope: "case",
            name: item.name,
            description: item.description,
            category: item.category,
            isActive: item.isActive,
            prompts: item.prompts ?? [],
          });
      const normalized = normalizeScenarioLibraryItem(saved);
      const index = this.scenarios.findIndex(
        (scenario) => scenario.id === normalized.id,
      );
      if (index >= 0) {
        applyScenarioLibraryItemInPlace(this.scenarios[index], normalized);
      } else {
        this.scenarios.unshift(normalized);
      }
      if (!options?.silent) {
        message.success(options?.successMessage ?? "已保存");
      }
      return normalized;
    },
    async deleteScenario(id: string) {
      await deleteScenarioLibraryItem(id);
      this.scenarios = this.scenarios.filter((item) => item.id !== id);
      message.success("场景库已删除");
    },
    toggleTestPointSelection(testPointId: string, selected?: boolean) {
      const has = this.selectedTestPointIds.includes(testPointId);
      const next = selected ?? !has;
      if (next && !has) {
        this.selectedTestPointIds = [...this.selectedTestPointIds, testPointId];
      } else if (!next && has) {
        this.selectedTestPointIds = this.selectedTestPointIds.filter(
          (id) => id !== testPointId,
        );
      }
    },
    setSelectedTestPointIds(ids: string[]) {
      this.selectedTestPointIds = [...new Set(ids)];
    },
    replaceTestPoint(updated: TestPointInstructionItem) {
      this.testPointDetails[updated.id] = updated;
      this.patchTestPointSummary(updated);
    },
  },
});

function createTempTestPointId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `new-${crypto.randomUUID()}`;
  }
  return `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isEnabledFlag(value: unknown) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined)
    return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true";
  }
  return Boolean(value);
}

function applyPromptListInPlace(
  local: PromptLibraryItem[],
  saved: PromptLibraryItem[],
) {
  saved.forEach((savedPrompt, index) => {
    if (local[index]) {
      Object.assign(local[index], savedPrompt);
      return;
    }
    local.push({ ...savedPrompt });
  });
  if (local.length > saved.length) {
    local.splice(saved.length);
  }
}

function applyScenarioLibraryItemInPlace(
  target: ScenarioLibraryItem,
  saved: ScenarioLibraryItem,
) {
  target.name = saved.name;
  target.description = saved.description;
  target.category = saved.category;
  target.isActive = saved.isActive;
  if (saved.prompts !== undefined) {
    applyPromptListInPlace(target.prompts, saved.prompts);
  }
}

function normalizeScenarioLibraryItem(
  scenario: ScenarioLibraryItem,
): ScenarioLibraryItem {
  return {
    ...scenario,
    isActive: isEnabledFlag(scenario.isActive),
    prompts: (scenario.prompts ?? []).map((prompt) => ({
      ...prompt,
      isActive: isEnabledFlag(prompt.isActive),
    })),
  };
}

function loadProjectStage(projectId: string): WorkspaceStage {
  const stage = getRecentWorkspaceEntry(
    WORKSPACE_STAGE_REGISTRY.caseForgeProject,
    `${stageStoragePrefix}${projectId}`,
  );
  return stage === "constraints" ||
    stage === "workbench" ||
    stage === "document"
    ? stage
    : "document";
}

function saveProjectStage(projectId: string, stage: WorkspaceStage) {
  setRecentWorkspaceEntry(
    WORKSPACE_STAGE_REGISTRY.caseForgeProject,
    `${stageStoragePrefix}${projectId}`,
    stage,
  );
}

function findNode(node: CaseTreeNode, nodeId: string): CaseTreeNode | null {
  if (node.id === nodeId) {
    return node;
  }
  for (const child of node.children || []) {
    const found = findNode(child, nodeId);
    if (found) return found;
  }
  return null;
}
