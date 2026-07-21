import type { ApiServiceProperty } from "@case-forge/shared";
import { extractApiDocSection, getApiDocFieldValue } from "./api-doc.parser";

export const API_CASE_RULE_VERSION = "api-case-rules-v3";

export const API_CASE_SCENARIOS = {
  positive_flow: "正向流程",
  pagination: "页码和页大小",
  required_fields: "必填参数检验",
  related_fields: "关联字段组合",
  enum: "枚举",
  precision: "精度校验",
  idempotency: "幂等性校验",
  accounting_business: "业务场景",
} as const;
export type ApiCaseScenarioKey = keyof typeof API_CASE_SCENARIOS;

const SERVICE_SCENARIOS: Record<ApiServiceProperty, ApiCaseScenarioKey[]> = {
  query_non_accounting: ["positive_flow", "pagination"],
  query_accounting: ["positive_flow", "pagination", "precision"],
  management_non_accounting: [
    "positive_flow",
    "required_fields",
    "related_fields",
    "enum",
    "idempotency",
  ],
  management_accounting: [
    "positive_flow",
    "required_fields",
    "related_fields",
    "enum",
    "precision",
    "idempotency",
  ],
  accounting: [
    "positive_flow",
    "precision",
    "required_fields",
    "enum",
    "accounting_business",
    "related_fields",
    "idempotency",
  ],
  reversal: [
    "positive_flow",
    "precision",
    "required_fields",
    "enum",
    "accounting_business",
    "related_fields",
    "idempotency",
  ],
  file: ["positive_flow", "idempotency"],
  push: ["positive_flow", "idempotency"],
};

export function scenariosForProperty(property: ApiServiceProperty) {
  return SERVICE_SCENARIOS[property].map((key) => ({
    key,
    name: API_CASE_SCENARIOS[key],
  }));
}

export interface ScenarioAiCase {
  title: string;
  polarity: "positive" | "negative";
  changes: Array<{ path: string; value: string }>;
  expected?: string;
}

export interface ScenarioAiResult {
  applicable: boolean;
  reason: string;
  cases: ScenarioAiCase[];
}

function requestFieldLines(structuredMarkdown: string) {
  return extractApiDocSection(structuredMarkdown, "请求报文")
    .split("\n")
    .filter(Boolean)
    .slice(0, 120);
}

export function buildScenarioPrompts(input: {
  scenarioKey: ApiCaseScenarioKey;
  scenarioName: string;
  structuredMarkdown: string;
  transactionCode: string;
  serviceProperty: ApiServiceProperty;
}): Array<{ prompt: string; inputFieldCount: number }> {
  const basic = extractApiDocSection(input.structuredMarkdown, "基础信息");
  const service = extractApiDocSection(input.structuredMarkdown, "服务信息");
  const fields = requestFieldLines(input.structuredMarkdown);
  const prefix = [
    `你正在为银行接口的「${input.scenarioName}」场景生成测试案例。`,
    "先判断场景是否适用；不适用时 cases 返回空数组并说明原因。",
    "适用时仅返回字段修改计划，不返回完整请求报文。",
    "只输出一个 JSON 对象：{applicable,reason,cases:[{title,polarity,changes:[{path,value}],expected}]}。",
    "changes.path 必须使用请求字段完整路径；不得编造请求字段。",
    `场景规则：${scenarioRule(input.scenarioKey)}`,
    `交易码：${input.transactionCode}`,
    `服务属性：${input.serviceProperty}`,
    `服务名称：${getApiDocFieldValue(basic, "服务名称(中)") || getApiDocFieldValue(basic, "服务名称")}`,
    `功能描述：${getApiDocFieldValue(service, "功能描述")}`,
    `业务规则：${getApiDocFieldValue(service, "业务规则")}`,
    "请求字段（节点路径|节点代码|节点名称|节点类型|数据类型|长度|是否必填|描述）：",
  ].join("\n");
  const header = fields[0] ?? "";
  const body = fields.slice(1);
  const chunks: string[][] = [];
  let chunk: string[] = [];
  let chars = prefix.length + header.length + 2;
  for (const line of body) {
    if (chunk.length && chars + line.length + 1 > 4000) {
      chunks.push(chunk);
      chunk = [];
      chars = prefix.length + header.length + 2;
    }
    chunk.push(line);
    chars += line.length + 1;
  }
  if (chunk.length || !chunks.length) chunks.push(chunk);
  return chunks.map((lines, index) => ({
    prompt: [
      prefix,
      chunks.length > 1
        ? `当前为字段分片 ${index + 1}/${chunks.length}，仅处理本分片字段。`
        : "",
      header,
      ...lines,
    ]
      .filter(Boolean)
      .join("\n"),
    inputFieldCount: lines.length,
  }));
}

