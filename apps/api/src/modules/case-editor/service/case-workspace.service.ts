/**
 * 案例工作区编排服务
 *
 * 职责：聚合项目视图，协调「需求格式化 → 约束 → 案例生成 → 编辑台运行记录」。
 *
 * ## 案例生成主流程（promote-skill + AI Chat）
 *
 * ```
 * POST /generate { testPointIds }
 *        │
 *        ├─ 单条：占全局并发槽 → 同步跑完 → 返回含新案例树的 workspace
 *        │
 *        └─ 批量：立即把所有 testPoint 标「生成中」→ 立刻返回
 *                 └─ runBatchGenerateInBackground 逐条排队调用 generateCasesInternal
 *                      └─ 每条再经 withCaseGenerateSlot 与全站其他用户共享 AI 并发上限
 * ```
 *
 * 状态写入 `case_test_point_instruct.status`（待编辑/已编辑/生成中/生成完成/…）。
 * 取消生成仅由用户点「停止」触发 POST /generate/cancel，刷新页面不会 cancel。
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { extractTextFromBuffer } from "../../../common/document/document-text.util";
import type {
  CaseForgeProject,
  CaseTreeNode,
  ConstraintInput,
  ConstraintInstruction,
  RequirementAnalysis,
  RequirementDocument,
  RequirementModule,
} from "@case-forge/shared";
import { CaseEditorService } from "@case-editor/service/case-editor.service";
import { TestPointInstructEntity } from "@dynamic-instruct/entity/test-point-instruct.entity";
import { TestPointPromptEntity } from "@dynamic-instruct/entity/test-point-prompt.entity";
import { CaseConstraintEntity } from "@case-editor/entity/case-constraint.entity";
import { BuildConstraintsDto } from "../dto/build-constraints.dto";
import {
  buildCaseWorkflowInput,
  mapTestPointsForWorkflow,
  type ScenarioPromptInput,
  type TestPointGenerationInput,
} from "../util/case-workflow-input.util";
import { CancelGenerateDto } from "../dto/cancel-generate.dto";
import { GenerateCasesDto } from "../dto/generate-cases.dto";
import { RegenerateNodeDto } from "../dto/regenerate-node.dto";
import { CasePipelineService } from "./case-pipeline.service";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { StructDocEntity } from "@struct-doc/entity/struct-doc.entity";
import { TestPointEntity } from "@struct-doc/entity/test-point.entity";
import { stripDocumentExtension } from "@struct-doc/util/struct-doc.parser";
import { In, Repository } from "typeorm";
import { auditFieldsForUpdate } from "../../../common/audit/request-context";
import {
  findOwnedProject,
  scopedWhere,
} from "../../../common/audit/user-scope";
import { withCaseGenerateSlot } from "../util/case-generate-concurrency";
import {
  cancelCaseGenerate,
  clearCaseGenerateSlot,
  getCaseGenerateRevertStatus,
  isCaseGenerateCancelled,
  registerCaseGenerate,
} from "../util/case-generate-cancel.registry";
import {
  type CaseTreeMergeMode,
  mergeCaseTreeBranches,
  mergeSourceTestPointIds,
  reassignCaseTreeNodeIds,
} from "../util/case-tree-merge.util";
import { withProjectCaseTreeMerge } from "../util/case-tree-merge-lock";
import { buildCaseGenerateInterruptedMessage } from "../util/case-generate-interrupted.util";
import { touchProjectUpdatedAt } from "../../../common/project/touch-project.util";

/** 案例编辑器工作区业务编排服务 */
@Injectable()
export class CaseWorkspaceService implements OnModuleInit {
  private readonly logger = new Logger(CaseWorkspaceService.name);

  constructor(
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
    @InjectRepository(StructDocEntity)
    private readonly structDocRepo: Repository<StructDocEntity>,
    @InjectRepository(TestPointEntity)
    private readonly testPointRepo: Repository<TestPointEntity>,
    @InjectRepository(CaseConstraintEntity)
    private readonly constraintRepo: Repository<CaseConstraintEntity>,
    @InjectRepository(TestPointInstructEntity)
    private readonly instructRepo: Repository<TestPointInstructEntity>,
    @InjectRepository(TestPointPromptEntity)
    private readonly promptSelectionRepo: Repository<TestPointPromptEntity>,
    private readonly caseEditorService: CaseEditorService,
    private readonly pipeline: CasePipelineService,
  ) {}

