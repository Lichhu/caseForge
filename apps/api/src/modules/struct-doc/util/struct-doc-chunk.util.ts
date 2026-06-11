/**
 * 长需求文档分段结构化：按章节切分、合并多段 AI 输出。
 */
import {
  extractRequirementNo,
} from "@struct-doc/util/struct-doc.parser";

/** 单次 AI 结构化可接受的最大字符数（超出则分段） */
const DEFAULT_SINGLE_PASS_MAX_CHARS = 28_000;

/** 每段送入 AI 的目标上限（字符） */
const DEFAULT_CHUNK_MAX_CHARS = 14_000;

/** 仅按体积分段时的最少字符数（有明确系统章节时不受此限制） */
const DEFAULT_CHUNK_MIN_DOC_CHARS = 12_000;

/** 银行需求说明书：系统级章节，如「3.1 手机银行」（不含 3.1.1 功能点） */
const SYSTEM_LEVEL_HEADING = /^\d+\.\d+\s+\S/;
const MODULE_LEVEL_HEADING = /^\d+\.\d+\.\d+/;

export interface RequirementStructMeta {
  requirementNo: string;
  requirementName: string;
  businessScope: string;
}

export interface RequirementStructChunk {
  index: number;
  total: number;
  /** 是否需要在输出中包含「需求概述」（仅首段） */
  includeOverview: boolean;
  text: string;
}

const SECTION_HEADING =
  /^(?:#{1,4}\s+|\d+(?:\.\d+){1,3}\s+\S|第[一二三四五六七八九十百\d]+[章节部分]\s*)/;

function readPositiveInt(raw: string | undefined, fallback: number) {
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function getStructSinglePassMaxChars() {
  return readPositiveInt(
    process.env.STRUCT_REQUIREMENT_SINGLE_PASS_MAX_CHARS,
    DEFAULT_SINGLE_PASS_MAX_CHARS,
  );
}

export function getStructChunkMaxChars() {
  return readPositiveInt(
    process.env.STRUCT_REQUIREMENT_CHUNK_MAX_CHARS,
    DEFAULT_CHUNK_MAX_CHARS,
  );
}

export function getStructChunkMinDocChars() {
  return readPositiveInt(
    process.env.STRUCT_REQUIREMENT_CHUNK_MIN_DOC_CHARS,
    DEFAULT_CHUNK_MIN_DOC_CHARS,
  );
}

/** 预估分段数量（1 表示单次调用） */
export function estimateRequirementChunkCount(text: string) {
  const chunks = splitRequirementForStructuring(text);
  return chunks?.length ?? 1;
}

/** 从原始需求正文提取结构化输出所需的元信息 */
export function extractRequirementStructMeta(text: string): RequirementStructMeta {
  const requirementNo =
    extractRequirementNo(text) ||
    text.match(/(?:\*\*)?需求编号(?:\*\*)?[：:]\s*([^\n]+)/)?.[1]?.trim() ||
    "";

  const titleMatch = text.match(/^#\s+(.+)$/m);
  const titleFromHeading = titleMatch?.[1]?.trim() || "";
  const requirementName =
    text.match(/(?:\*\*)?需求名称(?:\*\*)?[：:]\s*([^\n]+)/)?.[1]?.trim() ||
    titleFromHeading.replace(/^[\[]?[^\]]+[\]]?\s*/, "").replace(/\s*-\s*测试分析.*/, "").trim() ||
    "需求文档";

  const businessScope =
    text.match(/(?:\*\*)?业务范围(?:\*\*)?[：:]\s*([^\n]+)/)?.[1]?.trim() ||
    "";

  return {
    requirementNo,
    requirementName,
    businessScope,
  };
}

interface TextSection {
  heading: string;
  body: string;
}

function splitIntoSections(text: string): TextSection[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  const sections: TextSection[] = [];
  let currentHeading = "";
  let currentLines: string[] = [];

  const flush = () => {
    const body = currentLines.join("\n").trim();
    if (currentHeading || body) {
      sections.push({
        heading: currentHeading,
        body: currentHeading ? `${currentHeading}\n${body}`.trim() : body,
      });
    }
    currentLines = [];
  };

  for (const line of lines) {
    if (SECTION_HEADING.test(line.trim())) {
      flush();
      currentHeading = line;
      continue;
    }
    currentLines.push(line);
  }
  flush();

  if (sections.length <= 1) {
    return [{ heading: "", body: normalized }];
  }
  return sections;
}

function isTocLikeSystemLine(line: string) {
  const trimmed = line.trim();
  // 目录行常见格式：「3.1 手机银行 5」
  return /^\d+\.\d+\s+.+\s+\d{1,3}\s*$/.test(trimmed);
}

function isSystemLevelHeading(line: string) {
  const trimmed = line.trim();
  if (!trimmed || MODULE_LEVEL_HEADING.test(trimmed)) {
    return false;
  }
  if (isTocLikeSystemLine(trimmed)) {
    return false;
  }
  if (!SYSTEM_LEVEL_HEADING.test(trimmed)) {
    return false;
  }
  // 1.x / 2.x 通常是背景与总体描述，不作为系统切分点
  if (/^[12]\.\d+\s+\S/.test(trimmed)) {
    return false;
  }
  return true;
}

/** 去掉目录页，避免把目录里的 3.1/3.2 误当成正文章节 */
function stripTableOfContents(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let inToc = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^目\s*录$/.test(trimmed)) {
      inToc = true;
      continue;
    }
    if (inToc) {
      if (
        /^1(?:[.\s、]|$)/.test(trimmed) ||
        /^第?[一1]\s*[、.]?\s*需求/.test(trimmed) ||
        /^需求背景/.test(trimmed)
      ) {
        inToc = false;
        output.push(line);
      }
      continue;
    }
    output.push(line);
  }

  return output.join("\n");
}

