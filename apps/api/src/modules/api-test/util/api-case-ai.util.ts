import type {
  AiCasePlanItem,
  ApiCaseExpected,
  ApiCasePolarity,
  ApiCasePriority,
  ApiCaseStatus,
  ApiMessageFormat,
  ApiTechnicalProfile,
  ApiTestCasePayload,
} from "@case-forge/shared";
import { prettyPrintXml, unescapeLiteralXmlEscapes } from "@case-forge/shared";
import { Logger } from "@nestjs/common";
import { fetchTextFromUrl } from "@common/ai-workflow/util/workflow-input.util";
import type { AiWorkflowService } from "@common/ai-workflow/service/ai-workflow.service";
import type { ApiEndpointEntity } from "@api-test/entity/api-endpoint.entity";
import {
  compressApiStructuredDoc,
  DEFAULT_COMPRESSED_DOC_MAX_CHARS,
} from "./api-doc.parser";
import {
  appendScenarioProtocolAdaptation,
  buildCaseRequestFromProfile,
  buildEndpointContextForPrompt,
  buildProtocolGuidance,
  parseApiTechnicalProfile,
} from "./api-doc-technical-profile.util";
import { mapCasePlanToPayload } from "./api-case-assembler.util";
import {
  assessDocReadiness,
  buildFieldCatalogSummary,
  resolveCanonicalDoc,
} from "./api-canonical-doc.util";

interface AiApiCaseItem {
  caseNo?: string;
  caseName?: string;
  caseDesc?: string;
  caseType?: string;
  remark?: string;
  status?: string;
  priority?: string;
  requestBody?: string | Record<string, unknown>;
  expectedResult?: string;
  owner?: string;
}

export async function loadAtCaseSkillText(aiWorkflow: AiWorkflowService) {
  const skillUrl = aiWorkflow.getAtCaseSkillUrl()?.trim();
  if (!skillUrl) {
    return "";
  }
  return fetchTextFromUrl(skillUrl, "接口案例技能文档", "at-case-skill.md");
}

/** 单次 AI Chat user message 目标上限（为场景约束等动态内容预留余量）。 */
export const DEFAULT_AT_CASE_PROMPT_MAX_CHARS = 10000;
/** 未提供场景文本时，为「场景约束」段落预留的默认字符。 */
export const AT_CASE_SCENARIO_RESERVE_CHARS = 1_500;
/** 场景约束正文（不含章节标题）字符上限。 */
export const AT_CASE_SCENARIO_MAX_CHARS = 1_200;
/** 压缩文档下限，避免报文表被裁到无法生成案例。 */
export const MIN_COMPRESSED_DOC_MAX_CHARS = 1_200;

const AT_CASE_SKILL_EXAMPLE_MARKERS = ["\n输出格式示例", "\n### TCP + XML"];
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

/** 去掉 skill 中的长示例（运行时兜底，兼容 MinIO 上未更新的旧版 skill）。 */
export function compactAtCaseSkillTemplate(skillTemplate: string): string {
  let end = skillTemplate.length;
  for (const marker of AT_CASE_SKILL_EXAMPLE_MARKERS) {
    const index = skillTemplate.indexOf(marker);
    if (index >= 0) {
      end = Math.min(end, index);
    }
  }
  return skillTemplate.slice(0, end).trimEnd();
}

function estimateAtCasePromptOverhead(
  compactSkill: string,
  input: {
    transactionCode: string;
    endpointName: string;
    endpointMethod: string;
    endpointPath: string;
    requestNotes?: string;
    responseNotes?: string;
  },
  profile: ApiTechnicalProfile,
  structuredDocForGuidance: string,
): number {
  const protocolGuidance = buildProtocolGuidance(
    profile,
    structuredDocForGuidance,
    input.transactionCode,
  );
  const endpointContext = buildEndpointContextForPrompt(profile, {
    endpointMethod: input.endpointMethod,
    endpointPath: input.endpointPath,
    structuredDoc: structuredDocForGuidance,
    requestNotes: input.requestNotes,
    responseNotes: input.responseNotes,
  });

  return compactSkill
    .replaceAll("{transactionCode}", input.transactionCode)
    .replaceAll("{endpointName}", input.endpointName)
    .replaceAll("{endpointContext}", endpointContext)
    .replaceAll(
      "{httpMethod}",
      profile.transport === "http" ? input.endpointMethod : "—",
    )
    .replaceAll(
      "{endpointPath}",
      profile.transport === "http" ? input.endpointPath : "—",
    )
    .replaceAll("{structuredDoc}", "")
    .replaceAll("{protocolGuidance}", protocolGuidance).length;
}

