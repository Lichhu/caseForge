/**
 * 案例生成流水线
 *
 * **当前主路径**：generateJsonCaseTree（promote-skill + AI Chat + JSON → 案例树）
 *
 * **遗留路径**：generateCaseTree（旧 case-skill Markdown 工作流），保留作参考/未配置 AI Chat 时本地规则。
 *
 * Skill 文件均从 MinIO URL 拉取：promote-skill / case-skill / require-skill
 */
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AiWorkflowService } from "../../../common/ai-workflow/service/ai-workflow.service";
import { fetchTextFromUrl } from "../../../common/ai-workflow/util/workflow-input.util";
import { MinioStorageService } from "../../../common/minio/service/minio.service";
import type {
  CaseNodeKind,
  CasePriority,
  CaseTreeNode,
  ConstraintInput,
  RequirementAnalysis,
  RequirementDocument,
  RequirementModule,
  SceneTag,
} from "@case-forge/shared";
import {
  buildFallbackCaseTitle,
  extractCasePolarity,
  isPlaceholderCaseTitle,
  normalizeCaseTreeForSkill,
  sanitizeCaseTitleText,
  simplifyRequirementTitleForDisplay,
} from "@case-forge/shared";
/** 生成案例时使用的测试要点快照 */
export interface TestPointSnapshot {
  id: string;
  system: string;
  systemDesc?: string;
  featureModule: string;
  featureDesc?: string;
  testPoint: string;
  testPointDesc?: string;
}

import type { TestPointGenerationInput } from "../util/case-workflow-input.util";
export type { TestPointGenerationInput } from "../util/case-workflow-input.util";
import {
  buildCaseWorkflowInput,
  buildPromotePromptsText,
} from "../util/case-workflow-input.util";

/** AI Chat 返回的单条案例 JSON（字段名与 promote-skill 约定一致） */
interface JsonCaseItem {
  testPoint?: string;
  testName?: string; // 部分模型返回 testName，与 testPoint 同义
  caseName?: string; // 案例标题 → case_title 节点
  alms?: string; // 案例描述
  qztj?: string; // 前置条件，多条以 & 分隔，如 "1、登录&2、有权限&"
  allx?: string; // 案例类型：「正」|「反」
  albz?: string; // 测试步骤，& 分隔
  yqjg?: string; // 预期结果，& 分隔
  yxj?: string; // 优先级：高/中/低 → P0/P1/P2
}

/** 案例树生成入参（promote-skill 从 MinIO 拉取，不在此拼接全文） */
export interface GenerateCaseTreeParams {
  document: RequirementDocument;
  /** 结构化需求 Markdown 全文，填入 promote 的 {markdownContent} */
  requirementContext: string;
  /** 待生成的测试要点（含场景提示词、自然语言约束） */
  testPoints: TestPointGenerationInput[];
  model?: string;
  /** 用户点「停止」时返回 true，中断后续 testPoint 的 AI 调用 */
  shouldAbort?: () => boolean;
}
import { parseCaseSkillMarkdown } from "../util/case-markdown-tree.util";

const sceneLabel: Record<SceneTag, string> = {
  positive: "正向案例",
  negative: "反向案例",
  exception: "异常流程",
  boundary: "边界值",
  permission: "权限校验",
  e2e: "端到端",
  api: "接口测试",
  ui: "UI 交互",
  concurrency: "并发重复提交",
};

/** 案例生成流水线服务 */
@Injectable()
export class CasePipelineService {
  private readonly logger = new Logger(CasePipelineService.name);

  constructor(
    private readonly aiWorkflow: AiWorkflowService,
    private readonly minio: MinioStorageService,
  ) {}

  /** 将原始需求文本格式化为结构化 Markdown 与分析结果 */
  async formatRequirement(
    rawText: string,
    fileName?: string,
  ): Promise<RequirementDocument> {
    const requirementInput = [
      "# 需求文档",
      "",
      fileName ? `文件名：${fileName}` : "",
      "",
      rawText.trim(),
    ]
      .filter(Boolean)
      .join("\n");
    const aiMarkdown = await this.generateMarkdownByWorkflow(
      requirementInput,
      "req",
    );
    const structuredMarkdown =
      aiMarkdown ||
      this.renderStructuredMarkdown(this.analyzeRequirement(rawText));
    const analysis = this.analyzeRequirement(structuredMarkdown);
    return {
      rawText,
      fileName,
      structuredMarkdown,
      analysis,
      updatedAt: new Date().toISOString(),
    };
  }

  /** 检查 AI Workflow 是否已配置 */
  isAiConfigured() {
    return this.aiWorkflow.isConfigured();
  }

  /** 从结构化 Markdown 重建需求分析对象 */
  rebuildAnalysisFromMarkdown(markdown: string): RequirementAnalysis {
    return this.analyzeRequirement(markdown);
  }

  /** 生成案例树：已配置 AI Workflow 时仅走工作流，失败则抛错；未配置时用本地规则 */
  async generateCaseTree(params: GenerateCaseTreeParams) {
    const { document, requirementContext, testPoints } = params;
    const workflowInput = buildCaseWorkflowInput({
      requirementContext,
      testPoints,
    });
    const rootTitle =
      `${document.analysis.requirementId} ${document.analysis.requirementName}`.trim() ||
      "测试案例";
    const prompt = workflowInput;
    const localConstraint = this.defaultLocalConstraint();

    let tree: CaseTreeNode;
    if (this.shouldUseWorkflowForCaseGeneration()) {
      const llmTree = await this.generateCaseTreeByWorkflow(
        workflowInput,
        rootTitle,
      );
      const normalizedLlmTree = this.normalizeToSixLevelTree(
        this.ensureNodeIds(llmTree, "root"),
        document.analysis,
      );
      if (this.isLowQualityAiTree(normalizedLlmTree)) {
        throw new BadRequestException(
          "AI Workflow 返回的案例树缺少有效业务内容，生成失败",
        );
      }
      tree = normalizedLlmTree;
    } else {
      this.logger.warn("AI Workflow 未配置，使用本地规则生成案例树");
      tree = this.generateSixLevelLocalTree(
        document.analysis,
        localConstraint,
        testPoints,
      );
    }
    if (testPoints.length) {
      tree = this.alignTreeToTestPointHierarchy(tree, testPoints);
      tree = this.normalizeRequirementTitles(tree, testPoints);
    }
    tree = this.normalizeCaseNodesToSkillFormat(tree);
    tree = this.ensureCaseTitles(tree);
    tree = normalizeCaseTreeForSkill(tree);
    tree = this.ensureNodeIds(tree, "root");
    return { prompt, tree };
  }

