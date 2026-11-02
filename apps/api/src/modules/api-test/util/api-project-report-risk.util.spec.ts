import {
  buildRiskAnalysisRows,
  buildRiskClassificationPrompt,
  isProjectTypeVersion,
  PROJECT_REPORT_RISK_POINTS,
  shortenRequirementNo,
  validateRiskClassifications,
} from "./api-project-report-risk.util";

describe("project report risk analysis", () => {
  it("matches and shortens the project requirement identity", () => {
    expect(isProjectTypeVersion(" 项目类版本 ")).toBe(true);
    expect(isProjectTypeVersion("V1.0")).toBe(false);
    expect(shortenRequirementNo("XQ2026-1031-02")).toBe("XQ2026-1031");
  });

  it("prompts AI with the fixed categories and no request payload", () => {
    const prompt = buildRiskClassificationPrompt([
      {
        caseId: "case-1",
        caseNo: "TX-001-001",
        title: "金额精度非法",
        description: "验证金额精度",
        scenarioKey: "precision",
        polarity: "negative",
      },
    ]);

    for (const point of PROJECT_REPORT_RISK_POINTS) {
      expect(prompt).toContain(point);
    }
    expect(prompt).toContain('"caseNo":"TX-001-001"');
    expect(prompt).not.toContain("requestSnapshot");
    expect(prompt).not.toContain("responseSnapshot");
  });

  it("validates every case and rejects unknown categories", () => {
    const cases = [{ caseId: "case-1", title: "分页查询" }];
    expect(
      validateRiskClassifications(cases, [
        { caseId: "case-1", riskPoints: ["页码、单页数量测试"] },
      ]),
    ).toEqual([{ caseId: "case-1", riskPoints: ["页码、单页数量测试"] }]);

    expect(() => validateRiskClassifications(cases, [])).toThrow(
      "未覆盖全部执行案例",
    );
    expect(() =>
      validateRiskClassifications(cases, [
        { caseId: "case-1", riskPoints: ["未知分类"] },
      ]),
    ).toThrow("未知风险分类");
  });

  it("supports multiple categories and summarizes actual execution results", () => {
    const rows = buildRiskAnalysisRows(
      [
        {
          caseId: "case-pass",
          caseNo: "TX-001-001",
          title: "分页通过",
          transactionCode: "TX-001",
          status: "passed",
        },
        {
          caseId: "case-fail",
          caseNo: "TX-002-003",
          title: "重复提交",
          transactionCode: "TX-002",
          status: "failed",
        },
      ],
      [
        {
          caseId: "case-pass",
          riskPoints: ["页码、单页数量测试", "异常场景测试"],
        },
        {
          caseId: "case-fail",
          riskPoints: ["幂等性测试", "异常场景测试"],
        },
      ],
    );

    expect(rows.find((row) => row.point === "页码、单页数量测试")).toEqual({
      point: "页码、单页数量测试",
      actual: "都通过了",
      conclusion: "通过",
    });
    expect(rows.find((row) => row.point === "异常场景测试")).toEqual({
      point: "异常场景测试",
      actual: "TX-002/TX-002-003",
      conclusion: "不通过",
    });
    expect(rows.find((row) => row.point === "超时场景")).toEqual({
      point: "超时场景",
      actual: "未覆盖",
      conclusion: "不适用",
    });
  });
});