/** 按「3.1 手机银行 / 3.2 数据服务平台」等系统章节切分（银行需求说明书常见结构） */
function splitBySystemSections(text: string): string[] | null {
  const normalized = stripTableOfContents(text);
  const lines = normalized.replace(/\r\n/g, "\n").split("\n");
  const systemLineIndexes: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (isSystemLevelHeading(lines[index])) {
      systemLineIndexes.push(index);
    }
  }

  if (systemLineIndexes.length < 2) {
    return null;
  }

  const preamble = lines.slice(0, systemLineIndexes[0]).join("\n").trim();
  const chunks: string[] = [];

  for (let index = 0; index < systemLineIndexes.length; index += 1) {
    const start = systemLineIndexes[index];
    const end = systemLineIndexes[index + 1] ?? lines.length;
    const sectionText = lines.slice(start, end).join("\n").trim();
    if (!sectionText) {
      continue;
    }
    if (index === 0) {
      chunks.push([preamble, sectionText].filter(Boolean).join("\n\n"));
    } else {
      chunks.push(sectionText);
    }
  }

  return chunks.length >= 2 ? chunks : null;
}

function shouldUseStructChunking(text: string) {
  if (text.length > getStructSinglePassMaxChars()) {
    return true;
  }
  if (splitBySystemSections(text)?.length) {
    return true;
  }
  return text.length >= getStructChunkMinDocChars();
}

function buildChunksFromTexts(texts: string[]): RequirementStructChunk[] {
  return texts.map((chunkText, index) => ({
    index,
    total: texts.length,
    includeOverview: index === 0,
    text: chunkText,
  }));
}

function packSectionsIntoChunks(
  sections: TextSection[],
  maxChunkChars: number,
): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const section of sections) {
    const block = section.body.trim();
    if (!block) {
      continue;
    }

    if (!current) {
      current = block;
      continue;
    }

    if (current.length + block.length + 2 <= maxChunkChars) {
      current = `${current}\n\n${block}`;
      continue;
    }

    chunks.push(current);
    current = block;
  }

  if (current.trim()) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * 将需求文档切分为多段；无需分段时返回 null（走单次结构化）。
 */
export function splitRequirementForStructuring(
  text: string,
): RequirementStructChunk[] | null {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return null;
  }

  if (!shouldUseStructChunking(normalized)) {
    return null;
  }

  const systemChunks = splitBySystemSections(normalized);
  if (systemChunks?.length) {
    return buildChunksFromTexts(systemChunks);
  }

  const maxChunkChars = getStructChunkMaxChars();
  const sections = splitIntoSections(normalized);
  const packed = packSectionsIntoChunks(sections, maxChunkChars);

  if (packed.length <= 1) {
    const hardChunks = splitByCharWindow(normalized, maxChunkChars);
    if (hardChunks.length <= 1) {
      return null;
    }
    return buildChunksFromTexts(hardChunks);
  }

  return buildChunksFromTexts(packed);
}

function splitByCharWindow(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const breakAt = text.lastIndexOf("\n\n", end);
      if (breakAt > start + Math.floor(maxChars * 0.5)) {
        end = breakAt;
      }
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(Boolean);
}

function cleanSystemName(raw: string) {
  return raw.replace(/\*\*/g, "").replace(/[：:]+$/g, "").trim();
}

