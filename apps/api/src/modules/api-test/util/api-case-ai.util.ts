import type {
  AiCasePlanItem,
  ApiTechnicalProfile,
  ApiTestCasePayload,
} from "@case-forge/shared";
import { Logger } from "@nestjs/common";
import { fetchTextFromUrl } from "@common/ai-workflow/util/workflow-input.util";
import type { AiWorkflowService } from "@common/ai-workflow/service/ai-workflow.service";
import type { ApiEndpointEntity } from "@api-test/entity/api-endpoint.entity";
import {
  appendScenarioProtocolAdaptation,
  buildEndpointContextForPrompt,
  parseApiTechnicalProfile,
  resolveTechnicalProfileFromSmpData,
} from "./api-doc-technical-profile.util";
import { mapCasePlanToPayload } from "./api-case-assembler.util";
import {
  assessDocReadiness,
  buildFieldCatalogSummary,
  extractExampleMessage,
  resolveCanonicalDoc,
} from "./api-canonical-doc.util";

const EXAMPLE_MESSAGE_MAX_CHARS = 3000;

export async function loadAtCaseSkillText(aiWorkflow: AiWorkflowService) {
  const skillUrl = aiWorkflow.getAtCaseSkillUrl()?.trim();
  if (!skillUrl) {
    return "";
  }
  return fetchTextFromUrl(skillUrl, "接口案例技能文档", "at-case-skill.md");
}

/** 场景约束正文（不含章节标题）字符上限。 */
export const AT_CASE_SCENARIO_MAX_CHARS = 1_200;
const AT_CASE_SCENARIO_SECTION_PREFIX = "\n\n## 场景约束\n";
const AT_CASE_SCENARIO_TRUNCATED_SUFFIX =
  "\n> 提示：场景约束已截断，完整规则见场景库。";

export interface PreparedScenarioBlock {
  block: string;
  blockChars: number;
  scenarioTextChars: number;
  truncated: boolean;
}

/** 截断场景提示词，避免多选场景撑爆 prompt。 */
export function truncateScenarioPromptText(
  text: string,
  maxChars = AT_CASE_SCENARIO_MAX_CHARS,
): { text: string; truncated: boolean; originalLength: number } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { text: "", truncated: false, originalLength: 0 };
  }
  if (trimmed.length <= maxChars) {
    return { text: trimmed, truncated: false, originalLength: trimmed.length };
  }

  const budget = Math.max(
    0,
    maxChars - AT_CASE_SCENARIO_TRUNCATED_SUFFIX.length,
  );
  return {
    text: `${trimmed.slice(0, budget).trimEnd()}${AT_CASE_SCENARIO_TRUNCATED_SUFFIX}`,
    truncated: true,
    originalLength: trimmed.length,
  };
}

/** 组装场景约束块（含通讯适配与截断），供动态预算与 prompt 拼接。 */
export function prepareScenarioBlock(
  scenarioPromptText: string | undefined,
  profile: ApiTechnicalProfile,
): PreparedScenarioBlock {
  if (!scenarioPromptText?.trim()) {
    return {
      block: "",
      blockChars: 0,
      scenarioTextChars: 0,
      truncated: false,
    };
  }

  const adapted = appendScenarioProtocolAdaptation(scenarioPromptText, profile);
  const { text, truncated, originalLength } =
    truncateScenarioPromptText(adapted);
  const block = `${AT_CASE_SCENARIO_SECTION_PREFIX}${text}`;

  return {
    block,
    blockChars: block.length,
    scenarioTextChars: originalLength,
    truncated,
  };
}

function deriveTechnicalProfileFromEndpoint(
  endpoint: ApiEndpointEntity,
): ApiTechnicalProfile {
  const method = (endpoint.method || "").toUpperCase();
  const path = (endpoint.path || "").toLowerCase();
  const requestNotes = (endpoint.requestNotes || "").trim();
  const responseNotes = (endpoint.responseNotes || "").trim();
  const sample = requestNotes || responseNotes;

  const isTcp =
    ["TCP", "TEP", "SOCKET"].includes(method) ||
    path.startsWith("tcp://") ||
    path.startsWith("socket://");
  const transport = isTcp ? ("tcp" as const) : ("http" as const);

  const isXml =
    sample.startsWith("<") || sample.includes("</") || sample.includes("<?xml");
  const messageFormat = isXml ? ("xml" as const) : ("json" as const);

  return {
    transport,
    messageFormat,
    encoding: "UTF-8",
  };
}

/**
 * 按优先级解析技术画像：
 * 1. structuredDoc「技术信息」段（已有，最可靠）
 * 2. smpData.callServiceList 的 socketWay / messageType（兜底，兼容未刷新的 SMP 数据）
 * 3. endpoint method / requestNotes 启发式推断（最后兜底）
 */
function resolveTechnicalProfile(
  structuredDoc: string,
  endpoint: ApiEndpointEntity,
  smpData?: { callServiceList?: unknown[]; serviceTestList?: unknown[] } | null,
): ApiTechnicalProfile {
  if (structuredDoc.trim()) {
    const profile = parseApiTechnicalProfile(structuredDoc);
    if (
      profile.transport !== "http" ||
      profile.messageFormat !== "json" ||
      profile.encoding !== "UTF-8"
    ) {
      return profile;
    }
  }
  const smpProfile = resolveTechnicalProfileFromSmpData(smpData);
  if (smpProfile) return smpProfile;
  return deriveTechnicalProfileFromEndpoint(endpoint);
}

