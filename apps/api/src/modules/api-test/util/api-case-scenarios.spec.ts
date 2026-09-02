import {
  assertScenarioCoverage,
  buildScenarioPrompts,
  parseScenarioAiResult,
  validateScenarioAiResult,
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

  it("trims change paths before validation", () => {
    const result = parseScenarioAiResult(
      JSON.stringify({
        applicable: true,
        cases: [
          {
            title: "单页单条",
            polarity: "positive",
            changes: [{ path: " path/to/pageNum\n", value: "1" }],
          },
        ],
      }),
    );

    expect(result?.cases[0].changes[0].path).toBe("path/to/pageNum");
  });
});

describe("validateScenarioAiResult", () => {
  it("matches paths case-insensitively and restores the documented path", () => {
    const result = validateScenarioAiResult(
      {
        applicable: true,
        reason: "适用",
        cases: [
          {
            title: "起始位置",
            polarity: "positive",
            changes: [
              {
                path: "Transaction/Body/request/bizBody/start",
                value: "1",
              },
            ],
          },
        ],
      },
      [
        "请求报文",
        "----",
        "节点路径 | 节点代码 | 节点名称",
        "Transaction/Body/request/bizbody | start | 起始位置",
      ].join("\n"),
    );

    expect(result.cases[0].changes[0].path).toBe(
      "Transaction/Body/request/bizbody/start",
    );
  });
});

describe("assertScenarioCoverage", () => {
  const testCase = (polarity: "positive" | "negative") => ({
    title: polarity,
    polarity,
    changes: [{ path: "Transaction/Body/request/bizBody/value", value: "1" }],
  });

  it("requires at least two positive pagination effectiveness cases", () => {
    expect(() =>
      assertScenarioCoverage(
        "pagination",
        {
          applicable: true,
          reason: "分页字段存在",
          cases: [testCase("positive")],
        },
      ),
    ).toThrow("分页实效");
  });

  it("accepts pagination results with two positive cases", () => {
    expect(() =>
      assertScenarioCoverage(
        "pagination",
        {
          applicable: true,
          reason: "分页字段存在",
          cases: [
            { title: "首页查询", polarity: "positive", changes: [] },
            { title: "翻页生效", polarity: "positive", changes: [] },
            testCase("negative"),
          ],
        },
      ),
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

describe("buildScenarioPrompts", () => {
  it("recognizes nonstandard pagination field names", () => {
    const prompt = buildScenarioPrompts({
      scenarioKey: "pagination",
      scenarioName: "页码和页大小",
      structuredMarkdown: [
        "请求报文",
        "----",
        "节点路径 | 节点代码 | 节点名称 | 节点类型 | 数据类型 | 长度 | 是否必填 | 描述",
        "Transaction/Body/request/bizBody | size | 查询条数 | 单节点 | VARCHAR2 | 5 | N |",
        "Transaction/Body/request/bizBody | startSize | 查询开始条数 | 单节点 | VARCHAR2 | 5 | N |",
      ].join("\n"),
      transactionCode: "0101",
      serviceProperty: "query_non_accounting",
    })[0].prompt;

    expect(prompt).toContain("start/startSize/startIndex/beginRow/offset");
    expect(prompt).toContain("size+start、size+startSize");
    expect(prompt).toContain("示例 start=1 时正向首条使用 1");
    expect(prompt).toContain("分页实效");
    expect(prompt).toContain("翻页生效");
    expect(prompt).toContain("页码超末页");
  });
});