/** 按 skill / 协议说明 / 场景块占用动态计算文档压缩预算。 */
export function resolveCompressedDocMaxChars(
  skillTemplate: string,
  input: {
    transactionCode: string;
    endpointName: string;
    endpointMethod: string;
    endpointPath: string;
    structuredDoc: string;
    profile: ApiTechnicalProfile;
  },
  options: {
    promptMaxChars?: number;
    scenarioBlockChars?: number;
  } = {},
): number {
  const promptMaxChars =
    options.promptMaxChars ?? DEFAULT_AT_CASE_PROMPT_MAX_CHARS;
  const scenarioReserve =
    options.scenarioBlockChars ?? AT_CASE_SCENARIO_RESERVE_CHARS;
  const compactSkill = compactAtCaseSkillTemplate(skillTemplate);
  const preliminaryDoc = compressApiStructuredDoc(
    input.structuredDoc,
    30,
    MIN_COMPRESSED_DOC_MAX_CHARS,
    { requestOnly: true },
  );
  const overhead = estimateAtCasePromptOverhead(
    compactSkill,
    input,
    input.profile,
    preliminaryDoc,
  );
  const available = promptMaxChars - overhead - scenarioReserve;
  return Math.max(
    MIN_COMPRESSED_DOC_MAX_CHARS,
    Math.min(DEFAULT_COMPRESSED_DOC_MAX_CHARS, available),
  );
}

export function buildAtCasePrompt(
  skillTemplate: string,
  input: {
    transactionCode: string;
    endpointName: string;
    endpointMethod: string;
    endpointPath: string;
    structuredDoc: string;
    requestNotes?: string;
    responseNotes?: string;
    profile: ApiTechnicalProfile;
  },
  options: {
    scenarioBlockChars?: number;
  } = {},
) {
  const compactSkill = compactAtCaseSkillTemplate(skillTemplate);
  const docMaxChars = resolveCompressedDocMaxChars(compactSkill, input, {
    scenarioBlockChars: options.scenarioBlockChars,
  });
  const compressedDoc = compressApiStructuredDoc(
    input.structuredDoc,
    40,
    docMaxChars,
    { requestOnly: true },
  );
  const protocolGuidance = buildProtocolGuidance(
    input.profile,
    compressedDoc,
    input.transactionCode,
  );
  const endpointContext = buildEndpointContextForPrompt(input.profile, {
    endpointMethod: input.endpointMethod,
    endpointPath: input.endpointPath,
    structuredDoc: compressedDoc,
    requestNotes: input.requestNotes,
    responseNotes: input.responseNotes,
  });
  const prompt = compactSkill
    .replaceAll("{transactionCode}", input.transactionCode)
    .replaceAll("{endpointName}", input.endpointName)
    .replaceAll("{endpointContext}", endpointContext)
    .replaceAll(
      "{httpMethod}",
      input.profile.transport === "http" ? input.endpointMethod : "—",
    )
    .replaceAll(
      "{endpointPath}",
      input.profile.transport === "http" ? input.endpointPath : "—",
    )
    .replaceAll("{structuredDoc}", compressedDoc)
    .replaceAll("{protocolGuidance}", protocolGuidance);

  return {
    prompt,
    originalDocLength: input.structuredDoc.length,
    compressedDocLength: compressedDoc.length,
    compactSkillLength: compactSkill.length,
    docMaxChars,
    scenarioBlockChars: options.scenarioBlockChars ?? 0,
  };
}

