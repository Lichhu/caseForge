import * as XLSX from "xlsx";
import { extractTextFromExcel } from "./api-doc-extract.util";

interface SheetFixture {
  name: string;
  aoa: (string | number)[][];
  merges?: XLSX.Range[];
}

function buildXlsxBuffer(sheets: SheetFixture[]): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.aoa);
    if (sheet.merges) ws["!merges"] = sheet.merges;
    XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function requestMessageLines(text: string): string[] {
  const start = text.indexOf("请求报文");
  expect(start).toBeGreaterThanOrEqual(0);
  return text
    .slice(start)
    .split("\n")
    .slice(2)
    .filter((line) => line.trim());
}

describe("extractTextFromExcel", () => {
  it("单元格内换行压缩为连续文本，保持一行一条记录", () => {
    const buffer = buildXlsxBuffer([
      { name: "基础信息", aoa: [["服务编码", "WE1220"]] },
      {
        name: "请求报文",
        aoa: [
          ["节点路径", "节点代码", "节点名称", "描述"],
          [
            "Transaction/Body/request/bizBody",
            "NavDate",
            "查询日期",
            "查询日，月，年收益明细时必填。\n查询日收益明细,传参格式为“20260803”；\n查询年收益明细,传参格式为“2026”。",
          ],
        ],
      },
    ]);

    const lines = requestMessageLines(extractTextFromExcel(buffer));

    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(
      "查询日，月，年收益明细时必填。查询日收益明细,传参格式为“20260803”；查询年收益明细,传参格式为“2026”。",
    );
  });

  it("合并单元格把左上角值回填到被覆盖的行", () => {
    const buffer = buildXlsxBuffer([
      { name: "基础信息", aoa: [["服务编码", "WE1220"]] },
      {
        name: "请求报文",
        aoa: [
          ["节点路径", "节点代码", "节点名称"],
          ["Transaction/Body/request/bizBody", "NavDate", "查询日期"],
          ["", "OrderFlag", "排序标识"],
        ],
        merges: [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }],
      },
    ]);

    const lines = requestMessageLines(extractTextFromExcel(buffer));

    expect(lines).toHaveLength(3);
    expect(lines[2].split("|").map((cell) => cell.trim())[0]).toBe(
      "Transaction/Body/request/bizBody",
    );
  });
});
