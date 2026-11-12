import { collectExpectedSource } from "@api-test/util/assertion-source.util";

describe("collectExpectedSource", () => {
  it("识别 SQL 数据函数并带上函数介绍", () => {
    const source = collectExpectedSource({
      template: "${GET_CUST_NO($.custNo)}",
      functions: new Map([
        [
          "GET_CUST_NO",
          { type: "sql", description: "按客户号查询客户编号" },
        ],
      ]),
    });

    expect(source).toEqual({
      kind: "data_function",
      label: "SQL 查询函数 GET_CUST_NO（按客户号查询客户编号）",
      expression: "${GET_CUST_NO($.custNo)}",
    });
  });

  it("识别来自 SQL 步骤的共享变量", () => {
    const source = collectExpectedSource({
      template: "${orderNo}",
      variableSources: { orderNo: "SQL 步骤「查询订单」" },
    });

    expect(source).toEqual({
      kind: "variable",
      label: "orderNo（SQL 步骤「查询订单」）",
      expression: "${orderNo}",
    });
  });

  it("变量和函数混用时标记为 mixed", () => {
    const source = collectExpectedSource({
      template: "${prefix}-${GET_CUST_NO()}",
      variableSources: { prefix: "步骤「准备报文」" },
      functions: new Map([["GET_CUST_NO", { type: "sql" }]]),
    });

    expect(source?.kind).toBe("mixed");
    expect(source?.label).toContain("prefix（步骤「准备报文」）");
    expect(source?.label).toContain("SQL 查询函数 GET_CUST_NO");
  });

  it("纯字面量不产生来源", () => {
    expect(collectExpectedSource({ template: "200" })).toBeUndefined();
    expect(collectExpectedSource({ template: undefined })).toBeUndefined();
  });
});
