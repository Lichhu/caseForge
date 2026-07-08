import {
  AT_CASE_SCENARIO_MAX_CHARS,
  buildExampleMessagePromptBlock,
  formatCaseNo,
  generateAssertionsFromResponse,
  maxCaseNoSuffixFromRows,
  PLAN_MODE_SKILL_WITH_EXAMPLE,
  prepareScenarioBlock,
  resolvePlanModeSkillBody,
  truncateScenarioPromptText,
} from "./api-case-ai.util";
import {
  buildResponseAssertionSummary,
  compressApiStructuredDoc,
} from "./api-doc.parser";

describe("resolvePlanModeSkillBody", () => {
  it("uses requestBody skill when example message exists", () => {
    const skill = resolvePlanModeSkillBody("remote skill body", true);
    expect(skill).toBe(PLAN_MODE_SKILL_WITH_EXAMPLE);
    expect(skill).toContain("requestBody");
    expect(skill).toContain("不要**输出 bodyOverrides");
  });

  it("uses remote skill when no example message", () => {
    expect(resolvePlanModeSkillBody("remote skill body", false)).toBe(
      "remote skill body",
    );
  });

  it("falls back to field-catalog skill when remote skill empty", () => {
    const skill = resolvePlanModeSkillBody("", false);
    expect(skill).toContain("bodyOverrides");
    expect(skill).not.toContain("{{#HAS_EXAMPLE_MESSAGE}}");
  });
});

describe("buildExampleMessagePromptBlock", () => {
  it("wraps example XML in fenced block", () => {
    const block = buildExampleMessagePromptBlock("<Transaction/>");
    expect(block).toContain("示例报文");
    expect(block).toContain("```");
    expect(block).toContain("<Transaction/>");
  });

  it("returns empty string for blank example", () => {
    expect(buildExampleMessagePromptBlock("  ")).toBe("");
  });
});

describe("maxCaseNoSuffixFromRows", () => {
  it("returns max numeric suffix for transaction code prefix", () => {
    expect(
      maxCaseNoSuffixFromRows(
        [
          { caseNo: "addCtmSealInfo-001" },
          { caseNo: "addCtmSealInfo-006" },
          { caseNo: "OTHER-099" },
        ],
        "addCtmSealInfo",
      ),
    ).toBe(6);
  });

  it("returns 0 when no matching cases", () => {
    expect(maxCaseNoSuffixFromRows([], "addCtmSealInfo")).toBe(0);
  });
});

describe("formatCaseNo", () => {
  it("pads sequence to three digits", () => {
    expect(formatCaseNo("addCtmSealInfo", 7)).toBe("addCtmSealInfo-007");
  });
});

describe("truncateScenarioPromptText", () => {
  it("returns empty for blank input", () => {
    expect(truncateScenarioPromptText("  ")).toEqual({
      text: "",
      truncated: false,
      originalLength: 0,
    });
  });

  it("truncates long scenario text", () => {
    const long = "x".repeat(AT_CASE_SCENARIO_MAX_CHARS + 100);
    const result = truncateScenarioPromptText(long);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(
      AT_CASE_SCENARIO_MAX_CHARS + 10,
    );
    expect(result.text).toContain("场景约束已截断");
  });
});

describe("prepareScenarioBlock", () => {
  it("returns zero block when scenario is empty", () => {
    expect(
      prepareScenarioBlock("", { transport: "http", messageFormat: "json" }),
    ).toMatchObject({
      block: "",
      blockChars: 0,
    });
  });

  it("includes section prefix in blockChars", () => {
    const result = prepareScenarioBlock("分页反向案例", {
      transport: "http",
      messageFormat: "json",
    });
    expect(result.block).toContain("## 场景约束");
    expect(result.blockChars).toBe(result.block.length);
  });
});

