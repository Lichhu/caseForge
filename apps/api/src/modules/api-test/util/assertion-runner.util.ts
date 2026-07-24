import type {
  ApiAssertion,
  ApiCaseExpected,
  AssertionResult,
} from "@case-forge/shared";
import { JSONPath } from "jsonpath-plus";
import jmespath from "jmespath";
import { select } from "xpath";
import { DOMParser } from "@xmldom/xmldom";

export interface AssertionRunInput {
  expected: ApiCaseExpected;
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  bodySize: number;
  /** 响应耗时（毫秒），预留用于未来 duration 断言类型 */
  durationMs: number;
  polarity?: "positive" | "negative";
}

export function extractResponseValue(
  source: "body" | "header" | "status",
  expression: string | undefined,
  input: Pick<AssertionRunInput, "body" | "headers" | "statusCode">,
): unknown {
  if (source === "status") return input.statusCode;
  if (source === "header") {
    const key = expression ?? "";
    return input.headers[key] ?? input.headers[key.toLowerCase()] ?? "";
  }
  if (!expression) return undefined;
  if (typeof input.body === "string" && expression.startsWith("/")) {
    try {
      const doc = new DOMParser().parseFromString(
        stripTcpLengthPrefix(input.body),
        "text/xml",
      );
      const nodes = select(expression, doc as any);
      const node = Array.isArray(nodes) ? nodes[0] : nodes;
      return extractXPathText(node);
    } catch {
      return undefined;
    }
  }
  const body = coerceAssertionBody(input.body);
  try {
    if (expression.startsWith("$") ) {
      const value = JSONPath({ path: expression, json: body as object });
      return Array.isArray(value) ? value[0] : value;
    }
    return evaluateJmespath(body, expression);
  } catch {
    return undefined;
  }
}

function compareValues(
  actual: unknown,
  expected: unknown,
  operator: string,
): boolean {
  const actualStr = String(actual ?? "");
  const expectedStr = String(expected ?? "");

  switch (operator) {
    case "eq":
      return actualStr === expectedStr;
    case "nq":
      return actualStr !== expectedStr;
    case "gt":
      return Number(actualStr) > Number(expectedStr);
    case "lt":
      return Number(actualStr) < Number(expectedStr);
    case "gte":
      return Number(actualStr) >= Number(expectedStr);
    case "lte":
      return Number(actualStr) <= Number(expectedStr);
    default:
      return false;
  }
}

/** 剥离 TCP 响应常见的数字长度头，如 00009732<xml>...</xml> */
export function stripTcpLengthPrefix(body: string): string {
  const trimmed = body.trim();
  const matched = trimmed.match(/^(\d{4,8})(<[\s\S]+)$/);
  return matched ? matched[2] : trimmed;
}

function resolveAssertionBodyText(body: unknown): string {
  if (body == null) return "";
  if (typeof body === "string") return stripTcpLengthPrefix(body);
  try {
    return stripTcpLengthPrefix(JSON.stringify(body));
  } catch {
    return stripTcpLengthPrefix(String(body));
  }
}

function extractXPathText(node: unknown): string {
  if (!node) return "";
  const current = node as {
    nodeType?: number;
    nodeValue?: string | null;
    textContent?: string | null;
  };
  if (current.nodeType === 3 && current.nodeValue != null) {
    return current.nodeValue.trim();
  }
  if (current.textContent != null && current.textContent !== "") {
    return current.textContent.trim();
  }
  if (current.nodeValue != null) return String(current.nodeValue).trim();
  return String(node).trim();
}

/** 将字符串响应体尽量解析为 JSON，便于 jsonpath / jmespath 取值 */
export function coerceAssertionBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  const trimmed = stripTcpLengthPrefix(body.trim());
  if (!trimmed) return body;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

/** 修正 AI 常见的无效 JMESPath 写法，如 length(@.data)、length(@[*]) */
export function normalizeJmespathExpression(expression: string): string {
  let expr = expression.trim();
  expr = expr.replace(
    /length\(\s*@\.([A-Za-z_][A-Za-z0-9_]*)\s*\)/g,
    "length($1)",
  );
  expr = expr.replace(/length\(\s*@\[\*\]\s*\)/g, "length(@)");
  return expr;
}

function evaluateJmespath(body: unknown, expression: string): unknown {
  const candidates = [
    expression,
    normalizeJmespathExpression(expression),
  ].filter((item, index, arr) => item && arr.indexOf(item) === index);

  for (const expr of candidates) {
    try {
      return jmespath.search(body, expr);
    } catch {
      // try next normalized variant
    }
  }
  return undefined;
}

