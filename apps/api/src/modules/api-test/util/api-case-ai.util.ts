import type {
  AiCasePlanItem,
  ApiAssertion,
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
  resolveApiTechnicalProfile,
} from "./api-doc-technical-profile.util";
import { mapCasePlanToPayload } from "./api-case-assembler.util";
import {
  assessDocReadiness,
  buildFieldCatalogSummary,
  extractExampleMessage,
  resolveCanonicalDoc,
} from "./api-canonical-doc.util";
import { stripTcpLengthPrefix } from "./assertion-runner.util";

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

const PLAN_MODE_PROMPT_FALLBACK = `作为资深接口测试专家，请根据以下接口信息与字段目录，设计接口测试案例计划。

## bodyOverrides 规则
1. **只填需要覆盖的业务字段**，未列出的字段由平台填默认值
2. **key 必须使用字段目录中的节点代码**
3. 正向：填合法值；反向必填缺失：设为空串；反向非法值：只改被测字段
4. **禁止输出完整报文结构**（Transaction/Header/Body 由平台拼装）

## 输出要求
1. **仅输出 JSON 数组**，不要 Markdown 代码块或说明文字
2. caseType：正 / 反；priority：高 / 中 / 低
3. expectedResult：简要描述预期结果
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

  const readiness = assessDocReadiness(
    canonicalDoc,
    input.endpoint.path,
    input.smpData,
  );
  if (!readiness.ok) {
    throw new Error(readiness.message);
  }

  const profile = resolveApiTechnicalProfile(canonicalDoc, {
    endpoint: input.endpoint,
    smpData: input.smpData,
  });
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

export async function maxCaseNoSuffix(
  caseRepo: {
    find(options: object): Promise<Array<{ caseNo?: string | null }>>;
  },
  projectId: string,
  endpointId: string,
  transactionCode: string,
): Promise<number> {
  const cases = await caseRepo.find({
    where: { projectId, endpointId },
    select: ["caseNo"],
  });
  return maxCaseNoSuffixFromRows(cases, transactionCode);
}

export function maxCaseNoSuffixFromRows(
  cases: Array<{ caseNo?: string | null }>,
  transactionCode: string,
): number {
  const prefix = `${transactionCode}-`;
  let max = 0;
  for (const item of cases) {
    const caseNo = item.caseNo?.trim();
    if (!caseNo?.startsWith(prefix)) {
      continue;
    }
    const suffix = caseNo.slice(prefix.length);
    const num = Number.parseInt(suffix, 10);
    if (!Number.isNaN(num) && num > max) {
      max = num;
    }
  }
  return max;
}

export function formatCaseNo(
  transactionCode: string,
  sequence: number,
): string {
  return `${transactionCode}-${String(sequence).padStart(3, "0")}`;
}

export async function nextCaseNo(
  caseRepo: {
    find(options: object): Promise<Array<{ caseNo?: string | null }>>;
  },
  projectId: string,
  endpointId: string,
  transactionCode: string,
) {
  const max = await maxCaseNoSuffix(
    caseRepo,
    projectId,
    endpointId,
    transactionCode,
  );
  return formatCaseNo(transactionCode, max + 1);
}

const ASSERTION_GEN_PROMPT_HTTP = `你是接口测试专家。根据以下 HTTP 响应报文，为该接口测试案例生成断言列表。

## 通讯信息
- 协议: HTTP
- 报文格式: {messageFormat}
- 案例极性: {polarity}

## 响应信息
- 状态码: {statusCode}
- 响应头: {headers}
- 响应体:
{responseBody}

## 断言规则
生成 assertions 数组，每条字段：type, operator, expression, expected, description
- type: status_code | headers | jsonpath | jmespath | xpath | raw | string | re | response_size | default
- operator: eq | nq | gt | lt | gte | lte
- 正向案例：检查 HTTP 状态码 200 + 响应体中代表成功的字段
- 反向案例：检查错误状态码（4xx/5xx）或错误码字段
- 检查列表/数组非空：优先用 jmespath，expression 写 length(实际数组字段名) 或 length(@)，operator 用 gt，expected 写 0；禁止写 length(@.field) 或 length(@[*])
- 也可用 response_size + gt + 0 检查响应体非空
- 报文格式为 xml 时：必须用 xpath 提取节点文本，expression 写 //节点名/text() 或 //节点名，expected 写节点文本值（如 0000），不要用 raw 或 jmespath 比对整段 XML
- 包含文本断言：type=string 时 expression 写要匹配的片段（如 0000 或 <bizcode>0000</bizcode>），不要只写在 expected 里

仅输出 JSON 数组，不要 Markdown 代码块或说明文字。示例：
[{"description":"HTTP 状态码","type":"status_code","operator":"eq","expression":"","expected":"200"},{"description":"响应包含成功","type":"string","operator":"eq","expression":"success"}]`;

const ASSERTION_GEN_PROMPT_TCP = `你是接口测试专家。根据以下 TCP/Socket 响应报文，为该接口测试案例生成断言列表。

## 通讯信息
- 协议: TCP/Socket
- 报文格式: {messageFormat}
- 案例极性: {polarity}

## 响应信息
- 响应体:
{responseBody}