const PLAN_MODE_PROMPT_FALLBACK = `作为资深接口测试专家，请根据以下接口信息与字段目录，设计接口测试案例计划。

## bodyOverrides 规则
1. **只填需要覆盖的业务字段**，未列出的字段由平台填默认值
2. **key 必须使用字段目录中的节点代码**
3. 正向：填合法值；反向必填缺失：设为空串；反向非法值：只改被测字段
4. **禁止输出完整报文结构**（Transaction/Header/Body 由平台拼装）

## 输出要求
1. **仅输出 JSON 数组**，不要 Markdown 代码块或说明文字
2. caseType：正 / 反；priority：高 / 中 / 低
3. expectedResult：HTTP 接口写状态码；TCP/MQ 接口写响应报文业务返回码
4. 至少 6 条，建议配比：正 2～3 条 / 反 3～4 条

JSON 字段：caseNo, caseName, caseDesc, caseType, priority, remark, bodyOverrides, expectedResult`;

export async function generateCasesWithPlan(
  aiWorkflow: AiWorkflowService,
  input: {
    transactionCode: string;
    structuredDoc: string;
    endpoint: ApiEndpointEntity;
    scenarioPromptText?: string;
    smpData?: {
      callServiceList?: unknown[];
      serviceTestList?: unknown[];
    } | null;
  },
  logger?: Logger,
): Promise<ApiTestCasePayload[]> {
  if (!aiWorkflow.canGenerateApiCases()) {
    throw new Error(
      "AI Chat 或 at-case-skill 未配置，请检查 AI_CHAT_URL 与 AT_CASE_SKILL_URL",
    );
  }

  const canonicalDoc = resolveCanonicalDoc(
    input.structuredDoc,
    input.endpoint.requestNotes,
    input.endpoint.responseNotes,
  );

  const readiness = assessDocReadiness(canonicalDoc, input.endpoint.path);
  if (!readiness.ok) {
    throw new Error(readiness.message);
  }

  const profile = resolveTechnicalProfile(
    canonicalDoc,
    input.endpoint,
    input.smpData,
  );
  const fieldCatalog = buildFieldCatalogSummary(canonicalDoc);
  const exampleMessage = extractExampleMessage(canonicalDoc);

  const endpointContext = buildEndpointContextForPrompt(profile, {
    endpointMethod: input.endpoint.method,
    endpointPath: input.endpoint.path,
    structuredDoc: canonicalDoc,
  });

  const skillTemplate = await loadAtCaseSkillText(aiWorkflow);
  const skillBody = skillTemplate.trim() || PLAN_MODE_PROMPT_FALLBACK;

  const scenario = prepareScenarioBlock(input.scenarioPromptText, profile);
  const scenarioBlockText = scenario.block || "";

  const exampleMessageBlock = exampleMessage
    ? [
        "",
        "## 示例报文（测试人员维护，生成时须优先参照）",
        "以下为用户提供的真实报文样例。生成 bodyOverrides 时：",
        "1. 字段名必须与「请求字段目录」中的节点代码一致",
        "2. 取值风格、数据类型、格式须与示例报文保持一致",
        "3. 正向案例以示例为基准；反向案例仅变更被测字段，其余参照示例",
        "4. 禁止编造示例中不存在的字段结构",
        "```",
        exampleMessage.slice(0, EXAMPLE_MESSAGE_MAX_CHARS),
        exampleMessage.length > EXAMPLE_MESSAGE_MAX_CHARS
          ? "...（已截断）"
          : "",
        "```",
      ].join("\n")
    : "";

  const technicalContext = [
    `## 接口信息`,
    `- 交易码：${input.transactionCode}`,
    `- 接口名称：${input.endpoint.name}`,
    endpointContext,
    "",
    `## 请求字段目录`,
    fieldCatalog,
    exampleMessageBlock,
  ].join("\n");

  const prompt = [skillBody, "", technicalContext, scenarioBlockText].join(
    "\n",
  );

  logger?.log(
    `接口案例生成提示词：总长 ${prompt.length}，字段 ${readiness.fieldCount} 个，场景 ${scenario.scenarioTextChars}${scenario.truncated ? "（已截断）" : ""}`,
  );

  const { text } = await aiWorkflow.runWithAiChat(prompt);
  const items = aiWorkflow.parseJsonArray<AiCasePlanItem>(text) ?? [];
  if (!items.length) {
    throw new Error("AI 未返回可解析的案例计划 JSON");
  }

  return items.map((item, index) =>
    mapCasePlanToPayload(
      item,
      input.endpoint,
      input.transactionCode,
      index,
      profile,
      canonicalDoc,
    ),
  );
}

export async function nextCaseNo(
  caseRepo: { count(options: object): Promise<number> },
  projectId: string,
  endpointId: string,
  transactionCode: string,
) {
  const count = await caseRepo.count({ where: { projectId, endpointId } });
  return `${transactionCode}-${String(count + 1).padStart(3, "0")}`;
}
