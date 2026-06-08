import { defineStore } from 'pinia';
import { message } from 'ant-design-vue';
import type {
  CaseForgeProject,
  CaseTreeNode,
  ConstraintInput,
  FeatureInstruction,
  GenerationRun,
  RequirementModule,
} from '@case-forge/shared';
import {
  autoSaveStructDoc,
  batchSaveDynamicTestPointInstruction,
  buildConstraints,
  cancelCaseGenerate,
  createProject,
  createScenarioLibraryItem,
  batchDeleteProjects,
  deleteProject,
  deleteScenarioLibraryItem,
  generateCases,
  getProject,
  getProjectStructDoc,
  getStructDocUploadStatus,
  listDynamicTestPoints,
  listProjects,
  listScenarioLibrary,
  regenerateNode,
  saveDynamicTestPointInstruction,
  saveRunTree,
  saveStructDocTestPoints,
  cancelStructureRequirement,
  structureRequirement,
  updateProject,
  updateScenarioLibraryItem,
  uploadStructDocRequirement,
  type ProjectListItem,
  type ScenarioLibraryPayload,
  type ScenarioLibraryItem,
  type StructDocDetail,
  type TestPointInstructionItem,
} from '@/api/client';
import { sortTestPointsByStatus } from '@/utils/testPointStatusSort';
import { isTestPointDefinitionComplete, testPointDefinitionLabel } from '@/utils/testPointDefinition';

export type WorkspaceStage = 'document' | 'constraints' | 'workbench';

/** 前端报错后轮询服务端真实状态（AI 生成可能仍在进行） */
const GENERATE_POLL_DELAYS_MS = [2000, 3000, 5000, 8000, 10000, 15000, 20000, 30000];
/** 长任务追加轮询：避免尚未完成却被误标为失败 */
const GENERATE_POLL_EXTENDED_DELAYS_MS = [
  30000, 30000, 45000, 60000, 60000, 90000, 90000, 120000,
];

type DynamicWorkspaceLoadOptions = {
  /** 默认 true；仅刷新测试要点列表时可设为 false */
  refreshScenarios?: boolean;
  /** 仅在进入项目等时机恢复「遗留生成中」状态，避免生成期间反复轮询 */
  recoverOrphans?: boolean;
};

let inFlightDynamicWorkspaceLoad: Promise<void> | null = null;
let inFlightTestPointsRefresh: Promise<void> | null = null;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

interface State {
  projects: ProjectListItem[];
  activeProject: CaseForgeProject | null;
  structDoc: StructDocDetail | null;
  activeRun: GenerationRun | null;
  selectedNodeId: string;
  workspaceStage: WorkspaceStage;
  loading: boolean;
  structuringPollTimer: ReturnType<typeof setInterval> | null;
  structuringPollProjectId: string | null;
  constraintDraft: ConstraintInput;
  scenarios: ScenarioLibraryItem[];
  testPoints: TestPointInstructionItem[];
  selectedTestPointIds: string[];
  /** 当前前端正在请求生成的测试要点 ID，用于区分「真在生成」与「卡住」 */
  generatingTestPointIds: string[];
  /** 批量生成进度（非阻塞提示，不用 message.loading 遮罩） */
  batchGenerateProgress: { finished: number; total: number } | null;
  /** 案例树保存中（仅编辑台保存按钮，不锁整个工作区） */
  treeSaving: boolean;
  /** 已为该测试要点启动的结果轮询（防止 load 时重复开多条 poll） */
  pollingGenerateTestPointIds: string[];
}

const stageStoragePrefix = 'case-forge:workspace-stage:';

