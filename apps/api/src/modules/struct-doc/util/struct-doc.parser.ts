/**
 * 结构化需求文档 Markdown 解析工具。
 * 从 AI 生成的结构化 Markdown 中提取系统、功能模块与测试要点，并辅助文档命名与需求编号识别。
 */
export interface ParsedTestPoint {
  /** 系统名称 */
  system: string;
  /** 系统描述 */
  systemDesc: string;
  /** 功能模块名称 */
  featureModule: string;
  /** 功能描述 */
  featureDesc: string;
  /** 测试要点标题 */
  testPoint: string;
  /** 测试要点详细描述 */
  testPointDesc: string;
}

const DEFAULT_SYSTEM = "业务系统";
const FEATURE_MODULE_PATTERN =
  /\n#{2,5}\s*(?:\*\*)?功能模块(?:\*\*)?[：:]\s*([^\n]+)\n?/g;
const SYSTEM_HEADING_PATTERN =
  /^#{2,3}\s*(?:\*\*)?系统(?:\*\*)?[：:]\s*([^\n]+)/gm;

/**
 * 解析结构化 Markdown 文档，提取测试要点列表。
 * 依次尝试：功能模块分块 → 旧版标题块 → 宽松功能模块 → 全局测试要点段落。
 *
 * @param markdown 结构化需求 Markdown 正文
 * @returns 去重后的测试要点数组
 */
export function parseStructuredDoc(markdown: string): ParsedTestPoint[] {
  const normalized = normalizeStructuredMarkdown(markdown);
  if (!normalized.trim()) {
    return [];
  }

  const strategies = [
    () => parsePlainTextStructuredDoc(normalized),
    () => parseFromFeatureModuleBlocks(normalized),
    () => parseLegacyBlocks(normalized),
    () => parseRelaxedFeatureModules(normalized),
    () => parseGlobalTestPointSections(normalized),
  ];

  for (const strategy of strategies) {
    const results = dedupeTestPoints(strategy());
    if (results.length) {
      return results;
    }
  }

  return [];
}

function normalizeStructuredMarkdown(markdown: string) {
  const fenced = markdown.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : markdown).replace(/\r\n/g, "\n").trim();
}

/** 纯文本 / Markdown 标签行，如「#### 功能模块：」「**测试要点描述**：」 */
function plainLabelPattern(label: string, flags = "g") {
  return new RegExp(
    `(?:^|\\n)(?:#{1,5}\\s*)?(?:\\*\\*)?${label}(?:\\*\\*)?[：:]\\s*([^\\n]+)`,
    flags,
  );
}

const TEST_POINT_DESC_LABEL = "测试要点描述";

const PLAIN_FEATURE_MODULE_PATTERN = plainLabelPattern("功能模块");
const PLAIN_SYSTEM_PATTERN = plainLabelPattern("系统", "m");

/**
 * 解析 Dify 等返回的纯文本结构（无 # 标题，测试要点为「测试要点描述 / 验证点 / 测试方法」）
 */
function parsePlainTextStructuredDoc(text: string) {
  const moduleMatches = [...text.matchAll(PLAIN_FEATURE_MODULE_PATTERN)];
  if (!moduleMatches.length) {
    return [];
  }

  const system =
    cleanText(text.match(PLAIN_SYSTEM_PATTERN)?.[1] || "") || DEFAULT_SYSTEM;
  const results: ParsedTestPoint[] = [];

  for (let i = 0; i < moduleMatches.length; i += 1) {
    const featureModule = cleanText(moduleMatches[i][1]);
    const bodyStart =
      (moduleMatches[i].index ?? 0) + moduleMatches[i][0].length;
    const bodyEnd = moduleMatches[i + 1]?.index ?? text.length;
    const body = text.slice(bodyStart, bodyEnd);

    const featureDesc = cleanText(
      body.match(plainLabelPattern("功能描述", "m"))?.[1] || "",
    );
    const testPointItems = extractPlainTextTestPointDescriptions(body);

    if (testPointItems.length) {
      for (const item of testPointItems) {
        results.push({
          system,
          systemDesc: "",
          featureModule,
          featureDesc,
          testPoint: item.title,
          testPointDesc: item.detail,
        });
      }
      continue;
    }

    if (featureDesc) {
      results.push({
        system,
        systemDesc: "",
        featureModule,
        featureDesc,
        testPoint: "业务规则验证",
        testPointDesc: featureDesc,
      });
    }
  }

  return results;
}

