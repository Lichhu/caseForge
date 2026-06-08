/**
 * @file 工作流输入：从文件 URL 读取并解析为纯文本
 */
import {
  assertReadableText,
  extractTextFromBuffer,
} from "../../document/document-text.util";

/** 从 URL 路径解析文件名（用于判断扩展名） */
function extractFileNameFromUrl(url: string) {
  try {
    const pathname = decodeURIComponent(new URL(url).pathname);
    return pathname.split("/").pop() ?? "";
  } catch {
    return "";
  }
}

/**
 * 从可访问 URL 拉取文件并解析为纯文本
 * @param fileNameHint - 原始文件名（URL 无扩展名时使用，如 reqDocName）
 */
export async function fetchTextFromUrl(
  url: string,
  label: string,
  fileNameHint?: string,
) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    const fileName = fileNameHint?.trim() || extractFileNameFromUrl(url);
    const text = await extractTextFromBuffer(buffer, {
      fileName,
      contentType: resp.headers.get("content-type"),
    });
    return assertReadableText(text, label);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(label)) {
      throw error;
    }
    throw new Error(`读取${label}失败: ${(error as Error).message}`);
  }
}

/** 并行读取需求文档与技能文档内容 */
export async function fetchWorkflowFileContents(
  requireFileUrl: string,
  skillFileUrl: string,
  requireFileName?: string,
) {
  return Promise.all([
    fetchTextFromUrl(requireFileUrl, "需求文档", requireFileName),
    fetchTextFromUrl(skillFileUrl, "技能文档"),
  ]);
}

/** 截断超长输入（如 Dify 限制） */
export function truncateWorkflowInput(
  text: string,
  maxLength: number,
  onTruncated?: () => void,
) {
  if (text.length <= maxLength) {
    return text;
  }
  onTruncated?.();
  return text.slice(0, maxLength);
}