function cleanModuleName(raw: string) {
  return raw.replace(/\*\*/g, "").replace(/[：:]+$/g, "").trim();
}

function extractOverviewBlock(markdown: string, meta: RequirementStructMeta) {
  const overviewMatch = markdown.match(
    /##\s*需求概述[\s\S]*?(?=\n---\n|\n##\s*系统与功能测试分析)/,
  );
  if (overviewMatch?.[0]?.trim()) {
    return overviewMatch[0].trim();
  }

  const lines = [
    "## 需求概述",
    "",
    meta.requirementNo ? `**需求编号**：${meta.requirementNo}` : "",
    meta.requirementName ? `**需求名称**：${meta.requirementName}` : "",
    meta.businessScope ? `**业务范围**：${meta.businessScope}` : "",
    "",
    meta.requirementName
      ? `> 本需求围绕「${meta.requirementName}」开展测试分析（由分段结构化结果合并）。`
      : "> 本需求测试分析由分段结构化结果合并。",
  ].filter(Boolean);

  return lines.join("\n");
}

function extractTitleLine(markdown: string, meta: RequirementStructMeta) {
  const titleMatch = markdown.match(/^#\s+.+/m);
  if (titleMatch?.[0]) {
    return titleMatch[0].trim();
  }
  const no = meta.requirementNo ? `[${meta.requirementNo}] ` : "";
  return `# ${no}${meta.requirementName} - 测试分析`;
}

function parseModuleBlocks(systemBody: string) {
  const modules = new Map<string, string>();
  const regex =
    /^####\s*(?:\*\*)?功能模块(?:\*\*)?[：:]\s*([^\n]+)\n([\s\S]*?)(?=^####\s*(?:\*\*)?功能模块(?:\*\*)?[：:]|$)/gm;

  for (const match of systemBody.matchAll(regex)) {
    const name = cleanModuleName(match[1]);
    const content = match[0].trim();
    if (!name || !content) {
      continue;
    }
    const existing = modules.get(name);
    if (!existing || content.length > existing.length) {
      modules.set(name, content);
    }
  }

  return modules;
}

function parseSystemBlocks(markdown: string) {
  const systems = new Map<string, Map<string, string>>();
  const regex =
    /^###\s*(?:\*\*)?系统(?:\*\*)?[：:]\s*([^\n]+)\n([\s\S]*?)(?=^###\s*(?:\*\*)?系统(?:\*\*)?[：:]|$)/gm;

  for (const match of markdown.matchAll(regex)) {
    const systemName = cleanSystemName(match[1]);
    const body = match[2] || "";
    if (!systemName) {
      continue;
    }
    const moduleMap = systems.get(systemName) ?? new Map<string, string>();
    for (const [moduleName, content] of parseModuleBlocks(body)) {
      const existing = moduleMap.get(moduleName);
      if (!existing || content.length > existing.length) {
        moduleMap.set(moduleName, content);
      }
    }
    systems.set(systemName, moduleMap);
  }

  return systems;
}

function renderMergedSystemSections(systems: Map<string, Map<string, string>>) {
  const blocks: string[] = [];
  for (const [systemName, modules] of systems) {
    const moduleBlocks = [...modules.values()];
    if (!moduleBlocks.length) {
      continue;
    }
    blocks.push(
      [`### 系统：${systemName}`, "", ...moduleBlocks].join("\n"),
    );
  }
  return blocks.join("\n\n---\n\n");
}

/** 合并多段结构化 Markdown 为一份完整文档 */
export function mergeStructuredMarkdownParts(
  parts: string[],
  meta: RequirementStructMeta,
) {
  if (!parts.length) {
    return "";
  }
  if (parts.length === 1) {
    return parts[0].trim();
  }

  const mergedSystems = new Map<string, Map<string, string>>();
  for (const part of parts) {
    for (const [systemName, modules] of parseSystemBlocks(part)) {
      const target = mergedSystems.get(systemName) ?? new Map<string, string>();
      for (const [moduleName, content] of modules) {
        const existing = target.get(moduleName);
        if (!existing || content.length > existing.length) {
          target.set(moduleName, content);
        }
      }
      mergedSystems.set(systemName, target);
    }
  }

  const title = extractTitleLine(parts[0], meta);
  const overview = extractOverviewBlock(parts[0], meta);
  const systemsBlock = renderMergedSystemSections(mergedSystems);

  return [
    title,
    "",
    overview,
    "",
    "---",
    "",
    "## 系统与功能测试分析",
    "",
    systemsBlock,
  ]
    .filter((line, index, arr) => !(line === "" && arr[index - 1] === ""))
    .join("\n")
    .trim();
}
