export const PROJECT_REQUEST_VERSION_NAME = "项目类版本";

export const PROJECT_REPORT_RISK_POINTS = [
  "超时场景",
  "页码、单页数量测试",
  "幂等性测试",
  "金额边界值测试",
  "必输字段校验",
  "字段值校验",
  "字段可选值范围校验",
  "异常场景测试",
] as const;

export type ProjectReportRiskPoint =
  (typeof PROJECT_REPORT_RISK_POINTS)[number];

export interface ProjectRiskSourceCase {
  caseId: string;
  caseNo?: string | null;
  title: string;
  description?: string | null;
  scenarioName?: string | null;
  scenarioKey?: string | null;
  polarity?: string | null;
}

export interface ProjectRiskExecutionCase {
  caseId: string;
  caseNo?: string | null;
  title: string;
  transactionCode: string;
  status: string;
}

export interface ProjectRiskClassification {
  caseId: string;
  riskPoints: ProjectReportRiskPoint[];
}

export interface ProjectRiskAnalysisRow {
  point: ProjectReportRiskPoint;
  actual: string;
  conclusion: "通过" | "不通过" | "不适用";
}

export function isProjectTypeVersion(versionName?: string | null) {
  return versionName?.trim() === PROJECT_REQUEST_VERSION_NAME;
}

export function shortenRequirementNo(requirementNo: string) {
  const normalized = requirementNo.trim();
  return normalized.replace(/-[^-]+$/, "");
}

export function buildRiskClassificationPrompt(cases: ProjectRiskSourceCase[]) {
  const categories = PROJECT_REPORT_RISK_POINTS.map(
    (point, index) => `${index + 1}. ${point}`,
  ).join("\n");
  const caseLines = cases
    .map((item) =>
      JSON.stringify({
        caseId: item.caseId,
        caseNo: item.caseNo?.trim() || "",
        title: item.title.trim(),
        description: item.description?.trim() || "",
        scenarioName: item.scenarioName?.trim() || "",
        scenarioKey: item.scenarioKey?.trim() || "",
        polarity: item.polarity?.trim() || "",
      }),
    )
    .join("\n");

  return [
    "你是银行接口测试报告的风险分类助手。",
    "请把每个案例归入最符合的测试需求点，一个案例可以同时归入多个测试需求点。",
    "只能使用下面 8 个固定分类，分类名称必须逐字一致：",
    categories,
    "",
    "分类判断重点：",
    "- 超时场景：案例标题或描述明确涉及超时、响应时限、请求挂起或等待过久。",
    "- 页码、单页数量测试：涉及页码、每页数量、单页或多页数据量。",
    "- 幂等性测试：涉及重复提交、重复请求或幂等键。",
    "- 金额边界值测试：涉及金额、余额、限额、精度或金额边界。",
    "- 必输字段校验：涉及必填、必输、空值或缺失字段。",
    "- 字段值校验：涉及字段内容、格式、关联字段组合或取值正确性。",
    "- 字段可选值范围校验：涉及枚举、码值、可选值范围或非法枚举值。",
    "- 异常场景测试：反向案例，以及超时、失败、拒绝、异常响应等异常路径。",
    "",
    "输出要求：",
    "1. 只能输出 JSON 数组，不要输出 Markdown 或解释。",
    '2. 每个输入案例必须且只能返回一项，格式为 {"caseId":"输入 caseId","riskPoints":["分类名称"]}。',
    "3. 无法归入任何分类时 riskPoints 返回空数组。",
    "4. 不得修改 caseId，不得新增输入中不存在的案例。",
    "",
    "待分类案例：",
    caseLines,
  ].join("\n");
}

export function validateRiskClassifications(
  cases: ProjectRiskSourceCase[],
  rows: unknown[],
): ProjectRiskClassification[] {
  const expectedIds = new Set(cases.map((item) => item.caseId));
  const allowedPoints = new Set<string>(PROJECT_REPORT_RISK_POINTS);
  const seenIds = new Set<string>();
  const normalized: ProjectRiskClassification[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      throw new Error("AI 分类结果格式无效");
    }
    const record = row as Record<string, unknown>;
    const caseId =
      typeof record.caseId === "string" ? record.caseId.trim() : "";
    if (!caseId || !expectedIds.has(caseId) || seenIds.has(caseId)) {
      throw new Error("AI 分类结果包含无效或重复的案例编号");
    }
    if (!Array.isArray(record.riskPoints)) {
      throw new Error("AI 分类结果缺少 riskPoints");
    }
    const riskPoints: ProjectReportRiskPoint[] = [];
    for (const value of record.riskPoints) {
      const point = typeof value === "string" ? value.trim() : "";
      if (!allowedPoints.has(point)) {
        throw new Error(`AI 返回了未知风险分类：${point || "(空)"}`);
      }
      if (!riskPoints.includes(point as ProjectReportRiskPoint)) {
        riskPoints.push(point as ProjectReportRiskPoint);
      }
    }
    seenIds.add(caseId);
    normalized.push({ caseId, riskPoints });
  }

  if (seenIds.size !== expectedIds.size) {
    throw new Error("AI 分类结果未覆盖全部执行案例");
  }
  return normalized;
}

export function buildRiskAnalysisRows(
  executionCases: ProjectRiskExecutionCase[],
  classifications: ProjectRiskClassification[],
): ProjectRiskAnalysisRow[] {
  const pointsByCase = new Map(
    classifications.map((item) => [item.caseId, item.riskPoints]),
  );

  return PROJECT_REPORT_RISK_POINTS.map((point) => {
    const matched = executionCases.filter((item) =>
      pointsByCase.get(item.caseId)?.includes(point),
    );
    if (!matched.length) {
      return { point, actual: "未覆盖", conclusion: "不适用" };
    }

    const failedCases = [
      ...new Set(
        matched
          .filter((item) => item.status !== "passed")
          .map(
            (item) =>
              `${item.transactionCode}/${item.caseNo?.trim() || item.title}`,
          ),
      ),
    ];
    if (failedCases.length) {
      return {
        point,
        actual: failedCases.join("、"),
        conclusion: "不通过",
      };
    }
    return { point, actual: "都通过了", conclusion: "通过" };
  });
}
