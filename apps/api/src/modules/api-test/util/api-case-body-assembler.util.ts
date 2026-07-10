import { minifyXml, prettyPrintXml } from "@case-forge/shared";
import { Logger } from "@nestjs/common";

const assemblerLogger = new Logger("ApiCaseBodyAssembler");

const DYNAMIC_HEADER_FIELDS = new Set([
  "msgId",
  "msgDate",
  "msgTime",
  "tranNbr",
]);

export interface AssembleBodyInput {
  exampleMessage: string;
  overrides: Record<string, string>;
  messageFormat: "json" | "xml" | "soap" | "text" | "other";
  refreshDynamicHeaders?: boolean;
}

export interface AssembleBodyResult {
  body: string;
  warnings: string[];
}

export function assembleBodyFromExample(
  input: AssembleBodyInput,
): AssembleBodyResult {
  const warnings: string[] = [];
  const normalized = normalizeOverrides(input.overrides, warnings);

  switch (input.messageFormat) {
    case "xml":
    case "soap":
      return assembleXmlBody(
        input.exampleMessage,
        normalized,
        warnings,
        input.refreshDynamicHeaders,
      );
    case "json":
      return assembleJsonBody(
        input.exampleMessage,
        normalized,
        warnings,
        input.refreshDynamicHeaders,
      );
    case "text":
    default:
      return assembleTextBody(input.exampleMessage, normalized, warnings);
  }
}

function normalizeOverrides(
  overrides: Record<string, string>,
  warnings: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(overrides)) {
    const normalizedKey = normalizeOverridePath(key);
    if (normalizedKey !== key) {
      warnings.push(`路径归一化: "${key}" → "${normalizedKey}"`);
    }
    result[normalizedKey] = value;
  }
  return result;
}

export function normalizeOverridePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (!trimmed.includes("/")) return trimmed;
  return trimmed
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/");
}

export function extractPathsFromExample(
  exampleMessage: string,
  messageFormat: "json" | "xml" | "soap" | "text" | "other",
): string[] {
  switch (messageFormat) {
    case "xml":
    case "soap":
      return extractXmlPaths(exampleMessage);
    case "json":
      return extractJsonPaths(exampleMessage);
    default:
      return [];
  }
}

function extractXmlPaths(xml: string): string[] {
  const paths: string[] = [];
  const stack: string[] = [];

  let pos = 0;
  while (pos < xml.length) {
    const openMatch = matchOpenTag(xml, pos);
    if (openMatch) {
      const { tag, selfClosing, end } = openMatch;
      if (!selfClosing) {
        stack.push(tag);
        paths.push(stack.join("/"));
      }
      pos = end;
      continue;
    }

    const closeMatch = matchCloseTag(xml, pos);
    if (closeMatch) {
      const { tag, end } = closeMatch;
      const top = stack[stack.length - 1];
      if (top === tag) {
        stack.pop();
      }
      pos = end;
      continue;
    }

    pos++;
  }

  return [...new Set(paths)];
}

function matchOpenTag(
  xml: string,
  pos: number,
): { tag: string; selfClosing: boolean; end: number } | null {
  if (xml[pos] !== "<") return null;
  if (xml[pos + 1] === "/" || xml[pos + 1] === "!") return null;

  const end = xml.indexOf(">", pos + 1);
  if (end === -1) return null;

  const inner = xml.slice(pos + 1, end);
  const selfClosing = inner.endsWith("/");
  const tagContent = selfClosing ? inner.slice(0, -1) : inner;
  const tag = tagContent.split(/\s+/)[0];

  if (!tag || tag.startsWith("?")) return null;

  return { tag, selfClosing, end: end + 1 };
}

function matchCloseTag(
  xml: string,
  pos: number,
): { tag: string; end: number } | null {
  if (xml[pos] !== "<" || xml[pos + 1] !== "/") return null;

  const end = xml.indexOf(">", pos + 2);
  if (end === -1) return null;

  const tag = xml.slice(pos + 2, end).trim();
  return { tag, end: end + 1 };
}

function extractJsonPaths(jsonStr: string): string[] {
  try {
    const obj = JSON.parse(jsonStr);
    const paths: string[] = [];
    collectJsonPaths(obj, [], paths);
    return paths;
  } catch {
    return [];
  }
}

function collectJsonPaths(
  obj: unknown,
  currentPath: string[],
  paths: string[],
): void {
  if (obj === null || typeof obj !== "object") {
    if (currentPath.length) paths.push(currentPath.join("/"));
    return;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectJsonPaths(item, currentPath, paths);
    }
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    const nextPath = [...currentPath, key];
    if (value === null || typeof value !== "object") {
      paths.push(nextPath.join("/"));
    } else {
      collectJsonPaths(value, nextPath, paths);
    }
  }
}

function assembleXmlBody(
  exampleXml: string,
  overrides: Record<string, string>,
  warnings: string[],
  refreshDynamicHeaders?: boolean,
): AssembleBodyResult {
  const isCompact = !exampleXml.includes("\n");
  let result = exampleXml;

  for (const [path, value] of Object.entries(overrides)) {
    const segments = path.split("/").filter(Boolean);
    if (!segments.length) continue;

    const lastTag = segments[segments.length - 1];
    const replaced = replaceXmlFieldValue(result, lastTag, value);

    if (replaced.changed) {
      result = replaced.xml;
    } else {
      warnings.push(`路径 "${path}" 在示例报文中未找到对应节点，已跳过`);
    }
  }

  if (refreshDynamicHeaders) {
    result = refreshXmlDynamicHeaders(result);
  }

  const body = isCompact ? minifyXml(result) : prettyPrintXml(result);
  return { body, warnings };
}

