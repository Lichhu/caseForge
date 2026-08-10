import {
  looksLikeXml,
  prettyPrintXml,
  type ApiAssertion,
  type ApiCaseExpected,
} from "@case-forge/shared";
import {
  runAssertions,
  isAllPassed,
  extractExportValue,
  type AssertionRunInput,
} from "./assertion-runner.util";

function makeInput(
  expected: ApiCaseExpected,
  overrides: Partial<AssertionRunInput> = {},
): AssertionRunInput {
  return {
    expected,
    statusCode: 200,
    headers: {},
    body: "",
    bodySize: 0,
    durationMs: 50,
    ...overrides,
  };
}

function runSingle(
  assertion: ApiAssertion,
  overrides: Partial<AssertionRunInput> = {},
): { passed: boolean; actual: unknown; expected: unknown } {
  const results = runAssertions(
    makeInput({ assertions: [assertion] }, overrides),
  );
  const r = results[0];
  return { passed: r.passed, actual: r.actual, expected: r.expected };
}

describe("TCP XML display formatting", () => {
  it("keeps the length prefix and formats the XML body", () => {
    const body = "00001754\r\n<?xml version=\"1.0\"?><root><bizcode>0000</bizcode></root>";

    expect(looksLikeXml(body)).toBe(true);
    expect(prettyPrintXml(body)).toBe(
      "00001754\n<?xml version=\"1.0\"?>\n<root>\n\t<bizcode>0000</bizcode>\n</root>\n",
    );
  });
});

describe("runAssertions – empty assertions", () => {
  it("returns explicit failure when no assertions configured", () => {
    const results = runAssertions(makeInput({ assertions: [] }));
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].message).toContain("未配置");
  });

  it("returns explicit failure when assertions is undefined", () => {
    const results = runAssertions(makeInput({}));
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].message).toContain("未配置");
  });
});

describe("isAllPassed", () => {
  it("returns false when no assertions", () => {
    expect(isAllPassed([])).toBe(false);
  });

  it("returns true when all pass", () => {
    expect(
      isAllPassed([
        { name: "a", passed: true, expected: "x", actual: "x" },
        { name: "b", passed: true, expected: "y", actual: "y" },
      ]),
    ).toBe(true);
  });

  it("returns false when any fails", () => {
    expect(
      isAllPassed([
        { name: "a", passed: true, expected: "x", actual: "x" },
        { name: "b", passed: false, expected: "y", actual: "z" },
      ]),
    ).toBe(false);
  });
});

describe("runAssertions – status_code", () => {
  it("eq passes when status matches", () => {
    const r = runSingle(
      { type: "status_code", operator: "eq", expression: "", expected: "200" },
      { statusCode: 200 },
    );
    expect(r.passed).toBe(true);
  });

  it("eq fails when status differs", () => {
    const r = runSingle(
      { type: "status_code", operator: "eq", expression: "", expected: "200" },
      { statusCode: 404 },
    );
    expect(r.passed).toBe(false);
  });

  it("nq passes when status differs", () => {
    const r = runSingle(
      { type: "status_code", operator: "nq", expression: "", expected: "200" },
      { statusCode: 500 },
    );
    expect(r.passed).toBe(true);
  });

  it("defaults expected to 200 when not provided", () => {
    const r = runSingle(
      { type: "status_code", operator: "eq", expression: "" },
      { statusCode: 200 },
    );
    expect(r.passed).toBe(true);
    expect(r.expected).toBe("200");
  });
});

describe("runAssertions – headers", () => {
  it("eq passes when header value matches", () => {
    const r = runSingle(
      {
        type: "headers",
        operator: "eq",
        expression: "Content-Type",
        expected: "application/json",
      },
      { headers: { "Content-Type": "application/json" } },
    );
    expect(r.passed).toBe(true);
  });

  it("eq fails when header missing", () => {
    const r = runSingle(
      {
        type: "headers",
        operator: "eq",
        expression: "X-Trace-Id",
        expected: "abc",
      },
      { headers: {} },
    );
    expect(r.passed).toBe(false);
  });

  it("case-insensitive header lookup", () => {
    const r = runSingle(
      {
        type: "headers",
        operator: "eq",
        expression: "content-type",
        expected: "text/html",
      },
      { headers: { "Content-Type": "text/html" } },
    );
    expect(r.passed).toBe(true);
  });
});

