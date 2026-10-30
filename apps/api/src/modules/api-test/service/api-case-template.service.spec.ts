import ExcelJS from "exceljs";
import { RequestContext } from "@common/audit/request-context";
import { ApiCaseTemplateService } from "./api-case-template.service";

describe("ApiCaseTemplateService export", () => {
  const rows = [
    {
      id: "case-1",
      caseNo: "TX-001-001",
      title: "正常查询",
      description: "",
      remark: "",
      applicationPath: "手机银行",
      polarity: "positive",
      priority: "P1",
      transactionId: "tx-1",
      endpoint: {
        apiDoc: {
          structuredMarkdown: "服务名称 | 余额查询",
        },
      },
      exportTransaction: {
        name: "余额查询",
        code: "TX-001",
      },
    },
    {
      id: "case-2",
      caseNo: "TX-002-001",
      title: "必填字段为空",
      description: "客户号为空",
      remark: "",
      applicationPath: "/核心系统/客户/",
      polarity: "negative",
      priority: "P2",
      transactionId: "tx-2",
      endpoint: {
        apiDoc: {
          structuredMarkdown: "服务名称 | 客户查询",
        },
      },
      exportTransaction: {
        name: "客户查询",
        code: "TX-002",
      },
    },
  ];

  function buildService(sourceRows: typeof rows) {
    const queryBuilder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoinAndMapOne: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(sourceRows),
    };
    const caseRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    return new ApiCaseTemplateService(
      caseRepo as never,
      { query: jest.fn() } as never,
    );
  }

  it("uses each case application and appends the fixed 接口案例 node", async () => {
    const service = buildService(rows);

    const result = await RequestContext.run("tester", () =>
      service.export({
        caseIds: rows.map((row) => row.id),
        designer: "张三",
      }),
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer as never);
    const sheet = workbook.getWorksheet("测试案例");
    expect(sheet?.getCell("C7").value).toBe("/手机银行/接口案例");
    expect(sheet?.getCell("C8").value).toBe("/核心系统/客户/接口案例");
  });

  it("rejects export when a selected case has no owning application", async () => {
    const service = buildService([
      {
        ...rows[0],
        applicationPath: "",
      },
    ]);

    await expect(
      RequestContext.run("tester", () =>
        service.export({ caseIds: ["case-1"], designer: "张三" }),
      ),
    ).rejects.toThrow("未维护归属应用");
  });
});
