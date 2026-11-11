import type { ApiServiceProperty } from "@case-forge/shared";
import { extractApiDocSection, getApiDocFieldValue } from "./api-doc.parser";

export const API_CASE_RULE_VERSION = "api-case-rules-v6";

export const API_CASE_SCENARIOS = {
  positive_flow: "正向流程",
  pagination: "页码和页大小",
  required_fields: "必填参数检验",
  related_fields: "关联字段组合",
  enum: "枚举",
  precision: "精度校验",
  idempotency: "幂等性校验",
  accounting_business: "业务场景",
  all_fields_empty: "全字段空值校验",
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
  description?: string;
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

function parseTableCells(line: string): string[] {
  const cells = line.split("|").map((cell) => cell.trim());
  if (!cells[0]) cells.shift();
  if (!cells[cells.length - 1]) cells.pop();
  return cells;
}

function completeFieldPath(path: string, code: string): string {
  const normalizedPath = path.replace(/\/$/, "");
  const lastSegment = normalizedPath.split("/").filter(Boolean).pop();
  return lastSegment?.toLowerCase() === code.toLowerCase()
    ? normalizedPath
    : `${normalizedPath}/${code}`;
}

/** 请求报文全部字段路径（节点路径/节点代码，与 overrides 路径格式一致），按文档顺序去重 */
export function extractRequestFieldPaths(structuredMarkdown: string): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const line of requestFieldLines(structuredMarkdown).slice(1)) {
    const cells = parseTableCells(line);
    const path = (cells[0] ?? "").replace(/\/$/, "");
    const code = cells[1] ?? "";
    if (!path || !code) continue;
    const value = completeFieldPath(path, code);
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    paths.push(value);
  }
  return paths;
}

const REQUIRED_FLAG_PATTERN = /^(y|yes|m|mandatory|required|true|1|是|必填)$/i;
const OPTIONAL_FLAG_PATTERN = /^(n|no|o|optional|false|0|否|非必填|可选)$/i;

/** 「是否必填」列下标：优先按表头定位，缺省回退到第 7 列 */
function requiredFlagIndex(structuredMarkdown: string) {
  const header = requestFieldLines(structuredMarkdown)[0] ?? "";
  const cells = parseTableCells(header);
  const index = cells.findIndex((cell) => /必填|必需|required/i.test(cell));
  return index >= 0 ? index : 6;
}

interface RequestFieldRow {
  path: string;
  code: string;
  name: string;
  flag: string;
}

/** 解析请求报文表格的字段路径、代码、名称与「是否必填」标记 */
function requestFieldRows(structuredMarkdown: string): RequestFieldRow[] {
  const flagIndex = requiredFlagIndex(structuredMarkdown);
  const seen = new Set<string>();
  const rows: RequestFieldRow[] = [];
  for (const line of requestFieldLines(structuredMarkdown).slice(1)) {
    const cells = parseTableCells(line);
    const path = (cells[0] ?? "").replace(/\/$/, "");
    const code = cells[1] ?? "";
    if (!path || !code) continue;
    const field = completeFieldPath(path, code);
    const key = field.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      path: field,
      code,
      name: (cells[2] ?? "").trim() || code,
      flag: (cells[flagIndex] ?? "").replace(/[\s*]/g, ""),
    });
  }
  return rows;
}

/**
 * 按「是否必填」列拆分请求字段路径；条件必填等无法判定的字段不计入任何一侧
 */
export function extractFieldsByRequirement(structuredMarkdown: string): {
  required: string[];
  optional: string[];
} {
  const rows = requestFieldRows(structuredMarkdown);
  return {
    required: rows
      .filter((row) => REQUIRED_FLAG_PATTERN.test(row.flag))
      .map((row) => row.path),
    optional: rows
      .filter((row) => OPTIONAL_FLAG_PATTERN.test(row.flag))
      .map((row) => row.path),
  };
}

/**
 * 必填参数检验的确定性基线：
 * - 只要求存在必填字段即可适用，逐字段生成「置空」反向案例；
 * - 存在非必填字段时才追加 1 条「非必填全部为空」正向案例；
 * - 全部字段都标为必填时不得判定为不适用。
 */