describe("runAssertions – jsonpath", () => {
  const jsonBody = { code: 200, data: { name: "alice", tags: ["a", "b"] } };

  it("eq passes when jsonpath value matches", () => {
    const r = runSingle(
      {
        type: "jsonpath",
        operator: "eq",
        expression: "$.code",
        expected: "200",
      },
      { body: jsonBody },
    );
    expect(r.passed).toBe(true);
  });

  it("eq fails when jsonpath value differs", () => {
    const r = runSingle(
      {
        type: "jsonpath",
        operator: "eq",
        expression: "$.code",
        expected: "404",
      },
      { body: jsonBody },
    );
    expect(r.passed).toBe(false);
  });

  it("extracts nested field", () => {
    const r = runSingle(
      {
        type: "jsonpath",
        operator: "eq",
        expression: "$.data.name",
        expected: "alice",
      },
      { body: jsonBody },
    );
    expect(r.actual).toBe("alice");
    expect(r.passed).toBe(true);
  });

  it("handles missing path gracefully", () => {
    const r = runSingle(
      {
        type: "jsonpath",
        operator: "eq",
        expression: "$.nonexistent",
        expected: "something",
      },
      { body: jsonBody },
    );
    expect(r.passed).toBe(false);
  });
});

describe("runAssertions – jmespath", () => {
  const jsonBody = { code: 200, items: [{ id: 1 }, { id: 2 }] };

  it("passes with expected value comparison", () => {
    const r = runSingle(
      { type: "jmespath", operator: "eq", expression: "code", expected: "200" },
      { body: jsonBody },
    );
    expect(r.passed).toBe(true);
  });

  it("passes with truthy check when no expected", () => {
    const r = runSingle(
      { type: "jmespath", operator: "eq", expression: "items" },
      { body: jsonBody },
    );
    expect(r.passed).toBe(true);
  });

  it("fails when jmespath result is falsy and no expected", () => {
    const r = runSingle(
      { type: "jmespath", operator: "eq", expression: "nonexistent" },
      { body: jsonBody },
    );
    expect(r.passed).toBe(false);
  });

  it("normalizes length(@.data) and checks non-empty array", () => {
    const r = runSingle(
      {
        type: "jmespath",
        operator: "gt",
        expression: "length(@.data)",
        expected: "0",
        description: "响应体为非空数组",
      },
      { body: { data: [{ id: "a" }, { id: "b" }] } },
    );
    expect(r.actual).toBe(2);
    expect(r.passed).toBe(true);
  });

  it("normalizes length(@[*]) on root array", () => {
    const r = runSingle(
      {
        type: "jmespath",
        operator: "gt",
        expression: "length(@[*])",
        expected: "0",
      },
      { body: [{ id: "a" }] },
    );
    expect(r.actual).toBe(1);
    expect(r.passed).toBe(true);
  });

  it("coerces JSON string body before jmespath", () => {
    const r = runSingle(
      {
        type: "jmespath",
        operator: "gt",
        expression: "length(@)",
        expected: "0",
      },
      { body: '[{"id":"a"}]' },
    );
    expect(r.actual).toBe(1);
    expect(r.passed).toBe(true);
  });
});

describe("runAssertions – xpath", () => {
  const xmlBody = "<root><code>000000</code><msg>ok</msg></root>";

  it("passes when xpath node value matches expected", () => {
    const r = runSingle(
      {
        type: "xpath",
        operator: "eq",
        expression: "//code/text()",
        expected: "000000",
      },
      { body: xmlBody },
    );
    expect(r.passed).toBe(true);
  });

  it("passes with truthy check when no expected (node exists)", () => {
    const r = runSingle(
      { type: "xpath", operator: "eq", expression: "//msg" },
      { body: xmlBody },
    );
    expect(r.passed).toBe(true);
  });

  it("fails when node not found and no expected", () => {
    const r = runSingle(
      { type: "xpath", operator: "eq", expression: "//nonexistent" },
      { body: xmlBody },
    );
    expect(r.passed).toBe(false);
  });

  it("returns element text for //bizcode instead of markup", () => {
    const r = runSingle(
      {
        type: "xpath",
        operator: "eq",
        expression: "//bizcode",
        expected: "0000",
      },
      { body: "<xml><bizcode>0000</bizcode></xml>" },
    );
    expect(r.actual).toBe("0000");
    expect(r.passed).toBe(true);
  });

  it("strips TCP length prefix before xpath evaluation", () => {
    const r = runSingle(
      {
        type: "xpath",
        operator: "eq",
        expression: "//bizcode/text()",
        expected: "0000",
      },
      { body: "00000045<root><bizcode>0000</bizcode></root>" },
    );
    expect(r.passed).toBe(true);
  });
});

