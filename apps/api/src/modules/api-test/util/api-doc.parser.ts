import type { ApiEndpointPayload } from "@case-forge/shared";
import { randomUUID } from "node:crypto";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function normalizeMethod(method: string) {
  return method.trim().toUpperCase();
}

function normalizePath(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** 从 Markdown 表格或行内文本抽取接口端点 */
export function parseEndpointsFromText(text: string): ApiEndpointPayload[] {
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
