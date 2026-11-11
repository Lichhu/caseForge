import ExcelJS from "exceljs";
import JSZip from "jszip";
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

  function buildService(
    options: {
      runOverride?: typeof run;
      casesOverride?: unknown[];
    } = {},
  ) {
    const executionService = {
      getRunDetail: jest.fn().mockResolvedValue(options.runOverride ?? run),
    };
    const caseRepo = {
      find: jest.fn().mockResolvedValue(
        options.casesOverride ?? [
          {
            id: "case-1",
            caseNo: "TX-001-001",
            title: "余额查询成功",
            transactionCode: "TX-001",
            description: "正常查询",
            expected: { assertions: [] },
            metadata: {
              scenarioKey: "positive_flow",
              scenarioName: "正向流程",
            },
            polarity: "positive",
          },
        ],
      ),
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
    const requirementRepo = {
      findOne: jest.fn().mockResolvedValue({
        projectCode: "REQ-001",
        projectName: "需求项目",
        versionName: "V1.0",
        claimedByName: "测试人员",
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
    const reportConfigRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    const aiWorkflow = {
      canUseAiChat: jest.fn().mockReturnValue(true),
      runWithAiChatJsonArray: jest.fn().mockResolvedValue([]),
    };
    return new ApiReportService(
      executionService as never,
      caseRepo as never,
      endpointRepo as never,
      envRepo as never,
      projectRepo as never,
      transactionRepo as never,
      exportRepo as never,
      requirementRepo as never,
      reportConfigRepo as never,
      aiWorkflow as never,
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

  it("恢复旧执行记录中被误存为步骤 ID 的测试环境", async () => {
    const service = buildService({
      runOverride: {
        ...run,
        environmentId: "step-1",
      },
      casesOverride: [
        {
          id: "case-1",
          caseNo: "TX-001-001",
          title: "余额查询成功",
          transactionCode: "TX-001",
          description: "正常查询",
          expected: { assertions: [] },
          steps: [
            {
              id: "step-1",
              name: "正向流程",
              target: {
                name: "测试环境",
                address: "https://example.test",
                environmentId: "env-1",
              },
              request: { method: "POST", path: "/query" },
              expected: {},
              exports: [],
            },
          ],
        },
      ],
    });

    const result = await service.exportRequirementReport(projectId, "html", [
      { transactionId, runId },
    ]);
    const html = result.buffer.toString("utf-8");

    expect(html).toMatch(
      new RegExp(`<td class="mono">${runId}</td>\\s*<td>测试环境</td>`),
    );
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

  it("writes Socket resCode/resText to the Excel return columns", async () => {
    const socketRun = {
      ...run,
      items: [
        {
          ...run.items[0],
          requestSnapshot: {
            transport: "tcp",
            target: "127.0.0.1:60030",
            body: "<Transaction />",
          },
          responseSnapshot: {
            status: -1,
            headers: {},
            body: `<Transaction><Header><sysHeader><bizResCode>CIC024</bizResCode><bizResText>上送参数不能为空</bizResText><resCode>000000</resCode><resText>交易成功</resText></sysHeader></Header></Transaction>`,
          },
        },
      ],
    } as unknown as typeof run;
    const service = buildService({ runOverride: socketRun });

    const result = await service.exportRequirementReport(projectId, "xlsx", [
      { transactionId, runId },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      result.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const sheet = workbook.getWorksheet("执行案例")!;

    expect(sheet.getRow(1).getCell(8).value).toBe("返回码");
    expect(sheet.getRow(1).getCell(9).value).toBe("返回信息");
    expect(sheet.getRow(2).getCell(8).value).toBe("000000");
    expect(sheet.getRow(2).getCell(9).value).toBe("交易成功");
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

  it("builds a project-type DOCX with the execution ZIP embedded", async () => {
    const service = buildService();
    (service as any).requirementRepo.findOne.mockResolvedValue({
      id: "requirement-1",
      projectCode: "REQ-001",
      projectName: "需求项目",
      versionName: "项目类版本",
      claimedByName: "项目测试人员",
    });
    (service as any).reportConfigRepo.find.mockResolvedValue([
      { configKey: "reviewer_name", configValue: "常万恒" },
      { configKey: "approver_name", configValue: "陈志斌" },
    ]);
    (service as any).aiWorkflow.runWithAiChatJsonArray.mockResolvedValue([
      { caseId: "case-1", riskPoints: ["字段值校验"] },
    ]);

    const result = await service.exportRequirementReport(projectId, "html", [
      { transactionId, runId },
    ]);

    expect(result.format).toBe("docx");
    expect(result.fileName).toBe("REQ-001接口测试报告.docx");
    expect(result.contentType).toContain("wordprocessingml");
    const archive = await JSZip.loadAsync(result.buffer);
    const documentXml = await archive
      .file("word/document.xml")!
      .async("string");
    expect(documentXml).toContain("需求点编号：REQ-001");
    expect(documentXml).toContain("起草人：项目测试人员");
    expect(documentXml).toContain("审核人：常万恒");
    expect(documentXml).toContain("批准人：陈志斌");
    expect(documentXml).toContain("REQ-001接口测试报告.zip");
  });

  it("blocks a project-type report when reviewer or approver config is missing", async () => {
    const service = buildService();
    (service as any).requirementRepo.findOne.mockResolvedValue({
      id: "requirement-1",
      projectCode: "REQ-001",
      projectName: "需求项目",
      versionName: "项目类版本",
      claimedByName: "项目测试人员",
    });
    (service as any).reportConfigRepo.find.mockResolvedValue([
      { configKey: "reviewer_name", configValue: "常万恒" },
    ]);

    await expect(
      service.exportRequirementReport(projectId, "html", [
        { transactionId, runId },
      ]),
    ).rejects.toThrow("未配置报告审核人或批准人");
  });

  it("combines multiple selected histories for one transaction into one HTML", async () => {
    const service = buildService();
    const secondRunId = "44444444-4444-4444-8444-444444444444";
    const zipBuffer = await (service as any).buildProjectReportHtmlZip(
      "REQ-001",
      [
        { transaction, run, context: {} },
        {
          transaction,
          run: {
            ...run,
            id: secondRunId,
            versionCode: "20261026-130000",
          },
          context: {},
        },
      ],
    );
    const archive = await JSZip.loadAsync(zipBuffer);
    const files = Object.keys(archive.files).filter(
      (name) => !archive.files[name].dir,
    );

    expect(files).toEqual(["接口质量测试报告-TX-001-查询交易.html"]);
    const html = await archive.file(files[0])!.async("string");
    expect(html).toContain(runId);
    expect(html).toContain(secondRunId);
  });
});