export function buildRequiredFieldScenario(
  structuredMarkdown: string,
  actionName: string,
): ScenarioAiResult {
  const rows = requestFieldRows(structuredMarkdown);
  const required = rows.filter((row) => REQUIRED_FLAG_PATTERN.test(row.flag));
  const optional = rows.filter((row) => OPTIONAL_FLAG_PATTERN.test(row.flag));
  if (!required.length && !optional.length) {
    return {
      applicable: false,
      reason:
        "请求报文未标注可判定的必填或非必填字段，无法生成必填参数检验案例",
      cases: [],
    };
  }

  const cases: ScenarioAiCase[] = required.map((row) => ({
    title: `反向-${actionName}-必填字段${row.name}为空`,
    description: `系统用户在${actionName}业务场景中执行交易操作时，将必填字段${row.name}（${row.code}）置为空值，其余字段保持合法取值，预期接口返回参数校验失败并指明缺失字段，用于验证必填字段校验规则是否正确。`,
    polarity: "negative",
    changes: [{ path: row.path, value: "" }],
    expected: `接口应返回参数校验失败并指明缺失字段${row.name}，不得处理成功`,
  }));
  if (optional.length) {
    cases.push({
      title: `正向-${actionName}-非必填字段全部为空`,
      description: `系统用户在${actionName}业务场景中执行交易操作时，将全部非必填字段置为空值，必填字段取合法值，预期接口正常处理，用于验证非必填字段可缺省。`,
      polarity: "positive",
      changes: optional.map((row) => ({ path: row.path, value: "" })),
      expected: "接口应正常处理并返回正确业务结果",
    });
  }

  return {
    applicable: true,
    reason: optional.length
      ? `检测到 ${required.length} 个必填字段和 ${optional.length} 个非必填字段，按规则生成必填校验案例`
      : `检测到 ${required.length} 个必填字段且无非必填字段，仅生成必填字段反向案例`,
    cases,
  };
}

/**
 * 用确定性基线补齐 AI 结果：
 * - AI 判定不适用但存在必填字段时，直接采用基线；
 * - AI 适用时补上遗漏的必填字段反向案例和非必填正向案例。
 */
export function mergeRequiredFieldScenario(
  ai: ScenarioAiResult,
  baseline: ScenarioAiResult,
): ScenarioAiResult {
  if (!baseline.applicable) return ai;
  if (!ai.applicable) return baseline;

  const cases = [...ai.cases];
  const negativePaths = new Set<string>();
  let hasPositive = false;
  for (const item of cases) {
    if (item.polarity === "positive") hasPositive = true;
    if (item.polarity !== "negative") continue;
    for (const change of item.changes) {
      negativePaths.add(change.path.toLowerCase());
    }
  }
  for (const item of baseline.cases) {
    if (item.polarity === "negative") {
      const path = item.changes[0]?.path.toLowerCase();
      if (path && !negativePaths.has(path)) {
        cases.push(item);
        negativePaths.add(path);
      }
      continue;
    }
    if (!hasPositive) {
      cases.push(item);
      hasPositive = true;
    }
  }
  return {
    applicable: true,
    reason: ai.reason || baseline.reason,
    cases,
  };
}