export function validateScenarioAiResult(
  result: ScenarioAiResult,
  structuredMarkdown: string,
) {
  const allowed = new Set(
    requestFieldLines(structuredMarkdown)
      .slice(1)
      .map((line) => line.split("|").map((cell) => cell.trim()))
      .filter((cells) => cells[0] && cells[1])
      .map((cells) => `${cells[0].replace(/\/$/, "")}/${cells[1]}`),
  );
  const seen = new Set<string>();
  result.cases = result.cases.filter((item) => {
    item.changes = item.changes.filter((change) => allowed.has(change.path));
    if (!item.changes.length && item.polarity === "negative") return false;
    const key = `${item.title}|${JSON.stringify(item.changes)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return result;
}

export function assertScenarioCoverage(
  scenarioKey: ApiCaseScenarioKey,
  result: ScenarioAiResult,
  structuredMarkdown?: string,
) {
  if (!result.applicable) return;
  if (!result.cases.length) throw new Error("AI 判断场景适用，但未生成案例");
  const positive = result.cases.filter(
    (item) => item.polarity === "positive",
  ).length;
  const negative = result.cases.filter(
    (item) => item.polarity === "negative",
  ).length;
  if (scenarioKey === "positive_flow" && positive !== 1) {
    throw new Error("正向流程必须且只能生成 1 条正向案例");
  }
  if (["precision", "related_fields", "enum"].includes(scenarioKey)) {
    if (!positive || !negative)
      throw new Error("该场景必须同时包含正向和反向案例");
  }
  if (scenarioKey === "idempotency" && result.cases.length !== 1) {
    throw new Error("幂等性场景必须生成 1 条案例");
  }
  if (structuredMarkdown && scenarioKey === "precision") {
    assertEachFieldHasPolarities(
      result,
      scenarioFieldPaths(structuredMarkdown, "precision"),
    );
  }
  if (structuredMarkdown && scenarioKey === "enum") {
    const enumPaths = scenarioFieldPaths(structuredMarkdown, "enum");
    for (const path of enumPaths) {
      if (
        !result.cases.some(
          (item) =>
            item.polarity === "negative" &&
            item.changes.some((change) => change.path === path),
        )
      ) {
        throw new Error(`枚举字段 ${path} 缺少非法值反向案例`);
      }
    }
  }
}

function scenarioFieldPaths(
  structuredMarkdown: string,
  kind: "precision" | "enum",
) {
  return requestFieldLines(structuredMarkdown)
    .slice(1)
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .filter((cells) => {
      const text = cells.join(" ").toLowerCase();
      if (kind === "precision") {
        return /(金额|利率|比例|比率|频率|汇率|小数|精度|decimal|numeric|number)/i.test(
          text,
        );
      }
      return /(枚举|码值|取值|[0-9a-z]+\s*[-=:：]\s*[^,，;；]+)/i.test(text);
    })
    .filter((cells) => cells[0] && cells[1])
    .map((cells) => `${cells[0].replace(/\/$/, "")}/${cells[1]}`);
}

function assertEachFieldHasPolarities(
  result: ScenarioAiResult,
  paths: string[],
) {
  for (const path of paths) {
    const cases = result.cases.filter((item) =>
      item.changes.some((change) => change.path === path),
    );
    if (
      !cases.some((item) => item.polarity === "positive") ||
      !cases.some((item) => item.polarity === "negative")
    ) {
      throw new Error(`精度字段 ${path} 必须各生成 1 条正向和 1 条反向案例`);
    }
  }
}

function scenarioRule(key: ApiCaseScenarioKey) {
  switch (key) {
    case "positive_flow":
      return "生成1条成功正向案例。";
    case "pagination":
      return "按字段代码、中文名称和描述的语义识别分页，不限固定命名：page/pageNo/pageNum、size/pageSize/limit/rowCount/perPage 及名称含“页码/页数/每页/查询条数”的字段；start/startSize/startIndex/beginRow/offset 及名称含“开始条数/起始条数/起始位置/偏移量”的字段。存在页大小加起始位置（如 size+start、size+startSize）也适用；字段语义有歧义时以中文名称和描述为准。起始值必须遵循文档或示例报文：示例 start=1 时正向首条使用 1，不得按习惯改成 0；只有文档明确为零基偏移量时才使用 0。不适用时说明具体原因。生成单页/多页、单条/多条组合案例。";
    case "required_fields":
      return "覆盖必填字段缺失异常，并生成全部非必填字段为空的正向案例；忽略参数名称错误。";
    case "related_fields":
      return "识别业务规则中的关联字段，为每组关系生成合法正向和冲突反向案例。";
    case "enum":
      return "枚举不超过5项时正向尽量全覆盖，否则覆盖常用值；每个枚举字段生成1条非法值反向案例。";
    case "precision":
      return "每个金额、利率、频率、比例等精度字段生成1条符合精度正向和1条超精度反向案例。";
    case "idempotency":
      return "仅当存在幂等业务含义时适用，生成1条相同幂等键连续请求的案例。";
    case "accounting_business":
      return "生成利率超界、余额不足、非本人扣款账户、未传密码、金额或利率超范围等适用的涉账异常案例。";
  }
}

export function parseScenarioAiResult(text: string): ScenarioAiResult | null {
  const fenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(fenced.slice(start, end + 1)) as ScenarioAiResult;
    if (typeof value.applicable !== "boolean" || !Array.isArray(value.cases))
      return null;
    value.reason = String(value.reason ?? "");
    value.cases = value.cases
      .filter(
        (item) =>
          item && typeof item.title === "string" && Array.isArray(item.changes),
      )
      .map((item) => ({
        ...item,
        changes: item.changes
          .filter((change) => change && typeof change.path === "string")
          .map((change) => ({
            path: change.path,
            value: String(change.value ?? ""),
          })),
      }));
    return value;
  } catch {
    return null;
  }
}