export async function generateCasesWithAi(
  aiWorkflow: AiWorkflowService,
  input: {
    transactionCode: string;
    structuredDoc: string;
    endpoint: ApiEndpointEntity;
    scenarioPromptText?: string;
  },
  logger?: Logger,
): Promise<ApiTestCasePayload[]> {
  if (!aiWorkflow.canGenerateApiCases()) {
    throw new Error(
      "AI Chat 或 at-case-skill 未配置，请检查 AI_CHAT_URL 与 AT_CASE_SKILL_URL",
    );
  }

  const skillTemplate = await loadAtCaseSkillText(aiWorkflow);
  if (!skillTemplate.trim()) {
    throw new Error("读取 at-case-skill 失败，请检查 MinIO 上的技能文档");
  }

  const profile = input.structuredDoc.trim()
    ? parseApiTechnicalProfile(input.structuredDoc)
    : deriveTechnicalProfileFromEndpoint(input.endpoint);
  const scenario = prepareScenarioBlock(input.scenarioPromptText, profile);
  const structuredDocForPrompt =
    input.structuredDoc.trim() ||
    buildStructuredDocFromEndpointNotes(
      input.endpoint.requestNotes,
      input.endpoint.responseNotes,
    );

  const {
    prompt: basePrompt,
    originalDocLength,
    compressedDocLength,
    compactSkillLength,
    docMaxChars,
    scenarioBlockChars,
  } = buildAtCasePrompt(
    skillTemplate,
    {
      transactionCode: input.transactionCode,
      endpointName: input.endpoint.name,
      endpointMethod: input.endpoint.method,
      endpointPath: input.endpoint.path,
      structuredDoc: structuredDocForPrompt,
      requestNotes: input.endpoint.requestNotes,
      responseNotes: input.endpoint.responseNotes,
      profile,
    },
    { scenarioBlockChars: scenario.blockChars },
  );
  const prompt = `${basePrompt}${scenario.block}`;

  logger?.log(
    `接口案例生成提示词：总长 ${prompt.length}，skill ${compactSkillLength}，文档 ${originalDocLength}→${compressedDocLength}（预算 ${docMaxChars}），场景 ${scenario.scenarioTextChars}${scenario.truncated ? "（已截断）" : ""}，场景块 ${scenarioBlockChars}`,
  );
  if (prompt.length > DEFAULT_AT_CASE_PROMPT_MAX_CHARS) {
    logger?.warn(
      `接口案例生成提示词仍超过目标 ${DEFAULT_AT_CASE_PROMPT_MAX_CHARS} 字符，可能触发 AI Chat 超时；请精简 skill 或减少场景提示词`,
    );
  }

  const { text } = await aiWorkflow.runWithAiChat(prompt);
  const items = aiWorkflow.parseJsonArray<AiApiCaseItem>(text) ?? [];
  if (!items.length) {
    throw new Error("AI 未返回可解析的案例 JSON");
  }

  return items.map((item, index) =>
    mapAiCaseItem(item, input.endpoint, input.transactionCode, index, profile),
  );
}

export function mapAiCaseItem(
  item: AiApiCaseItem,
  endpoint: ApiEndpointEntity,
  transactionCode: string,
  index: number,
  profile: ApiTechnicalProfile,
): ApiTestCasePayload {
  const polarity = normalizePolarity(item.caseType);
  const priority = normalizePriority(item.priority);
  const status = normalizeStatus(item.status);
  const body = normalizeRequestBody(
    parseRequestBody(item.requestBody, profile.messageFormat),
    profile.messageFormat,
  );
  const expected = buildExpectedFromText(
    item.expectedResult,
    polarity,
    profile,
  );

  return {
    title: item.caseName?.trim() || `${endpoint.name} - 案例${index + 1}`,
    caseNo:
      item.caseNo?.trim() ||
      `${transactionCode}-${String(index + 1).padStart(3, "0")}`,
    description: item.caseDesc?.trim() || "",
    remark: item.remark?.trim() || "",
    transactionCode,
    owner: item.owner?.trim() || "",
    priority,
    polarity,
    enabled: status !== "disabled",
    status,
    preconditions: [],
    request: buildCaseRequestFromProfile(endpoint, profile, body),
    expected,
    metadata: {
      source: "ai",
      inferredFields: inferBodyFields(body, profile.messageFormat),
    },
  };
}

function normalizePolarity(value?: string): ApiCasePolarity {
  const text = (value ?? "").trim();
  if (text === "反" || text.toLowerCase() === "negative") {
    return "negative";
  }
  return "positive";
}

function normalizePriority(value?: string): ApiCasePriority {
  const text = (value ?? "").trim();
  if (text === "高" || text.toUpperCase() === "P0") return "P0";
  if (text === "低" || text.toUpperCase() === "P2") return "P2";
  return "P1";
}

function normalizeStatus(value?: string): ApiCaseStatus {
  const text = (value ?? "ready").trim().toLowerCase();
  if (text === "draft" || text === "disabled") {
    return text;
  }
  return "ready";
}

function normalizeRequestBody(body: unknown, messageFormat: ApiMessageFormat) {
  if (
    (messageFormat === "xml" || messageFormat === "soap") &&
    typeof body === "string" &&
    body.trim()
  ) {
    return prettyPrintXml(unescapeLiteralXmlEscapes(body));
  }
  return body;
}

function parseRequestBody(
  input?: string | Record<string, unknown>,
  messageFormat: ApiMessageFormat = "json",
) {
  if (!input) {
    return messageFormat === "json" ? {} : "";
  }
  if (typeof input === "object") {
    return messageFormat === "json" ? input : JSON.stringify(input);
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return messageFormat === "json" ? {} : "";
  }
  if (messageFormat !== "json") {
    return trimmed;
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return { raw: trimmed };
  }
}

