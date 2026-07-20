import type {
  ApiAssertion,
  ApiCaseExpected,
  AssertionOperator,
  AssertionType,
} from "@case-forge/shared";
import type { CaseProtocol } from "@/utils/casePayloadFormat.util";

export interface AssertionRow {
  id: string;
  description: string;
  type: AssertionType | "";
  operator: AssertionOperator | "";
  expression: string;
  expected: string;
}

export const ASSERTION_TYPE_OPTIONS: Array<{
  value: AssertionType;
  label: string;
}> = [
  { value: "status_code", label: "HTTP 状态码" },
  { value: "headers", label: "响应头" },
  { value: "jsonpath", label: "JSONPath" },
  { value: "jmespath", label: "JMESPath" },
  { value: "xpath", label: "XPath" },
  { value: "string", label: "包含文本" },
  { value: "re", label: "正则匹配" },
  { value: "raw", label: "全文比对" },
  { value: "response_size", label: "响应大小" },
  { value: "default", label: "业务码默认" },
  { value: "rsp_download", label: "下载响应" },
];

export const ASSERTION_OPERATOR_OPTIONS: Array<{
  value: AssertionOperator;
  label: string;
}> = [
  { value: "eq", label: "等于" },
  { value: "nq", label: "不等于" },
  { value: "gt", label: "大于" },
  { value: "lt", label: "小于" },
  { value: "gte", label: "大于等于" },
  { value: "lte", label: "小于等于" },
];

function createRowId() {
  return `assertion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyAssertionRow(
  protocol: CaseProtocol = "http",
): AssertionRow {
  return {
    id: createRowId(),
    description: "",
    type: protocol === "http" ? "status_code" : "string",
    operator: "eq",
    expression: "",
    expected: protocol === "http" ? "200" : "",
  };
}

export function filterAssertionTypeOptions(protocol: CaseProtocol) {
  if (protocol === "http") return ASSERTION_TYPE_OPTIONS;
  return ASSERTION_TYPE_OPTIONS.filter((item) => item.value !== "status_code");
}

export function assertionToRow(assertion: ApiAssertion): AssertionRow {
  return {
    id: createRowId(),
    description: assertion.description ?? "",
    type: assertion.type,
    operator: assertion.operator,
    expression: assertion.expression ?? "",
    expected: String(assertion.expected ?? ""),
  };
}

export function assertionsToRows(
  assertions: ApiAssertion[] | undefined,
): AssertionRow[] {
  if (!assertions?.length) return [];
  return assertions.map(assertionToRow);
}

export function rowToAssertion(row: AssertionRow): ApiAssertion | null {
  if (!row.type || !row.operator) return null;
  const assertion: ApiAssertion = {
    type: row.type,
    operator: row.operator,
    expression: row.expression ?? "",
  };
  if (row.description.trim()) {
    assertion.description = row.description.trim();
  }
  const expected = String(row.expected ?? "").trim();
  if (expected) {
    assertion.expected = expected;
  }
  return assertion;
}

export function rowsToAssertions(rows: AssertionRow[]): ApiAssertion[] {
  return rows
    .map(rowToAssertion)
    .filter((item): item is ApiAssertion => Boolean(item));
}

export function buildExpectedFromRows(rows: AssertionRow[]): ApiCaseExpected {
  return { assertions: rowsToAssertions(rows) };
}

export function expressionPlaceholder(type: AssertionType | ""): string {
  switch (type) {
    case "status_code":
    case "raw":
    case "response_size":
    case "default":
      return "通常留空";
    case "headers":
      return "Header 名称";
    case "jsonpath":
      return "$.path.to.field";
    case "jmespath":
      return "JMESPath 表达式";
    case "xpath":
      return "XPath 表达式";
    case "string":
      return "要匹配的文本";
    case "re":
      return "正则表达式";
    case "rsp_download":
      return "文件名模式（可选）";
    default:
      return "表达式";
  }
}

export function expectedPlaceholder(type: AssertionType | ""): string {
  switch (type) {
    case "status_code":
      return "如 200";
    case "headers":
    case "jsonpath":
    case "jmespath":
    case "xpath":
    case "raw":
    case "response_size":
      return "预期值";
    case "string":
    case "re":
    case "default":
    case "rsp_download":
      return "可留空";
    default:
      return "预期值";
  }
}

export function showsExpectedField(type: AssertionType | ""): boolean {
  return (
    type !== "string" &&
    type !== "re" &&
    type !== "default" &&
    type !== "rsp_download"
  );
}
