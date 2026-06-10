/**
 * @file 案例生成输入组装
 *
 * promote-skill 路径下：scenarioPrompts + naturalLanguage → pipeline.buildPromotePromptsText
 * buildCaseWorkflowInput 仍用于 run 记录里的 prompt 快照（审计用，非 AI 入参）
 */
import type { TestPointEntity } from "@struct-doc/entity/test-point.entity";

/** 勾选的场景提示词 */
export interface ScenarioPromptInput {
  name: string;
  content: string;
}

/** 参与组装的测试要点（case_test_point + 动态指令） */
export interface TestPointGenerationInput {
  id: string;
  system: string;
  systemDesc?: string;
  featureModule: string;
  featureDesc?: string;
  testPoint: string;
  testPointDesc?: string;
  /** 场景提示词包（case_test_point_prompt + prompt_library） */
  scenarioPrompts?: ScenarioPromptInput[];
  /** 自然语言约束（case_test_point_instruct.naturalText） */
  naturalLanguage?: string;
}

function appendLine(lines: string[], label: string, value?: string) {
  const text = value?.trim();
  if (text) {
    lines.push(`- ${label}：${text}`);
  }
}

/**
 * 拼入 promote-skill 占位符 {prompts}：场景提示词 + 自然语言约束（生成前须已保存到 DB）
 */
export function buildPromotePromptsText(
  point: Pick<TestPointGenerationInput, "scenarioPrompts" | "naturalLanguage">,
): string {
  const lines: string[] = [];
  const prompts = (point.scenarioPrompts || []).filter(
    (item) => item.name.trim() || item.content.trim(),
  );

  if (prompts.length) {
    lines.push(
      "### 场景提示词包（硬性约束：每条案例须在案例名称、案例描述、步骤或预期中可识别体现对应场景要求）",
      "",
    );
    for (const prompt of prompts) {
      const name = prompt.name.trim() || "未命名场景";
      const content = prompt.content.trim();
      lines.push(
        content
          ? `- **${name}**：${content}`
          : `- **${name}**（请按该场景名称含义设计可执行步骤与断言）`,
      );
    }
  }

  const natural = point.naturalLanguage?.trim();
  if (natural) {
    if (lines.length) {
      lines.push("");
    }
    lines.push(
      "### 自然语言约束（硬性约束：须逐条落实到案例，不得忽略或仅写无关套话）",
      "",
      natural,
    );
  }

  if (!lines.length) {
    return "（本条测试要点未配置场景提示词与自然语言约束；仅依据功能模块、测试要点与需求内容生成。）";
  }

  return lines.join("\n");
}

function formatTestPointBlock(point: TestPointGenerationInput, index: number) {
  const lines: string[] = [`## 测试要点 ${index + 1}`, ""];

  appendLine(lines, "系统", point.system);
  appendLine(lines, "系统详情", point.systemDesc);
  appendLine(lines, "功能模块", point.featureModule);
  appendLine(lines, "功能模块详情", point.featureDesc);
  appendLine(lines, "测试要点", point.testPoint);
  appendLine(lines, "测试要点详情", point.testPointDesc);

  const constraintBlock = buildPromotePromptsText(point);
  if (
    constraintBlock &&
    !constraintBlock.startsWith("（本条测试要点未配置")
  ) {
    lines.push("", constraintBlock);
  }

  return lines.join("\n");
}

export function mapTestPointsForWorkflow(
  testPoints: TestPointEntity[],
): TestPointGenerationInput[] {
  return testPoints.map((item) => ({
    id: item.id,
    system: item.system,
    systemDesc: item.systemDesc,
    featureModule: item.featureModule,
    featureDesc: item.featureDesc,
    testPoint: item.testPoint,
    testPointDesc: item.testPointDesc,
  }));
}

/** 组装工作流 requirefile：需求前景 + 测试要点列表（含场景提示词与自然语言约束） */
export function buildCaseWorkflowInput(options: {
  requirementContext: string;
  testPoints: TestPointGenerationInput[];
}) {
  const { requirementContext, testPoints } = options;
  const context = requirementContext.trim();
  if (!context) {
    throw new Error("需求前景为空");
  }
  if (!testPoints.length) {
    throw new Error("未指定测试要点");
  }

  return [
    "# 需求前景",
    "",
    context,
    "",
    "# 测试案例生成任务",
    "",
    "请基于上述需求前景，仅为下列测试要点生成案例树 Markdown 列表。",
    "须综合各测试要点下的「场景提示词包」「自然语言约束」（若有）。",
    "严格遵循技能文档中的层级与格式要求。",
    "每个测试要点至少包含 1 条「案例详情 [正]」与 1 条「案例详情 [反]」。",
    "",
    "# 测试要点",
    "",
    ...testPoints.flatMap((point, index) => [
      formatTestPointBlock(point, index),
      "",
    ]),
  ].join("\n");
}