function runSingleAssertion(
  assertion: ApiAssertion,
  input: AssertionRunInput,
): AssertionResult {
  const name =
    assertion.description ||
    `${assertion.type} ${assertion.operator} ${assertion.expected ?? ""}`;
  const { type, operator, expression, expected } = assertion;

  let passed = false;
  let actual: unknown = undefined;
  let expectedDisplay: unknown = expected ?? expression;

  switch (type) {
    case "status_code": {
      actual = input.statusCode;
      expectedDisplay = expected ?? "200";
      passed = compareValues(actual, expectedDisplay, operator);
      break;
    }

    case "headers": {
      const headerKey = expression;
      const headerVal =
        input.headers[headerKey] ??
        input.headers[headerKey.toLowerCase()] ??
        input.headers[headerKey.replace(/\b\w/g, (c) => c.toUpperCase())];
      actual = headerVal ?? "";
      expectedDisplay = expected ?? "";
      passed = compareValues(actual, expectedDisplay, operator);
      break;
    }

    case "jsonpath": {
      try {
        const jsonBody = coerceAssertionBody(input.body);
        actual = JSONPath({ path: expression, json: jsonBody as object });
        actual = Array.isArray(actual) ? actual[0] : actual;
      } catch {
        actual = undefined;
      }
      expectedDisplay = expected ?? "";
      passed = compareValues(actual, expectedDisplay, operator);
      break;
    }

    case "jmespath": {
      const jsonBody = coerceAssertionBody(input.body);
      actual = evaluateJmespath(jsonBody, expression);
      if (expected !== undefined && expected !== "") {
        expectedDisplay = expected;
        passed = compareValues(actual, expectedDisplay, operator);
      } else {
        passed = Boolean(actual);
      }
      break;
    }

    case "xpath": {
      const bodyStr = resolveAssertionBodyText(input.body);
      try {
        const doc = new DOMParser().parseFromString(bodyStr, "text/xml");
        const nodes = select(expression, doc as any);
        const nodeArr = Array.isArray(nodes) ? nodes : nodes ? [nodes] : [];
        if (expected !== undefined && expected !== "") {
          actual = nodeArr.length > 0 ? extractXPathText(nodeArr[0]) : "";
          expectedDisplay = expected;
          passed = compareValues(actual, expectedDisplay, operator);
        } else {
          actual = nodeArr.length > 0;
          passed = Boolean(actual);
        }
      } catch {
        actual = undefined;
        passed = false;
      }
      break;
    }

    case "raw": {
      const bodyStr = resolveAssertionBodyText(input.body);
      actual = bodyStr;
      expectedDisplay = expected ?? expression;
      passed = compareValues(actual, expectedDisplay, operator);
      break;
    }

    case "string": {
      const bodyStr = resolveAssertionBodyText(input.body);
      actual = bodyStr;
      expectedDisplay = expression;
      if (operator === "eq") {
        passed = bodyStr.includes(expression);
      } else if (operator === "nq") {
        passed = !bodyStr.includes(expression);
      } else {
        passed = compareValues(bodyStr, expression, operator);
      }
      break;
    }

    case "re": {
      const bodyStr = resolveAssertionBodyText(input.body);
      actual = bodyStr;
      expectedDisplay = expression;
      try {
        const regex = new RegExp(expression);
        const matched = regex.test(bodyStr);
        passed = operator === "nq" ? !matched : matched;
      } catch {
        passed = false;
      }
      break;
    }

    case "response_size": {
      actual = input.bodySize;
      expectedDisplay = expected ?? "0";
      passed = compareValues(actual, expectedDisplay, operator);
      break;
    }

    case "default": {
      const bodyStr = resolveAssertionBodyText(input.body);
      actual = bodyStr;
      if (input.polarity === "negative") {
        passed = true;
      } else {
        const successPatterns = ["000000", "00000", "成功", "success"];
        passed = successPatterns.some((p) => bodyStr.includes(p));
      }
      break;
    }

    case "rsp_download": {
      const contentType =
        input.headers["content-type"] ?? input.headers["Content-Type"] ?? "";
      actual = contentType;
      expectedDisplay = expected ?? expression;
      const isDownload =
        contentType.includes("application/octet-stream") ||
        contentType.includes("attachment") ||
        contentType.includes("multipart/form-data");
      if (expression) {
        passed = isDownload && bodyIncludesPattern(input.body, expression);
      } else {
        passed = isDownload;
      }
      if (operator === "nq") passed = !passed;
      break;
    }

    default:
      passed = false;
  }

  return {
    name,
    passed,
    expected: expectedDisplay,
    actual,
    message: passed ? undefined : "断言未通过",
  };
}

function bodyIncludesPattern(body: unknown, pattern: string): boolean {
  const bodyStr = resolveAssertionBodyText(body);
  return bodyStr.includes(pattern);
}

export function runAssertions(input: AssertionRunInput): AssertionResult[] {
  const assertions = input.expected.assertions;
  if (!assertions?.length) {
    return [
      {
        name: "断言检查",
        passed: false,
        expected: "至少一条断言",
        actual: "未配置断言",
        message: "未配置任何断言，请在 expected.assertions 中添加至少一条断言",
      },
    ];
  }
  return assertions.map((a) => runSingleAssertion(a, input));
}

export function isAllPassed(assertions: AssertionResult[]) {
  return assertions.length > 0 && assertions.every((item) => item.passed);
}