  /** 服务启动时将遗留的「生成中」测试要点标记为失败（常见于生成中重启） */
  async onModuleInit() {
    const result = await this.instructRepo.update(
      { status: "生成中" },
      {
        status: "生成失败",
        modifiedBy: "system",
      },
    );
    if (result.affected) {
      this.logger.warn(
        `服务启动：已将 ${result.affected} 条中断的案例生成任务标记为失败（${buildCaseGenerateInterruptedMessage()}）`,
      );
    }
  }

  /** 获取项目完整工作区视图 */
  async getProjectWorkspace(projectId: string) {
    return this.buildProjectView(projectId);
  }

  private async formatRequirement(
    projectId: string,
    dto: { rawText: string; fileName?: string },
  ) {
    await this.ensureProject(projectId);
    const document = await this.pipeline.formatRequirement(
      dto.rawText,
      dto.fileName,
    );
    const structDoc = await this.saveRequirementDocument(
      projectId,
      document,
      dto.fileName,
    );
    await this.syncTestPointsFromAnalysis(
      projectId,
      structDoc.id,
      document.analysis,
    );
    await touchProjectUpdatedAt(this.projectRepo, projectId, {
      title:
        document.analysis.requirementName ||
        stripDocumentExtension(dto.fileName || "") ||
        "案例生成项目",
      requirementNo: document.analysis.requirementId,
    });
    return this.buildProjectView(projectId);
  }

  /** 检查 LLM 是否已配置可用 */
  isAiConfigured() {
    return this.pipeline.isAiConfigured();
  }