function inferBodyFields(body: unknown, messageFormat: ApiMessageFormat) {
  if (messageFormat === "json" && body && typeof body === "object") {
    return Object.keys(body as Record<string, unknown>);
  }
  if (typeof body === "string" && body.trim()) {
    return ["body"];
  }
  return [];
}

function buildExpectedFromText(
  text: string | undefined,
  polarity: ApiCasePolarity,
  profile: ApiTechnicalProfile,
): ApiCaseExpected {
  const content = (text ?? "").trim();
  const isHttp = profile.transport === "http";

  if (!isHttp) {
    const resCodeMatch = content.match(
      /(?:bizResCode|resCode|retCode)[=为:：\s]+(\w+)/i,
    );
    const bodyAssertions = content
      ? [
          {
            type: "contains" as const,
            expected: resCodeMatch?.[1] ?? extractAssertionSnippet(content),
            description: content,
          },
        ]
      : polarity === "negative"
        ? [
            {
              type: "contains" as const,
              expected: "bizResCode",
              description: "响应报文含业务返回码",
            },
          ]
        : [
            {
              type: "contains" as const,
              expected: "000000",
              description: "响应报文 bizResCode 为成功",
            },
          ];
    return {
      skipStatusCheck: true,
      statusOnly: false,
      bodyAssertions,
    };
  }

  const statusMatch = content.match(/\b(20\d|40\d|50\d)\b/);
  if (statusMatch) {
    return {
      statusCode: Number(statusMatch[1]),
      skipStatusCheck: false,
      statusOnly:
        !content.includes("loanAmt") &&
        !content.includes("字段") &&
        !content.includes("retCode") &&
        !content.includes("bizResCode") &&
        !content.includes("resCode"),
      bodyAssertions:
        content.includes("字段") ||
        content.includes("retCode") ||
        content.includes("bizResCode") ||
        content.includes("resCode")
          ? [
              {
                type: "contains",
                expected: extractAssertionSnippet(content),
                description: content,
              },
            ]
          : undefined,
    };
  }
  return {
    statusCode: polarity === "negative" ? [400, 422, 500] : [200, 201],
    skipStatusCheck: false,
    statusOnly: !content,
    bodyAssertions: content
      ? [
          {
            type: "contains",
            expected: extractAssertionSnippet(content),
            description: content,
          },
        ]
      : undefined,
  };
}

function extractAssertionSnippet(content: string) {
  const fieldMatch = content.match(
    /(?:包含|含|字段|节点)\s*[`'"]?([\w./-]+)[`'"]?/,
  );
  if (fieldMatch?.[1]) {
    return fieldMatch[1];
  }
  if (content.length <= 80) {
    return content;
  }
  return content.slice(0, 80);
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
    method === "TCP" ||
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

function buildStructuredDocFromEndpointNotes(
  requestNotes?: string,
  responseNotes?: string,
): string {
  const lines = ["技术信息", "----"];
  if (requestNotes?.trim()) {
    lines.push("请求报文", "----", requestNotes.trim());
  }
  if (responseNotes?.trim()) {
    lines.push("响应报文", "----", responseNotes.trim());
  }
  return lines.join("\n");
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

  const profile = readiness.profile;
  const fieldCatalog = buildFieldCatalogSummary(canonicalDoc);

  const endpointContext = buildEndpointContextForPrompt(profile, {
    endpointMethod: input.endpoint.method,
    endpointPath: input.endpoint.path,
    structuredDoc: canonicalDoc,
  });

  const skillTemplate = await loadAtCaseSkillText(aiWorkflow);
  const skillBody = skillTemplate.trim() || PLAN_MODE_PROMPT_FALLBACK;

  const scenario = prepareScenarioBlock(input.scenarioPromptText, profile);
  const scenarioBlockText = scenario.block || "";

  const technicalContext = [
    `## 接口信息`,
    `- 交易码：${input.transactionCode}`,
    `- 接口名称：${input.endpoint.name}`,
    endpointContext,
    "",
    `## 请求字段目录`,
    fieldCatalog,
  ].join("\n");

  const prompt = [skillBody, "", technicalContext, scenarioBlockText].join(
    "\n",
  );

  logger?.log(
    `接口案例生成（Plan 模式）提示词：总长 ${prompt.length}，字段 ${readiness.fieldCount} 个，场景 ${scenario.scenarioTextChars}${scenario.truncated ? "（已截断）" : ""}`,
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
