import * as XLSX from "xlsx";
import {
  assertReadableText,
  extractTextFromBuffer,
} from "../../../common/document/document-text.util";
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

  const sections: string[] = [];
  for (const name of namesToRead) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean)[]>(
      sheet,
      { header: 1, defval: "" },
    );
    const lines = rows
      .map((row) => row.map((cell) => String(cell ?? "").trim()))
      .filter((row) => row.some(Boolean))
      .map((row) => row.join(" | "));
    sections.push(name, API_DOC_SECTION_SEPARATOR, ...lines, "");
  }

  const text = sections.join("\n").trim();
  return assertReadableText(text, "Excel 接口文档");
}

export function structureEndpointsFromRawText(rawText: string) {
  const endpoints = parseEndpointsFromText(rawText);
  return { endpoints, rawText };
}
