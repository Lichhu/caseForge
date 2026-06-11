/**
 * @file 工作流输入：从文件 URL 读取并解析为纯文本
 */
import {
  assertReadableText,
  extractTextFromBuffer,
} from "../../document/document-text.util";
import type {
  RequirementStructChunk,
  RequirementStructMeta,
} from "@struct-doc/util/struct-doc-chunk.util";

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

/** 组装需求结构化 AI Chat 提示词（skill + 原始需求正文） */
export function buildStructRequirementPrompt(
  skillText: string,
  requireText: string,
  requireFileName?: string,
) {
  const fileNameLine = requireFileName?.trim()
    ? `文件名：${requireFileName.trim()}\n\n`
    : "";

  return [
    skillText.trim(),
    "",
    "---",
    "",
    "# 待结构化的需求文档",
    "",
    fileNameLine + requireText.trim(),
    "",
    "---",
    "",
    "请严格按技能文档中的 Markdown 模板输出结构化结果，直接输出 Markdown 正文，不要用 ```markdown 代码块包裹，不要输出 thinking 标签或解释性前言。",
  ]
    .filter((line, index, arr) => !(line === "" && arr[index - 1] === ""))
    .join("\n");
}

/** 分段结构化：首段含需求概述，后续段仅输出本片段涉及的新增系统/模块/测试要点 */
export function buildStructRequirementChunkPrompt(
  skillText: string,
  chunk: RequirementStructChunk,
  meta: RequirementStructMeta,
  requireFileName?: string,
) {
  const fileNameLine = requireFileName?.trim()
    ? `文件名：${requireFileName.trim()}\n\n`
    : "";

  const metaLines = [
    meta.requirementNo ? `- 需求编号：${meta.requirementNo}` : "",
    meta.requirementName ? `- 需求名称：${meta.requirementName}` : "",
    meta.businessScope ? `- 业务范围：${meta.businessScope}` : "",
  ].filter(Boolean);

  const segmentIntro = [
    `# 分段结构化任务（第 ${chunk.index + 1}/${chunk.total} 段）`,
    "",
    "以下是一份较长需求文档的**片段**。请严格按技能文档中的 Markdown 模板，**仅结构化管理本片段中出现的功能内容**。",
    "",
    "## 全局需求背景（仅供理解，不要在本段重复输出完整需求概述）",
    ...metaLines,
    "",
    chunk.includeOverview
      ? "## 本段输出要求"
      : "## 本段输出要求（重要）",
    chunk.includeOverview
      ? "- 输出完整文档头部：`# 标题`、`## 需求概述`（可精炼）、`## 系统与功能测试分析`"
      : "- **不要**输出 `# 标题` 或 `## 需求概述`",
    "- 仅输出本片段中能够识别到的 `### 系统：` / `#### 功能模块：` / `测试要点` 块",
    "- 不要编造本片段未出现的系统或功能",
    "- 不要输出 ```markdown 代码块或 thinking 标签",
    chunk.total > 1
      ? `- 这是第 ${chunk.index + 1}/${chunk.total} 段，后续片段会补充其他系统/模块，本段宁缺毋滥`
      : "",
    "",
    "---",
    "",
    "# 待结构化的需求文档片段",
    "",
    fileNameLine + chunk.text.trim(),
    "",
    "---",
    "",
    chunk.includeOverview
      ? "请输出本段对应的完整 Markdown（含需求概述与本段系统/模块/测试要点）。"
      : "请仅输出本段新增的 `### 系统：` 模块块（可含多个系统，每个系统下含功能模块与测试要点）。",
  ]
    .filter(Boolean)
    .filter((line, index, arr) => !(line === "" && arr[index - 1] === ""));

  return [skillText.trim(), "", ...segmentIntro].join("\n");
}

/** 组装案例生成用需求总结 AI Chat 提示词（压缩结构化 Markdown） */
export function buildCaseGenerateSummaryPrompt(structuredMarkdown: string) {
  return [
    "你是一位资深银行软件测试专家。下面是一份已结构化的需求分析 Markdown。",
    "请将其压缩为一份「案例生成用需求总结」，供后续按各测试要点批量生成测试案例时作为共享背景。",
    "",
    "## 压缩要求",
    "- 保留：需求编号、需求名称、需求概述、各系统边界与职责",
    "- 每个功能模块保留：模块名称、核心业务规则、关键处理逻辑、重要输入输出约束",
    "- 每个测试要点保留一行：所属系统、功能模块、测试要点标题、测试要点描述（可精炼但不可丢失验证意图）",
    "- 删除：修订记录、重复表述、冗长表格细节、与案例设计无关的流程/组织信息",
    "- 目标篇幅：明显短于原文，但不得遗漏会影响案例设计的业务规则",
    "",
    "## 输出格式",
    "- 直接输出 Markdown 正文",
    "- 不要用 ```markdown 代码块包裹",
    "- 不要输出 thinking 标签或解释性前言",
    "- 建议结构：",
    "  # [需求编号] [需求名称] - 案例生成摘要",
    "  ## 需求概述",
    "  ## 系统与模块",
    "  ### [系统名]",
    "  #### [功能模块]",
    "  **业务规则**：...",
    "  **测试要点**",
    "  - **[测试要点]**：**测试要点描述**：...",
    "",
    "---",
    "",
    "# 待压缩的结构化需求文档",
    "",
    structuredMarkdown.trim(),
  ]
    .filter((line, index, arr) => !(line === "" && arr[index - 1] === ""))
    .join("\n");
}

