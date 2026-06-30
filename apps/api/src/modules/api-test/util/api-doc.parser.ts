import type { ApiEndpointPayload } from "@case-forge/shared";
import { randomUUID } from "node:crypto";
import {
  API_DOC_SECTION_SEPARATOR,
  API_DOC_SHEET_NAMES,
} from "./api-doc-format.const";

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

function normalizeMethod(method: string) {
  return method.trim().toUpperCase();
}

function normalizePath(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function isApiDocSectionFormat(text: string) {
  return API_DOC_SHEET_NAMES.some(
    (section) =>
      text.includes(`${section}\n${API_DOC_SECTION_SEPARATOR}`) ||
      text.includes(`${section}\r\n${API_DOC_SECTION_SEPARATOR}`),
  );
}

export function extractApiDocSection(text: string, sectionName: string) {
  const sectionPattern = API_DOC_SHEET_NAMES.map((name) =>
    name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|");
  const pattern = new RegExp(
    `${sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\r?\\n${API_DOC_SECTION_SEPARATOR}\\r?\\n([\\s\\S]*?)(?=\\r?\\n(?:${sectionPattern})\\r?\\n${API_DOC_SECTION_SEPARATOR}|$)`,
  );
  return pattern.exec(text)?.[1]?.trim() ?? "";
}

export function getApiDocFieldValue(sectionText: string, fieldName: string) {
  for (const line of sectionText.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells[0] === fieldName) {
      return cells[1] ?? "";
    }
  }
  return "";
}

/** 从「技术信息」读取通讯方式（避免与 profile 模块循环依赖） */
export function resolveDocTransport(text: string) {
  const section = extractApiDocSection(text, "技术信息");
  const value = getApiDocFieldValue(section, "通讯方式").trim().toUpperCase();
  if (value.includes("TCP")) return "tcp" as const;
  if (value.includes("HTTP")) return "http" as const;
  if (value.includes("TUXEDO")) return "tuxedo" as const;
  if (value) return "other" as const;
  return "http" as const;
}

/** 从标准接口文档 Excel 结构化文本抽取端点 */
export function parseEndpointsFromApiDocSections(
  text: string,
): ApiEndpointPayload[] {
  const basic = extractApiDocSection(text, "基础信息");
  const service = extractApiDocSection(text, "服务信息");
  const request = extractApiDocSection(text, "请求报文");
  const response = extractApiDocSection(text, "响应报文");

  const code = getApiDocFieldValue(basic, "原服务交易码");
  const name =
    getApiDocFieldValue(basic, "服务名称(中)") ||
    getApiDocFieldValue(basic, "服务名称") ||
    code;
  const serviceUrl = getApiDocFieldValue(basic, "服务URL").trim();

  if (!code && !serviceUrl) {
    return [];
  }

  const transport = resolveDocTransport(text);
  let method: string;
  let path: string;

  if (transport === "tcp") {
    method = "TCP";
    path = serviceUrl || code || "/";
  } else {
    method = "POST";
    path = code ? `/${code}` : "/";
    if (serviceUrl) {
      try {
        const url = /^https?:\/\//i.test(serviceUrl)
          ? serviceUrl
          : `http://${serviceUrl}`;
        path = new URL(url).pathname || path;
      } catch {
        path = normalizePath(serviceUrl);
      }
    }
  }

  return [
    {
      name: name || code,
      method,
      path: transport === "tcp" ? path : normalizePath(path),
      summary: getApiDocFieldValue(service, "功能描述"),
      requestNotes: request,
      responseNotes: response,
      tags: code ? [code] : undefined,
    },
  ];
}

/** 从 Markdown 表格或行内文本抽取接口端点 */
export function parseEndpointsFromText(text: string): ApiEndpointPayload[] {
  if (isApiDocSectionFormat(text)) {
    const endpoints = parseEndpointsFromApiDocSections(text);
    if (endpoints.length) {
      return endpoints;
    }
  }

  const endpoints: ApiEndpointPayload[] = [];
  const seen = new Set<string>();

  const linePattern =
    /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b\s+([/\w{}.-]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = linePattern.exec(text)) !== null) {
    const method = normalizeMethod(match[1]);
    const path = normalizePath(match[2]);
    const key = `${method} ${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    endpoints.push({
      name: `${method} ${path}`,
      method,
      path,
      summary: "",
    });
  }

  const rows = text.split("\n");
  for (const row of rows) {
    if (!row.includes("|")) continue;
    const cells = row
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (cells.length < 3) continue;
    const methodCell = cells.find((cell) =>
      HTTP_METHODS.includes(normalizeMethod(cell)),
    );
    if (!methodCell) continue;
    const method = normalizeMethod(methodCell);
    const pathCell = cells.find((cell) => cell.startsWith("/"));
    if (!pathCell) continue;
    const path = normalizePath(pathCell);
    const key = `${method} ${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const nameCell =
      cells.find(
        (cell) =>
          cell !== methodCell &&
          cell !== pathCell &&
          !HTTP_METHODS.includes(normalizeMethod(cell)),
      ) ?? `${method} ${path}`;
    endpoints.push({
      name: nameCell,
      method,
      path,
      summary: cells.join(" | "),
    });
  }

  return endpoints;
}

export function buildStructuredMarkdownFromEndpoints(
  endpoints: ApiEndpointPayload[],
  title = "接口测试文档",
) {
  const lines = [
    `# ${title}`,
    "",
    "## 接口清单",
    "",
    "| 接口名称 | 方法 | 路径 | 说明 |",
    "| --- | --- | --- | --- |",
  ];
  for (const endpoint of endpoints) {
    lines.push(
      `| ${endpoint.name} | ${endpoint.method} | ${endpoint.path} | ${endpoint.summary ?? ""} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

/** 压缩后文档的默认字符预算，留出余量给技能模板、协议规则与场景约束。 */
export const DEFAULT_COMPRESSED_DOC_MAX_CHARS = 4000;

/** 报文表中需要保留的关键列（按表头关键字匹配，其余列裁剪以缩短文档）。 */
const MESSAGE_TABLE_KEEP_KEYWORDS = [
  "节点路径",
  "节点代码",
  "节点名称",
  "字段",
  "中文",
  "英文",
  "类型",
  "长度",
  "必填",
  "必输",
  "是否",
  "说明",
  "描述",
  "取值",
  "枚举",
];

/** 这些列内容通常较长，超过阈值时截断。 */
const MESSAGE_TABLE_TRUNCATE_KEYWORDS = [
  "说明",
  "描述",
  "备注",
  "取值",
  "枚举",
];
const MESSAGE_TABLE_MAX_CELL_LENGTH = 40;

/**
 * 压缩接口结构化文档，用于缩减 API 案例生成 AI 提示词长度。
 *
 * 保留对生成案例最有价值的部分：基础信息、服务信息、技术信息、请求/响应报文。
 * 在固定分区（基础/服务/技术信息）之外，对请求/响应报文按字符预算压缩：
 * 1. 列裁剪：仅保留与字段定义相关的关键列（节点路径/代码、类型、长度、必填、说明等）；
 * 2. 说明截断：超长说明/取值列截断到固定长度；
 * 3. 动态行数：必填字段优先保留，选填字段按剩余字符预算补齐。
 */
export function compressApiStructuredDoc(
  structuredDoc: string,
  maxRowsPerTable = 60,
  maxChars = DEFAULT_COMPRESSED_DOC_MAX_CHARS,
): string {
  if (!structuredDoc?.trim()) {
    return "";
  }

  const fixedSections: string[] = [];
  for (const name of ["基础信息", "服务信息", "技术信息"] as const) {
    const text = extractApiDocSection(structuredDoc, name);
    if (text.trim()) {
      fixedSections.push(`${name}\n${API_DOC_SECTION_SEPARATOR}\n${text}`);
    }
  }
  const fixedText = fixedSections.join("\n\n");

  // 报文表可用的字符预算（请求报文权重更高，因为它决定 requestBody 生成）。
  const tableBudget = Math.max(0, maxChars - fixedText.length - 200);
  const requestBudget = Math.round(tableBudget * 0.6);
  const responseBudget = tableBudget - requestBudget;

  const tableSections: string[] = [];
  const requestText = extractApiDocSection(structuredDoc, "请求报文");
  if (requestText.trim()) {
    tableSections.push(
      `请求报文\n${API_DOC_SECTION_SEPARATOR}\n${compressApiDocTable(
        requestText,
        maxRowsPerTable,
        requestBudget,
      )}`,
    );
  }
  const responseText = extractApiDocSection(structuredDoc, "响应报文");
  if (responseText.trim()) {
    tableSections.push(
      `响应报文\n${API_DOC_SECTION_SEPARATOR}\n${compressApiDocTable(
        responseText,
        maxRowsPerTable,
        responseBudget,
      )}`,
    );
  }

  const compressed = [fixedText, ...tableSections].filter(Boolean).join("\n\n");

  // 兜底：极端情况下（必填字段极多）按硬上限截断，确保不突破 AI 长度限制。
  if (compressed.length > maxChars) {
    return `${compressed.slice(0, maxChars)}\n> 提示：文档超出长度预算，已截断，请结合接口文档核对完整字段。`;
  }
  return compressed;
}

function splitTableRow(line: string): string[] {
  return line.split("|").map((cell) => cell.trim());
}

function isRequiredFieldCells(cells: string[]): boolean {
  return cells.some((cell) => cell === "Y" || cell === "是");
}

function compressApiDocTable(
  tableText: string,
  maxRows: number,
  maxChars?: number,
): string {
  const rawLines = tableText.split("\n");
  const headerIndex = rawLines.findIndex((line) => line.includes("|"));
  if (headerIndex < 0) {
    return tableText;
  }

  const separatorIndex = rawLines.findIndex(
    (line, index) => index > headerIndex && /^\s*\|[-:\s|]*\|\s*$/.test(line),
  );
  const dataStart = separatorIndex >= 0 ? separatorIndex + 1 : headerIndex + 1;
  const preLines = rawLines.slice(0, headerIndex);

  // 1. 列裁剪：仅保留命中关键字的列；若无命中则保留全部列。
  const headerCells = splitTableRow(rawLines[headerIndex]);
  let keepIndices = headerCells
    .map((cell, idx) => ({ cell, idx }))
    .filter(({ cell }) =>
      MESSAGE_TABLE_KEEP_KEYWORDS.some((kw) => cell.includes(kw)),
    )
    .map(({ idx }) => idx);
  if (!keepIndices.length) {
    keepIndices = headerCells.map((_, idx) => idx);
  }
  const truncateIndices = new Set(
    keepIndices.filter((idx) =>
      MESSAGE_TABLE_TRUNCATE_KEYWORDS.some((kw) =>
        headerCells[idx]?.includes(kw),
      ),
    ),
  );

  const projectRow = (cells: string[]) =>
    `| ${keepIndices
      .map((idx) => {
        let value = cells[idx] ?? "";
        if (
          truncateIndices.has(idx) &&
          value.length > MESSAGE_TABLE_MAX_CELL_LENGTH
        ) {
          value = `${value.slice(0, MESSAGE_TABLE_MAX_CELL_LENGTH)}…`;
        }
        return value;
      })
      .join(" | ")} |`;

  const header = projectRow(headerCells);
  const separator = `| ${keepIndices.map(() => "---").join(" | ")} |`;

  const dataRows = rawLines
    .slice(dataStart)
    .filter((line) => line.includes("|"))
    .map((line) => splitTableRow(line));

  const requiredRows = dataRows
    .filter((cells) => isRequiredFieldCells(cells))
    .map(projectRow);
  const optionalRows = dataRows
    .filter((cells) => !isRequiredFieldCells(cells))
    .map(projectRow);

  // 2. 行数上限。
  const remainingSlots = Math.max(0, maxRows - requiredRows.length);
  let keptOptional = optionalRows.slice(0, remainingSlots);

  // 3. 字符预算：必填字段优先，选填字段在预算内逐行补齐。
  if (typeof maxChars === "number") {
    const baseLen = [...preLines, header, separator, ...requiredRows].join(
      "\n",
    ).length;
    let budget = maxChars - baseLen;
    const fitted: string[] = [];
    for (const row of keptOptional) {
      if (budget - (row.length + 1) < 0) {
        break;
      }
      fitted.push(row);
      budget -= row.length + 1;
    }
    keptOptional = fitted;
  }

  const result = [
    ...preLines,
    header,
    separator,
    ...requiredRows,
    ...keptOptional,
  ];
  const totalKept = requiredRows.length + keptOptional.length;
  if (dataRows.length > totalKept) {
    const dropped = dataRows.length - totalKept;
    result.push(
      "",
      `> 提示：报文字段共 ${dataRows.length} 行，已保留全部必填字段（${requiredRows.length} 行）及前 ${keptOptional.length} 行选填字段，省略 ${dropped} 行。`,
    );
  }
  return result.join("\n");
}

export function ensureEndpointIds(endpoints: ApiEndpointPayload[]) {
  return endpoints.map((endpoint, index) => ({
    ...endpoint,
    id: endpoint.id ?? randomUUID(),
    method: normalizeMethod(endpoint.method),
    path:
      normalizeMethod(endpoint.method) === "TCP"
        ? endpoint.path.trim()
        : normalizePath(endpoint.path),
    sortOrder: index,
  }));
}
