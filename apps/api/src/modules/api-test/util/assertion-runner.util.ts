import type {
  ApiBodyAssertion,
  ApiCaseExpected,
  AssertionResult,
} from "@case-forge/shared";

function readJsonPath(body: unknown, path?: string) {
  if (!path || body === null || body === undefined) return body;
  const segments = path
    .replace(/^\$\.?/, "")
    .split(".")
    .filter(Boolean);
  let current: unknown = body;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function runBodyAssertion(
  assertion: ApiBodyAssertion,
  body: unknown,
): AssertionResult {
  const name =
    assertion.description ||
    `${assertion.type}${assertion.path ? ` ${assertion.path}` : ""}`;
  const actual = assertion.path
    ? readJsonPath(body, assertion.path)
    : body;

  let passed = false;
  switch (assertion.type) {
    case "equals":
      passed =
        JSON.stringify(actual) === JSON.stringify(assertion.expected);
      break;
    case "contains":
      passed = String(actual ?? "").includes(String(assertion.expected ?? ""));
      break;
    case "matches":
      passed = new RegExp(String(assertion.expected)).test(String(actual ?? ""));
      break;
    case "jsonPath":
      passed =
        JSON.stringify(actual) === JSON.stringify(assertion.expected);
      break;
    default:
      passed = false;
  }

  return {
    name,
    passed,
    expected: assertion.expected,
    actual,
    message: passed ? undefined : "断言未通过",
  };
}

export function runAssertions(input: {
  expected: ApiCaseExpected;
  statusCode: number;
  body: unknown;
  durationMs: number;
}): AssertionResult[] {
  const results: AssertionResult[] = [];

  if (!input.expected.skipStatusCheck) {
    const codes = Array.isArray(input.expected.statusCode)
      ? input.expected.statusCode
      : input.expected.statusCode !== undefined
        ? [input.expected.statusCode]
        : [200];

    results.push({
      name: "HTTP 状态码",
      passed: codes.includes(input.statusCode),
      expected: codes,
      actual: input.statusCode,
      message: codes.includes(input.statusCode) ? undefined : "状态码不匹配",
    });
  }

  if (input.expected.maxDurationMs) {
    results.push({
      name: "响应时间",
      passed: input.durationMs <= input.expected.maxDurationMs,
      expected: input.expected.maxDurationMs,
      actual: input.durationMs,
    });
  }

  if (!input.expected.statusOnly && input.expected.bodyAssertions?.length) {
    for (const assertion of input.expected.bodyAssertions) {
      results.push(runBodyAssertion(assertion, input.body));
    }
  }

  return results;
}

export function isAllPassed(assertions: AssertionResult[]) {
  return assertions.length > 0 && assertions.every((item) => item.passed);
}