describe("compressApiStructuredDoc requestOnly", () => {
  const sampleDoc = [
    "基础信息",
    "----",
    "| 字段 | 值 |",
    "| 原服务交易码 | TEST001 |",
    "",
    "请求报文",
    "----",
    "| 节点代码 | 是否必填 |",
    "| --- | --- |",
    "| custNo | Y |",
    "| pageNum | N |",
    "",
    "响应报文",
    "----",
    "| 节点代码 | 是否必填 |",
    "| --- | --- |",
    "| bizResCode | Y |",
    "| bizResText | N |",
  ].join("\n");

  it("omits full response table and adds assertion summary", () => {
    const full = compressApiStructuredDoc(sampleDoc, 60, 5000);
    const requestOnly = compressApiStructuredDoc(sampleDoc, 60, 5000, {
      requestOnly: true,
    });

    expect(full).toContain("响应报文");
    expect(full).toContain("| bizResCode |");
    expect(requestOnly).not.toMatch(/响应报文\n----\n\| 节点代码/);
    expect(requestOnly).toContain("响应断言参考");
    expect(requestOnly).toContain("请求报文");
  });

  it("buildResponseAssertionSummary picks known code fields", () => {
    const summary = buildResponseAssertionSummary(sampleDoc);
    expect(summary).toContain("bizResCode");
    expect(summary).toContain("bizResText");
  });
});

function createMockAiWorkflow(
  capturedPrompt: { value: string },
  responseText: string,
) {
  return {
    runWithAiChat: jest.fn(async (prompt: string) => {
      capturedPrompt.value = prompt;
      return { text: responseText };
    }),
    parseJsonArray: jest.fn(<T>(text: string): T[] | null => {
      try {
        return JSON.parse(text) as T[];
      } catch {
        return null;
      }
    }),
  } as any;
}

describe("generateAssertionsFromResponse", () => {
  it("HTTP prompt contains status_code rule and passes statusCode", async () => {
    const captured = { value: "" };
    const mockResponse = JSON.stringify([
      {
        type: "status_code",
        operator: "eq",
        expression: "",
        expected: "200",
        description: "HTTP 状态码",
      },
      {
        type: "string",
        operator: "eq",
        expression: "success",
        description: "响应包含成功",
      },
    ]);
    const ai = createMockAiWorkflow(captured, mockResponse);

    const assertions = await generateAssertionsFromResponse(ai, {
      transport: "http",
      messageFormat: "json",
      polarity: "positive",
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: { code: "000000" },
    });

    expect(captured.value).toContain("HTTP");
    expect(captured.value).toContain("状态码: 200");
    expect(captured.value).toContain("status_code");
    expect(assertions).toHaveLength(2);
    expect(assertions[0].type).toBe("status_code");
  });

  it("TCP prompt omits status_code rule and does not include statusCode", async () => {
    const captured = { value: "" };
    const mockResponse = JSON.stringify([
      {
        type: "string",
        operator: "eq",
        expression: "000000",
        description: "业务返回码",
      },
    ]);
    const ai = createMockAiWorkflow(captured, mockResponse);

    const assertions = await generateAssertionsFromResponse(ai, {
      transport: "tcp",
      messageFormat: "xml",
      polarity: "positive",
      statusCode: -1,
      headers: {},
      body: "<root><code>000000</code></root>",
    });

    expect(captured.value).toContain("TCP/Socket");
    expect(captured.value).toContain("不要生成 status_code");
    expect(captured.value).not.toMatch(/状态码: \d/);
    expect(assertions).toHaveLength(1);
    expect(assertions[0].type).toBe("string");
  });

  it("filters out assertions missing type or operator", async () => {
    const captured = { value: "" };
    const mockResponse = JSON.stringify([
      { type: "status_code", operator: "eq", expected: "200" },
      { type: "string", operator: "", expression: "ok" },
      { type: "", operator: "eq", expression: "bad" },
      { type: "raw", operator: "eq", expression: "ok" },
    ]);
    const ai = createMockAiWorkflow(captured, mockResponse);

    const assertions = await generateAssertionsFromResponse(ai, {
      transport: "http",
      messageFormat: "json",
      polarity: "positive",
      statusCode: 200,
      headers: {},
      body: "ok",
    });

    expect(assertions).toHaveLength(2);
    expect(assertions.every((a) => a.type && a.operator)).toBe(true);
  });
});