describe("runAssertions – raw", () => {
  it("eq passes when full body matches", () => {
    const r = runSingle(
      { type: "raw", operator: "eq", expression: "", expected: "hello" },
      { body: "hello" },
    );
    expect(r.passed).toBe(true);
  });

  it("eq fails when body differs", () => {
    const r = runSingle(
      { type: "raw", operator: "eq", expression: "", expected: "hello" },
      { body: "world" },
    );
    expect(r.passed).toBe(false);
  });

  it("nq passes when body differs", () => {
    const r = runSingle(
      { type: "raw", operator: "nq", expression: "", expected: "hello" },
      { body: "world" },
    );
    expect(r.passed).toBe(true);
  });

  it("stringifies object body", () => {
    const r = runSingle(
      { type: "raw", operator: "eq", expression: "", expected: '{"a":1}' },
      { body: { a: 1 } },
    );
    expect(r.passed).toBe(true);
  });
});

describe("runAssertions – string (includes semantics)", () => {
  it("eq = includes: passes when body contains expression", () => {
    const r = runSingle(
      { type: "string", operator: "eq", expression: "000000" },
      { body: "bizResCode=000000&msg=ok" },
    );
    expect(r.passed).toBe(true);
  });

  it("eq = includes: fails when body does not contain expression", () => {
    const r = runSingle(
      { type: "string", operator: "eq", expression: "999999" },
      { body: "bizResCode=000000" },
    );
    expect(r.passed).toBe(false);
  });

  it("nq = not includes: passes when body does not contain expression", () => {
    const r = runSingle(
      { type: "string", operator: "nq", expression: "error" },
      { body: "success" },
    );
    expect(r.passed).toBe(true);
  });

  it("nq = not includes: fails when body contains expression", () => {
    const r = runSingle(
      { type: "string", operator: "nq", expression: "error" },
      { body: "error occurred" },
    );
    expect(r.passed).toBe(false);
  });

  it("works with JSON-stringified object body", () => {
    const r = runSingle(
      { type: "string", operator: "eq", expression: "success" },
      { body: { status: "success", code: 200 } },
    );
    expect(r.passed).toBe(true);
  });
});

describe("runAssertions – re (regex)", () => {
  it("passes when regex matches (default operator)", () => {
    const r = runSingle(
      { type: "re", operator: "eq", expression: "\\d{6}" },
      { body: "code=000000" },
    );
    expect(r.passed).toBe(true);
  });

  it("fails when regex does not match", () => {
    const r = runSingle(
      { type: "re", operator: "eq", expression: "\\d{6}" },
      { body: "code=abc" },
    );
    expect(r.passed).toBe(false);
  });

  it("nq inverts: passes when regex does not match", () => {
    const r = runSingle(
      { type: "re", operator: "nq", expression: "error" },
      { body: "success" },
    );
    expect(r.passed).toBe(true);
  });

  it("handles invalid regex gracefully", () => {
    const r = runSingle(
      { type: "re", operator: "eq", expression: "[invalid" },
      { body: "test" },
    );
    expect(r.passed).toBe(false);
  });
});

describe("runAssertions – response_size", () => {
  it("eq passes when size matches", () => {
    const r = runSingle(
      {
        type: "response_size",
        operator: "eq",
        expression: "",
        expected: "100",
      },
      { bodySize: 100 },
    );
    expect(r.passed).toBe(true);
  });

  it("gt passes when actual > expected", () => {
    const r = runSingle(
      { type: "response_size", operator: "gt", expression: "", expected: "50" },
      { bodySize: 100 },
    );
    expect(r.passed).toBe(true);
  });

  it("lte passes when actual <= expected", () => {
    const r = runSingle(
      {
        type: "response_size",
        operator: "lte",
        expression: "",
        expected: "100",
      },
      { bodySize: 100 },
    );
    expect(r.passed).toBe(true);
  });

  it("lt fails when actual >= expected", () => {
    const r = runSingle(
      {
        type: "response_size",
        operator: "lt",
        expression: "",
        expected: "100",
      },
      { bodySize: 100 },
    );
    expect(r.passed).toBe(false);
  });
});