function extractPlainTextTestPointDescriptions(body: string) {
  const results: Array<{ title: string; detail: string }> = [];
  const seen = new Set<string>();

  const patterns = [
    // 1. **测试要点描述**：验证…（带序号）
    new RegExp(
      `(?:^|\\n)\\s*\\d+[.、．)]\\s*(?:\\*\\*)?${TEST_POINT_DESC_LABEL}(?:\\*\\*)?[：:]\\s*([^\\n]+)([\\s\\S]*?)(?=(?:\\n\\s*\\d+[.、．)]\\s*(?:\\*\\*)?${TEST_POINT_DESC_LABEL})|(?:\\n(?:#{1,5}\\s*)?(?:\\*\\*)?功能模块)|$)`,
      "gi",
    ),
    // 2. **测试要点描述**：验证…（无序号）
    new RegExp(
      `(?:^|\\n)(?:\\*\\*)?${TEST_POINT_DESC_LABEL}(?:\\*\\*)?[：:]\\s*([^\\n]+)([\\s\\S]*?)(?=(?:\\n(?:\\*\\*)?${TEST_POINT_DESC_LABEL})|(?:\\n(?:#{1,5}\\s*)?(?:\\*\\*)?功能模块)|$)`,
      "gi",
    ),
  ];

  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) {
      const title = cleanText(match[1]);
      if (!title || title === TEST_POINT_DESC_LABEL || seen.has(title)) {
        continue;
      }
      seen.add(title);
      results.push({
        title,
        detail: buildPlainTextTestPointDetail(match[2] || ""),
      });
    }
  }

  return results;
}

function buildPlainTextTestPointDetail(block: string) {
  const verification = block.match(plainLabelPattern("验证点", "m"))?.[1];
  const method = block.match(plainLabelPattern("测试方法", "m"))?.[1];
  const parts: string[] = [];
  if (verification) {
    parts.push(`验证点：${cleanText(verification)}`);
  }
  if (method) {
    parts.push(`测试方法：${cleanText(method)}`);
  }
  return parts.length ? parts.join(" ") : cleanText(block);
}

interface FeatureModuleBlock {
  moduleName: string;
  body: string;
  startIndex: number;
}

function parseFromFeatureModuleBlocks(markdown: string) {
  const blocks = splitFeatureModuleBlocks(markdown);
  const results: ParsedTestPoint[] = [];
  for (const block of blocks) {
    results.push(...parseFeatureModuleBlock(markdown, block));
  }
  return results;
}

function splitFeatureModuleBlocks(markdown: string): FeatureModuleBlock[] {
  const matches = [...markdown.matchAll(FEATURE_MODULE_PATTERN)];
  if (!matches.length) {
    return [];
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const next = matches[index + 1];
    const end = next?.index ?? markdown.length;
    return {
      moduleName: cleanText(match[1]),
      body: markdown.slice(start + match[0].length, end),
      startIndex: start,
    };
  });
}

