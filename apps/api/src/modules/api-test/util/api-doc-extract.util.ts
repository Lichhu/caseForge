import * as XLSX from "xlsx";
import {
  assertReadableText,
  extractTextFromBuffer,
} from "@common/document/document-text.util";
import { parseEndpointsFromText } from "./api-doc.parser";
import {
  API_DOC_SECTION_SEPARATOR,
  API_DOC_SHEET_NAMES,
} from "./api-doc-format.const";

export async function extractDocumentText(
  buffer: Buffer,
  fileName: string,
  contentType?: string,
) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["xls", "xlsx"].includes(extension)) {
    return extractTextFromExcel(buffer);
  }
  const text = await extractTextFromBuffer(buffer, {
    fileName,
    contentType,
  });
  return assertReadableText(text, "接口文档");
}

export function extractTextFromExcel(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetNames = API_DOC_SHEET_NAMES.filter((name) =>
    workbook.SheetNames.includes(name),
  );
  const namesToRead = sheetNames.length ? sheetNames : workbook.SheetNames;
  if (!namesToRead.length) {
    throw new Error("Excel 中没有可读取的工作表");
  }

  const rawRows = new Map<string, string[][]>();
  for (const name of namesToRead) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils
      .sheet_to_json<
        (string | number | boolean)[]
      >(sheet, { header: 1, defval: "" })
      .map((row) => row.map((cell) => normalizeCellText(cell)));
    fillMergedCells(rows, sheet["!merges"]);
    rawRows.set(
      name,
      rows.filter((row) => row.some(Boolean)),
    );
  }

  const basic = filterPropertyRows(rawRows.get("基础信息") ?? [], [
    "服务编码",
    "原服务交易码",
    "服务名称(中)",
    "服务名称",
    "服务属性",
  ]);
  const basicNameRow = basic.find((row) => row[0] === "服务名称(中)");
  if (basicNameRow) basicNameRow[0] = "服务名称";
  const service = filterPropertyRows(rawRows.get("服务信息") ?? [], [
    "功能描述",
    "业务规则",
  ]);
  const basicValues = new Map(basic.slice(1).map((row) => [row[0], row[1]]));
  service.push(
    ["服务名称", basicValues.get("服务名称") || ""],
    ["服务属性", basicValues.get("服务属性") || ""],
  );

  const sections: string[] = [];
  for (const [name, rows] of [
    ["基础信息", basic],
    ["服务信息", service],
    ["请求报文", rawRows.get("请求报文") ?? []],
  ] as const) {
    if (!rows.length) continue;
    sections.push(
      name,
      API_DOC_SECTION_SEPARATOR,
      ...rows.map((row) => row.join(" | ")),
      "",
    );
  }

  const text = sections.join("\n").trim();
  return assertReadableText(text, "Excel 接口文档");
}

/** 单元格内换行（手动换行/合并单元格产生）会破坏「一行=一条记录」的文本约定，压成连续文本 */
function normalizeCellText(cell: string | number | boolean) {
  return String(cell ?? "").replace(/\s*\r?\n\s*/g, "").trim();
}

/** 合并单元格只有左上角有值：把值回填到被合并覆盖的单元格，避免下游表格出现空洞行 */
function fillMergedCells(rows: string[][], merges: XLSX.Range[] | undefined) {
  if (!merges?.length) return;
  for (const range of merges) {
    const value = rows[range.s.r]?.[range.s.c] ?? "";
    if (!value) continue;
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        if (r === range.s.r && c === range.s.c) continue;
        if (!rows[r]) rows[r] = [];
        if (!rows[r][c]) rows[r][c] = value;
      }
    }
  }
}

function filterPropertyRows(rows: string[][], allowed: string[]) {
  const values = new Map(
    rows.map((row) => [row[0]?.trim(), row[1]?.trim() ?? ""]),
  );
  return [
    ["服务属性", "属性值"],
    ...allowed
      .filter(
        (name, index) => allowed.indexOf(name) === index && values.has(name),
      )
      .map((name) => [name, values.get(name) ?? ""]),
  ];
}

export function structureEndpointsFromRawText(rawText: string) {
  const endpoints = parseEndpointsFromText(rawText);
  return { endpoints, rawText };
}