export function buildScenarioPrompts(input: {
  scenarioKey: string;
  scenarioName: string;
  structuredMarkdown: string;
  transactionCode: string;
  serviceProperty: string;
  scenarioPromptText?: string;
}): Array<{ prompt: string; inputFieldCount: number }> {
  const basic = extractApiDocSection(input.structuredMarkdown, "基础信息");
  const service = extractApiDocSection(input.structuredMarkdown, "服务信息");
  const fields = requestFieldLines(input.structuredMarkdown);
  const prefix = [
    `你正在为银行接口的「${input.scenarioName}」场景生成测试案例。`,
    "先判断场景是否适用；不适用时 cases 返回空数组并说明原因。",
    "适用时仅返回字段修改计划，不返回完整请求报文。",
    "只输出一个 JSON 对象：{applicable,reason,cases:[{title,description,polarity,changes:[{path,value}],expected}]}。",
    "title 必须简要描述“业务场景 + 业务规则或被测条件”，不得只写字段名，不得包含案例编号；示例：反向-省份列表查询-分页参数非法。",
    "description 必须描述用例设计目标，建议格式：{角色}在{业务场景}中执行{交易或操作}时，{输入或触发条件}，预期{结果}，用于验证{业务规则}是否正确。",
    "文档未提供角色时使用“系统用户”，不得编造角色；description 不得为空，不得只写错误码或重复 title。",
    'polarity 只能取英文枚举值 "positive"（正向案例）或 "negative"（反向案例），不得输出「正向」「反向」等中文取值。',
    "changes.path 必须使用请求字段完整路径；不得编造请求字段。",
    `场景规则：${
      input.scenarioPromptText?.trim() || scenarioRule(input.scenarioKey)
    }`,
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
  const allowed = new Map(
    requestFieldLines(structuredMarkdown)
      .slice(1)
      .map(parseTableCells)
      .filter((cells) => cells[0] && cells[1])
      .map((cells) => completeFieldPath(cells[0], cells[1]))
      .map((path) => [path.toLowerCase(), path]),
  );
  const seen = new Set<string>();
  result.cases = result.cases.filter((item) => {
    item.title = String(item.title ?? "").trim();
    item.expected = String(item.expected ?? "").trim();
    item.description = normalizeCaseDescription(
      item.title,
      item.description,
      item.expected,
    );
    item.changes = item.changes.filter((change) => {
      const path = allowed.get(change.path.toLowerCase());
      if (path) change.path = path;
      return Boolean(path);
    });
    if (
      !item.title ||
      !item.description ||
      (!item.changes.length && item.polarity === "negative")
    ) {
      return false;
    }
    const key = `${item.title}|${JSON.stringify(item.changes)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return result;
}

export function assertScenarioCoverage(
  scenarioKey: string,
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
  if (
    scenarioKey === "pagination" &&
    (result.cases.length !== 4 || positive !== 4)
  ) {
    throw new Error("分页场景必须生成 4 条正向案例（单页、多页、单条、多条）");
  }
  if (scenarioKey === "all_fields_empty" && result.cases.length !== 1) {
    throw new Error("全字段空值场景必须生成 1 条案例");
  }
  if (structuredMarkdown && scenarioKey === "required_fields") {
    const { required, optional } =
      extractFieldsByRequirement(structuredMarkdown);
    for (const path of required) {
      if (
        !result.cases.some(
          (item) =>
            item.polarity === "negative" &&
            item.changes.some((change) => change.path === path),
        )
      ) {
        throw new Error(`必填字段 ${path} 缺少缺失或为空的反向案例`);
      }
    }
    if (optional.length && !positive) {
      throw new Error(
        "存在非必填字段时必须生成 1 条全部非必填字段为空的正向案例",
      );
    }
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
    .map(parseTableCells)
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
    .map((cells) => completeFieldPath(cells[0], cells[1]));
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

function scenarioRule(key: string) {
  switch (key) {
    case "positive_flow":
      return "生成1条成功正向案例。";
    case "pagination":
      return [
        "按字段代码、中文名称和描述的语义识别页码和页大小字段，不限固定命名。",
        "起始值和默认页大小必须遵循文档或示例报文，不得自行改成零基偏移量。",
        "适用时固定生成 4 条正向案例：① 单页：结果总数不超过一个页大小；② 多页：至少存在两页数据，翻页后结果与上一页不重复；③ 单条：页大小为 1 时只返回 1 条；④ 多条：页大小大于 1 时返回不超过页大小的多条数据。",
      ].join(" ");
    case "required_fields":
      return [
        "只要请求字段中存在标注为必填的字段，本场景即适用；即使所有字段都是必填、没有非必填字段，也必须逐个生成必填字段反向案例，不得判定为不适用。",
        "判定不适用仅限：请求报文没有可解析字段，或所有字段的必填标注都无法判定。",
        "按「是否必填」列判定必填与非必填字段；标注为条件必填或留空等无法判定的字段直接忽略，不得臆测。",
        "必填字段：逐个生成反向案例，仅将该字段置为空值、其余字段保留示例报文原值，预期接口返回参数校验失败并指明缺失字段。",
        "非必填字段：生成 1 条正向案例，将全部非必填字段置为空值、必填字段取合法值，预期接口正常处理，验证非必填字段可缺省；不存在非必填字段时跳过该正向案例即可。",
        "业务规则要求多个非必填查询条件至少传其一时，补充 1 条全部条件均为空的反向案例和 1 条仅传单个条件的正向案例。",
        "每条案例的预期结果须写明校验维度（必填缺失报错 / 非必填可空成功）；忽略参数名称错误等非必填性维度的校验。",
      ].join(" ");
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
    case "all_fields_empty":
      return "生成 1 条请求报文每个字段均置为空值的反向案例，验证接口校验能力。";
    default:
      return "";
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
        title: item.title.trim(),
        expected: String(item.expected ?? "").trim(),
        description: normalizeCaseDescription(
          item.title.trim(),
          item.description,
          item.expected,
        ),
        polarity: normalizePolarity(item.polarity),
        changes: item.changes
          .filter((change) => change && typeof change.path === "string")
          .map((change) => ({
            path: change.path.trim(),
            value: String(change.value ?? ""),
          })),
      }));
    return value;
  } catch {
    return null;
  }
}

function normalizeCaseDescription(
  title: string,
  description: unknown,
  expected: unknown,
) {
  const explicit = String(description ?? "").trim();
  if (explicit) return explicit;
  const expectedText = String(expected ?? "").trim();
  return `系统用户在“${title || "当前接口"}”业务场景中执行交易操作时，触发对应业务规则，预期${expectedText || "接口完成预期业务处理"}，用于验证该业务规则是否正确。`;
}

/** AI 偶尔把枚举值翻成中文，统一归一为文档约定的英文取值 */
const NEGATIVE_POLARITY_PATTERN = /^(negative|neg|反向|反|负向|异常|失败)$/i;

function normalizePolarity(value: unknown): "positive" | "negative" {
  const text = String(value ?? "").trim();
  return NEGATIVE_POLARITY_PATTERN.test(text) ? "negative" : "positive";
}