  /**
   * 当前主路径：promote-skill + AI Chat → JSON 案例数组 → 六级案例树
   *
   * 对每个 testPoint：
   * 1. buildPromotePromptsText 拼场景提示词 + 自然语言约束 → {prompts}
   * 2. runCaseWorkflowJson 替换 promote 模板并调 AI Chat
   * 3. buildCaseTreeFromJsonCases 组装 根→系统→模块→测试要点→案例 树
   */
  async generateJsonCaseTree(params: GenerateCaseTreeParams) {
    const { document, requirementContext, testPoints, model, shouldAbort } =
      params;
    if (!testPoints.length) {
      throw new BadRequestException("未指定测试要点");
    }
    if (!this.aiWorkflow.canGenerateJsonCases()) {
      throw new BadRequestException(
        "AI Chat 或 promote-skill 未配置，请检查 AI_CHAT_URL 与 CASE_DOC_PROMOTE_URL",
      );
    }

    const rootTitle =
      `${document.analysis.requirementId} ${document.analysis.requirementName}`.trim() ||
      "测试案例";
    const casesByTestPointId = new Map<string, JsonCaseItem[]>();

    for (const point of testPoints) {
      if (shouldAbort?.()) {
        break;
      }
      const promptsText = buildPromotePromptsText(point);
      const jsonCases = await this.runCaseWorkflowJson(
        point.featureModule,
        point.testPoint,
        requirementContext,
        promptsText,
        model,
      );
      casesByTestPointId.set(point.id, jsonCases);
    }

    let tree = this.buildCaseTreeFromJsonCases(
      rootTitle,
      testPoints,
      casesByTestPointId,
    );
    tree = this.normalizeRequirementTitles(tree, testPoints);
    tree = this.normalizeCaseNodesToSkillFormat(tree);
    tree = this.ensureCaseTitles(tree);
    tree = normalizeCaseTreeForSkill(tree);
    tree = this.ensureNodeIds(tree, "root");
    return { tree };
  }

  /** 根据自然语言指令生成局部节点扩展子树 */
  createNodeExpansion(instruction: string): CaseTreeNode[] {
    const normalized = instruction.trim() || "补充测试场景";
    return [
      this.sixLevelCaseNode(
        "案例详情 [正向]",
        `[补充] ${normalized}`,
        "P1",
        "补充测试",
        [
          `已选中目标节点，依据指令“${normalized}”进行局部扩展`,
          "测试数据已准备且满足原需求前置条件",
        ],
        [
          "在目标业务入口执行新增场景操作",
          "观察接口返回、页面提示与数据落库结果",
        ],
        [
          "新增场景不破坏原有案例结构",
          "关键断言覆盖业务规则、异常反馈和数据一致性",
        ],
      ),
    ];
  }

  private analyzeRequirement(text: string): RequirementAnalysis {
    const requirementId = this.extractRequirementId(text);
    const requirementName = this.extractRequirementName(text, requirementId);
    const systems = this.extractSystems(text);
    const modules = this.extractModules(text, systems);
    const businessScope = systems.join("、") || "待识别业务范围";
    const risks = this.extractRisks(text);

    return {
      requirementId,
      requirementName,
      businessScope,
      summary: this.extractSummary(text, requirementName),
      modules,
      risks,
    };
  }

  private renderStructuredMarkdown(analysis: RequirementAnalysis) {
    const moduleBlocks = analysis.modules
      .map((module, index) =>
        [
          `### ${index + 1}. 系统：${module.system}`,
          "",
          `#### 功能模块：${module.name}`,
          "",
          `> 需求来源：${module.source}`,
          "",
          `**功能描述**：${module.description}`,
          "",
          "**业务规则**：",
          ...module.rules.map((rule) => `- ${rule}`),
          "",
          "**系统交互**：",
          ...module.interactions.map((item) => `- ${item}`),
          "",
          "**测试要点**：",
          "- 业务规则验证：覆盖正常、异常、边界和数据一致性。",
          "- 系统交互验证：覆盖接口成功、失败、超时和异常返回。",
          "- 用户体验验证：覆盖提示文案、弹窗、按钮状态和重复提交。",
        ].join("\n"),
      )
      .join("\n\n---\n\n");

    return [
      `# ${analysis.requirementId} ${analysis.requirementName} - 测试分析`,
      "",
      "## 需求概述",
      "",
      `**需求编号**：${analysis.requirementId}`,
      `**需求名称**：${analysis.requirementName}`,
      `**业务范围**：${analysis.businessScope}`,
      "",
      `> ${analysis.summary}`,
      "",
      "---",
      "",
      "## 系统与功能测试分析",
      "",
      moduleBlocks,
      "",
      "---",
      "",
      "## 需求级测试要点汇总",
      "",
      "### 关键业务流程测试",
      "- 覆盖需求涉及的端到端主流程、拦截流程和状态流转。",
      "",
      "### 系统间交互测试",
      "- 覆盖接口调用、返回码、超时、异常数据和重试策略。",
      "",
      "### 非功能测试要点",
      ...analysis.risks.map((risk) => `- ${risk}`),
    ].join("\n");
  }

  private generateSixLevelLocalTree(
    analysis: RequirementAnalysis,
    constraint: ConstraintInput,
    testPoints?: TestPointSnapshot[],
  ): CaseTreeNode {
    const root = this.node(
      `${analysis.requirementId} ${analysis.requirementName}`.trim(),
      "root",
      [],
    );

    if (testPoints?.length) {
      root.children = this.buildSystemNodesFromTestPoints(
        testPoints,
        constraint,
      );
      return root;
    }

    const modulesBySystem = new Map<string, RequirementModule[]>();
    for (const module of analysis.modules) {
      modulesBySystem.set(module.system, [
        ...(modulesBySystem.get(module.system) || []),
        module,
      ]);
    }

    root.children = [...modulesBySystem.entries()].map(([system, modules]) =>
      this.node(
        system,
        "system",
        modules.map((module) => this.buildModuleBranch(module, constraint)),
      ),
    );
    return root;
  }

  private buildSystemNodesFromTestPoints(
    testPoints: TestPointSnapshot[],
    constraint: ConstraintInput,
  ) {
    const systemMap = new Map<string, Map<string, TestPointSnapshot[]>>();
    for (const item of testPoints) {
      if (!systemMap.has(item.system)) {
        systemMap.set(item.system, new Map());
      }
      const moduleMap = systemMap.get(item.system)!;
      if (!moduleMap.has(item.featureModule)) {
        moduleMap.set(item.featureModule, []);
      }
      moduleMap.get(item.featureModule)!.push(item);
    }

    return [...systemMap.entries()].map(([system, moduleMap]) =>
      this.node(
        system,
        "system",
        [...moduleMap.entries()].map(([featureModule, points]) =>
          this.node(
            featureModule,
            "module",
            points.map((point) =>
              this.buildRequirementBranch(point, constraint),
            ),
          ),
        ),
      ),
    );
  }

  private buildModuleBranch(
    module: RequirementModule,
    constraint: ConstraintInput,
  ) {
    const requirementTitle =
      module.rules[0] || module.description || `${module.name}测试要点`;
    return this.node(
      requirementTitle,
      "requirement",
      this.buildCasesForModule(module, constraint),
      {
        source: module.source,
      },
    );
  }

