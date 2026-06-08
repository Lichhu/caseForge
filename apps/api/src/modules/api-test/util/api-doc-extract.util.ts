import ExcelJS from "exceljs";
import {
  assertReadableText,
  extractTextFromBuffer,
} from "../../../common/document/document-text.util";
import { parseEndpointsFromText } from "./api-doc.parser";

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

async function extractTextFromExcel(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("Excel 中没有可读取的工作表");
  }
  const lines: string[] = [];
  sheet.eachRow((row) => {
    const values = (row.values as Array<string | number | null | undefined>)
      .slice(1)
      .map((value) => (value === null || value === undefined ? "" : String(value).trim()))
      .filter(Boolean);
    if (values.length) {
      lines.push(values.join(" | "));
    }
  });
  const text = lines.join("\n");
  return assertReadableText(text, "Excel 接口文档");
}

export function structureEndpointsFromRawText(rawText: string) {
  const endpoints = parseEndpointsFromText(rawText);
  return { endpoints, rawText };
}