export const useCaseForgeStore = defineStore('caseForge', {
  state: (): State => ({
    projects: [],
    activeProject: null,
    structDoc: null,
    activeRun: null,
    selectedNodeId: '',
    workspaceStage: 'document',
    loading: false,
    structuringPollTimer: null,
    structuringPollProjectId: null,
    scenarios: [],
    testPoints: [],
    selectedTestPointIds: [],
    generatingTestPointIds: [],
    batchGenerateProgress: null,
    treeSaving: false,
    pollingGenerateTestPointIds: [],
    constraintDraft: {
      scenarioTags: ['positive', 'negative'],
      testDimensions: ['functional', 'interface', 'data'],
      grouping: 'bySystem',
      knowledgeBaseIds: [],
      naturalLanguage: '每个测试要点至少覆盖一条正向与一条反向可执行案例，步骤从系统登录或访问系统开始。',
      featureInstructions: [],
    },
  }),
  getters: {
    isStructuring(state): boolean {
      return state.structDoc?.structuringStatus === 'processing';
    },
    selectedNode(state): CaseTreeNode | null {
      if (!state.activeRun || !state.selectedNodeId) {
        return null;
      }
      return findNode(state.activeRun.tree, state.selectedNodeId);
    },
  },
  actions: {
    async bootstrap() {
      this.loading = true;
      try {
        await this.refreshProjects();
        if (this.projects.length) {
          await this.selectProject(this.projects[0].id);
        } else {
          await this.newProject();
        }
      } finally {
        this.loading = false;
      }
    },
    async refreshProjects() {
      this.projects = await listProjects('case-forge');
    },
    /** 刷新侧边栏列表，使当前编辑项目按 updatedAt 排到最前 */
    async bumpSidebarProjectOrder(projectId?: string) {
      const id = projectId ?? this.activeProject?.id;
      if (!id) {
        return;
      }
      await this.refreshProjects();
    },
    async newProject() {
      this.stopStructuringPoll();
      const project = await createProject({
        title: `案例生成项目 ${this.projects.length + 1}`,
        platform: 'case-forge',
      });
      this.activeProject = project;
      this.structDoc = null;
      this.activeRun = null;
      this.selectedNodeId = '';
      this.scenarios = [];
      this.testPoints = [];
      this.selectedTestPointIds = [];
      this.setWorkspaceStage('document');
      await this.refreshProjects();
    },
    async selectProject(projectId: string) {
      this.stopStructuringPoll();
      this.activeProject = await getProject(projectId);
      this.structDoc = await getProjectStructDoc(projectId);
      this.activeRun = this.activeProject.runs[0] || null;
      this.selectedNodeId = this.activeRun?.tree.id || '';
      this.workspaceStage = loadProjectStage(projectId);
      this.syncConstraintDraftFromProject();
      await this.loadDynamicWorkspace({ recoverOrphans: true });
      if (this.structDoc?.structuringStatus === 'processing') {
        this.startStructuringPoll(projectId);
      }
    },
    async loadScenarioLibrary() {
      const scenarios = await listScenarioLibrary();
      this.scenarios = scenarios.map((scenario) => normalizeScenarioLibraryItem(scenario));
    },
    /** 仅刷新测试要点列表（轻量，不拉场景库、不触发 orphan 恢复） */
    async refreshTestPoints(options?: { force?: boolean }) {
      if (inFlightTestPointsRefresh && !options?.force) {
        return inFlightTestPointsRefresh;
      }
      const task = this.applyTestPointsFromServer().finally(() => {
        if (inFlightTestPointsRefresh === task) {
          inFlightTestPointsRefresh = null;
        }
      });
      inFlightTestPointsRefresh = task;
      return task;
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
          .filter((item): item is typeof item & { id: string } => Boolean(item.id))
          .map((item) => [item.id, item]),
      );
      this.testPoints = sortTestPointsByStatus(
        this.testPoints
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
          }),
      );
      this.selectedTestPointIds = this.selectedTestPointIds.filter((id) =>
        this.testPoints.some((item) => item.id === id),
      );
    },
    async applyTestPointsFromServer() {
      const structDocId = this.structDoc?.id || '';
      if (!structDocId || !this.activeProject) {
        this.testPoints = [];
        this.selectedTestPointIds = [];
        return;
      }
      this.testPoints = sortTestPointsByStatus(
        await listDynamicTestPoints(this.activeProject.id, structDocId),
      );
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
        await this.refreshTestPoints({ force: true });
        if (options?.recoverOrphans) {
          await this.recoverOrphanedGeneratingStatus();
        }
      })().finally(() => {
        inFlightDynamicWorkspaceLoad = null;
      });
      return inFlightDynamicWorkspaceLoad;
    },
    setWorkspaceStage(stage: WorkspaceStage) {
      if (stage === 'constraints' && !this.structDoc?.canEnterDynamicInstruct) {
        message.warning('请先保存结构化需求文档后再进入动态指令');
        stage = 'document';
      }
      this.workspaceStage = stage;
      if (this.activeProject) {
        localStorage.setItem(`${stageStoragePrefix}${this.activeProject.id}`, stage);
      }
    },
    async removeProject(projectId: string) {
      await deleteProject(projectId);
      localStorage.removeItem(`${stageStoragePrefix}${projectId}`);
      await this.refreshProjects();
      if (this.activeProject?.id === projectId) {
        const next = this.projects[0];
        if (next) {
          await this.selectProject(next.id);
        } else {
          this.activeProject = null;
          this.activeRun = null;
          this.scenarios = [];
          this.testPoints = [];
          this.selectedNodeId = '';
          this.workspaceStage = 'document';
        }
      }
      message.success('项目已删除');
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
      message.success('项目已更新');
    },
    async removeProjects(projectIds: string[]) {
      const ids = [...new Set(projectIds)];
      if (!ids.length) return;
      try {
        await batchDeleteProjects(ids);
      } catch {
        const results = await Promise.allSettled(ids.map((projectId) => deleteProject(projectId)));
        const failedCount = results.filter((result) => result.status === 'rejected').length;
        if (failedCount) {
          message.warning(`${failedCount} 个项目删除失败，请稍后重试`);
        }
      }
      ids.forEach((projectId) => localStorage.removeItem(`${stageStoragePrefix}${projectId}`));
      await this.refreshProjects();
      if (this.activeProject && ids.includes(this.activeProject.id)) {
        const next = this.projects[0];
        if (next) {
          await this.selectProject(next.id);
        } else {
          this.activeProject = null;
          this.activeRun = null;
          this.scenarios = [];
          this.testPoints = [];
          this.selectedNodeId = '';
          this.workspaceStage = 'document';
        }
      }
      message.success(`已删除 ${ids.length} 个项目`);
    },
    async submitRequirement() {
      if (!this.activeProject) return;
      if (!this.structDoc?.canStructure) {
        if (this.structDoc?.structuringStatus === 'processing') {
          message.info('结构化任务进行中，请稍候');
          return;
        }
        message.warning('请先上传需求文档后再进行结构化');
        return;
      }
      try {
        this.structDoc = await structureRequirement(this.activeProject.id);
        this.startStructuringPoll(this.activeProject.id);
        message.info('已开始结构化，完成后将自动更新文档');
      } catch (error) {
        message.error((error as Error)?.message || '启动结构化失败');
      }
    },
    async cancelStructuring() {
      if (!this.activeProject) return;
      try {
        this.structDoc = await cancelStructureRequirement(this.activeProject.id);
        this.stopStructuringPoll();
        if (this.structDoc?.structuringStatus === 'failed') {
          message.warning(this.structDoc.structuringError || '已取消结构化');
        }
      } catch (error) {
        message.error((error as Error)?.message || '取消结构化失败');
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
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          return;
        }
        void this.pollStructDocStatus(projectId);
      }, 4000);
    },
    async pollStructDocStatus(projectId: string) {
      if (this.structuringPollProjectId !== projectId) {
        return;
      }
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      try {
        const doc = await getProjectStructDoc(projectId);
        if (this.activeProject?.id === projectId) {
          this.patchStructDocFromPoll(doc);
        }
        if (!doc || doc.structuringStatus !== 'processing') {
          this.stopStructuringPoll();
          if (this.activeProject?.id !== projectId) {
            return;
          }
          if (doc?.structuringStatus === 'completed') {
            await this.loadDynamicWorkspace();
            await this.bumpSidebarProjectOrder(projectId);
            message.success('需求文档已结构化');
          } else if (doc?.structuringStatus === 'failed') {
            message.error(doc.structuringError || '结构化失败，请稍后重试');
          }
        }
      } catch {
        // 轮询失败时保持 processing 状态，下次继续
      }
    },
    async uploadRequirementFile(file: File, force = false) {
      if (!this.activeProject) return;
      if (!force) {
        const status = await getStructDocUploadStatus(this.activeProject.id);
        if (status.hasExisting) {
          message.warning('当前项目已存在需求文档，重新上传需要重新结构化并重新保存，建议新建项目操作');
          return;
        }
      }
      this.loading = true;
      try {
        const projectId = this.activeProject.id;
        await uploadStructDocRequirement(projectId, file, force);
        await this.refreshProjects();
        if (this.activeProject?.id === projectId) {
          const [project, structDoc] = await Promise.all([
            getProject(projectId),
            getProjectStructDoc(projectId),
          ]);
          this.activeProject = project;
          this.structDoc = structDoc;
          await this.loadDynamicWorkspace();
        }
        message.success('需求文档已上传');
      } finally {
        this.loading = false;
      }
    },
    patchStructDocFromPoll(doc: StructDocDetail | null) {
      if (!doc) {
        this.structDoc = doc;
        return;
      }
      const prev = this.structDoc;
      if (
        prev &&
        doc.structuringStatus === 'processing' &&
        prev.structuringStatus === 'processing' &&
        prev.structuringStartedAt === doc.structuringStartedAt &&
        prev.tempStructDoc === doc.tempStructDoc &&
        prev.canStructure === doc.canStructure &&
        prev.canSave === doc.canSave
      ) {
        return;
      }
      this.structDoc = doc;
    },
    async autoSaveDocument(markdown: string, projectId?: string) {
      const targetProjectId = projectId ?? this.activeProject?.id;
      if (!targetProjectId || this.activeProject?.id !== targetProjectId) {
        return;
      }
      const structDoc = await autoSaveStructDoc(targetProjectId, { tempStructDoc: markdown });
      if (this.activeProject?.id === targetProjectId && this.structDoc) {
        this.structDoc = {
          ...this.structDoc,
          canSave: structDoc.canSave,
          canStructure: structDoc.canStructure,
          canEnterDynamicInstruct: structDoc.canEnterDynamicInstruct,
          isStructuring: structDoc.isStructuring,
          structuringStatus: structDoc.structuringStatus,
          structuringError: structDoc.structuringError,
        };
      } else if (this.activeProject?.id === targetProjectId) {
        this.structDoc = structDoc;
      }
      await this.bumpSidebarProjectOrder(targetProjectId);
    },
    async saveDocument(markdown: string) {
      if (!this.activeProject) return;
      if (!this.structDoc?.canSave && !markdown.trim()) {
        message.warning('请先结构化需求文档后再保存');
        return;
      }
      // 不传 testPoints，由后端从 Markdown 解析并尽量保留已有测试要点 ID（动态指令关联）
      this.structDoc = await saveStructDocTestPoints(this.activeProject.id, {
        tempStructDoc: markdown,
      });
      await this.loadDynamicWorkspace();
      this.setWorkspaceStage('constraints');
      if (this.testPoints.length) {
        this.selectedTestPointIds = [this.testPoints[0].id];
      }
      message.success('结构化文档已保存');
      await this.bumpSidebarProjectOrder();
    },
    async createConstraint() {
      if (!this.activeProject) return;
      this.syncConstraintDraftFromProject(false);
      this.activeProject = await buildConstraints(this.activeProject.id, this.constraintDraft);
      message.success('约束快照已保存');
      await this.bumpSidebarProjectOrder();
    },
    markGeneratingTestPoints(testPointIds: string[]) {
      const next = new Set(this.generatingTestPointIds);
      testPointIds.forEach((id) => next.add(id));
      this.generatingTestPointIds = [...next];
    },
    unmarkGeneratingTestPoints(testPointIds: string[]) {
      const remove = new Set(testPointIds);
      this.generatingTestPointIds = this.generatingTestPointIds.filter((id) => !remove.has(id));
    },
    /** 取消单条测试要点的案例生成 */
    async cancelTestPointGenerate(testPointId: string) {
      if (!this.activeProject) {
        return;
      }
      const row = this.testPoints.find((item) => item.id === testPointId);
      const label = row?.testPoint || '测试要点';
      const projectId = this.activeProject.id;

      this.unmarkGeneratingTestPoints([testPointId]);
      this.pollingGenerateTestPointIds = this.pollingGenerateTestPointIds.filter(
        (id) => id !== testPointId,
      );

      try {
        this.activeProject = await cancelCaseGenerate(projectId, [testPointId]);
        this.activeRun = this.activeProject.runs[0] || null;
        await this.refreshTestPoints({ force: true });
        message.info(`已取消「${label}」的案例生成`);
      } catch (error) {
        if (row) {
          this.replaceTestPoint({
            ...row,
            status: row.status === '生成完成' ? '再编辑' : '已编辑',
          });
        }
        message.error((error as Error)?.message || '取消生成失败');
      }
    },
    /** 从服务端拉取测试要点生成状态（轻量刷新，不触发场景库与 orphan 恢复） */
    async fetchGenerateOutcome(testPointId: string) {
      await this.refreshTestPoints();
      const row = this.testPoints.find((item) => item.id === testPointId);
      if (!row) {
        return 'unknown' as const;
      }
      if (row.status === '生成完成') {
        const projectId = this.activeProject?.id;
        if (projectId) {
          try {
            this.activeProject = await getProject(projectId);
            this.activeRun = this.activeProject.runs[0] || null;
            this.selectedNodeId = this.activeRun?.tree.id || '';
          } catch {
            // 刷新项目失败时仍以列表状态为准
          }
        }
        return 'completed' as const;
      }
      if (row.status === '生成中') {
        return 'pending' as const;
      }
      if (row.status === '生成失败') {
        return 'failed' as const;
      }
      return 'unknown' as const;
    },
    scheduleGeneratePoll(testPointId: string, testPointLabel: string, projectId: string) {
      if (this.pollingGenerateTestPointIds.includes(testPointId)) {
        return;
      }
      if (this.generatingTestPointIds.includes(testPointId)) {
        return;
      }
      this.pollingGenerateTestPointIds = [
        ...this.pollingGenerateTestPointIds,
        testPointId,
      ];
      void this.pollGenerateOutcome(testPointId, testPointLabel, projectId).finally(() => {
        this.pollingGenerateTestPointIds = this.pollingGenerateTestPointIds.filter(
          (id) => id !== testPointId,
        );
      });
    },
    async markGenerateFailed(testPointId: string) {
      await this.saveTestPointInstruction(testPointId, { status: '生成失败' }, { silent: true });
      await this.refreshTestPoints();
    },
    async pollGenerateOutcome(
      testPointId: string,
      testPointLabel: string,
      projectId: string,
    ) {
      const delays = [...GENERATE_POLL_DELAYS_MS, ...GENERATE_POLL_EXTENDED_DELAYS_MS];
      for (const delay of delays) {
        await sleep(delay);
        if (this.activeProject?.id !== projectId) {
          return;
        }
        if (!this.testPoints.some((item) => item.id === testPointId)) {
          return;
        }
        const outcome = await this.fetchGenerateOutcome(testPointId);
        if (outcome === 'completed') {
          this.unmarkGeneratingTestPoints([testPointId]);
          message.success(`「${testPointLabel}」案例已生成`);
          if (this.activeProject?.runs.length) {
            this.setWorkspaceStage('workbench');
          }
          return;
        }
        if (outcome === 'failed') {
          this.unmarkGeneratingTestPoints([testPointId]);
          return;
        }
        if (outcome === 'unknown') {
          this.unmarkGeneratingTestPoints([testPointId]);
          return;
        }
      }
      if (this.activeProject?.id !== projectId) {
        return;
      }
      if (!this.testPoints.some((item) => item.id === testPointId)) {
        return;
      }
      const outcome = await this.fetchGenerateOutcome(testPointId);
      if (outcome === 'completed') {
        this.unmarkGeneratingTestPoints([testPointId]);
        message.success(`「${testPointLabel}」案例已生成`);
        if (this.activeProject?.runs.length) {
          this.setWorkspaceStage('workbench');
        }
        return;
      }
      if (outcome === 'failed' || outcome === 'unknown') {
        this.unmarkGeneratingTestPoints([testPointId]);
        return;
      }
    },
    /** 进入项目时：对无前端请求的「生成中」启动轮询等待服务端完成 */
    async recoverOrphanedGeneratingStatus() {
      const orphans = this.testPoints.filter(
        (item) =>
          item.status === '生成中' &&
          !this.generatingTestPointIds.includes(item.id) &&
          !this.pollingGenerateTestPointIds.includes(item.id),
      );
      if (!orphans.length || !this.activeProject) {
        return;
      }
      const projectId = this.activeProject.id;
      for (const item of orphans) {
        this.scheduleGeneratePoll(item.id, item.testPoint, projectId);
      }
    },
    async ensureProjectConstraint() {
      if (!this.activeProject) return;
      if (this.activeProject.constraints[0]?.id) {
        return;
      }
      this.syncConstraintDraftFromProject(false);
      this.activeProject = await buildConstraints(this.activeProject.id, this.constraintDraft);
    },
    schedulePollForGenerating(testPointIds: string[]) {
      if (!this.activeProject) {
        return;
      }
      const projectId = this.activeProject.id;
      for (const id of testPointIds) {
        const row = this.testPoints.find((item) => item.id === id);
        if (row?.status === '生成中') {
          this.scheduleGeneratePoll(id, row.testPoint, projectId);
        }
      }
    },
    async generate(testPointIds?: string[]) {
      if (!this.activeProject) return;
      const explicitIds = testPointIds?.length ? [...new Set(testPointIds)] : undefined;
      const candidateIds = explicitIds?.length
        ? explicitIds
        : this.selectedTestPointIds.length
          ? [...new Set(this.selectedTestPointIds)]
          : this.testPoints.map((item) => item.id);
      const selectedIds = explicitIds?.length
        ? candidateIds
        : candidateIds.filter((id) => {
            const row = this.testPoints.find((item) => item.id === id);
            return row && row.status !== '生成中';
          });
      if (!selectedIds.length) {
        message.warning('没有可生成的测试要点');
        return;
      }
      const incomplete = selectedIds
        .map((id) => this.testPoints.find((item) => item.id === id))
        .filter((row): row is TestPointInstructionItem => Boolean(row))
        .filter((row) => !isTestPointDefinitionComplete(row));
      if (incomplete.length) {
        const sample = incomplete.map((row) => testPointDefinitionLabel(row)).slice(0, 3).join('、');
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
        await this.refreshTestPoints({ force: true });
        this.schedulePollForGenerating(selectedIds);
        message.info(
          `已为 ${selectedIds.length} 条测试要点标记「生成中」，后台依次生成，可随时刷新查看进度`,
        );
      } catch (error) {
        message.error((error as Error)?.message || '批量生成提交失败');
      } finally {
        this.unmarkGeneratingTestPoints(selectedIds);
      }
    },
    async generateOneTestPoint(
      testPointId: string,
      options?: { deferSidebarRefresh?: boolean; quiet?: boolean },
    ) {
      if (!this.activeProject) return;
      const current = this.testPoints.find((item) => item.id === testPointId);
      if (!current) {
        return;
      }
      if (current.status === '生成中' && !this.generatingTestPointIds.includes(testPointId)) {
        this.scheduleGeneratePoll(testPointId, current.testPoint, this.activeProject.id);
        return;
      }
      this.markGeneratingTestPoints([testPointId]);
      const projectId = this.activeProject.id;
      try {
        this.activeProject = await generateCases(projectId, {
          testPointIds: [testPointId],
        });
        this.activeRun = this.activeProject.runs[0] || null;
        this.selectedNodeId = this.activeRun?.tree.id || '';
        if (!options?.deferSidebarRefresh) {
          await this.refreshProjects();
          await this.loadDynamicWorkspace();
        }
        if (!options?.quiet) {
          message.success(`「${current.testPoint}」案例已生成`);
          if (this.activeProject?.runs.length) {
            this.setWorkspaceStage('workbench');
          }
        }
      } catch (error) {
        const outcome = await this.fetchGenerateOutcome(testPointId);
        if (outcome === 'completed') {
          if (!options?.quiet) {
            message.success(`「${current.testPoint}」案例已生成`);
            if (this.activeProject.runs.length) {
              this.setWorkspaceStage('workbench');
            }
          }
          return;
        }
        if (outcome === 'pending') {
          this.scheduleGeneratePoll(testPointId, current.testPoint, projectId);
          return;
        }
        if (!options?.quiet) {
          const reason = (error as Error)?.message || '生成失败';
          const hint = reason.includes('timeout') || reason.includes('超时') ? '（请求超时）' : '';
          message.error(`「${current.testPoint}」生成失败${hint}：${reason}`);
        }
      } finally {
        this.unmarkGeneratingTestPoints([testPointId]);
        await this.refreshTestPoints({ force: true });
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
          status: TestPointInstructionItem['status'];
          isFull: boolean;
          isAppend: boolean;
        };
      },
    ) {
      if (!this.activeProject || !testPointIds.length) return;
      if (payload.definition) {
        const { system, featureModule, testPoint } = payload.definition;
        if (!system.trim() || !featureModule.trim() || !testPoint.trim()) {
          message.warning('系统、功能模块、测试要点均不能为空');
          return;
        }
      }
      if (payload.definition && testPointIds.length === 1) {
        const targetId = testPointIds[0];
        const nextList = this.testPoints.map((item) =>
          item.id === targetId
            ? {
                id: item.id,
                system: payload.definition!.system,
                systemDesc: payload.definition!.systemDesc,
                featureModule: payload.definition!.featureModule,
                featureDesc: payload.definition!.featureDesc,
                testPoint: payload.definition!.testPoint,
                testPointDesc: payload.definition!.testPointDesc,
              }
            : {
                id: item.id,
                system: item.system,
                systemDesc: item.systemDesc,
                featureModule: item.featureModule,
                featureDesc: item.featureDesc,
                testPoint: item.testPoint,
                testPointDesc: item.testPointDesc,
              },
        );
        await saveStructDocTestPoints(this.activeProject.id, { testPoints: nextList });
        await this.refreshTestPoints();
      }
      if (testPointIds.length === 1) {
        await this.saveTestPointInstruction(testPointIds[0], payload.instruction, { silent: true });
      } else {
        const rows = await this.batchSaveTestPointInstruction(
          {
            testPointIds,
            ...payload.instruction,
          },
          { silent: true },
        );
        if (!rows.length) {
          return;
        }
      }
      message.success('测试要点已保存');
    },
    async saveTree(options?: { successMessage?: string }) {
      if (!this.activeProject || !this.activeRun) return;
      this.treeSaving = true;
      try {
        this.activeRun = await saveRunTree(
          this.activeProject.id,
          this.activeRun.id,
          this.activeRun.tree,
          this.activeRun.mindMapExtras,
        );
        const index = this.activeProject.runs.findIndex((run) => run.id === this.activeRun?.id);
        if (index >= 0) {
          this.activeProject.runs[index] = this.activeRun;
        }
        message.success(options?.successMessage ?? '案例树已保存');
        await this.bumpSidebarProjectOrder();
      } catch (error) {
        message.error((error as Error)?.message || '保存案例树失败');
        throw error;
      } finally {
        this.treeSaving = false;
      }
    },
    async regenerateSelected(instruction: string, mode: 'append' | 'replace' | 'complete') {
      if (!this.activeProject || !this.activeRun || !this.selectedNodeId) return;
      this.activeRun = await regenerateNode(this.activeProject.id, {
        runId: this.activeRun.id,
        nodeId: this.selectedNodeId,
        instruction,
        mode,
      });
      const project = await getProject(this.activeProject.id);
      this.activeProject = project;
      message.success('局部生成完成');
      await this.bumpSidebarProjectOrder();
    },
    async saveTestPointInstruction(
      testPointId: string,
      payload: Partial<Pick<TestPointInstructionItem, 'promptIds' | 'naturalText' | 'status' | 'isFull' | 'isAppend'>>,
      options?: { silent?: boolean },
    ) {
      const updated = await saveDynamicTestPointInstruction(testPointId, payload);
      this.replaceTestPoint(updated);
      if (!options?.silent) {
        message.success('测试要点约束已保存');
      }
      await this.bumpSidebarProjectOrder();
      return updated;
    },
    async batchSaveTestPointInstruction(
      payload: {
        testPointIds: string[];
        promptIds?: string[];
        naturalText?: string;
        status?: TestPointInstructionItem['status'];
        isFull?: boolean;
        isAppend?: boolean;
      },
      options?: { silent?: boolean },
    ) {
      const incomplete = payload.testPointIds
        .map((id) => this.testPoints.find((item) => item.id === id))
        .filter((row): row is TestPointInstructionItem => Boolean(row))
        .filter((row) => !isTestPointDefinitionComplete(row));
      if (incomplete.length) {
        const sample = incomplete.map((row) => testPointDefinitionLabel(row)).slice(0, 3).join('、');
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
        this.generatingTestPointIds = this.generatingTestPointIds.filter((item) => item !== id);
        this.pollingGenerateTestPointIds = this.pollingGenerateTestPointIds.filter(
          (item) => item !== id,
        );
      });
      const hasNewWithoutId = testPoints.some((item) => !item.id);
      await saveStructDocTestPoints(this.activeProject.id, { testPoints });
      if (hasNewWithoutId) {
        await this.refreshTestPoints({ force: true });
      } else {
        this.applyLocalTestPointDefinitions(testPoints);
        void this.refreshTestPoints({ force: true });
      }
      message.success(options?.successMessage ?? '测试要点已保存');
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
            name: item.name,
            description: item.description,
            category: item.category,
            isActive: item.isActive,
            prompts: item.prompts ?? [],
          });
      const normalized = normalizeScenarioLibraryItem(saved);
      const index = this.scenarios.findIndex((scenario) => scenario.id === normalized.id);
      if (index >= 0) {
        this.scenarios.splice(index, 1, normalized);
      } else {
        this.scenarios.unshift(normalized);
      }
      if (!options?.silent) {
        message.success(options?.successMessage ?? '已保存');
      }
      return normalized;
    },
    async deleteScenario(id: string) {
      await deleteScenarioLibraryItem(id);
      this.scenarios = this.scenarios.filter((item) => item.id !== id);
      message.success('场景库已删除');
    },
    toggleTestPointSelection(testPointId: string, selected?: boolean) {
      const has = this.selectedTestPointIds.includes(testPointId);
      const next = selected ?? !has;
      if (next && !has) {
        this.selectedTestPointIds = [...this.selectedTestPointIds, testPointId];
      } else if (!next && has) {
        this.selectedTestPointIds = this.selectedTestPointIds.filter((id) => id !== testPointId);
      }
    },
    setSelectedTestPointIds(ids: string[]) {
      this.selectedTestPointIds = [...new Set(ids)];
    },
    syncConstraintDraftFromProject(preferLatestConstraint = true) {
      const modules = this.activeProject?.document?.analysis.modules || [];
      const latestInput = ensureConstraintInput(this.activeProject?.constraints[0]?.input);
      const source = preferLatestConstraint ? latestInput || this.constraintDraft : this.constraintDraft;
      this.constraintDraft = {
        scenarioTags: source.scenarioTags?.length ? source.scenarioTags : ['positive', 'negative'],
        testDimensions: source.testDimensions?.length ? source.testDimensions : ['functional', 'interface', 'data'],
        grouping: source.grouping || 'bySystem',
        knowledgeBaseIds: source.knowledgeBaseIds || [],
        naturalLanguage: source.naturalLanguage || '',
        featureInstructions: mergeFeatureInstructions(
          modules,
          source.featureInstructions || this.constraintDraft.featureInstructions,
        ),
      };
    },
    replaceTestPoint(updated: TestPointInstructionItem) {
      const index = this.testPoints.findIndex((item) => item.id === updated.id);
      if (index >= 0) {
        this.testPoints.splice(index, 1, updated);
      } else {
        this.testPoints.push(updated);
      }
      this.testPoints = sortTestPointsByStatus(this.testPoints);
    },
  },
});

