import type {
  ApiCaseExpected,
  ApiCasePolarity,
  ApiCasePriority,
  ApiCaseStatus,
  ApiMessageFormat,
  ApiTechnicalProfile,
  ApiTestCasePayload,
} from "@case-forge/shared";
import { prettyPrintXml, unescapeLiteralXmlEscapes } from "@case-forge/shared";
import { fetchTextFromUrl } from "../../../common/ai-workflow/util/workflow-input.util";
import type { AiWorkflowService } from "../../../common/ai-workflow/service/ai-workflow.service";
import type { ApiEndpointEntity } from "../entity/api-endpoint.entity";
import {
  appendScenarioProtocolAdaptation,
  buildCaseRequestFromProfile,
  buildEndpointContextForPrompt,
  buildProtocolGuidance,
  parseApiTechnicalProfile,
} from "./api-doc-technical-profile.util";

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

export function buildAtCasePrompt(
  skillTemplate: string,
  input: {
    transactionCode: string;
    endpointName: string;
    endpointMethod: string;
    endpointPath: string;
    structuredDoc: string;
    profile: ApiTechnicalProfile;
  },
) {
  const protocolGuidance = buildProtocolGuidance(
    input.profile,
    input.structuredDoc,
    input.transactionCode,
  );
  const endpointContext = buildEndpointContextForPrompt(input.profile, {
    endpointMethod: input.endpointMethod,
    endpointPath: input.endpointPath,
    structuredDoc: input.structuredDoc,
  });
  return skillTemplate
    .replaceAll("{transactionCode}", input.transactionCode)
    .replaceAll("{endpointName}", input.endpointName)
    .replaceAll("{endpointContext}", endpointContext)
    .replaceAll("{httpMethod}", input.profile.transport === "http" ? input.endpointMethod : "—")
    .replaceAll("{endpointPath}", input.profile.transport === "http" ? input.endpointPath : "—")
    .replaceAll("{structuredDoc}", input.structuredDoc)
    .replaceAll("{protocolGuidance}", protocolGuidance);
}

export async function generateCasesWithAi(
  aiWorkflow: AiWorkflowService,
  input: {
    transactionCode: string;
    structuredDoc: string;
    endpoint: ApiEndpointEntity;
    scenarioPromptText?: string;
  },
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

  const profile = parseApiTechnicalProfile(input.structuredDoc);

  let prompt = buildAtCasePrompt(skillTemplate, {
    transactionCode: input.transactionCode,
    endpointName: input.endpoint.name,
    endpointMethod: input.endpoint.method,
    endpointPath: input.endpoint.path,
    structuredDoc: input.structuredDoc,
    profile,
  });
  if (input.scenarioPromptText?.trim()) {
    const scenarioText = appendScenarioProtocolAdaptation(
      input.scenarioPromptText,
      profile,
    );
    prompt += `\n\n## 场景约束\n${scenarioText}`;
  }

  const { text } = await aiWorkflow.runWithAiChat(prompt);
  const items = aiWorkflow.parseJsonArray<AiApiCaseItem>(text) ?? [];
  if (!items.length) {
    throw new Error("AI 未返回可解析的案例 JSON");
  }

  return items.map((item, index) =>
    mapAiCaseItem(
      item,
      input.endpoint,
      input.transactionCode,
      index,
      profile,
    ),
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

export async function nextCaseNo(
  caseRepo: { count(options: object): Promise<number> },
  projectId: string,
  endpointId: string,
  transactionCode: string,
) {
  const count = await caseRepo.count({ where: { projectId, endpointId } });
  return `${transactionCode}-${String(count + 1).padStart(3, "0")}`;
}
