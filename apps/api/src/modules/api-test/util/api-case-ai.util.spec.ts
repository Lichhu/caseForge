import {
  AT_CASE_SCENARIO_MAX_CHARS,
  prepareScenarioBlock,
  truncateScenarioPromptText,
} from "./api-case-ai.util";
import {
  buildResponseAssertionSummary,
  compressApiStructuredDoc,
} from "./api-doc.parser";

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
    expect(prepareScenarioBlock("", { transport: "http", messageFormat: "json" }))
      .toMatchObject({
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