describe("runAssertions – default", () => {
  it("positive: passes when body contains success pattern", () => {
    const r = runSingle(
      { type: "default", operator: "eq", expression: "" },
      { body: "bizResCode=000000", polarity: "positive" },
    );
    expect(r.passed).toBe(true);
  });

  it("positive: passes with 'success' pattern", () => {
    const r = runSingle(
      { type: "default", operator: "eq", expression: "" },
      { body: '{"status":"success"}', polarity: "positive" },
    );
    expect(r.passed).toBe(true);
  });

  it("positive: fails when no success pattern found", () => {
    const r = runSingle(
      { type: "default", operator: "eq", expression: "" },
      { body: "error", polarity: "positive" },
    );
    expect(r.passed).toBe(false);
  });

  it("negative: always passes", () => {
    const r = runSingle(
      { type: "default", operator: "eq", expression: "" },
      { body: "whatever", polarity: "negative" },
    );
    expect(r.passed).toBe(true);
  });
});

describe("runAssertions – rsp_download", () => {
  it("passes when content-type is octet-stream and no expression", () => {
    const r = runSingle(
      { type: "rsp_download", operator: "eq", expression: "" },
      {
        headers: { "content-type": "application/octet-stream" },
        body: "binarydata",
      },
    );
    expect(r.passed).toBe(true);
  });

  it("passes when content-type has attachment", () => {
    const r = runSingle(
      { type: "rsp_download", operator: "eq", expression: "" },
      {
        headers: { "Content-Type": "attachment; filename=test.pdf" },
        body: "data",
      },
    );
    expect(r.passed).toBe(true);
  });

  it("fails when not a download content-type", () => {
    const r = runSingle(
      { type: "rsp_download", operator: "eq", expression: "" },
      { headers: { "content-type": "application/json" }, body: "data" },
    );
    expect(r.passed).toBe(false);
  });

  it("passes when download and body contains pattern", () => {
    const r = runSingle(
      { type: "rsp_download", operator: "eq", expression: "report" },
      {
        headers: { "content-type": "application/octet-stream" },
        body: "report_data",
      },
    );
    expect(r.passed).toBe(true);
  });

  it("fails when download but body does not contain pattern", () => {
    const r = runSingle(
      { type: "rsp_download", operator: "eq", expression: "report" },
      {
        headers: { "content-type": "application/octet-stream" },
        body: "other",
      },
    );
    expect(r.passed).toBe(false);
  });

  it("nq inverts result", () => {
    const r = runSingle(
      { type: "rsp_download", operator: "nq", expression: "" },
      { headers: { "content-type": "application/json" }, body: "data" },
    );
    expect(r.passed).toBe(true);
  });
});

describe("runAssertions – multiple assertions", () => {
  it("runs all assertions and returns results in order", () => {
    const results = runAssertions(
      makeInput(
        {
          assertions: [
            {
              type: "status_code",
              operator: "eq",
              expression: "",
              expected: "200",
            },
            { type: "string", operator: "eq", expression: "success" },
            { type: "string", operator: "eq", expression: "error" },
          ],
        },
        { statusCode: 200, body: "success" },
      ),
    );
    expect(results).toHaveLength(3);
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(true);
    expect(results[2].passed).toBe(false);
  });
});

describe("extractExportValue", () => {
  const requestSnapshot = {
    body: "<Transaction><Header><sysHeader><msgId>123456</msgId></sysHeader></Header></Transaction>",
    headers: { "X-Req": "req-1" },
  };
  const responseSnapshot = {
    status: 200,
    headers: { "x-token": "tok-1" },
    body: { code: "0000", data: { token: "tok-2" } },
  };

  it("source=request 从请求报文 XML 中提取字段", () => {
    const value = extractExportValue(
      { source: "request", expression: "/Transaction/Header/sysHeader/msgId" },
      requestSnapshot,
      responseSnapshot,
    );
    expect(value).toBe("123456");
  });

  it("source=request 支持 JSON 请求体 jsonpath", () => {
    const value = extractExportValue(
      { source: "request", expression: "$.msgId" },
      { body: JSON.stringify({ msgId: "777" }) },
      responseSnapshot,
    );
    expect(value).toBe("777");
  });

  it("source=body 仍从响应体提取", () => {
    const value = extractExportValue(
      { source: "body", expression: "data.token" },
      requestSnapshot,
      responseSnapshot,
    );
    expect(value).toBe("tok-2");
  });

  it("source=status 仍返回响应状态码", () => {
    const value = extractExportValue(
      { source: "status" },
      requestSnapshot,
      responseSnapshot,
    );
    expect(value).toBe(200);
  });

  it("source=request 且请求快照缺失时返回 undefined", () => {
    const value = extractExportValue(
      { source: "request", expression: "/Transaction/Header/sysHeader/msgId" },
      undefined,
      responseSnapshot,
    );
    expect(value).toBeUndefined();
  });
});