function replaceXmlFieldValue(
  xml: string,
  tag: string,
  value: string,
): { xml: string; changed: boolean } {
  const escaped = escapeXmlValue(value);
  let changed = false;

  let result = xml.replace(new RegExp(`<${tag}>([^<]*)</${tag}>`, "g"), () => {
    changed = true;
    return `<${tag}>${escaped}</${tag}>`;
  });

  result = result.replace(new RegExp(`<${tag}/>`, "g"), () => {
    changed = true;
    return `<${tag}>${escaped}</${tag}>`;
  });

  result = result.replace(new RegExp(`<${tag}\\s*/>`, "g"), () => {
    changed = true;
    return `<${tag}>${escaped}</${tag}>`;
  });

  return { xml: result, changed };
}

function refreshXmlDynamicHeaders(xml: string): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replaceAll("-", "");
  const timeStr = now.toTimeString().slice(0, 8).replaceAll(":", "");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  const traceId = `000${dateStr}${timeStr}${ms}0000001`;

  let result = xml;
  result = replaceXmlFieldValue(result, "msgId", traceId).xml;
  result = replaceXmlFieldValue(result, "msgDate", dateStr).xml;
  result = replaceXmlFieldValue(
    result,
    "msgTime",
    `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}.${ms}`,
  ).xml;
  result = replaceXmlFieldValue(result, "tranNbr", traceId).xml;

  return result;
}

function assembleJsonBody(
  exampleJson: string,
  overrides: Record<string, string>,
  warnings: string[],
  refreshDynamicHeaders?: boolean,
): AssembleBodyResult {
  try {
    const obj = JSON.parse(exampleJson);

    for (const [path, value] of Object.entries(overrides)) {
      const segments = path.split("/").filter(Boolean);
      const found = setJsonValueByPath(obj, segments, value);
      if (!found) {
        const lastSegment = segments[segments.length - 1] || path;
        const fallbackFound = setJsonValueByLastSegment(
          obj,
          lastSegment,
          value,
        );
        if (fallbackFound) {
          warnings.push(
            `路径 "${path}" 全路径未命中，按末段名 "${lastSegment}" 回退匹配`,
          );
        } else {
          warnings.push(`路径 "${path}" 在示例报文中未找到对应节点，已跳过`);
        }
      }
    }

    if (refreshDynamicHeaders) {
      refreshJsonDynamicHeaders(obj);
    }

    const body = JSON.stringify(obj, null, 2);
    return { body, warnings };
  } catch (e) {
    assemblerLogger.warn(`JSON 示例报文解析失败: ${(e as Error).message}`);
    return {
      body: exampleJson,
      warnings: ["示例报文 JSON 解析失败，原样返回"],
    };
  }
}

function setJsonValueByPath(
  obj: unknown,
  segments: string[],
  value: string,
): boolean {
  let current: unknown = obj;

  for (let i = 0; i < segments.length - 1; i++) {
    if (current === null || typeof current !== "object") return false;
    const next = (current as Record<string, unknown>)[segments[i]];
    if (next === undefined) return false;
    current = next;
  }

  if (current === null || typeof current !== "object") return false;
  const lastKey = segments[segments.length - 1];
  const record = current as Record<string, unknown>;
  if (record[lastKey] === undefined) return false;

  record[lastKey] = value;
  return true;
}

function setJsonValueByLastSegment(
  obj: unknown,
  lastSegment: string,
  value: string,
): boolean {
  if (obj === null || typeof obj !== "object") return false;

  const record = obj as Record<string, unknown>;
  if (record[lastSegment] !== undefined) {
    record[lastSegment] = value;
    return true;
  }

  for (const key of Object.keys(record)) {
    if (typeof record[key] === "object" && record[key] !== null) {
      if (setJsonValueByLastSegment(record[key], lastSegment, value)) {
        return true;
      }
    }
  }
  return false;
}

function refreshJsonDynamicHeaders(obj: unknown): void {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replaceAll("-", "");
  const timeStr = now.toTimeString().slice(0, 8).replaceAll(":", "");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  const traceId = `000${dateStr}${timeStr}${ms}0000001`;

  setJsonValueByPath(
    obj,
    ["Transaction", "Header", "sysHeader", "msgId"],
    traceId,
  );
  setJsonValueByPath(
    obj,
    ["Transaction", "Header", "sysHeader", "msgDate"],
    dateStr,
  );
  setJsonValueByPath(
    obj,
    ["Transaction", "Header", "sysHeader", "msgTime"],
    `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}.${ms}`,
  );
  setJsonValueByPath(
    obj,
    ["Transaction", "Body", "request", "bizHeader", "tranNbr"],
    traceId,
  );
}

function assembleTextBody(
  exampleText: string,
  overrides: Record<string, string>,
  warnings: string[],
): AssembleBodyResult {
  let result = exampleText;

  for (const [path, value] of Object.entries(overrides)) {
    const lastSegment = path.split("/").pop() || path;
    const escaped = escapeXmlValue(value);

    const replaced = result.replace(
      new RegExp(`${lastSegment}=([^&\\n]*)`, "g"),
      `${lastSegment}=${escaped}`,
    );

    if (replaced !== result) {
      result = replaced;
    } else {
      warnings.push(`路径 "${path}" 在示例报文中未找到对应字段，已跳过`);
    }
  }

  return { body: result, warnings };
}

function escapeXmlValue(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export { DYNAMIC_HEADER_FIELDS };