function parseFeatureModuleBlock(
  markdown: string,
  block: FeatureModuleBlock,
): ParsedTestPoint[] {
  const system =
    findSystemBefore(markdown, block.startIndex) ||
    inferSystemFromModuleName(block.moduleName);
  const featureModule = block.moduleName || "未命名功能模块";
  const featureDesc = extractLabeledParagraph(block.body, "功能描述");
  const testPointItems = extractNumberedTestPoints(block.body);

  if (testPointItems.length) {
    return testPointItems.map((item) => ({
      system,
      systemDesc: "",
      featureModule,
      featureDesc,
      testPoint: item.title,
      testPointDesc: item.detail,
    }));
  }

  return [
    {
      system,
      systemDesc: "",
      featureModule,
      featureDesc,
      testPoint: "业务规则验证",
      testPointDesc: featureDesc || featureModule,
    },
  ];
}

/** 兼容 ### 功能模块 等 AI 常见输出（无 #### 时） */
function parseRelaxedFeatureModules(markdown: string) {
  const results: ParsedTestPoint[] = [];
  const systemBlocks = [...markdown.matchAll(SYSTEM_HEADING_PATTERN)];
  if (!systemBlocks.length) {
    return parseFeatureModuleBlocksWithDefaultSystem(markdown);
  }

  for (let i = 0; i < systemBlocks.length; i += 1) {
    const system = cleanText(systemBlocks[i][1]);
    const start = systemBlocks[i].index ?? 0;
    const end = systemBlocks[i + 1]?.index ?? markdown.length;
    const section = markdown.slice(start, end);
    const moduleMatches = [...section.matchAll(FEATURE_MODULE_PATTERN)];
    if (!moduleMatches.length) {
      continue;
    }

    for (let j = 0; j < moduleMatches.length; j += 1) {
      const moduleName = cleanText(moduleMatches[j][1]);
      const bodyStart =
        (moduleMatches[j].index ?? 0) + moduleMatches[j][0].length;
      const bodyEnd =
        moduleMatches[j + 1]?.index !== undefined
          ? moduleMatches[j + 1].index!
          : section.length;
      results.push(
        ...buildPointsFromModuleBody(
          system,
          moduleName,
          section.slice(bodyStart, bodyEnd),
        ),
      );
    }
  }

  return results;
}

function parseFeatureModuleBlocksWithDefaultSystem(markdown: string) {
  const results: ParsedTestPoint[] = [];
  const matches = [...markdown.matchAll(FEATURE_MODULE_PATTERN)];
  for (let i = 0; i < matches.length; i += 1) {
    const moduleName = cleanText(matches[i][1]);
    const bodyStart = (matches[i].index ?? 0) + matches[i][0].length;
    const bodyEnd = matches[i + 1]?.index ?? markdown.length;
    results.push(
      ...buildPointsFromModuleBody(
        DEFAULT_SYSTEM,
        moduleName,
        markdown.slice(bodyStart, bodyEnd),
      ),
    );
  }
  return results;
}

function buildPointsFromModuleBody(
  system: string,
  featureModule: string,
  body: string,
) {
  const featureDesc = extractLabeledParagraph(body, "功能描述");
  const testPointItems = extractNumberedTestPoints(body);
  if (testPointItems.length) {
    return testPointItems.map((item) => ({
      system,
      systemDesc: "",
      featureModule,
      featureDesc,
      testPoint: item.title,
      testPointDesc: item.detail,
    }));
  }
  if (!featureDesc && !body.trim()) {
    return [];
  }
  return [
    {
      system,
      systemDesc: "",
      featureModule,
      featureDesc,
      testPoint: "业务规则验证",
      testPointDesc: featureDesc || featureModule,
    },
  ];
}

