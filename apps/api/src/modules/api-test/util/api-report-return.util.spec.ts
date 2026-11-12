import { buildApiReportHtml } from "./api-report-html.util";
import { resolveReportReturnInfo } from "./api-report-return.util";

const SOCKET_BODY = `<?xml version="1.0"?>
<Transaction>
  <Header>
    <sysHeader>
      <bizResCode>CIC024</bizResCode>
      <bizResText>上送参数不能为空</bizResText>
      <resCode>000000</resCode>
      <resText>交易成功</resText>
    </sysHeader>
  </Header>
</Transaction>`;

describe("resolveReportReturnInfo", () => {
  it("uses resCode/resText before business return fields for Socket reports", () => {
    expect(
      resolveReportReturnInfo({
        requestSnapshot: { transport: "tcp" },
        responseSnapshot: { status: -1, body: SOCKET_BODY },
      }),
    ).toEqual({ code: "000000", message: "交易成功" });
  });

  it("uses the last Socket step for a multi-step report", () => {
    expect(
      resolveReportReturnInfo({
        requestSnapshot: {
          steps: [
            {
              request: { transport: "http" },
              response: { status: 200, body: '{"ok":true}' },
            },
            {
              request: { transport: "tcp" },
              response: { status: -1, body: SOCKET_BODY },
            },
          ],
        },
        responseSnapshot: {
          status: -1,
          body: { steps: [] },
        },
      }),
    ).toEqual({ code: "000000", message: "交易成功" });
  });

  it("keeps the HTTP status for non-Socket reports", () => {
    expect(
      resolveReportReturnInfo({
        requestSnapshot: { transport: "http" },
        responseSnapshot: {
          status: 200,
          body: SOCKET_BODY,
          error: "",
        },
      }),
    ).toEqual({ code: "200", message: "" });
  });
});

describe("Socket return info in HTML reports", () => {
  it("renders resCode/resText in the return code and return message columns", () => {
    const html = buildApiReportHtml({
      id: "run-1",
      totalCount: 1,
      passedCount: 1,
      failedCount: 0,
      errorCount: 0,
      concurrency: 1,
      items: [
        {
          caseId: "case-1",
          caseTitle: "Socket 交易成功",
          status: "passed",
          durationMs: 20,
          requestSnapshot: {
            transport: "tcp",
            target: "127.0.0.1:60030",
            body: "<Transaction />",
          },
          responseSnapshot: { status: -1, body: SOCKET_BODY },
          assertions: [],
        },
      ],
    });

    expect(html).toMatch(
      /<div style="width:10%;">000000<\/div>\s*<div style="width:10%;">交易成功<\/div>/,
    );
    expect(html).not.toMatch(
      /<div style="width:10%;">-1<\/div>\s*<div style="width:10%;"><\/div>/,
    );
  });
});

describe("期望值来源 in HTML reports", () => {
  type ReportAssertion = {
    name: string;
    passed: boolean;
    expected?: unknown;
    actual?: unknown;
    message?: string;
    expectedSource?: {
      kind: "data_function" | "variable" | "mixed";
      label: string;
      expression?: string;
    };
  };

  function buildHtml(assertions: ReportAssertion[]) {
    return buildApiReportHtml(
      {
        id: "run-1",
        totalCount: 1,
        passedCount: 1,
        failedCount: 0,
        errorCount: 0,
        concurrency: 1,
        items: [
          {
            caseId: "case-1",
            caseTitle: "客户编号查询",
            status: "passed",
            durationMs: 20,
            requestSnapshot: {
              method: "POST",
              url: "https://example.test/query",
              body: '{"custNo":"C001"}',
            },
            responseSnapshot: { status: 200, body: '{"custNo":"XQ2025-5190-01"}' },
            assertions,
          },
        ],
      },
      {
        caseMeta: {
          "case-1": {
            assertionMeta: {
              客户编号正确: {
                type: "body",
                operator: "eq",
                expression: "$.custNo",
              },
            },
          },
        },
      },
    );
  }

  it("renders the data source label and original expression", () => {
    const html = buildHtml([
      {
        name: "客户编号正确",
        passed: true,
        expected: "XQ2025-5190-01",
        actual: "XQ2025-5190-01",
        expectedSource: {
          kind: "data_function",
          label: "SQL 查询函数 GET_CUST_NO（按客户号查询客户编号）",
          expression: "${GET_CUST_NO($.custNo)}",
        },
      },
    ]);

    expect(html).toContain("数据来源");
    expect(html).toContain("SQL 查询函数 GET_CUST_NO（按客户号查询客户编号）");
    expect(html).toContain("${GET_CUST_NO($.custNo)}");
  });

  it("renders — for literal assertions without a source", () => {
    const html = buildHtml([
      {
        name: "客户编号正确",
        passed: true,
        expected: "200",
        actual: "200",
      },
    ]);

    expect(html).not.toContain("SQL 查询函数");
    expect(html).toContain("<div>—</div>");
  });
});
