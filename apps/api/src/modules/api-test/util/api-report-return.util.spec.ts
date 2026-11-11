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
