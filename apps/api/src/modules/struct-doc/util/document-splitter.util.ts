import { MAX_REQUIREMENT_DOC_CHINESE_CHARS } from "@case-forge/shared";

/** 匹配中文需求文档常见标题行 */
const HEADING_PATTERNS = [
  /^第[一二三四五六七八九十百零\d]+[章节部分篇]/, // 第一章 / 第1章
  /^[一二三四五六七八九十]+[、.．]/, // 一、 / 一.
  /^[\d]+[.．]\s*[^.．]/, // 1. 标题（非 1.1）
  /^[\d]+[.．][\d]+[.．]\s*/, // 1.1 标题
  /^[\d]+[.．][\d]+[.．][\d]+[.．]\s*/, // 1.1.1 标题
  /^#{1,6}\s+/, // Markdown 标题
];

function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return HEADING_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function countChineseChars(text: string): number {
  return (text.match(/[\u4e00-\u9fa5]/g) || []).length;
}

interface Section {
  heading: string;
  body: string;
}

/** 将纯文本按标题行切分为 Section 列表 */
function splitIntoSections(text: string): Section[] {
  const lines = text.split("\n");
  const sections: Section[] = [];
  let currentHeading = "";
  let currentBody: string[] = [];

  for (const line of lines) {
    if (isHeadingLine(line)) {
      if (currentHeading || currentBody.join("\n").trim()) {
        sections.push({
          heading: currentHeading,
          body: currentBody.join("\n"),
        });
      }
      currentHeading = line.trim();
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  if (currentHeading || currentBody.join("\n").trim()) {
    sections.push({
      heading: currentHeading,
      body: currentBody.join("\n"),
    });
  }

  return sections;
}

/** 按段落进一步切分超大 Section */
function splitSectionByParagraphs(section: Section): Section[] {
  const paragraphs = section.body.split(/\n\s*\n/);
  const result: Section[] = [];
  let buffer: string[] = [];

  for (const para of paragraphs) {
    const candidate = [...buffer, para].join("\n\n");
    if (countChineseChars(section.heading + "\n" + candidate) > MAX_REQUIREMENT_DOC_CHINESE_CHARS && buffer.length > 0) {
      result.push({
        heading: section.heading,
        body: buffer.join("\n\n"),
      });
      buffer = [para];
    } else {
      buffer.push(para);
    }
  }

  if (buffer.length) {
    result.push({
      heading: section.heading,
      body: buffer.join("\n\n"),
    });
  }

  return result;
}

export interface SplitChunk {
  /** 拆分部分序号（从 1 开始） */
  index: number;
  /** 拆分部分标题（取自首个标题行，用于命名） */
  title: string;
  /** 拆分部分完整文本内容 */
  content: string;
}

/**
 * 将提取的纯文本按章节结构拆分为多个不超过中文字符上限的块。
 *
 * 拆分策略：
 * 1. 优先按标题行（第X章、X.、X.X 等）切分
 * 2. 单章超限时按段落进一步切分
 * 3. 相邻小节合并以减少碎片
 */
export function splitDocumentText(text: string): SplitChunk[] {
  const totalChineseChars = countChineseChars(text);
  if (totalChineseChars <= MAX_REQUIREMENT_DOC_CHINESE_CHARS) {
    return [{ index: 1, title: "", content: text }];
  }

  const sections = splitIntoSections(text);
  const chunks: { title: string; content: string }[] = [];

  for (const section of sections) {
    const sectionText = (section.heading + "\n" + section.body).trim();
    const sectionChineseChars = countChineseChars(sectionText);

    if (sectionChineseChars <= MAX_REQUIREMENT_DOC_CHINESE_CHARS) {
      chunks.push({
        title: section.heading || extractTitleFromBody(section.body),
        content: sectionText,
      });
    } else {
      const subSections = splitSectionByParagraphs(section);
      for (const sub of subSections) {
        const subText = (sub.heading + "\n" + sub.body).trim();
        const subChars = countChineseChars(subText);
        if (subChars <= MAX_REQUIREMENT_DOC_CHINESE_CHARS) {
          chunks.push({
            title: sub.heading || extractTitleFromBody(sub.body),
            content: subText,
          });
        } else {
          // 段落合并后仍超限，按行硬切
          const lineChunks = splitByLines(subText, sub.heading);
          chunks.push(...lineChunks);
        }
      }
    }
  }

  // 合并相邻小碎片
  const merged = mergeSmallChunks(chunks);

  return merged.map((chunk, i) => ({
    index: i + 1,
    title: chunk.title,
    content: chunk.content,
  }));
}

function extractTitleFromBody(body: string): string {
  const firstLine = body.trim().split("\n")[0]?.trim() || "";
  return firstLine.slice(0, 30);
}

function splitByLines(text: string, heading: string): { title: string; content: string }[] {
  const lines = text.split("\n");
  const result: { title: string; content: string }[] = [];
  let buffer: string[] = [];

  for (const line of lines) {
    const candidate = [...buffer, line].join("\n");
    if (countChineseChars(heading + "\n" + candidate) > MAX_REQUIREMENT_DOC_CHINESE_CHARS && buffer.length > 0) {
      result.push({
        title: heading || extractTitleFromBody(buffer.join("\n")),
        content: (heading + "\n" + buffer.join("\n")).trim(),
      });
      buffer = [line];
    } else {
      buffer.push(line);
    }
  }

  if (buffer.length) {
    result.push({
      title: heading || extractTitleFromBody(buffer.join("\n")),
      content: (heading + "\n" + buffer.join("\n")).trim(),
    });
  }

  return result;
}

function mergeSmallChunks(chunks: { title: string; content: string }[]): { title: string; content: string }[] {
  const result: { title: string; content: string }[] = [];
  let current: { title: string; content: string } | null = null;

  for (const chunk of chunks) {
    if (!current) {
      current = { ...chunk };
      continue;
    }

    const combinedChars = countChineseChars(current.content + "\n\n" + chunk.content);
    if (combinedChars <= MAX_REQUIREMENT_DOC_CHINESE_CHARS) {
      current = {
        title: current.title,
        content: current.content + "\n\n" + chunk.content,
      };
    } else {
      result.push(current);
      current = { ...chunk };
    }
  }

  if (current) {
    result.push(current);
  }

  return result;
}
