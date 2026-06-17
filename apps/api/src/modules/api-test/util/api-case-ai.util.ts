import * as fs from "node:fs";
import * as path from "node:path";
import type {
  ApiCaseExpected,
  ApiCasePolarity,
  ApiCasePriority,
  ApiCaseRequest,
  ApiCaseStatus,
  ApiTestCasePayload,
} from "@case-forge/shared";
import type { AiWorkflowService } from "../../../common/ai-workflow/service/ai-workflow.service";
import type { ApiEndpointEntity } from "../entity/api-endpoint.entity";

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

const SKILL_CANDIDATES = [
  "skill/at-case-skill.md",
  "../../skill/at-case-skill.md",
  "../../../skill/at-case-skill.md",
];

export function loadAtCaseSkillText() {
  for (const relative of SKILL_CANDIDATES) {
    const absolute = path.resolve(process.cwd(), relative);
    if (fs.existsSync(absolute)) {
      return fs.readFileSync(absolute, "utf8");
    }
  }
  return "";
}

export function buildAtCasePrompt(
  skillTemplate: string,
  input: {
    transactionCode: string;
    endpointName: string;
    httpMethod: string;
    endpointPath: string;
    structuredDoc: string;
  },
) {
  return skillTemplate
    .replaceAll("{transactionCode}", input.transactionCode)
    .replaceAll("{endpointName}", input.endpointName)
    .replaceAll("{httpMethod}", input.httpMethod)
    .replaceAll("{endpointPath}", input.endpointPath)
    .replaceAll("{structuredDoc}", input.structuredDoc);
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
  const skillTemplate = loadAtCaseSkillText();
  if (!skillTemplate.trim()) {
    throw new Error("未找到 at-case-skill.md");
  }
  if (!aiWorkflow.canGenerateJsonCases()) {
    throw new Error("AI Chat 未配置");
  }

  let prompt = buildAtCasePrompt(skillTemplate, {
    transactionCode: input.transactionCode,
    endpointName: input.endpoint.name,
    httpMethod: input.endpoint.method,
    endpointPath: input.endpoint.path,
    structuredDoc: input.structuredDoc,
  });
  if (input.scenarioPromptText?.trim()) {
    prompt += `\n\n## 场景约束\n${input.scenarioPromptText.trim()}`;
  }

  const { text } = await aiWorkflow.runWithAiChat(prompt);
  const items = aiWorkflow.parseJsonArray<AiApiCaseItem>(text) ?? [];
  if (!items.length) {
    throw new Error("AI 未返回可解析的案例 JSON");
  }

  return items.map((item, index) =>
    mapAiCaseItem(item, input.endpoint, input.transactionCode, index),
  );
}

export function mapAiCaseItem(
  item: AiApiCaseItem,
  endpoint: ApiEndpointEntity,
  transactionCode: string,
  index: number,
): ApiTestCasePayload {
  const polarity = normalizePolarity(item.caseType);
  const priority = normalizePriority(item.priority);
  const status = normalizeStatus(item.status);
  const body = parseRequestBody(item.requestBody);
  const expected = buildExpectedFromText(item.expectedResult, polarity);

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
    request: {
      method: endpoint.method,
      path: endpoint.path,
      headers: { "Content-Type": "application/json" },
      body,
    },
    expected,
    metadata: { source: "ai", inferredFields: Object.keys(body ?? {}) },
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

function parseRequestBody(input?: string | Record<string, unknown>) {
  if (!input) return {};
  if (typeof input === "object") return input;
  const trimmed = input.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return { raw: trimmed };
  }
}

function buildExpectedFromText(
  text: string | undefined,
  polarity: ApiCasePolarity,
): ApiCaseExpected {
  const content = (text ?? "").trim();
  const statusMatch = content.match(/\b(20\d|40\d|50\d)\b/);
  if (statusMatch) {
    return {
      statusCode: Number(statusMatch[1]),
      statusOnly: !content.includes("loanAmt") && !content.includes("字段"),
      bodyAssertions: content.includes("字段")
        ? [{ type: "contains", expected: content, description: content }]
        : undefined,
    };
  }
  return {
    statusCode: polarity === "negative" ? [400, 422, 500] : [200, 201],
    statusOnly: true,
    bodyAssertions: content
      ? [{ type: "contains", expected: content, description: content }]
      : undefined,
  };
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
