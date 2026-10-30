import { ApiReportService } from "./api-report.service";

describe("ApiReportService requirement report", () => {
  const projectId = "project-1";
  const transactionId = "11111111-1111-4111-8111-111111111111";
  const runId = "22222222-2222-4222-8222-222222222222";
  const transaction = {
    id: transactionId,
    projectId,
    code: "TX-001",
    name: "查询交易",
    reqCode: "REQ-001",
  };
  const run = {
    id: runId,
    projectId,
    environmentId: "env-1",
    transactionId,
    versionCode: "20261026-120000",
    status: "completed",
    totalCount: 1,
    passedCount: 1,
    failedCount: 0,
    errorCount: 0,
    concurrency: 1,
    createdAt: new Date("2026-10-26T04:00:00.000Z"),
    finishedAt: new Date("2026-10-26T04:00:01.000Z"),
    items: [
      {
        id: "item-1",
        caseId: "case-1",
        caseTitle: "余额查询成功",
        status: "passed",
        durationMs: 12,
        requestSnapshot: {
          method: "POST",
          url: "https://example.test/query",
          body: '{"account":"123"}',
        },
        responseSnapshot: {
          status: 200,
          headers: {},
          body: '{"ok":true}',
        },
        assertions: [],
      },
    ],
  };

  function buildService() {
    const executionService = {
      getRunDetail: jest.fn().mockResolvedValue(run),
    };
    const caseRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: "case-1",
          caseNo: "TX-001-001",
          transactionCode: "TX-001",
          description: "正常查询",
          expected: { assertions: [] },
        },
      ]),
    };
    const endpointRepo = { find: jest.fn().mockResolvedValue([]) };
    const envRepo = {
      findOne: jest.fn().mockResolvedValue({ id: "env-1", name: "测试环境" }),
    };
    const projectRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: projectId,
        title: "需求项目",
        requirementNo: "REQ-001",
      }),
    };
    const transactionRepo = {
      findOne: jest.fn().mockResolvedValue(transaction),
    };
    const exportRepo = {
      save: jest.fn(),
      create: jest.fn(),
      find: jest.fn(),
      softDelete: jest.fn(),
    };
    return new ApiReportService(
      executionService as never,
      caseRepo as never,
      endpointRepo as never,
      envRepo as never,
      projectRepo as never,
      transactionRepo as never,
      exportRepo as never,
    );
  }

  it("renders each selected execution with its transaction code and history id", async () => {
    const service = buildService();

    const result = await service.exportRequirementReport(projectId, "html", [
      { transactionId, runId },
    ]);

    const html = result.buffer.toString("utf-8");
    expect(html).toContain("TX-001 · 查询交易");
    expect(html).toContain(`执行历史 ID：<span class="mono">${runId}</span>`);
    expect(html).toContain("余额查询成功");
    expect(result.fileName).toBe(`REQ-001_TX-001_${runId}.html`);
    expect(result.selections).toEqual([{ transactionId, runId }]);
  });

  it("rejects an execution history that belongs to another transaction", async () => {
    const service = buildService();
    const executionService = (service as any).executionService;
    executionService.getRunDetail.mockResolvedValue({
      ...run,
      transactionId: "33333333-3333-4333-8333-333333333333",
    });

    await expect(
      service.exportRequirementReport(projectId, "html", [
        { transactionId, runId },
      ]),
    ).rejects.toThrow(`执行历史 ${runId} 不属于交易码 TX-001`);
  });

  it("builds an Excel workbook with transaction and history columns", async () => {
    const service = buildService();

    const result = await service.exportRequirementReport(projectId, "xlsx", [
      { transactionId, runId },
    ]);

    expect(result.fileName).toBe(`REQ-001_TX-001_${runId}.xlsx`);
    expect(result.buffer.subarray(0, 2).toString()).toBe("PK");
  });

  it("builds a PDF with a summary page and per-history case sections", async () => {
    const service = buildService();

    const result = await service.exportRequirementReport(projectId, "pdf", [
      { transactionId, runId },
    ]);

    expect(result.fileName).toBe(`REQ-001_TX-001_${runId}.pdf`);
    expect(result.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(result.buffer.length).toBeGreaterThan(1000);
  });
});
