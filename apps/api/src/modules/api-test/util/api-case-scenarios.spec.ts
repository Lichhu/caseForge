import {
  assertScenarioCoverage,
  parseScenarioAiResult,
} from "./api-case-scenarios.util";

describe("parseScenarioAiResult", () => {
  it("coerces numeric change values to strings", () => {
    const result = parseScenarioAiResult(
      JSON.stringify({
        applicable: true,
        reason: "适用",
        cases: [
          {
            title: "单页单条",
            polarity: "positive",
            changes: [
              { path: "Transaction/Body/request/bizBody/pageNum", value: 1 },
            ],
          },
        ],
      }),
    );
    expect(result?.cases[0].changes[0].value).toBe("1");
  });
});

describe("assertScenarioCoverage", () => {
  const testCase = (polarity: "positive" | "negative") => ({
    title: polarity,
    polarity,
    changes: [{ path: "Transaction/Body/request/bizBody/value", value: "1" }],
  });

  it("does not restrict pagination case count", () => {
    expect(() =>
      assertScenarioCoverage("pagination", {
        applicable: true,
        reason: "分页字段存在",
        cases: [testCase("positive")],
      }),
    ).not.toThrow();
  });

  it("requires positive and negative precision cases", () => {
    expect(() =>
      assertScenarioCoverage("precision", {
        applicable: true,
        reason: "精度字段存在",
        cases: [testCase("positive")],
      }),
    ).toThrow("必须同时包含正向和反向案例");
  });

  it("allows not applicable scenarios without cases", () => {
    expect(() =>
      assertScenarioCoverage("precision", {
        applicable: false,
        reason: "无精度字段",
        cases: [],
      }),
    ).not.toThrow();
  });

  it("requires both polarities for every precision field", () => {
    const doc = [
      "请求报文",
      "----",
      "节点路径 | 节点代码 | 节点名称 | 节点类型 | 数据类型 | 长度 | 是否必填 | 描述",
      "Transaction/Body/request/bizBody | amount | 金额 | 单节点 | NUMBER | 10 | Y | 两位小数",
    ].join("\n");
    expect(() =>
      assertScenarioCoverage(
        "precision",
        {
          applicable: true,
          reason: "存在金额字段",
          cases: [testCase("positive"), testCase("negative")],
        },
        doc,
      ),
    ).toThrow("精度字段");
  });
});