/** 按「测试要点」章节全局扫描（无功能模块标题时的兜底） */
function parseGlobalTestPointSections(markdown: string) {
  const results: ParsedTestPoint[] = [];
  const sectionPattern = /(?:^|\n)(?:#{1,4}\s*)?(?:\*\*)?测试要点(?:\*\*)?[：:]?\s*\n/gi;
  const matches = [...markdown.matchAll(sectionPattern)];
  if (!matches.length) {
    return results;
  }

  let moduleIndex = 0;
  for (const match of matches) {
    const start = (match.index ?? 0) + match[0].length;
    const rest = markdown.slice(start);
    const nextSection = rest.search(
      /\n(?:#{1,4}\s*(?:\*\*)?(?:功能模块|系统|业务规则)|(?:\*\*)?功能模块)/,
    );
    const body = nextSection === -1 ? rest : rest.slice(0, nextSection);
    const system =
      findSystemBefore(markdown, match.index ?? 0) || DEFAULT_SYSTEM;
    moduleIndex += 1;
    const featureModule = `功能模块${moduleIndex}`;
    results.push(...buildPointsFromModuleBody(system, featureModule, body));
  }

  return results;
}

function parseLegacyBlocks(markdown: string): ParsedTestPoint[] {
  const blocks = markdown.split(/\n(?=#{2,4}\s+)/g).filter(Boolean);
  const results: ParsedTestPoint[] = [];

  for (const block of blocks) {
    const system =
      block.match(/(?:\*\*)?系统(?:\*\*)?[：:]\s*([^\n*]+)/)?.[1]?.trim() ||
      block.match(/^#{2,3}\s*\d+\.\s*([^\n]+)/)?.[1]?.trim() ||
      block.match(/^#{2,3}\s*([^\n]+)/)?.[1]?.trim() ||
      "";
    if (!system || /^功能模块|测试要点|系统与功能/.test(system)) {
      continue;
    }

    const systemDesc =
      block.match(/系统描述[：:]\s*([^\n]+)/)?.[1]?.trim() ||
      extractParagraphAfter(block, "系统概述") ||
      "";

    const featureModule =
      block.match(/(?:\*\*)?功能模块(?:\*\*)?[：:]\s*([^\n*]+)/)?.[1]?.trim() ||
      block.match(/模块[：:]\s*([^\n*]+)/)?.[1]?.trim() ||
      `${cleanText(system)}核心流程`;

    const featureDesc =
      extractLabeledParagraph(block, "功能描述") ||
      extractParagraphAfter(block, "功能描述") ||
      `围绕 ${featureModule} 完成业务规则、交互和数据校验。`;

    const testPointItems = extractNumberedTestPoints(block);
    if (testPointItems.length) {
      for (const item of testPointItems) {
        results.push({
          system: cleanText(system),
          systemDesc: cleanText(systemDesc),
          featureModule: cleanText(featureModule),
          featureDesc: cleanText(featureDesc),
          testPoint: item.title,
          testPointDesc: item.detail,
        });
      }
      continue;
    }

    const legacyItems = extractListAfter(block, "测试要点");
    if (legacyItems.length) {
      for (const item of legacyItems) {
        const labeled = parseLabeledTestPointLine(item);
        results.push({
          system: cleanText(system),
          systemDesc: cleanText(systemDesc),
          featureModule: cleanText(featureModule),
          featureDesc: cleanText(featureDesc),
          testPoint: labeled.testPoint,
          testPointDesc: labeled.testPointDesc || cleanText(featureDesc),
        });
      }
      continue;
    }

    if (block.includes("功能描述") || block.includes("业务规则")) {
      results.push({
        system: cleanText(system),
        systemDesc: cleanText(systemDesc),
        featureModule: cleanText(featureModule),
        featureDesc: cleanText(featureDesc),
        testPoint: "业务规则验证",
        testPointDesc: cleanText(featureDesc),
      });
    }
  }

  return results;
}

function findSystemBefore(markdown: string, position: number) {
  const before = markdown.slice(0, position);
  const matches = [...before.matchAll(SYSTEM_HEADING_PATTERN)];
  if (!matches.length) {
    return "";
  }
  return cleanText(matches[matches.length - 1][1]);
}

function inferSystemFromModuleName(moduleName: string) {
  const match = moduleName.match(/^(.+?)(?:系统|平台)/);
  if (match?.[1] && match[1].length >= 2) {
    return cleanText(match[1]);
  }
  return DEFAULT_SYSTEM;
}

function extractLabeledParagraph(text: string, label: string) {
  const inline = text.match(
    new RegExp(`\\*\\*${label}\\*\\*[：:]\\s*([^\\n]+)`, "i"),
  );
  if (inline?.[1]) {
    return cleanText(inline[1]);
  }

  const index = text.indexOf(label);
  if (index === -1) {
    return "";
  }

  const paragraph = text
    .slice(index)
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .find(
      (line) =>
        line &&
        !line.startsWith("#") &&
        !/^[-*]/.test(line) &&
        !/^\d+\./.test(line),
    );

  return paragraph
    ? cleanText(paragraph.replace(/^\*\*[^*]+\*\*[：:]\s*/, ""))
    : "";
}

function extractNumberedTestPoints(text: string) {
  const section = extractSection(text, "测试要点") || text;
  const labeledItems = extractPlainTextTestPointDescriptions(section);
  if (labeledItems.length) {
    return labeledItems;
  }

  const results: Array<{ title: string; detail: string }> = [];

  const boldNumbered =
    /(?:^|\n)\s*\d+[.、．)]\s*\*\*([^*]+)\*\*([\s\S]*?)(?=\n\s*\d+[.、．)]\s*\*\*|$)/g;
  for (const match of section.matchAll(boldNumbered)) {
    const labelTitle = cleanText(match[1]);
    const title =
      labelTitle === TEST_POINT_DESC_LABEL
        ? cleanText(
            match[0].match(
              new RegExp(`${TEST_POINT_DESC_LABEL}(?:\\*\\*)?[：:]\\s*([^\\n]+)`),
            )?.[1] || "",
          )
        : labelTitle;
    if (!title || title === TEST_POINT_DESC_LABEL) {
      continue;
    }
    results.push({
      title,
      detail: buildTestPointDetail(match[2] || ""),
    });
  }
  if (results.length) {
    return results;
  }

  const plainNumbered =
    /(?:^|\n)\s*\d+[.、．)]\s*([^\n]+)([\s\S]*?)(?=\n\s*\d+[.、．)]\s*|$)/g;
  for (const match of section.matchAll(plainNumbered)) {
    const title = cleanText(match[1]);
    if (!title || /^[-*]/.test(title)) {
      continue;
    }
    results.push({
      title,
      detail: buildTestPointDetail(match[2] || ""),
    });
  }
  if (results.length) {
    return results;
  }

  const bulletBold = /(?:^|\n)\s*[-*]\s*\*\*([^*]+)\*\*([^\n]*)/g;
  for (const match of section.matchAll(bulletBold)) {
    const labelTitle = cleanText(match[1]);
    if (labelTitle === TEST_POINT_DESC_LABEL) {
      continue;
    }
    results.push({
      title: labelTitle,
      detail: cleanText(match[2] || ""),
    });
  }

  return results;
}

function buildTestPointDetail(body: string) {
  const verification =
    body.match(/\*\*验证点\*\*[：:]\s*([^\n]+)/)?.[1]?.trim() ||
    body.match(/验证点[：:]\s*([^\n]+)/)?.[1]?.trim() ||
    "";
  const method =
    body.match(/\*\*测试方法\*\*[：:]\s*([^\n]+)/)?.[1]?.trim() ||
    body.match(/测试方法[：:]\s*([^\n]+)/)?.[1]?.trim() ||
    "";

  const parts: string[] = [];
  if (verification) {
    parts.push(`验证点：${cleanText(verification)}`);
  }
  if (method) {
    parts.push(`测试方法：${cleanText(method)}`);
  }
  if (parts.length) {
    return parts.join(" ");
  }

  return cleanText(
    body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("-"))
      .map((line) => line.replace(/^[-*]\s*/, "").replace(/\*\*/g, ""))
      .join(" "),
  );
}

function extractSection(text: string, title: string) {
  const marker = text.search(
    new RegExp(`(?:^|\\n)(?:#{1,4}\\s*)?(?:\\*\\*)?${title}(?:\\*\\*)?[：:]?`, "i"),
  );
  if (marker === -1) {
    return "";
  }
  const start = text.lastIndexOf("\n", marker);
  const from = start === -1 ? marker : start;
  const rest = text.slice(from);
  const nextHeading = rest.slice(1).search(/\n#{2,5}\s+/);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1);
}

function extractListAfter(text: string, title: string) {
  const index = text.search(
    new RegExp(`(?:\\*\\*)?${title}(?:\\*\\*)?[：:]?`, "i"),
  );
  if (index === -1) {
    return [] as string[];
  }

  return text
    .slice(index)
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => /^[-*]|\d+[.、．)]/.test(line))
    .map((line) =>
      line
        .replace(/^[-*]\s*/, "")
        .replace(/^\d+[.、．)]\s*/, "")
        .replace(/\*\*/g, "")
        .trim(),
    )
    .filter(Boolean);
}