  private buildRequirementBranch(
    point: TestPointSnapshot,
    constraint: ConstraintInput,
  ) {
    const requirementTitle = (point.testPoint || "").trim() || "测试要点";
    const module = this.testPointToModule(point);
    return this.node(
      requirementTitle,
      "requirement",
      this.buildCasesForModule(module, constraint, point.testPointDesc),
      {
        source: point.featureDesc || "动态指令测试要点",
      },
    );
  }

  private buildCasesForModule(
    module: RequirementModule,
    constraint: ConstraintInput,
    instructionHint = "",
  ) {
    const featureInstruction =
      this.findFeatureInstruction(module, constraint) || instructionHint;
    const knowledgeBaseIds = constraint.knowledgeBaseIds;
    return [
      this.buildSkillPolarityCase(
        "正向",
        module,
        constraint,
        featureInstruction,
        knowledgeBaseIds,
      ),
      this.buildSkillPolarityCase(
        "反向",
        module,
        constraint,
        featureInstruction,
        knowledgeBaseIds,
      ),
    ];
  }

  /** 按 case-skill：每个测试要点一条正向、一条反向 */
  private buildSkillPolarityCase(
    polarity: "正向" | "反向",
    module: RequirementModule,
    constraint: ConstraintInput,
    featureInstruction: string,
    knowledgeBaseIds: string[],
  ) {
    const positive = polarity === "正向";
    const caseTitle = positive
      ? `${module.name}在满足准入条件时正常完成`
      : `未满足「${module.rules[0] || "业务规则"}」时系统拦截并提示`;
    const conditions = positive
      ? [`${module.system} 可正常访问`, "客户或业务数据不命中拦截规则"]
      : [
          `构造不满足「${module.rules[0] || "业务规则"}」的测试数据`,
          "用户已进入目标功能页面",
        ];
    const steps = positive
      ? [
          "从系统登录或访问系统入口进入功能",
          `执行「${module.name}」核心操作`,
          "提交业务请求并等待处理结果",
        ]
      : [
          "从系统登录或访问系统入口进入功能",
          "提交不满足业务规则的请求",
          "查看页面提示与处理结果",
        ];
    const expectations = positive
      ? ["业务流程正常完成", "关键状态、落库数据和页面提示与需求一致"]
      : ["系统阻断后续流程", "提示文案清晰准确", "不产生错误业务数据"];
    return this.sixLevelCaseNode(
      `案例详情 [${polarity}]`,
      caseTitle,
      positive ? "P1" : "P0",
      positive ? "功能测试" : "功能测试",
      conditions,
      steps,
      expectations,
      knowledgeBaseIds,
      featureInstruction,
    );
  }

  private testPointToModule(point: TestPointSnapshot): RequirementModule {
    return {
      id: point.id,
      system: point.system,
      name: point.featureModule,
      source: point.featureDesc || "动态指令测试要点",
      description: point.testPointDesc || point.testPoint,
      rules: [point.testPoint, point.testPointDesc].filter(Boolean) as string[],
      interactions: [point.featureDesc].filter(Boolean) as string[],
    };
  }

  private convertScenarioToCaseNode(
    scenario: CaseTreeNode,
    featureInstruction = "",
  ) {
    const conditions = this.extractLegacySectionLines(scenario, "前置");
    const steps = this.extractLegacySectionLines(scenario, "步骤");
    const expectations = this.extractLegacySectionLines(scenario, "预期");
    const { caseNodeTitle, caseTitle } = this.resolveSkillCaseTitles(
      scenario.title,
    );
    return this.sixLevelCaseNode(
      caseNodeTitle,
      caseTitle,
      scenario.metadata?.priority || "P1",
      scenario.metadata?.caseType || "功能测试",
      conditions.length ? conditions : ["测试数据和环境已准备"],
      steps.length ? steps : ["执行目标业务操作"],
      expectations.length ? expectations : ["结果符合需求预期"],
      scenario.metadata?.knowledgeBaseIds || [],
      featureInstruction || scenario.metadata?.source,
    );
  }

  private extractLegacySectionLines(node: CaseTreeNode, keyword: string) {
    const section = node.children?.find(
      (item) => item.kind === "section" && item.title.includes(keyword),
    );
    if (!section) {
      return [] as string[];
    }
    return (section.children || []).map((item) =>
      item.title.replace(/^\d+\.\s*/, ""),
    );
  }

