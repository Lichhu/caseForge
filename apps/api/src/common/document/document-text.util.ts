/**
 * @file 从 Word / PDF / 文本二进制内容提取纯文本（兼容 .doc 与 .docx）
 */
import { extname } from "node:path";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import WordExtractor from "word-extractor";

type DocumentFormat = "docx" | "doc" | "pdf" | "text";

const wordExtractor = new WordExtractor();

function isZipDocx(buffer: Buffer) {
  return (
    buffer.length >= 4 && buffer.subarray(0, 4).toString("utf8") === "PK\x03\x04"
  );
}

function isOleDoc(buffer: Buffer) {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  );
}

function detectDocumentFormat(
  fileName: string,
  contentType: string | undefined,
  buffer: Buffer,
): DocumentFormat {
  const extension = extname(fileName).toLowerCase();
  const normalizedType = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";

  if (isZipDocx(buffer)) {
    return "docx";
  }
  if (isOleDoc(buffer)) {
    return "doc";
  }
  if (
    extension === ".docx" ||
    normalizedType.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml",
    )
  ) {
    return "docx";
  }
  if (extension === ".doc" || normalizedType === "application/msword") {
    return "doc";
  }
  if (extension === ".pdf" || normalizedType === "application/pdf") {
    return "pdf";
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("utf8") === "%PDF-") {
    return "pdf";
  }
  if (
    [".md", ".txt", ".markdown"].includes(extension) ||
    normalizedType.startsWith("text/")
  ) {
    return "text";
  }
  return "text";
}

async function extractDocxText(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractLegacyDocText(buffer: Buffer) {
  const document = await wordExtractor.extract(buffer);
  return document.getBody();
}

/** 从 Buffer 解析文档正文 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  options: { fileName: string; contentType?: string | null },
) {
  if (!buffer.length) {
    throw new Error("文件内容为空");
  }

  const format = detectDocumentFormat(
    options.fileName,
    options.contentType ?? undefined,
    buffer,
  );

  switch (format) {
    case "docx":
      return extractDocxText(buffer);
    case "doc":
      return extractLegacyDocText(buffer);
    case "pdf": {
      const result = await pdfParse(buffer);
      return result.text;
    }
    default:
      return buffer.toString("utf8");
  }
}

/** 校验提取结果是否为可读文本 */
export function assertReadableText(text: string, label: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`${label}内容为空`);
  }

  const controlChars = trimmed.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g)?.length ?? 0;
  if (controlChars > Math.max(8, trimmed.length * 0.02)) {
    throw new Error(
      `${label}解析失败，请确认文件为有效的 doc、docx、pdf 或文本格式`,
    );
  }

  return trimmed;
}
