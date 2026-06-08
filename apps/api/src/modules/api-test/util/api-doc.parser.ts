import type { ApiEndpointPayload } from "@case-forge/shared";
import { randomUUID } from "node:crypto";
import {
  API_DOC_SECTION_SEPARATOR,
  API_DOC_SHEET_NAMES,
} from "./api-doc-format.const";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

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

  let path = code ? `/${code}` : "/";
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

  if (!code && !serviceUrl) {
    return [];
  }

  const method = "POST";

  return [
    {
      name: name || code,
      method,
      path: normalizePath(path),
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

export function ensureEndpointIds(endpoints: ApiEndpointPayload[]) {
  return endpoints.map((endpoint, index) => ({
    ...endpoint,
    id: endpoint.id ?? randomUUID(),
    method: normalizeMethod(endpoint.method),
    path: normalizePath(endpoint.path),
    sortOrder: index,
  }));
}
