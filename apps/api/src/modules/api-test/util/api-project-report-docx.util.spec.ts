import * as CFB from "cfb";
import iconv from "iconv-lite";
import JSZip from "jszip";
import { buildProjectReportDocx } from "./api-project-report-docx.util";
import { buildRiskAnalysisRows } from "./api-project-report-risk.util";

describe("project report DOCX", () => {
  it("fills the retained template and embeds the execution ZIP as an OLE package", async () => {
    const executionZip = new JSZip();
    executionZip.file("接口质量测试报告-TX-001-查询交易.html", "<html/>");
    const zipBuffer = await executionZip.generateAsync({ type: "nodebuffer" });
    const riskRows = buildRiskAnalysisRows(
      [
        {
          caseId: "case-1",
          caseNo: "TX-001-001",
          title: "分页查询",
          transactionCode: "TX-001",
          status: "passed",
        },
      ],
      [
        {
          caseId: "case-1",
          riskPoints: ["页码、单页数量测试"],
        },
      ],
    );

    const docx = await buildProjectReportDocx({
      requirementNo: "XQ2026-1031-02",
      requirementNoShort: "XQ2026-1031",
      projectName: "代发工资批量文件加密通道迁移",
      draftName: "项目测试人员",
      reviewerName: "常万恒",
      approverName: "陈志斌",
      overview:
        "本次共选择 1 个交易、1 个执行历史，执行案例 1 条，通过 1 条，失败/错误 0 条，总通过率 100.00%。",
      conclusion: "本次接口测试通过。",
      riskRows,
      zipFileName: "XQ2026-1031-02接口测试报告.zip",
      zipBuffer,
    });

    const archive = await JSZip.loadAsync(docx);
    const documentXml = await archive
      .file("word/document.xml")!
      .async("string");
    expect(documentXml).toContain("需求点编号：XQ2026-1031-02");
    expect(documentXml).toContain("需求编号：XQ2026-1031");
    expect(documentXml).toContain("项目名称：代发工资批量文件加密通道迁移");
    expect(documentXml).toContain("起草人：项目测试人员");
    expect(documentXml).toContain("审核人：常万恒");
    expect(documentXml).toContain("批准人：陈志斌");
    expect(documentXml).toContain("本次接口测试通过。");
    expect(documentXml).toContain("XQ2026-1031-02接口测试报告.zip");

    const oleBuffer = await archive
      .file("word/embeddings/oleObject1.bin")!
      .async("nodebuffer");
    const cfb = CFB.read(oleBuffer, { type: "buffer" });
    const native = cfb.FileIndex.find(
      (entry) => entry.name === "\u0001Ole10Native",
    );
    expect(native).toBeDefined();
    const nativeBuffer = Buffer.from(native!.content);
    expect(
      nativeBuffer.includes(
        iconv.encode("XQ2026-1031-02接口测试报告.zip", "gbk"),
      ),
    ).toBe(true);
    const zipOffset = nativeBuffer.indexOf(
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    );
    expect(zipOffset).toBeGreaterThan(4);
    expect(nativeBuffer.readUInt32LE(zipOffset - 4)).toBe(zipBuffer.length);
    const zipEnd = zipOffset + zipBuffer.length;
    expect(nativeBuffer.subarray(zipOffset, zipEnd).equals(zipBuffer)).toBe(
      true,
    );
    let cursor = zipEnd;
    const unicodeValues: string[] = [];
    while (cursor < nativeBuffer.length) {
      const charLength = nativeBuffer.readUInt32LE(cursor);
      cursor += 4;
      const byteLength = charLength * 2;
      unicodeValues.push(
        nativeBuffer.subarray(cursor, cursor + byteLength).toString("utf16le"),
      );
      cursor += byteLength;
    }
    expect(unicodeValues).toEqual([
      "C:\\Users\\User\\AppData\\Local\\Temp\\XQ2026-1031-02接口测试报告.zip",
      "XQ2026-1031-02接口测试报告.zip",
      "D:/Users/User/Desktop/XQ2026-1031-02接口测试报告.zip",
    ]);
    expect(cursor).toBe(nativeBuffer.length);
  });
});