function extractParagraphAfter(text: string, title: string) {
  const index = text.indexOf(title);
  if (index === -1) {
    return "";
  }
  const paragraph = text
    .slice(index)
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !/^[-*]/.test(line));
  return paragraph || "";
}

function cleanText(value: string) {
  return value.replace(/\*\*/g, "").replace(/[：:]+$/g, "").trim();
}

/** 从「测试要点描述：xxx」或「**测试要点描述**：xxx」行提取真正的测试要点标题 */
function parseLabeledTestPointLine(line: string) {
  const normalized = cleanText(line);
  const numberedLabeled = normalized.match(
    /^\d+[.、．)]\s*测试要点描述[：:]\s*(.+)$/i,
  );
  if (numberedLabeled?.[1]) {
    return {
      testPoint: cleanText(numberedLabeled[1]),
      testPointDesc: "",
    };
  }

  const labeledMatch = normalized.match(/^测试要点描述[：:]\s*(.+)$/i);
  if (labeledMatch?.[1]) {
    return {
      testPoint: cleanText(labeledMatch[1]),
      testPointDesc: "",
    };
  }

  const [title, ...descParts] = normalized.split(/[：:]/);
  if (descParts.length && /^测试要点描述$/i.test(title.trim())) {
    return {
      testPoint: cleanText(descParts.join(":")),
      testPointDesc: "",
    };
  }

  return {
    testPoint: cleanText(descParts.length ? title : normalized),
    testPointDesc: cleanText(descParts.length ? descParts.join(":") : ""),
  };
}

function dedupeTestPoints(items: ParsedTestPoint[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.testPoint?.trim()) {
      return false;
    }
    const key = [
      item.system,
      item.featureModule,
      item.testPoint,
      item.testPointDesc,
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * 去除文档文件名中的扩展名（doc/docx/md）。
 */
export function stripDocumentExtension(name: string) {
  return name.replace(/\.(docx?|md)$/i, "").trim();
}

/**
 * 根据需求文档名生成结构化文档默认文件名。
 */
export function buildStructuredDocName(reqDocName?: string | null) {
  const baseName = stripDocumentExtension(reqDocName || "结构化需求文档");
  return `${baseName}-结构化文档.md`;
}

/**
 * 从结构化 Markdown 中提取需求编号。
 */
export function extractRequirementNo(markdown: string) {
  const normalized = normalizeStructuredMarkdown(markdown);
  return (
    normalized.match(/(?:\*\*)?需求编号(?:\*\*)?[：:]\s*([^\n]+)/)?.[1]?.trim() ||
    normalized.match(/\[([A-Z][A-Z0-9-]+)\]/)?.[1]?.trim() ||
    normalized.match(/^#\s*([A-Z0-9-]+)/m)?.[1]?.trim() ||
    undefined
  );
}