function isEnabledFlag(value: unknown) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
  }
  return Boolean(value);
}

function normalizeScenarioLibraryItem(scenario: ScenarioLibraryItem): ScenarioLibraryItem {
  return {
    ...scenario,
    isActive: isEnabledFlag(scenario.isActive),
    prompts: (scenario.prompts ?? []).map((prompt) => ({
      ...prompt,
      isActive: isEnabledFlag(prompt.isActive),
    })),
  };
}

function ensureConstraintInput(input: ConstraintInput | undefined): ConstraintInput | null {
  if (!input) return null;
  return {
    scenarioTags: input.scenarioTags || [],
    testDimensions: input.testDimensions || [],
    grouping: input.grouping || 'bySystem',
    knowledgeBaseIds: input.knowledgeBaseIds || [],
    naturalLanguage: input.naturalLanguage || '',
    featureInstructions: input.featureInstructions || [],
  };
}

function mergeFeatureInstructions(
  modules: RequirementModule[],
  existingInstructions: FeatureInstruction[] = [],
): FeatureInstruction[] {
  const existingByModule = new Map(existingInstructions.map((item) => [item.moduleId, item]));
  return modules.map((module) => {
    const existing = existingByModule.get(module.id);
    return {
      moduleId: module.id,
      system: module.system,
      featureName: module.name,
      instruction:
        existing?.instruction ||
        `围绕“${module.name}”生成可执行案例，覆盖业务规则、系统交互、异常分支和数据一致性断言。`,
    };
  });
}

function loadProjectStage(projectId: string): WorkspaceStage {
  const stage = localStorage.getItem(`${stageStoragePrefix}${projectId}`);
  return stage === 'constraints' || stage === 'workbench' || stage === 'document'
    ? stage
    : 'document';
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