  /** 解析上传的需求文档并格式化为结构化需求 */
  async formatUploadedRequirement(
    projectId: string,
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException("File is required");
    }
    const fileName = this.normalizeUploadFileName(file.originalname);
    const rawText = await this.extractText(file, fileName);
    Logger.log(`Extracted text from ${fileName}`);
    return this.formatRequirement(projectId, {
      rawText,
      fileName,
    });
  }

  /** 更新结构化需求文档并同步测试要点 */
  async updateStructuredDocument(
    projectId: string,
    structuredMarkdown: string,
    rawText?: string,
  ) {
    const project = await this.buildProjectView(projectId);
    if (!project.document) {
      throw new NotFoundException("Requirement document not found");
    }
    const document: RequirementDocument = {
      ...project.document,
      structuredMarkdown,
      rawText: rawText || project.document.rawText,
      analysis: this.pipeline.rebuildAnalysisFromMarkdown(structuredMarkdown),
      updatedAt: new Date().toISOString(),
    };
    const structDoc = await this.saveRequirementDocument(
      projectId,
      document,
      project.document.fileName,
    );
    await this.syncTestPointsFromAnalysis(
      projectId,
      structDoc.id,
      document.analysis,
    );
    await touchProjectUpdatedAt(this.projectRepo, projectId, {
      title: document.analysis.requirementName || project.title,
      requirementNo: document.analysis.requirementId,
    });
    return this.buildProjectView(projectId);
  }

  /** 保存约束输入（JSON）快照 */
  async buildConstraints(projectId: string, dto: BuildConstraintsDto) {
    const project = await this.buildProjectView(projectId);
    const input = this.normalizeConstraintInput(
      dto,
      project.document?.analysis,
    );
    const constraintEntity = this.constraintRepo.create({
      projectId,
      structDocId: await this.getStructDocId(projectId),
      input: input as unknown as Record<string, unknown>,
      markdown: "",
    });
    await this.constraintRepo.save(constraintEntity);
    await touchProjectUpdatedAt(this.projectRepo, projectId);
    return this.buildProjectView(projectId);
  }

  /**
   * 案例生成入口（Controller 直接调用）
   *
   * - **单条**：同步执行，HTTP 会阻塞到 AI 返回并写入案例树（约 1～3 分钟）
   * - **批量**：先把全部 testPointIds 标为「生成中」并立即响应；后台 foreach 逐条生成
   *
   * @see runBatchGenerateInBackground 批量后台消化
   * @see generateCasesInternal       单条实际生成逻辑
   */
  async generateCases(projectId: string, dto: GenerateCasesDto) {
    const testPointIds = [...new Set(dto.testPointIds ?? [])];
    if (!testPointIds.length) {
      throw new BadRequestException("请指定要生成案例的测试要点");
    }

    await this.loadAndValidateGenerateTestPoints(projectId, testPointIds);
    // 登记内存槽：记录「若用户点停止，应回退到什么状态」（已编辑/再编辑）
    await this.registerGenerateSlots(projectId, testPointIds);

    if (testPointIds.length === 1) {
      // 单条：在全局 AI 并发槽内同步跑完
      return withCaseGenerateSlot(() =>
        this.generateCasesInternal(projectId, dto),
      );
    }

    // 批量：先落库「生成中」，前端刷新也能看到；不阻塞 HTTP
    await this.updateDynamicStatus(testPointIds, "生成中");
    void this.runBatchGenerateInBackground(projectId, dto, testPointIds).catch(
      (error) => {
        this.logger.error(
          `批量案例生成后台任务异常: ${(error as Error).message}`,
        );
      },
    );
    return this.buildProjectView(projectId);
  }

  /**
   * 批量生成的后台 worker（fire-and-forget）
   *
   * 按 testPointIds 顺序逐条调用 generateCasesInternal；
   * 每条之间竞争 withCaseGenerateSlot，与别的用户/别的批量任务共享并发上限。
   * skipGeneratingStatus=true 因为入口已统一标过「生成中」。
   */
  private async runBatchGenerateInBackground(
    projectId: string,
    dto: GenerateCasesDto,
    testPointIds: string[],
  ) {
    for (const testPointId of testPointIds) {
      if (isCaseGenerateCancelled(projectId, testPointId)) {
        await this.revertCancelledGenerations(projectId, [testPointId]);
        clearCaseGenerateSlot(projectId, testPointId);
        continue;
      }
      try {
        await withCaseGenerateSlot(() =>
          this.generateCasesInternal(
            projectId,
            { ...dto, testPointIds: [testPointId] },
            { skipGeneratingStatus: true },
          ),
        );
      } catch (error) {
        this.logger.warn(
          `测试要点 ${testPointId} 案例生成失败: ${(error as Error).message}`,
        );
      }
    }
  }

  /**
   * 用户主动「停止」生成（仅前端停止按钮调用，刷新不会触发）
   *
   * 1. 内存槽标记 cancelled
   * 2. 把 DB 状态回退到生成前（已编辑 或 再编辑）
   * 3. 若 AI 已在跑，generateCasesInternal 内 shouldAbort 会中断并在 finally 清理槽
   */
  async cancelGenerateCases(projectId: string, dto: CancelGenerateDto) {
    await this.ensureProject(projectId);
    const testPointIds = [...new Set(dto.testPointIds)];
    if (!testPointIds.length) {
      return this.buildProjectView(projectId);
    }

    const instructs = await this.instructRepo.find({
      where: { testPointId: In(testPointIds) },
    });
    const instructByTestPoint = new Map(
      instructs.map((item) => [item.testPointId, item]),
    );

    const grouped = new Map<TestPointInstructEntity["status"], string[]>();
    for (const testPointId of testPointIds) {
      const currentStatus = instructByTestPoint.get(testPointId)?.status;
      if (currentStatus === "生成完成") {
        continue;
      }
      if (!getCaseGenerateRevertStatus(projectId, testPointId)) {
        registerCaseGenerate(
          projectId,
          testPointId,
          this.resolveGenerateRevertStatus(currentStatus),
        );
      }
      cancelCaseGenerate(projectId, testPointId);
      const revert =
        getCaseGenerateRevertStatus(projectId, testPointId) || "已编辑";
      const bucket = grouped.get(revert) || [];
      bucket.push(testPointId);
      grouped.set(revert, bucket);
    }

    for (const [status, ids] of grouped) {
      await this.updateDynamicStatus(ids, status);
    }

    return this.buildProjectView(projectId);
  }

  /**
   * 单条（或批量中的单条）案例生成核心逻辑
   *
   * 步骤概要：
   * 1. 加载结构化需求 + 测试要点 + 场景提示词/自然语言约束
   * 2. 调 pipeline.generateJsonCaseTree → promote-skill 拼 prompt → AI Chat → 解析 JSON
   * 3. 与上一轮 run 合并案例树（append/full 由动态指令决定）
   * 4. createRun 写入编辑台，更新测试要点状态为「生成完成」
   *
   * @param options.skipGeneratingStatus 批量入口已标「生成中」时为 true，避免重复 update
   */
  private async generateCasesInternal(
    projectId: string,
    dto: GenerateCasesDto,
    options?: { skipGeneratingStatus?: boolean },
  ) {
    const { view: project, structDoc } = await this.loadProjectBundle(projectId);
    if (!project.document || !structDoc) {
      throw new BadRequestException(
        "Requirement document must be formatted before generation",
      );
    }

    if (!dto.testPointIds?.length) {
      throw new BadRequestException("请指定要生成案例的测试要点");
    }

    const requirementContext = project.document.structuredMarkdown.trim();
    if (!requirementContext) {
      throw new BadRequestException(
        "需求前景为空，请先在「结构化需求文档」完成结构化并保存",
      );
    }

    const selectedTestPoints = await this.loadAndValidateGenerateTestPoints(
      projectId,
      dto.testPointIds,
    );

    const analysis = this.buildAnalysisFromTestPoints(
      project.document.analysis,
      selectedTestPoints,
    );
    const testPointInputs =
      await this.buildTestPointWorkflowInputs(selectedTestPoints);
    const workflowInputPreview = buildCaseWorkflowInput({
      requirementContext,
      testPoints: testPointInputs,
    });

    const testPointIds = selectedTestPoints.map((item) => item.id);
    const activeTestPointIds = testPointIds.filter(
      (id) => !isCaseGenerateCancelled(projectId, id),
    );
    if (!activeTestPointIds.length) {
      return this.buildProjectView(projectId);
    }

    if (!options?.skipGeneratingStatus) {
      // 单条入口：此处才写入「生成中」
      await this.updateDynamicStatus(activeTestPointIds, "生成中");
    }

    const structDocId = structDoc.id;
    const activeTestPointInputs = testPointInputs.filter((item) =>
      activeTestPointIds.includes(item.id),
    );

    try {
      // --- AI 生成案例 JSON 并转为六级案例树 ---
      const { tree: generatedTree } =
        await this.pipeline.generateJsonCaseTree({
          document: {
            ...project.document,
            analysis,
            structuredMarkdown: requirementContext,
          },
          requirementContext,
          testPoints: activeTestPointInputs,
          model: dto.model,
          shouldAbort: () =>
            activeTestPointIds.some((id) =>
              isCaseGenerateCancelled(projectId, id),
            ),
        });

      const stillActiveTestPointIds = activeTestPointIds.filter(
        (id) => !isCaseGenerateCancelled(projectId, id),
      );
      const cancelledTestPointIds = activeTestPointIds.filter((id) =>
        isCaseGenerateCancelled(projectId, id),
      );
      if (cancelledTestPointIds.length) {
        await this.revertCancelledGenerations(projectId, cancelledTestPointIds);
      }
      if (!stillActiveTestPointIds.length) {
        return this.buildProjectView(projectId);
      }

      const activeSnapshots = activeTestPointInputs.filter((item) =>
        stillActiveTestPointIds.includes(item.id),
      );

      const instructs = await this.instructRepo.find({
        where: { testPointId: In(stillActiveTestPointIds) },
      });
      const mergeModeByTestPointId = new Map<string, CaseTreeMergeMode>(
        stillActiveTestPointIds.map((testPointId) => {
          const instruct = instructs.find(
            (item) => item.testPointId === testPointId,
          );
          const mode: CaseTreeMergeMode = instruct?.isAppend ? "append" : "full";
          return [testPointId, mode];
        }),
      );

      // --- 合并进已有 run、持久化、更新状态 ---
      await withProjectCaseTreeMerge(projectId, async () => {
        const runs = await this.caseEditorService.listRuns(projectId);
        const previousRun = runs[0];
        let finalTree = generatedTree;
        let sourceTestPointIds = stillActiveTestPointIds;
        if (previousRun?.tree && activeSnapshots.length) {
          finalTree = reassignCaseTreeNodeIds(
            mergeCaseTreeBranches(
              previousRun.tree,
              generatedTree,
              activeSnapshots,
              { mergeModeByTestPointId },
            ),
          );
          sourceTestPointIds = mergeSourceTestPointIds(
            previousRun.sourceTestPointIds,
            sourceTestPointIds,
          );
        }

        await this.caseEditorService.createRun({
          projectId,
          structDocId,
          prompt: workflowInputPreview,
          model: dto.model || "ai-chat",
          tree: finalTree,
          status: "completed",
          sourceTestPointIds,
        });
      });

      await this.updateDynamicStatus(stillActiveTestPointIds, "生成完成");
      await touchProjectUpdatedAt(this.projectRepo, projectId);
      return this.buildProjectView(projectId);
    } catch (error) {
      const failedTestPointIds = activeTestPointIds.filter(
        (id) => !isCaseGenerateCancelled(projectId, id),
      );
      const cancelledTestPointIds = activeTestPointIds.filter((id) =>
        isCaseGenerateCancelled(projectId, id),
      );
      if (cancelledTestPointIds.length) {
        await this.revertCancelledGenerations(projectId, cancelledTestPointIds);
      }
      if (failedTestPointIds.length) {
        await this.updateDynamicStatus(failedTestPointIds, "生成失败");
      }
      if (!failedTestPointIds.length) {
        return this.buildProjectView(projectId);
      }
      throw error;
    } finally {
      for (const testPointId of testPointIds) {
        clearCaseGenerateSlot(projectId, testPointId);
      }
    }
  }

  /** 按指令局部扩展或替换案例树节点 */
  async regenerateNode(projectId: string, dto: RegenerateNodeDto) {
    const run = await this.caseEditorService.getRun(projectId, dto.runId);
    const node = this.findNode(run.tree, dto.nodeId);
    if (!node) {
      throw new NotFoundException("Case tree node not found");
    }
    const expansion = this.pipeline.createNodeExpansion(dto.instruction);
    if (dto.mode === "replace") {
      node.children = expansion;
    } else if (dto.mode === "complete") {
      node.children = node.children?.length ? node.children : expansion;
    } else {
      node.children = [...(node.children || []), ...expansion];
    }
    const updated = await this.caseEditorService.updateRunTree(
      projectId,
      dto.runId,
      run.tree,
    );
    await touchProjectUpdatedAt(this.projectRepo, projectId);
    return updated;
  }

  /** 一次加载项目、结构化文档、约束与运行记录（避免重复查 structDoc） */
  private async loadProjectBundle(projectId: string) {
    const project = await this.ensureProject(projectId);
    const [structDoc, constraints, runs] = await Promise.all([
      this.structDocRepo.findOne({
        where: scopedWhere({ projectId }),
      }),
      this.constraintRepo.find({
        where: scopedWhere({ projectId }),
        order: { createdAt: "DESC" },
      }),
      this.caseEditorService.listRuns(projectId),
    ]);

    const view: CaseForgeProject = {
      id: project.id,
      title: project.title || "未命名案例生成项目",
      description: project.description || "",
      document: structDoc ? this.toRequirementDocument(structDoc) : undefined,
      constraints: constraints.map((item) => this.toConstraint(item)),
      runs,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };

    return { project, structDoc: structDoc ?? undefined, view };
  }

  private async buildProjectView(projectId: string): Promise<CaseForgeProject> {
    const { view } = await this.loadProjectBundle(projectId);
    return view;
  }

  private async saveRequirementDocument(
    projectId: string,
    document: RequirementDocument,
    fileName?: string,
  ) {
    const existing = await this.structDocRepo.findOne({
      where: scopedWhere({ projectId }),
    });
    return this.structDocRepo.save(
      this.structDocRepo.create({
        ...existing,
        projectId,
        reqDocName: fileName || existing?.reqDocName || document.fileName,
        aiResponse: {
          rawText: document.rawText,
          fileName: fileName || document.fileName,
          analysis: document.analysis,
          updatedAt: document.updatedAt,
        },
        tempStructDoc: document.structuredMarkdown,
        structuredDocName:
          existing?.structuredDocName ||
          `${document.analysis.requirementId || "structured"}-structured.md`,
      }),
    );
  }

  private toRequirementDocument(
    structDoc: StructDocEntity,
  ): RequirementDocument {
    const payload = (structDoc.aiResponse ||
      {}) as Partial<RequirementDocument> & {
      analysis?: RequirementAnalysis;
      fileName?: string;
      rawText?: string;
      updatedAt?: string;
    };
    const structuredMarkdown = structDoc.tempStructDoc || "";
    const analysis =
      payload.analysis ||
      this.pipeline.rebuildAnalysisFromMarkdown(structuredMarkdown || "");
    return {
      rawText: payload.rawText || "",
      fileName:
        payload.fileName || structDoc.reqDocName || structDoc.structuredDocName,
      structuredMarkdown,
      analysis,
      updatedAt: payload.updatedAt || structDoc.updatedAt.toISOString(),
    };
  }

  private async syncTestPointsFromAnalysis(
    projectId: string,
    structDocId: string,
    analysis: RequirementAnalysis,
  ) {
    const existing = await this.testPointRepo.find({
      where: scopedWhere({ projectId, structDocId }),
      select: ["id"],
    });
    if (existing.length) {
      await this.testPointRepo.delete({
        id: In(existing.map((item) => item.id)),
      });
    }

    const testPoints = analysis.modules.map((module) =>
      this.testPointRepo.create({
        projectId,
        structDocId,
        system: module.system,
        systemDesc: analysis.businessScope,
        featureModule: module.name,
        featureDesc: module.description,
        testPoint: module.rules[0] || `${module.name}校验`,
        testPointDesc: [
          module.description,
          module.rules.length ? `规则：${module.rules.join("；")}` : "",
          module.interactions.length
            ? `交互：${module.interactions.join("；")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      }),
    );
    if (testPoints.length) {
      await this.testPointRepo.save(testPoints);
    }
  }

  private normalizeConstraintInput(
    dto: BuildConstraintsDto,
    analysis?: RequirementAnalysis,
  ): ConstraintInput {
    return {
      scenarioTags: dto.scenarioTags?.length
        ? dto.scenarioTags
        : ["positive", "negative"],
      testDimensions: dto.testDimensions?.length
        ? dto.testDimensions
        : ["functional", "interface"],
      grouping: dto.grouping || "bySystem",
      knowledgeBaseIds: dto.knowledgeBaseIds || [],
      naturalLanguage: dto.naturalLanguage || "",
      featureInstructions: this.normalizeFeatureInstructions(
        dto.featureInstructions,
        analysis,
      ),
    };
  }

  private normalizeFeatureInstructions(
    instructions: BuildConstraintsDto["featureInstructions"] | undefined,
    analysis?: RequirementAnalysis,
  ) {
    const byModuleId = new Map(
      (instructions || []).map((item) => [item.moduleId, item]),
    );
    if (!analysis?.modules.length) {
      return (instructions || []).map((item) => ({
        moduleId: item.moduleId,
        system: item.system,
        featureName: item.featureName,
        instruction: item.instruction,
      }));
    }
    return analysis.modules.map((module) => {
      const matched = byModuleId.get(module.id);
      return {
        moduleId: module.id,
        system: module.system,
        featureName: module.name,
        instruction:
          matched?.instruction?.trim() ||
          `围绕“${module.name}”生成可执行案例，每个测试要点包含正向与反向案例，步骤从系统登录或访问系统开始。`,
      };
    });
  }

  /**
   * 从 DB 拉取测试要点关联数据，供 promote-skill 拼 {prompts} 使用
   *
   * - case_test_point_instruct.naturalText → naturalLanguage
   * - case_test_point_prompt + prompt_library → scenarioPrompts
   */
  private async buildTestPointWorkflowInputs(
    testPoints: TestPointEntity[],
  ): Promise<TestPointGenerationInput[]> {
    const base = mapTestPointsForWorkflow(testPoints);
    if (!base.length) {
      return base;
    }

    const testPointIds = testPoints.map((item) => item.id);
    const [instructs, selections] = await Promise.all([
      this.instructRepo.find({ where: { testPointId: In(testPointIds) } }),
      this.promptSelectionRepo.find({
        where: { testPointId: In(testPointIds) },
        relations: ["prompt"],
        order: { createdAt: "ASC" },
      }),
    ]);

    const naturalByTestPointId = new Map(
      instructs.map((item) => [
        item.testPointId,
        item.naturalText?.trim() || "",
      ]),
    );
    const promptsByTestPointId = new Map<string, ScenarioPromptInput[]>();
    for (const row of selections) {
      const prompt = row.prompt;
      if (!prompt) {
        continue;
      }
      const bucket = promptsByTestPointId.get(row.testPointId) ?? [];
      bucket.push({
        name: prompt.name?.trim() || "",
        content: prompt.content?.trim() || "",
      });
      promptsByTestPointId.set(row.testPointId, bucket);
    }

    return base.map((item) => ({
      ...item,
      scenarioPrompts: promptsByTestPointId.get(item.id),
      naturalLanguage: naturalByTestPointId.get(item.id) || undefined,
    }));
  }

  private async buildConstraintInputFromDynamic(
    projectId: string,
    analysis: RequirementAnalysis,
    testPoints: TestPointEntity[],
  ): Promise<ConstraintInput> {
    const testPointIds = testPoints.map((item) => item.id);
    const [instructs, selections] = await Promise.all([
      this.instructRepo.find({ where: { testPointId: In(testPointIds) } }),
      this.promptSelectionRepo.find({
        where: { testPointId: In(testPointIds) },
        relations: ["prompt"],
        order: { createdAt: "ASC" },
      }),
    ]);

    const instructMap = new Map(
      instructs.map((item) => [item.testPointId, item]),
    );
    const selectionMap = new Map<string, TestPointPromptEntity[]>();
    for (const row of selections) {
      selectionMap.set(row.testPointId, [
        ...(selectionMap.get(row.testPointId) || []),
        row,
      ]);
    }

    return {
      scenarioTags: ["positive", "negative"],
      testDimensions: ["functional", "interface", "data"],
      grouping: "bySystem",
      knowledgeBaseIds: [],
      naturalLanguage: "",
      featureInstructions: testPoints.map((testPoint) => {
        const instruct = instructMap.get(testPoint.id);
        const promptText = (selectionMap.get(testPoint.id) || [])
          .map((item) => item.prompt?.content?.trim())
          .filter(Boolean)
          .join("\n");
        const naturalText = instruct?.naturalText?.trim() || "";
        const instruction = [promptText, naturalText]
          .filter(Boolean)
          .join("\n");
        return {
          moduleId: testPoint.id,
          system: testPoint.system,
          featureName: `${testPoint.featureModule} / ${testPoint.testPoint}`,
          instruction:
            instruction ||
            `围绕“${testPoint.testPoint}”生成可执行案例，覆盖业务规则、系统交互、异常分支和数据一致性断言。`,
        };
      }),
    };
  }

  private buildAnalysisFromTestPoints(
    baseAnalysis: RequirementAnalysis,
    testPoints: TestPointEntity[],
  ): RequirementAnalysis {
    const modules: RequirementModule[] = testPoints.map((item) => ({
      id: item.id,
      system: item.system,
      name: `${item.featureModule} / ${item.testPoint}`,
      source: "动态指令测试要点",
      description: item.testPointDesc || item.featureDesc || item.testPoint,
      rules: [item.testPoint, item.testPointDesc].filter(Boolean),
      interactions: [item.featureDesc].filter(Boolean),
    }));
    return {
      ...baseAnalysis,
      modules,
    };
  }

  /** 校验测试要点存在且 system / featureModule / testPoint 非空 */
  private async loadAndValidateGenerateTestPoints(
    projectId: string,
    testPointIds: string[],
  ) {
    const selectedTestPoints = await this.testPointRepo.find({
      where: scopedWhere({
        id: In(testPointIds),
        projectId,
      }),
      order: { createdAt: "desc" },
    });
    if (selectedTestPoints.length !== testPointIds.length) {
      throw new BadRequestException("部分测试要点不存在或不属于当前项目");
    }

    for (const testPoint of selectedTestPoints) {
      const system = testPoint.system?.trim() || "";
      const featureModule = testPoint.featureModule?.trim() || "";
      const point = testPoint.testPoint?.trim() || "";
      if (!system || !featureModule || !point) {
        const label = point || featureModule || system || testPoint.id;
        throw new BadRequestException(
          `测试要点「${label}」的系统、功能模块、测试要点均不能为空，无法生成案例`,
        );
      }
    }

    return selectedTestPoints;
  }

  /** 取消/失败时回退的目标状态：生成完成→再编辑，其余→已编辑 */
  private resolveGenerateRevertStatus(
    current?: TestPointInstructEntity["status"],
  ): TestPointInstructEntity["status"] {
    if (current === "再编辑" || current === "生成完成") {
      return "再编辑";
    }
    return "已编辑";
  }

  /** 生成开始前写入内存 cancel 槽，供「停止」按钮回退状态 */
  private async registerGenerateSlots(
    projectId: string,
    testPointIds: string[],
  ) {
    const instructs = await this.instructRepo.find({
      where: { testPointId: In(testPointIds) },
    });
    const instructByTestPoint = new Map(
      instructs.map((item) => [item.testPointId, item]),
    );
    for (const testPointId of testPointIds) {
      registerCaseGenerate(
        projectId,
        testPointId,
        this.resolveGenerateRevertStatus(
          instructByTestPoint.get(testPointId)?.status,
        ),
      );
    }
  }

  /** 用户停止后，按 register 时记录的 revertStatus 写回 DB */
  private async revertCancelledGenerations(
    projectId: string,
    testPointIds: string[],
  ) {
    const grouped = new Map<TestPointInstructEntity["status"], string[]>();
    for (const testPointId of testPointIds) {
      const revert =
        getCaseGenerateRevertStatus(projectId, testPointId) || "已编辑";
      const bucket = grouped.get(revert) || [];
      bucket.push(testPointId);
      grouped.set(revert, bucket);
    }
    for (const [status, ids] of grouped) {
      await this.updateDynamicStatus(ids, status);
    }
  }

  /** 批量更新 case_test_point_instruct.status */
  private async updateDynamicStatus(testPointIds: string[], status: string) {
    if (!testPointIds.length) {
      return;
    }
    await this.instructRepo
      .createQueryBuilder()
      .update(TestPointInstructEntity)
      .set({
        status: status as TestPointInstructEntity["status"],
        ...auditFieldsForUpdate(),
      })
      .where("testPointId IN (:...testPointIds)", { testPointIds })
      .execute();
  }

  private toConstraint(entity: CaseConstraintEntity): ConstraintInstruction {
    return {
      id: entity.id,
      projectId: entity.projectId,
      input: entity.input as unknown as ConstraintInput,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  private async ensureProject(projectId: string) {
    return findOwnedProject(this.projectRepo, projectId);
  }

  private async getStructDocId(projectId: string) {
    return (
      await this.structDocRepo.findOne({
        where: scopedWhere({ projectId }),
        select: ["id"],
      })
    )?.id;
  }

  private async extractText(
    file: Express.Multer.File,
    normalizedFileName = file.originalname,
  ) {
    return extractTextFromBuffer(file.buffer, {
      fileName: normalizedFileName,
      contentType: file.mimetype,
    });
  }

  private normalizeUploadFileName(fileName: string) {
    const decoded = Buffer.from(fileName, "latin1").toString("utf8");
    const looksMojibake = /[ÃÂâåæçèéäöü]/.test(fileName);
    const decodedLooksReadable =
      !decoded.includes("�") && /[\u4e00-\u9fff]/.test(decoded);
    return looksMojibake && decodedLooksReadable ? decoded : fileName;
  }

  private findNode(node: CaseTreeNode, nodeId: string): CaseTreeNode | null {
    if (node.id === nodeId) {
      return node;
    }
    for (const child of node.children || []) {
      const found = this.findNode(child, nodeId);
      if (found) {
        return found;
      }
    }
    return null;
  }
}