  private resolveSkillCaseTitles(rawTitle: string) {
    const title = rawTitle.trim();
    const legacy = title.match(
      /^\[(正向|反向|异常|边界|接口|权限|端到端|UI|并发)\]\s*(.*)$/u,
    );
    if (!legacy) {
      if (title.startsWith("案例详情 [")) {
        const caseTitleChild = title
          .replace(/^案例详情\s*\[[^\]]+\]\s*/, "")
          .trim();
        return {
          caseNodeTitle: title.match(/^案例详情\s*\[[^\]]+\]/)?.[0] || title,
          caseTitle: isPlaceholderCaseTitle(caseTitleChild)
            ? ""
            : caseTitleChild,
        };
      }
      return {
        caseNodeTitle: title,
        caseTitle: isPlaceholderCaseTitle(title) ? "" : title,
      };
    }
    const polarity = legacy[1] === "正向" ? "正向" : ("反向" as const);
    const caseTitle = sanitizeCaseTitleText(legacy[2] || "");
    return {
      caseNodeTitle: `案例详情 [${polarity}]`,
      caseTitle,
    };
  }

  /** 将 AI/旧模板中的 [异常]/[边界]/[接口] 等统一为 case-skill 的正向/反向格式 */
  private normalizeCaseNodesToSkillFormat(tree: CaseTreeNode): CaseTreeNode {
    const walk = (node: CaseTreeNode): CaseTreeNode => {
      if (node.kind === "case" || node.kind === "scenario") {
        const { caseNodeTitle, caseTitle } = this.resolveSkillCaseTitles(
          node.title,
        );
        const titleChild = node.children?.find(
          (item) => item.kind === "case_title",
        );
        const resolvedTitle =
          titleChild?.title && !isPlaceholderCaseTitle(titleChild.title)
            ? sanitizeCaseTitleText(titleChild.title)
            : caseTitle && !isPlaceholderCaseTitle(caseTitle)
              ? caseTitle
              : "";
        const nextChildren = (node.children || []).map((child) =>
          child.kind === "case_title"
            ? {
                ...child,
                title:
                  resolvedTitle ||
                  (isPlaceholderCaseTitle(child.title) ? "" : child.title),
              }
            : walk(child),
        );
        if (!titleChild && resolvedTitle) {
          nextChildren.unshift(this.node(resolvedTitle, "case_title"));
        }
        return { ...node, title: caseNodeTitle, children: nextChildren };
      }
      return {
        ...node,
        children: (node.children || []).map((child) => walk(child)),
      };
    };
    return walk(tree);
  }

  /** 补齐 case_title 业务标题，避免与「案例详情 [正向/反向]」占位重复 */
  private ensureCaseTitles(tree: CaseTreeNode): CaseTreeNode {
    const walk = (
      node: CaseTreeNode,
      requirementTitle?: string,
    ): CaseTreeNode => {
      const nextRequirement =
        node.kind === "requirement"
          ? simplifyRequirementTitleForDisplay(node.title)
          : requirementTitle;
      if (node.kind !== "case") {
        return {
          ...node,
          children: (node.children || []).map((child) =>
            walk(child, nextRequirement),
          ),
        };
      }

      const polarity = extractCasePolarity(node.title) || "正向";
      const titleChild = node.children?.find(
        (item) => item.kind === "case_title",
      );
      const currentTitle = sanitizeCaseTitleText(titleChild?.title || "");
      const resolvedTitle = isPlaceholderCaseTitle(currentTitle)
        ? this.buildDefaultCaseTitle(nextRequirement, polarity)
        : currentTitle;

      const nextChildren = (node.children || []).map((child) =>
        child.kind === "case_title"
          ? { ...child, title: resolvedTitle }
          : walk(child, nextRequirement),
      );
      if (!titleChild) {
        nextChildren.unshift(this.node(resolvedTitle, "case_title"));
      }
      return { ...node, children: nextChildren };
    };
    return walk(tree);
  }

  private buildDefaultCaseTitle(
    requirementTitle: string | undefined,
    polarity: "正向" | "反向",
  ) {
    return buildFallbackCaseTitle(requirementTitle, polarity);
  }

  private sixLevelCaseNode(
    caseNodeTitle: string,
    caseTitle: string,
    priority: CasePriority,
    caseType: string,
    conditions: string[],
    steps: string[],
    expectations: string[],
    knowledgeBaseIds: string[] = [],
    featureInstruction = "",
  ) {
    const children: CaseTreeNode[] = [
      this.node(caseTitle, "case_title"),
      this.node(conditions.join("\n"), "case_condition"),
      this.node(
        steps.map((item, index) => `${index + 1}. ${item}`).join("\n"),
        "case_step",
      ),
      this.node(
        expectations.map((item, index) => `${index + 1}. ${item}`).join("\n"),
        "case_expected",
      ),
    ];
    return this.node(caseNodeTitle, "case", children, {
      priority,
      caseType,
      knowledgeBaseIds,
      source: featureInstruction
        ? `动态指令：${featureInstruction}`
        : undefined,
    });
  }

  private normalizeToSixLevelTree(
    tree: CaseTreeNode,
    analysis: RequirementAnalysis,
  ): CaseTreeNode {
    if (
      this.containsKind(tree, "requirement") ||
      this.containsKind(tree, "case")
    ) {
      return tree;
    }
    return this.generateSixLevelLocalTree(analysis, {
      scenarioTags: ["positive", "negative"],
      testDimensions: ["functional", "interface"],
      grouping: "bySystem",
      knowledgeBaseIds: [],
      naturalLanguage: "",
      featureInstructions: [],
    });
  }

  private containsKind(node: CaseTreeNode, kind: CaseNodeKind): boolean {
    if (node.kind === kind) {
      return true;
    }
    return (node.children || []).some((child) =>
      this.containsKind(child, kind),
    );
  }

  private generateLocalTree(
    analysis: RequirementAnalysis,
    constraint: ConstraintInput,
  ): CaseTreeNode {
    const root = this.node(
      `${analysis.requirementId} ${analysis.requirementName} - 测试案例`,
      "root",
      [],
    );
    const modulesBySystem = new Map<string, RequirementModule[]>();
    for (const module of analysis.modules) {
      modulesBySystem.set(module.system, [
        ...(modulesBySystem.get(module.system) || []),
        module,
      ]);
    }

    if (constraint.grouping === "byScenarioType") {
      root.children = constraint.scenarioTags.map((tag) =>
        this.node(
          sceneLabel[tag],
          "system",
          analysis.modules.map((module) =>
            this.moduleNode(module, [tag], constraint),
          ),
        ),
      );
      return root;
    }

    if (constraint.grouping === "byModule") {
      root.children = analysis.modules.map((module) =>
        this.moduleNode(module, constraint.scenarioTags, constraint),
      );
      return root;
    }

    root.children = [...modulesBySystem.entries()].map(([system, modules]) =>
      this.node(
        system,
        "system",
        modules.map((module) =>
          this.moduleNode(module, constraint.scenarioTags, constraint),
        ),
      ),
    );
    return root;
  }

  private moduleNode(
    module: RequirementModule,
    tags: SceneTag[],
    constraint: ConstraintInput,
  ) {
    const scenarios = tags.flatMap((tag) =>
      this.scenariosForTag(tag, module, constraint),
    );
    const instruction = this.findFeatureInstruction(module, constraint);
    return this.node(module.name, "module", scenarios, {
      source: instruction
        ? `${module.source}；动态指令：${instruction}`
        : module.source,
    });
  }

  private scenariosForTag(
    tag: SceneTag,
    module: RequirementModule,
    constraint: ConstraintInput,
  ) {
    const knowledgeBaseIds = constraint.knowledgeBaseIds;
    const featureInstruction = this.findFeatureInstruction(module, constraint);
    if (tag === "negative") {
      return [
        this.scenarioNode(
          "[反向] 未满足业务规则时系统拦截",
          "P0",
          "功能测试",
          [
            `构造不满足「${module.rules[0] || "业务规则"}」的数据`,
            "用户已进入目标功能页面",
          ],
          [
            "从系统登录或访问系统进入功能",
            "提交不满足规则的请求",
            "查看页面提示与处理结果",
          ],
          ["系统阻断后续流程", "提示准确", "不产生错误业务数据"],
          knowledgeBaseIds,
          featureInstruction,
        ),
      ];
    }
    if (tag === "positive") {
      return [
        this.scenarioNode(
          "[正向] 满足准入条件时流程正常通过",
          "P1",
          "功能测试",
          [`${module.system} 可正常访问`, "客户或业务数据不命中拦截规则"],
          [
            "进入功能入口",
            `执行“${module.name}”核心操作`,
            "提交业务请求并等待处理结果",
          ],
          ["业务流程正常完成", "关键状态、落库数据和页面提示与需求一致"],
          knowledgeBaseIds,
          featureInstruction,
        ),
      ];
    }
    if (tag === "exception") {
      return [
        this.scenarioNode(
          "[异常] 命中业务规则时拦截",
          "P0",
          "异常测试",
          [
            `构造命中“${module.rules[0] || "业务拦截"}”的数据`,
            "用户已进入目标功能页面",
          ],
          ["提交业务请求", "检查接口返回和前端反馈", "继续尝试后续流程"],
          ["系统阻断后续流程", "提示文案清晰准确", "不产生错误业务数据"],
          knowledgeBaseIds,
          featureInstruction,
        ),
        this.scenarioNode(
          "[异常] 依赖系统超时或无响应",
          "P0",
          "接口测试",
          ["已模拟下游系统超时或无响应", "请求参数满足基本校验"],
          ["发起业务请求", "等待接口超时", "查看页面提示和服务端日志"],
          [
            "系统返回可理解的失败提示",
            "不默认放行业务",
            "日志记录 trace 信息便于排障",
          ],
          knowledgeBaseIds,
          featureInstruction,
        ),
      ];
    }
    if (tag === "boundary") {
      return [
        this.scenarioNode(
          "[边界] 状态枚举边界识别",
          "P0",
          "数据测试",
          ["准备正常、冻结、解约、待生效、空状态等枚举数据"],
          ["分别使用不同状态数据提交请求", "记录每次处理结果"],
          ["仅需求指定状态触发拦截或放行", "未知状态按异常数据处理并可追踪"],
          knowledgeBaseIds,
          featureInstruction,
        ),
      ];
    }
    if (tag === "permission") {
      return [
        this.scenarioNode(
          "[权限] 无权限用户访问功能",
          "P1",
          "权限测试",
          ["准备无权限账号或过期会话", `目标功能为“${module.name}”`],
          ["使用无权限账号进入功能入口", "尝试提交业务请求"],
          ["系统拒绝访问或提交", "不会泄露敏感业务数据"],
          knowledgeBaseIds,
          featureInstruction,
        ),
      ];
    }
    if (tag === "e2e") {
      return [
        this.scenarioNode(
          "[端到端] 跨系统主链路一致性",
          "P1",
          "端到端测试",
          ["上下游系统测试环境可用", "准备完整业务链路数据"],
          ["从渠道入口发起请求", "跟踪下游接口与数据同步", "核对最终业务状态"],
          ["各系统状态一致", "接口调用顺序、数据同步结果和用户反馈均符合需求"],
          knowledgeBaseIds,
          featureInstruction,
        ),
      ];
    }
    if (tag === "api") {
      return [
        this.scenarioNode(
          "[接口] 返回字段和错误码校验",
          "P1",
          "接口测试",
          ["已关联接口定义或准备接口契约", "请求参数覆盖必填与可选字段"],
          ["调用接口", "校验响应字段、错误码和错误信息", "检查服务端日志"],
          ["字段类型、枚举、错误码符合接口约定", "异常分支具备稳定返回结构"],
          knowledgeBaseIds,
          featureInstruction,
        ),
      ];
    }
    if (tag === "ui") {
      return [
        this.scenarioNode(
          "[UI] 提示文案和弹窗控制",
          "P2",
          "UI 测试",
          ["已进入目标页面", "准备触发提示或弹窗的数据"],
          ["执行页面操作", "观察提示文案、弹窗和按钮状态"],
          ["文案与需求完全一致", "弹窗展示或关闭逻辑符合业务规则"],
          knowledgeBaseIds,
          featureInstruction,
        ),
      ];
    }
    return [
      this.scenarioNode(
        "[并发] 快速重复提交",
        "P1",
        "并发测试",
        ["准备同一用户同一业务数据", "客户端或接口工具支持并发请求"],
        ["连续快速点击提交或并发调用接口", "观察所有请求处理结果"],
        [
          "系统只处理一次有效请求",
          "重复请求被幂等处理或明确拒绝",
          "无重复落库或状态错乱",
        ],
        knowledgeBaseIds,
        featureInstruction,
      ),
    ];
  }

  private scenarioNode(
    title: string,
    priority: CasePriority,
    caseType: string,
    conditions: string[],
    steps: string[],
    expectations: string[],
    knowledgeBaseIds: string[] = [],
    featureInstruction = "",
  ) {
    const children: CaseTreeNode[] = [
      this.node(
        "前置条件",
        "section",
        conditions.map((item) => this.node(item, "condition")),
      ),
      this.node(
        "测试步骤",
        "section",
        steps.map((item, index) => this.node(`${index + 1}. ${item}`, "step")),
      ),
      this.node(
        "预期结果",
        "section",
        expectations.map((item, index) =>
          this.node(`${index + 1}. ${item}`, "expectation"),
        ),
      ),
    ];
    if (featureInstruction) {
      children.push(
        this.node("动态指令", "section", [
          this.node(featureInstruction, "metadata"),
        ]),
      );
    }
    children.push(
      this.node("用例元数据", "metadata", [
        this.node(`优先级：${priority}`, "metadata"),
        this.node(`类型：${caseType}`, "metadata"),
        this.node(
          `关联知识库：${knowledgeBaseIds.length ? knowledgeBaseIds.join("、") : "无"}`,
          "metadata",
        ),
      ]),
    );
    return this.node(title, "scenario", [...children], {
      priority,
      caseType,
      knowledgeBaseIds,
      source: featureInstruction
        ? `动态指令：${featureInstruction}`
        : undefined,
    });
  }

  private findFeatureInstruction(
    module: RequirementModule,
    constraint: ConstraintInput,
  ) {
    return (
      constraint.featureInstructions
        .find((item) => item.moduleId === module.id)
        ?.instruction?.trim() || ""
    );
  }

  /**
   * AI 生成的树常省略「功能模块」层（system → 测试要点 → 案例），
   * 按动态指令测试要点补全 module 节点。
   */
  /** 测试要点节点标题仅保留主描述（验证点/测试方法留在结构化文档，不进案例树） */
  private normalizeRequirementTitles(
    tree: CaseTreeNode,
    testPoints: TestPointSnapshot[],
  ) {
    this.walkTree(tree, (node) => {
      if (node.kind !== "requirement") {
        return;
      }
      const matched = testPoints.find((point) =>
        this.requirementTitleMatchesTestPoint(node.title || "", point),
      );
      node.title = matched?.testPoint?.trim()
        ? matched.testPoint.trim()
        : simplifyRequirementTitleForDisplay(node.title || "");
    });
    return tree;
  }

  private requirementTitleMatchesTestPoint(
    requirementTitle: string,
    point: TestPointSnapshot,
  ) {
    const testPoint = (point.testPoint || "").trim();
    if (!testPoint) {
      return false;
    }
    const normalizedTitle = this.normalizeMatchText(requirementTitle);
    const normalizedPoint = this.normalizeMatchText(testPoint);
    if (!normalizedPoint) {
      return false;
    }
    return (
      normalizedTitle === normalizedPoint ||
      normalizedTitle.startsWith(normalizedPoint) ||
      requirementTitle.includes(testPoint)
    );
  }

  private alignTreeToTestPointHierarchy(
    tree: CaseTreeNode,
    testPoints: TestPointSnapshot[],
  ): CaseTreeNode {
    const root = this.cloneTreeNode(tree);
    for (const point of testPoints) {
      this.ensureModuleLayerForTestPoint(root, point);
    }
    return root;
  }

  private ensureModuleLayerForTestPoint(
    root: CaseTreeNode,
    point: TestPointSnapshot,
  ) {
    const moduleTitle = point.featureModule?.trim();
    if (!moduleTitle) {
      return;
    }

    const requirement = this.findRequirementNodeForTestPoint(root, point);
    if (!requirement) {
      return;
    }
    if (!requirement.id) {
      requirement.id = randomUUID();
    }
    if (!requirement.title?.trim()) {
      requirement.title = (point.testPoint || "").trim() || "测试要点";
    }

    const parent = this.findParentOf(root, requirement.id);
    if (!parent) {
      return;
    }

    if (parent.kind === "system") {
      const moduleNode = this.node(
        moduleTitle,
        "module",
        [requirement],
        point.featureDesc ? { source: point.featureDesc } : undefined,
      );
      parent.children = (parent.children || []).map((child) =>
        child.id === requirement.id ? moduleNode : child,
      );
      return;
    }

    const parentTitle = (parent.title || "").trim();
    if (parent.kind === "module" && parentTitle !== moduleTitle) {
      const testPointTitle = (point.testPoint || "").trim();
      const combined = `${moduleTitle} / ${testPointTitle}`.trim();
      if (
        (testPointTitle && parentTitle.includes(testPointTitle)) ||
        parentTitle === combined
      ) {
        parent.title = moduleTitle;
      }
    }
  }

  private findRequirementNodeForTestPoint(
    root: CaseTreeNode,
    point: TestPointSnapshot,
  ): CaseTreeNode | null {
    const candidates: CaseTreeNode[] = [];
    this.walkTree(root, (node) => {
      if (node.kind === "requirement") {
        candidates.push(node);
      }
    });

    const testPointTitle = (point.testPoint || "").trim();
    if (!testPointTitle) {
      return candidates[0] || null;
    }

    const normalizedTarget = this.normalizeMatchText(testPointTitle);
    if (!normalizedTarget) {
      return candidates[0] || null;
    }

    return (
      candidates.find((node) => {
        const normalizedTitle = this.normalizeMatchText(node.title);
        return (
          normalizedTitle.length > 0 &&
          normalizedTitle.includes(normalizedTarget)
        );
      }) ||
      candidates.find((node) => {
        const normalizedTitle = this.normalizeMatchText(node.title);
        return (
          normalizedTitle.length > 0 &&
          normalizedTarget.includes(normalizedTitle)
        );
      }) ||
      candidates[0] ||
      null
    );
  }

  private findParentOf(
    root: CaseTreeNode,
    targetId: string,
  ): CaseTreeNode | null {
    for (const child of root.children || []) {
      if (child.id === targetId) {
        return root;
      }
      const found = this.findParentOf(child, targetId);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private walkTree(node: CaseTreeNode, visit: (node: CaseTreeNode) => void) {
    visit(node);
    for (const child of node.children || []) {
      this.walkTree(child, visit);
    }
  }

  private cloneTreeNode(node: CaseTreeNode): CaseTreeNode {
    return {
      ...node,
      metadata: node.metadata ? { ...node.metadata } : undefined,
      children: (node.children || []).map((child) => this.cloneTreeNode(child)),
    };
  }

  private normalizeMatchText(value?: string | null) {
    return (value ?? "").replace(/\s+/g, "").toLowerCase();
  }

  private node(
    title: string,
    kind: CaseNodeKind,
    children: CaseTreeNode[] = [],
    metadata?: CaseTreeNode["metadata"],
  ): CaseTreeNode {
    return {
      id: randomUUID(),
      title,
      kind,
      metadata,
      children,
    };
  }

  private ensureNodeIds(
    node: CaseTreeNode,
    fallbackKind: CaseNodeKind,
  ): CaseTreeNode {
    const kind = node.kind || fallbackKind;
    return {
      ...node,
      id: node.id || randomUUID(),
      kind,
      title: (node.title ?? "").trim() || this.defaultTitleForKind(kind),
      children: (node.children || []).map((child) =>
        this.ensureNodeIds(child, child.kind || this.inferChildKind(kind)),
      ),
    };
  }

  /** AI 常只返回 kind 无 title，经补全后整棵树都是「功能模块/案例标题」等占位文案 */
  private isLowQualityAiTree(tree: CaseTreeNode) {
    const caseNodes: CaseTreeNode[] = [];
    this.walkTree(tree, (node) => {
      if (node.kind === "case") {
        caseNodes.push(node);
      }
    });
    if (!caseNodes.length) {
      return true;
    }

    const realCases = caseNodes.filter(
      (node) => !this.isPlaceholderTitle(node.title, "case"),
    );
    if (!realCases.length) {
      return true;
    }

    const hollowCases = caseNodes.filter((node) => {
      const children = node.children || [];
      if (!children.length) {
        return true;
      }
      return children.every((child) =>
        this.isPlaceholderTitle(child.title, child.kind || "case_title"),
      );
    });
    return hollowCases.length === caseNodes.length;
  }

  private isPlaceholderTitle(title: string | undefined, kind: CaseNodeKind) {
    const normalized = (title || "").trim();
    if (!normalized) {
      return true;
    }
    return normalized === this.defaultTitleForKind(kind);
  }

  private defaultTitleForKind(kind: CaseNodeKind) {
    const labels: Partial<Record<CaseNodeKind, string>> = {
      root: "案例根节点",
      system: "系统",
      module: "功能模块",
      requirement: "测试要点",
      case: "案例",
      case_title: "案例标题",
      case_condition: "前置条件",
      case_step: "测试步骤",
      case_expected: "预期结果",
      scenario: "场景",
      section: "区块",
      condition: "前置条件",
      step: "测试步骤",
      expectation: "预期结果",
      metadata: "元数据",
    };
    return labels[kind] || "未命名节点";
  }

  private inferChildKind(parentKind: CaseNodeKind): CaseNodeKind {
    const chain: Partial<Record<CaseNodeKind, CaseNodeKind>> = {
      root: "system",
      system: "module",
      module: "requirement",
      requirement: "case",
      case: "case_title",
    };
    return chain[parentKind] || "scenario";
  }

  private extractRequirementId(text: string) {
    return (
      text.match(/[A-Z]{1,4}\d{4}-\d{3,5}(?:-\d{2})?/)?.[0] ||
      text.match(/需求编号[：:\s|]*([A-Za-z0-9-]+)/)?.[1] ||
      "REQ-LOCAL-0001"
    );
  }

  private extractRequirementName(text: string, requirementId: string) {
    const explicit = text.match(/需求名称[：:\s|]*([^\n|]+)/)?.[1]?.trim();
    if (explicit) {
      return explicit.replace(/\*\*/g, "");
    }
    const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (heading) {
      return heading
        .replace(requirementId, "")
        .replace(/[-－]\s*测试分析.*$/, "")
        .trim();
    }
    const firstLine = text
      .split("\n")
      .map((line) => line.trim())
      .find(
        (line) =>
          line.length > 8 && !line.startsWith("|") && !line.startsWith("#"),
      );
    return firstLine?.slice(0, 80) || "智能生成案例需求";
  }

  private extractSystems(text: string) {
    const candidates = [
      "手机银行渠道系统",
      "柜面渠道系统",
      "积存金系统",
      "核心系统",
      "渠道系统",
      "数据平台",
      "后台管理系统",
    ];
    const matched = candidates.filter(
      (item) => text.includes(item.replace("系统", "")) || text.includes(item),
    );
    const unique = [...new Set(matched)].filter(
      (item) =>
        item !== "渠道系统" ||
        (!matched.includes("手机银行渠道系统") &&
          !matched.includes("柜面渠道系统")),
    );
    return unique.length ? unique : ["业务系统"];
  }

  private extractModules(text: string, systems: string[]): RequirementModule[] {
    const headingBlocks = text.split(/\n(?=###?\s+)/g);
    const modules: RequirementModule[] = [];

    for (const block of headingBlocks) {
      const blockSystems = systems.filter(
        (item) =>
          block.includes(item) || block.includes(item.replace("系统", "")),
      );
      if (!blockSystems.length) {
        continue;
      }
      const extractedName =
        block.match(/功能模块[：:】\s*]*([^\n*]+)/)?.[1]?.trim() ||
        block.match(/模块[：:\s]*([^\n]+)/)?.[1]?.trim() ||
        "";
      for (const system of blockSystems) {
        const name = extractedName || `${system}核心流程校验`;
        modules.push({
          id: randomUUID(),
          system,
          name: name.replace(/[：:]+$/, ""),
          source:
            block.match(/需求来源[：:\s]*([^\n]+)/)?.[1]?.trim() ||
            "需求文档自动识别",
          description:
            block.match(/功能描述[：:\s]*([^\n]+)/)?.[1]?.trim() ||
            `围绕 ${system} 的 ${name} 完成业务规则、数据和交互校验。`,
          rules: this.extractListAfter(block, "业务规则").slice(0, 8),
          interactions: this.extractListAfter(block, "系统交互").slice(0, 6),
        });
      }
    }

    if (modules.length) {
      return modules.map((module) => ({
        ...module,
        rules: module.rules.length
          ? module.rules
          : ["按需求定义的前置校验、拦截、放行和提示规则执行。"],
        interactions: module.interactions.length
          ? module.interactions
          : [`${module.system} 调用依赖系统完成状态查询或业务处理。`],
      }));
    }

    return systems.map((system) => ({
      id: randomUUID(),
      system,
      name: `${system}核心业务流程校验`,
      source: "需求文档自动识别",
      description: `围绕 ${system} 的核心业务流程生成测试分析。`,
      rules: ["按需求定义的前置校验、拦截、放行和提示规则执行。"],
      interactions: [
        `${system} 与上下游系统完成接口查询、业务处理和结果反馈。`,
      ],
    }));
  }

  private extractListAfter(text: string, title: string) {
    const index = text.indexOf(title);
    if (index === -1) {
      return [];
    }
    return text
      .slice(index)
      .split("\n")
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => /^[-*]|\d+[.、]/.test(line))
      .map((line) =>
        line
          .replace(/^[-*]\s*/, "")
          .replace(/^\d+[.、]\s*/, "")
          .replace(/\*\*/g, "")
          .trim(),
      )
      .filter(Boolean);
  }

  private extractSummary(text: string, requirementName: string) {
    const paragraph = text
      .split(/\n{2,}/)
      .map((item) => item.replace(/\s+/g, " ").trim())
      .find(
        (item) =>
          item.length > 30 && !item.startsWith("|") && !item.startsWith("#"),
      );
    return (
      paragraph?.slice(0, 220) ||
      `围绕“${requirementName}”完成结构化测试分析和案例生成。`
    );
  }

  private extractRisks(text: string) {
    const risks = [
      text.includes("超时") ? "接口超时处理需明确默认策略，避免错误放行。" : "",
      text.includes("并发") || text.includes("重复")
        ? "重复提交和并发冲突需验证幂等性。"
        : "",
      text.includes("文案") || text.includes("提示")
        ? "提示文案需与需求完全一致。"
        : "",
      text.includes("状态")
        ? "状态枚举边界需覆盖正常、异常、空值和未知值。"
        : "",
    ].filter(Boolean);
    return risks.length
      ? risks
      : ["响应时效、异常提示、数据一致性和可追溯性需重点验证。"];
  }

  private async generateMarkdownByWorkflow(
    prompt: string,
    skill: "req" | "case",
  ): Promise<string | null> {
    const skillUrl = this.resolveSkillUrl(skill);
    if (!skillUrl || !this.aiWorkflow.isConfigured()) {
      return null;
    }

    try {
      const skillText = await this.loadSkillText(skill);
      if (!skillText) {
        return null;
      }

      const { text } = await this.aiWorkflow.runWithContent(prompt, skillText);
      return text ? this.stripMarkdownFence(text) : null;
    } catch (error) {
      this.logger.warn(
        `AI Workflow Markdown 生成失败，回退本地逻辑: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /** 已配置工作流时必须走 AI；未配置完整案例技能 URL 时也视为应走工作流并失败 */
  private defaultLocalConstraint(): ConstraintInput {
    return {
      scenarioTags: ["positive", "negative"],
      testDimensions: ["functional", "interface"],
      grouping: "bySystem",
      knowledgeBaseIds: [],
      naturalLanguage: "",
      featureInstructions: [],
    };
  }

  private shouldUseWorkflowForCaseGeneration() {
    if (this.aiWorkflow.canGenerateCases()) {
      return true;
    }
    if (
      this.aiWorkflow.isConfigured() &&
      this.aiWorkflow.getCaseDocSkillUrl()
    ) {
      throw new BadRequestException(
        "AI Workflow 案例生成配置不完整，请检查 DIFY_WORKFLOW_URL、DIFY_WORKFLOW_ID 与 CASE_DOC_SKILL_URL",
      );
    }
    return false;
  }

  private async generateCaseTreeByWorkflow(
    input: string,
    rootTitle: string,
  ): Promise<CaseTreeNode> {
    if (!input?.trim()) {
      throw new BadRequestException("案例生成输入为空，生成失败");
    }

    const markdown = await this.runCaseWorkflowMarkdown(input);
    const tree = parseCaseSkillMarkdown(markdown, rootTitle);
    if (!tree) {
      throw new BadRequestException(
        "AI Workflow 返回内容无法解析为案例树，请检查输出是否符合 case-skill 格式",
      );
    }
    return tree;
  }

  private async runCaseWorkflowMarkdown(prompt: string): Promise<string> {
    const skillUrl = this.resolveSkillUrl("case");
    if (!skillUrl) {
      throw new BadRequestException("CASE_DOC_SKILL_URL 未配置，无法生成案例");
    }

    try {
      const skillText = await this.loadSkillText("case");
      if (!skillText) {
        throw new BadRequestException(
          "读取案例技能文档失败，请检查 MinIO 上的 case-skill 文件",
        );
      }

      const { text } = await this.aiWorkflow.runWithContent(prompt, skillText);
      const markdown = text ? this.stripMarkdownFence(text) : "";
      if (!markdown.trim()) {
        throw new BadRequestException("AI Workflow 未返回有效 Markdown");
      }
      return markdown;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.warn(`AI Workflow 案例生成失败: ${(error as Error).message}`);
      throw new BadRequestException(
        `AI Workflow 案例生成失败：${(error as Error).message}`,
      );
    }
  }

  /**
   * 将 AI 返回的 JSON 案例列表挂到六级树：
   * root → system → module → requirement(测试要点) → case → case_title/condition/step/expected
   */
  private buildCaseTreeFromJsonCases(
    rootTitle: string,
    testPoints: TestPointGenerationInput[],
    casesByTestPointId: Map<string, JsonCaseItem[]>,
  ): CaseTreeNode {
    const systemMap = new Map<string, Map<string, TestPointGenerationInput[]>>();
    for (const item of testPoints) {
      if (!systemMap.has(item.system)) {
        systemMap.set(item.system, new Map());
      }
      const moduleMap = systemMap.get(item.system)!;
      if (!moduleMap.has(item.featureModule)) {
        moduleMap.set(item.featureModule, []);
      }
      moduleMap.get(item.featureModule)!.push(item);
    }

    const root = this.node(rootTitle, "root", []);
    root.children = [...systemMap.entries()].map(([system, moduleMap]) =>
      this.node(
        system,
        "system",
        [...moduleMap.entries()].map(([featureModule, points]) =>
          this.node(
            featureModule,
            "module",
            points.map((point) => {
              const jsonCases = casesByTestPointId.get(point.id) || [];
              const requirementTitle =
                (point.testPoint || "").trim() || "测试要点";
              return this.node(
                requirementTitle,
                "requirement",
                jsonCases.map((item) => this.jsonCaseToCaseNode(item, point)),
                {
                  source:
                    point.featureDesc ||
                    point.testPointDesc ||
                    "动态指令测试要点",
                },
              );
            }),
          ),
        ),
      ),
    );
    return root;
  }

  /** 单条 JsonCaseItem → 案例节点（含正向/反向、步骤与预期子节点） */
  private jsonCaseToCaseNode(
    item: JsonCaseItem,
    point: TestPointGenerationInput,
  ): CaseTreeNode {
    const polarity = this.mapJsonPolarity(item.allx);
    const caseTitle =
      (item.caseName || item.alms || "").trim() ||
      buildFallbackCaseTitle(point.testPoint, polarity);
    const conditions = this.splitDelimitedField(item.qztj);
    const steps = this.splitDelimitedField(item.albz);
    const expectations = this.splitDelimitedField(item.yqjg);
    const priority = this.mapJsonPriority(item.yxj);
    const caseType = (item.alms || "").trim() || "功能测试";

    return this.sixLevelCaseNode(
      `案例详情 [${polarity}]`,
      caseTitle,
      priority,
      caseType,
      conditions.length
        ? conditions
        : ["系统已登录且具备相关操作权限"],
      steps.length
        ? steps
        : [
            "从系统登录进入目标功能",
            "执行与测试要点相关的操作",
            "查看系统处理结果",
          ],
      expectations.length
        ? expectations
        : ["系统行为与业务规则一致"],
      [],
      item.alms?.trim(),
    );
  }

  /** 解析 AI 返回的 & 分隔字段，去掉 "1、" 序号前缀 */
  private splitDelimitedField(value?: string) {
    if (!value?.trim()) {
      return [];
    }
    return value
      .split("&")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.replace(/^\d+[、.]?\s*/, ""));
  }

  /** promote-skill 中 allx：「正」→ 正向，「反」→ 反向 */
  private mapJsonPolarity(allx?: string): "正向" | "反向" {
    return (allx || "").trim() === "反" ? "反向" : "正向";
  }

  /** promote-skill 中 yxj：高/中/低 → P0/P1/P2 */
  private mapJsonPriority(yxj?: string): CasePriority {
    const value = (yxj || "").trim();
    if (value === "高") {
      return "P0";
    }
    if (value === "低") {
      return "P2";
    }
    return "P1";
  }

  /**
   * 加载 promote-skill.md，替换占位符后调用 AI Chat，解析 JSON 数组
   *
   * 占位符：{mkName} {testPoint} {markdownContent} {prompts}
   */
  private async runCaseWorkflowJson(
    featureModule: string,
    testPoint: string,
    markdownContent: string,
    prompts: string,
    model?: string,
  ): Promise<JsonCaseItem[]> {
    let promote = await this.loadSkillText("promote");
    if (
      !promote ||
      !promote.includes("{mkName}") ||
      !promote.includes("{testPoint}") ||
      !promote.includes("{markdownContent}") ||
      !promote.includes("{prompts}")
    ) {
      throw new BadRequestException(
        "读取案例统一提示词文档失败，请检查 MinIO 上的 promote-skill 文件",
      );
    }

    const replacements = [
      { key: "{mkName}", value: featureModule },
      { key: "{testPoint}", value: testPoint },
      { key: "{markdownContent}", value: markdownContent },
      { key: "{prompts}", value: prompts },
    ];

    for (const { key, value } of replacements) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      promote = promote.replace(new RegExp(escapedKey, "g"), value);
    }

    try {
      const { text } = await this.aiWorkflow.runWithAiChat(promote, model);
      const cases = this.aiWorkflow.parseJsonArray<JsonCaseItem>(text);
      if (!cases?.length) {
        throw new BadRequestException(
          `AI 未返回可解析的案例 JSON（测试要点：${testPoint}）`,
        );
      }
      return cases;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.warn(
        `AI Chat 案例生成失败（测试要点：${testPoint}）: ${(error as Error).message}`,
      );
      throw new BadRequestException(
        `AI Chat 案例生成失败（测试要点：${testPoint}）：${(error as Error).message}`,
      );
    }
  }

  private resolveSkillUrl(skill: "req" | "case" | "promote") {
    return skill === "req"
      ? this.aiWorkflow.getReqDocSkillUrl()
      : skill === "case"
        ? this.aiWorkflow.getCaseDocSkillUrl()
        : this.aiWorkflow.getPromoteUrl();
  }

  private async loadSkillText(skill: "req" | "case" | "promote") {
    const skillUrl = this.resolveSkillUrl(skill);
    if (!skillUrl) {
      return null;
    }
    return fetchTextFromUrl(skillUrl, "技能文档");
  }

  private stripMarkdownFence(text: string) {
    const fenced = text.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : text.trim();
  }
}