## 断言规则
生成 assertions 数组，每条字段：type, operator, expression, expected, description
- type: jsonpath | jmespath | xpath | raw | string | re | response_size | default
- operator: eq | nq | gt | lt | gte | lte
- 注意：TCP 协议没有 HTTP 状态码，不要生成 status_code 类型的断言
- 正向案例：检查响应体中代表成功的业务码或字段（如 bizcode=0000）
- 反向案例：检查响应体中代表错误的业务码或字段
- TCP 响应可能在 XML 前有数字长度头（如 00009732<xml>...</xml>），断言时只针对 XML 节点，优先 xpath：//节点名/text()，expected 写节点文本值
- 报文格式为 xml 时：禁止用 raw 对整段报文做精确比对；业务码用 xpath + expected 文本值
- 包含文本断言：type=string 时 expression 写要匹配的片段

仅输出 JSON 数组，不要 Markdown 代码块或说明文字。示例：
[{"description":"业务返回码","type":"string","operator":"eq","expression":"000000"},{"description":"响应包含成功标志","type":"string","operator":"eq","expression":"success"}]`;

function formatAssertionResponseBody(
  body: unknown,
  messageFormat: string,
  transport: string,
): string {
  let bodyStr =
    typeof body === "string" ? body : JSON.stringify(body ?? "", null, 2);
  if (transport === "tcp" || messageFormat === "xml") {
    bodyStr = stripTcpLengthPrefix(bodyStr);
  }
  return bodyStr;
}

function normalizeGeneratedAssertions(
  assertions: ApiAssertion[],
  input: { messageFormat: string; transport: string },
): ApiAssertion[] {
  const isXml = input.messageFormat === "xml";
  const isTcp = input.transport === "tcp";
  return assertions.map((assertion) => {
    let next: ApiAssertion = { ...assertion };

    if (next.type === "jmespath" && (isXml || isTcp)) {
      next = {
        ...next,
        type: "xpath",
        expression: next.expression?.includes("/")
          ? next.expression
          : `//${(next.expression || "bizcode").replace(/^\//, "")}/text()`,
      };
    }

    if (isXml && next.type === "xpath" && next.expression?.trim()) {
      const expr = next.expression.trim();
      if (
        next.expected !== undefined &&
        next.expected !== "" &&
        !/\/text\(\)\s*$/.test(expr) &&
        !expr.includes("@")
      ) {
        next.expression = `${expr}/text()`;
      }
    }

    if (next.type === "string") {
      const expr = next.expression?.trim() ?? "";
      const expected = String(next.expected ?? "").trim();
      if (!expr && expected) {
        next.expression = expected;
        next.expected = "";
      }
    }

    if ((isXml || isTcp) && next.type === "raw" && next.expected) {
      const code = String(next.expected).trim();
      if (/^\d{3,8}$/.test(code)) {
        next = {
          ...next,
          type: "xpath",
          operator: "eq",
          expression: "//bizcode/text() | //BizCode/text() | //code/text()",
          expected: code,
          description: next.description || "业务返回码",
        };
      }
    }

    return next;
  });
}

const ASSERTION_RESPONSE_MAX_CHARS = 2000;

export async function generateAssertionsFromResponse(
  aiWorkflow: AiWorkflowService,
  input: {
    transport: string;
    messageFormat: string;
    polarity: "positive" | "negative";
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
  },
): Promise<ApiAssertion[]> {
  const bodyStr = formatAssertionResponseBody(
    input.body,
    input.messageFormat,
    input.transport,
  );

  const truncatedBody =
    bodyStr.length > ASSERTION_RESPONSE_MAX_CHARS
      ? bodyStr.slice(0, ASSERTION_RESPONSE_MAX_CHARS) + "\n...（已截断）"
      : bodyStr;

  const headersStr = JSON.stringify(input.headers).slice(0, 500);

  const isTcp = input.transport === "tcp";
  const template = isTcp ? ASSERTION_GEN_PROMPT_TCP : ASSERTION_GEN_PROMPT_HTTP;

  let prompt = template
    .replace("{messageFormat}", input.messageFormat)
    .replace("{polarity}", input.polarity === "negative" ? "反向" : "正向")
    .replace("{responseBody}", truncatedBody);

  if (!isTcp) {
    prompt = prompt
      .replace("{statusCode}", String(input.statusCode))
      .replace("{headers}", headersStr);
  }

  const { text } = await aiWorkflow.runWithAiChat(prompt);
  const assertions = aiWorkflow.parseJsonArray<ApiAssertion>(text) ?? [];

  return normalizeGeneratedAssertions(
    assertions
      .filter((a) => a && a.type && a.operator)
      .map((assertion) => ({
        ...assertion,
        expression:
          assertion.type === "jmespath" && assertion.expression
            ? assertion.expression
                .replace(
                  /length\(\s*@\.([A-Za-z_][A-Za-z0-9_]*)\s*\)/g,
                  "length($1)",
                )
                .replace(/length\(\s*@\[\*\]\s*\)/g, "length(@)")
            : assertion.expression,
      })),
    {
      messageFormat: input.messageFormat,
      transport: input.transport,
    },
  );
}
