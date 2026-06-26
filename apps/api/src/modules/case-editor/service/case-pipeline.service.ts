/**
 * 案例生成流水线
 *
 * **当前主路径**：generateJsonCaseTree（promote-skill + AI Chat + JSON → 案例树）
 *
 * **遗留路径**：generateCaseTree（旧 case-skill Markdown），保留作参考/未配置 AI Chat 时本地规则。
 *
 * Skill 文件均从 MinIO URL 拉取：promote-skill / case-skill / require-skill
 */
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mapWithConcurrency } from "@common/util/concurrency.util";
import { AiWorkflowService } from "@common/ai-workflow/service/ai-workflow.service";
import {
  buildStructRequirementPrompt,
  fetchTextFromUrl,
} from "@common/ai-workflow/util/workflow-input.util";
import { sanitizeStructuredMarkdown } from "@struct-doc/util/struct-doc.parser";
import type {
  CaseNature,
  CaseNodeKind,
  CasePriority,
  CaseTreeNode,
  RequirementAnalysis,
  RequirementDocument,
  RequirementModule,
} from "@case-forge/shared";
import {
  buildFallbackCaseTitle,
  extractCasePolarity,
  isPlaceholderCaseTitle,
  normalizeCaseNature,
  normalizeCasePriority,
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

import type { TestPointGenerationInput } from "@case-editor/util/case-workflow-input.util";
export type { TestPointGenerationInput } from "@case-editor/util/case-workflow-input.util";
import { buildPromotePromptsText } from "@case-editor/util/case-workflow-input.util";
import { truncateRequirementContext } from "@case-editor/util/requirement-context.util";

/** 单个测试要点案例生成失败信息 */
export interface CaseGeneratePointFailure {
  testPointId: string;
  testPoint: string;
  message: string;
}

/** 单个 generateJsonCaseTree 调用内并发的 AI 请求上限 */
const CASE_POINT_AI_CONCURRENCY = 3;

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

/** 案例生成流水线服务 */
@Injectable()
export class CasePipelineService {
  private readonly logger = new Logger(CasePipelineService.name);

  constructor(private readonly aiWorkflow: AiWorkflowService) {}

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
    const aiMarkdown = await this.generateMarkdownByAiChat(
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

  /** 检查 AI Chat 与 Skill 是否已配置 */
  isAiConfigured() {
    return this.aiWorkflow.isAiConfigured();
  }

  /** 从结构化 Markdown 重建需求分析对象 */
  rebuildAnalysisFromMarkdown(markdown: string): RequirementAnalysis {
    return this.analyzeRequirement(markdown);
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
    const boundedRequirementContext =
      truncateRequirementContext(requirementContext);
    const casesByTestPointId = new Map<string, JsonCaseItem[]>();
    const failures: CaseGeneratePointFailure[] = [];

    await mapWithConcurrency(
      testPoints,
      CASE_POINT_AI_CONCURRENCY,
      async (point) => {
        if (shouldAbort?.()) {
          return;
        }
        try {
          const promptsText = buildPromotePromptsText(point);
          const jsonCases = await this.runCaseWorkflowJson(
            point.featureModule,
            point.testPoint,
            boundedRequirementContext,
            promptsText,
            model,
          );
          casesByTestPointId.set(point.id, jsonCases);
        } catch (error) {
          const message =
            error instanceof BadRequestException
              ? error.message
              : (error as Error).message || "案例生成失败";
          failures.push({
            testPointId: point.id,
            testPoint: point.testPoint,
            message,
          });
          this.logger.warn(
            `测试要点案例生成失败 id=${point.id} title=${point.testPoint}: ${message}`,
          );
        }
      },
    );

    const succeededTestPoints = testPoints.filter((point) =>
      casesByTestPointId.has(point.id),
    );
    if (!succeededTestPoints.length) {
      const detail = failures
        .map((item) => `「${item.testPoint}」：${item.message}`)
        .join("；");
      throw new BadRequestException(
        detail || "全部测试要点案例生成失败，请稍后重试",
      );
    }

    let tree = this.buildCaseTreeFromJsonCases(
      rootTitle,
      succeededTestPoints,
      casesByTestPointId,
    );
    tree = this.normalizeRequirementTitles(tree, succeededTestPoints);
    tree = this.normalizeCaseNodesToSkillFormat(tree);
    tree = this.ensureCaseTitles(tree);
    tree = normalizeCaseTreeForSkill(tree);
    tree = this.ensureNodeIds(tree, "root");
    return { tree, failures };
  }

  /** 根据自然语言指令生成局部节点扩展子树 */
  createNodeExpansion(instruction: string): CaseTreeNode[] {
    const normalized = instruction.trim() || "补充测试场景";
    return [
      this.sixLevelCaseNode(
        "案例详情 [正]",
        `[补充] ${normalized}`,
        "高",
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

  private resolveSkillCaseTitles(rawTitle: string) {
    const title = rawTitle.trim();
    const legacy = title.match(
      /^\[(正|反|正向|反向|异常|边界|接口|权限|端到端|UI|并发)\]\s*(.*)$/u,
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
    const polarity: CaseNature =
      legacy[1] === "正向" || legacy[1] === "正" ? "正" : "反";
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

      const polarity = extractCasePolarity(node.title) || "正";
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
    polarity: CaseNature,
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
      caseNature: extractCasePolarity(caseNodeTitle) || "正",
      priority: normalizeCasePriority(priority),
      caseType,
      knowledgeBaseIds,
      source: featureInstruction
        ? `动态指令：${featureInstruction}`
        : undefined,
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

  private async generateMarkdownByAiChat(
    prompt: string,
    skill: "req",
  ): Promise<string | null> {
    if (!this.aiWorkflow.canStructRequirement()) {
      return null;
    }

    try {
      const skillText = await this.loadSkillText(skill);
      if (!skillText) {
        return null;
      }

      const chatPrompt = buildStructRequirementPrompt(skillText, prompt);
      const { text } = await this.aiWorkflow.runWithAiChat(chatPrompt);
      return text ? sanitizeStructuredMarkdown(text) : null;
    } catch (error) {
      this.logger.warn(
        `AI Chat 结构化 Markdown 生成失败，回退本地逻辑: ${(error as Error).message}`,
      );
      return null;
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
    const systemMap = new Map<
      string,
      Map<string, TestPointGenerationInput[]>
    >();
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
      conditions.length ? conditions : ["系统已登录且具备相关操作权限"],
      steps.length
        ? steps
        : [
            "从系统登录进入目标功能",
            "执行与测试要点相关的操作",
            "查看系统处理结果",
          ],
      expectations.length ? expectations : ["系统行为与业务规则一致"],
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

  /** promote-skill 中 allx：「正」/「反」 */
  private mapJsonPolarity(allx?: string): CaseNature {
    return normalizeCaseNature(allx);
  }

  /** promote-skill 中 yxj：高/中/低，默认高 */
  private mapJsonPriority(yxj?: string): CasePriority {
    return normalizeCasePriority(yxj);
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

    promote = promote
      .replaceAll("{mkName}", featureModule)
      .replaceAll("{testPoint}", testPoint)
      .replaceAll("{prompts}", prompts)
      .replaceAll("{markdownContent}", markdownContent);

    try {
      const cases = await this.aiWorkflow.runWithAiChatJsonArray<JsonCaseItem>(
        promote,
        model,
        { context: `测试要点：${testPoint}` },
      );
      if (!cases.length) {
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

  private resolveSkillUrl(skill: "req" | "promote") {
    return skill === "req"
      ? this.aiWorkflow.getReqDocSkillUrl()
      : this.aiWorkflow.getPromoteUrl();
  }

  private async loadSkillText(skill: "req" | "promote") {
    const skillUrl = this.resolveSkillUrl(skill);
    if (!skillUrl) {
      return null;
    }
    return fetchTextFromUrl(skillUrl, "技能文档");
  }
}
