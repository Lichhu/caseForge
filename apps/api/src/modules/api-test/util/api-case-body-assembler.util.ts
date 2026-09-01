import { minifyXml, prettyPrintXml } from "@case-forge/shared";
import { Logger } from "@nestjs/common";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

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
  createMissingPaths?: boolean;
}

export interface AssembleBodyResult {
  body: string;
  warnings: string[];
}

function detectExampleFormat(text: string): "json" | "xml" | "text" {
  const trimmed = text.trim();
  if (!trimmed) return "text";
  if (trimmed.startsWith("<") || trimmed.includes("<?xml")) return "xml";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  return "text";
}

export function assembleBodyFromExample(
  input: AssembleBodyInput,
): AssembleBodyResult {
  const warnings: string[] = [];
  const normalized = normalizeOverrides(input.overrides, warnings);
  const exampleFormat = detectExampleFormat(input.exampleMessage);
  const outputFormat = input.messageFormat;

  if (
    exampleFormat === outputFormat ||
    (exampleFormat === "xml" &&
      (outputFormat === "xml" || outputFormat === "soap"))
  ) {
    switch (outputFormat) {
      case "xml":
      case "soap":
        return assembleXmlBody(
          input.exampleMessage,
          normalized,
          warnings,
          input.refreshDynamicHeaders,
          input.createMissingPaths,
        );
      case "json":
        return assembleJsonBody(
          input.exampleMessage,
          normalized,
          warnings,
          input.refreshDynamicHeaders,
          input.createMissingPaths,
        );
      case "text":
      default:
        return assembleTextBody(
          input.exampleMessage,
          normalized,
          warnings,
          input.createMissingPaths,
        );
    }
  }

  const obj = parseExampleToObject(
    input.exampleMessage,
    exampleFormat,
    warnings,
  );
  if (obj === null) {
    return { body: input.exampleMessage, warnings };
  }

  for (const [path, value] of Object.entries(normalized)) {
    const segments = path.split("/").filter(Boolean);
    const found = setJsonValueByPath(
      obj,
      segments,
      value,
      input.createMissingPaths,
    );
    if (!found) {
      const lastSegment = segments[segments.length - 1] || path;
      const fallbackFound = setJsonValueByLastSegment(obj, lastSegment, value);
      if (fallbackFound) {
        warnings.push(
          `路径 "${path}" 全路径未命中，按末段名 "${lastSegment}" 回退匹配`,
        );
      } else if (input.createMissingPaths) {
        warnings.push(`路径 "${path}" 无法在示例结构中创建，已跳过`);
      } else {
        warnings.push(`路径 "${path}" 在示例报文中未找到对应节点，已跳过`);
      }
    }
  }

  if (input.refreshDynamicHeaders) {
    refreshJsonDynamicHeaders(obj);
  }

  switch (outputFormat) {
    case "json":
      return { body: JSON.stringify(obj, null, 2), warnings };
    case "xml":
    case "soap": {
      const xml = objectToXml(obj);
      return { body: prettyPrintXml(xml), warnings };
    }
    case "text":
    default: {
      const lines: string[] = [];
      flattenObjectToTextLines(obj, [], lines);
      return { body: lines.join("\n"), warnings };
    }
  }
}

function parseExampleToObject(
  example: string,
  format: "json" | "xml" | "text",
  warnings: string[],
): Record<string, unknown> | null {
  if (format === "json") {
    try {
      return JSON.parse(example);
    } catch (e) {
      assemblerLogger.warn(`JSON 示例报文解析失败: ${(e as Error).message}`);
      warnings.push("示例报文 JSON 解析失败");
      return null;
    }
  }
  if (format === "xml") {
    const parsed = parseXmlToObject(example);
    if (parsed === null) {
      warnings.push("示例报文 XML 解析失败");
    }
    return parsed;
  }
  const result: Record<string, string> = {};
  for (const line of example.split(/\n/)) {
    const idx = line.indexOf("=");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key) result[key] = value;
    }
  }
  return result;
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
  createMissingPaths?: boolean,
): AssembleBodyResult {
  const isCompact = !exampleXml.includes("\n");
  let result = exampleXml;

  for (const [path, value] of Object.entries(overrides)) {
    const segments = path.split("/").filter(Boolean);
    if (!segments.length) continue;

    const lastTag = segments[segments.length - 1];
    let replaced = replaceXmlFieldValueByPath(result, segments, value);

    if (!replaced.changed && countXmlTags(result, lastTag) === 1) {
      replaced = replaceXmlFieldValue(result, lastTag, value);
      if (replaced.changed) {
        warnings.push(
          `路径 "${path}" 全路径未命中，按唯一节点 "${lastTag}" 回退匹配`,
        );
      }
    }

    if (replaced.changed) {
      result = replaced.xml;
    } else if (createMissingPaths) {
      const created = createXmlPath(result, segments, value);
      result = created.xml;
      if (!created.changed) warnings.push(`路径 "${path}" 无法创建`);
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

function replaceXmlFieldValueByPath(
  xml: string,
  segments: string[],
  value: string,
): { xml: string; changed: boolean } {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  type XmlElement = NonNullable<typeof document.documentElement>;
  let current: XmlElement | undefined = document.documentElement ?? undefined;
  let index =
    current?.tagName.toLowerCase() === segments[0]?.toLowerCase() ? 1 : 0;

  for (; current && index < segments.length; index++) {
    const name = segments[index].toLowerCase();
    current = Array.from(current.childNodes).find(
      (node) =>
        node.nodeType === 1 &&
        (node as XmlElement).tagName.toLowerCase() === name,
    ) as XmlElement | undefined;
  }

  if (
    !current ||
    index !== segments.length ||
    isDataFunctionExpression(current.textContent)
  ) {
    return { xml, changed: false };
  }
  current.textContent = value;
  return {
    xml: new XMLSerializer().serializeToString(document),
    changed: true,
  };
}

function countXmlTags(xml: string, tag: string): number {
  return (
    xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?(?:>|/>)`, "gi"))?.length ?? 0
  );
}

function createXmlPath(xml: string, segments: string[], value: string) {
  const parentSegments = segments.slice(0, -1);
  let parentIndex = parentSegments.length - 1;
  while (
    parentIndex >= 0 &&
    !new RegExp(`<${parentSegments[parentIndex]}(?:\\s[^>]*)?>`, "i").test(xml)
  ) {
    parentIndex -= 1;
  }
  if (parentIndex < 0) return { xml, changed: false };
  const parent = parentSegments[parentIndex];
  const missing = segments.slice(parentIndex + 1).map((segment) => segment.toLowerCase());
  const escaped = escapeXmlValue(value);
  const nested = missing.reduceRight(
    (content, tag, index) =>
      index === missing.length - 1
        ? `<${tag}>${escaped}</${tag}>`
        : `<${tag}>${content}</${tag}>`,
    "",
  );
  const closeMatch = new RegExp(`</${parent}>`, "i").exec(xml);
  if (!closeMatch) return { xml, changed: false };
  const closeIndex = closeMatch.index;
  return {
    xml: `${xml.slice(0, closeIndex)}${nested}${xml.slice(closeIndex)}`,
    changed: true,
  };
}

function replaceXmlFieldValue(
  xml: string,
  tag: string,
  value: string,
): { xml: string; changed: boolean } {
  const escaped = escapeXmlValue(value);
  let changed = false;

  let result = xml.replace(
    new RegExp(`<${tag}>([^<]*)</${tag}>`, "g"),
    (match, current) => {
      if (isDataFunctionExpression(current)) return match;
      changed = true;
      return `<${tag}>${escaped}</${tag}>`;
    },
  );

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
  createMissingPaths?: boolean,
): AssembleBodyResult {
  try {
    const obj = JSON.parse(exampleJson);

    for (const [path, value] of Object.entries(overrides)) {
      const segments = path.split("/").filter(Boolean);
      const found = setJsonValueByPath(
        obj,
        segments,
        value,
        createMissingPaths,
      );
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
  createMissing = false,
): boolean {
  return applyJsonValueBySegments(obj, segments, value, createMissing, false);
}

/**
 * 按路径段递归应用覆盖；途中遇到对象数组时对每个数组元素分别应用。
 * 数组内字段的空字符串覆盖表示「字段缺失」：从所有数组元素中删除该字段；
 * 非空值则写入所有数组元素。
 */
function applyJsonValueBySegments(
  node: unknown,
  segments: string[],
  value: string,
  createMissing: boolean,
  insideArray: boolean,
): boolean {
  if (!segments.length) return false;
  if (Array.isArray(node)) {
    let changed = false;
    for (const item of node) {
      if (applyJsonValueBySegments(item, segments, value, createMissing, true)) {
        changed = true;
      }
    }
    return changed;
  }
  if (node === null || typeof node !== "object") return false;

  const record = node as Record<string, unknown>;
  const requestedKey = segments[0];
  const key =
    Object.keys(record).find(
      (existing) => existing.toLowerCase() === requestedKey.toLowerCase(),
    ) ?? requestedKey;

  if (!(key in record)) {
    // 字段目录路径可能跳过数组节点（目录写 .../data/deviceModelName，
    // 示例实为 .../data/terminalList[].deviceModelName）：
    // 此时下探到元素含该段的数组子节点，对每个数组元素应用。
    const arrayChild = Object.values(record).find(
      (child) =>
        Array.isArray(child) &&
        child.some(
          (item) =>
            item !== null &&
            typeof item === "object" &&
            !Array.isArray(item) &&
            Object.keys(item).some(
              (itemKey) => itemKey.toLowerCase() === requestedKey.toLowerCase(),
            ),
        ),
    );
    if (arrayChild) {
      return applyJsonValueBySegments(
        arrayChild,
        segments,
        value,
        createMissing,
        true,
      );
    }
  }

  if (segments.length === 1) {
    if (value === "" && insideArray) {
      if (isDataFunctionExpression(record[key])) return true;
      if (key in record) delete record[key];
      return true;
    }
    if (record[key] === undefined && !createMissing) return false;
    if (isDataFunctionExpression(record[key])) return true;
    record[key] = value;
    return true;
  }

  let next = record[key];
  if (next === undefined && createMissing) {
    next = {};
    record[key] = next;
  }
  if (next === undefined) return false;
  return applyJsonValueBySegments(
    next,
    segments.slice(1),
    value,
    createMissing,
    insideArray,
  );
}

function setJsonValueByLastSegment(
  obj: unknown,
  lastSegment: string,
  value: string,
  insideArray = false,
): boolean {
  if (obj === null || typeof obj !== "object") return false;
  if (Array.isArray(obj)) {
    let changed = false;
    for (const item of obj) {
      if (setJsonValueByLastSegment(item, lastSegment, value, true)) {
        changed = true;
      }
    }
    return changed;
  }

  const record = obj as Record<string, unknown>;
  const existingKey = Object.keys(record).find(
    (key) => key.toLowerCase() === lastSegment.toLowerCase(),
  );
  if (existingKey !== undefined) {
    if (isDataFunctionExpression(record[existingKey])) return true;
    if (value === "" && insideArray) {
      delete record[existingKey];
    } else {
      record[existingKey] = value;
    }
    return true;
  }

  for (const key of Object.keys(record)) {
    const child = record[key];
    if (typeof child === "object" && child !== null) {
      if (
        setJsonValueByLastSegment(
          child,
          lastSegment,
          value,
          Array.isArray(child),
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function isDataFunctionExpression(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /\$\{[A-Z][A-Z0-9_-]*\([^{}]*\)(?:\.[A-Za-z_][\w]*)?\}/.test(value)
  );
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
  createMissingPaths?: boolean,
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
    } else if (createMissingPaths) {
      const separator = result.endsWith("\n") || !result ? "" : "\n";
      result += `${separator}${lastSegment}=${escaped}`;
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

function parseXmlToObject(xml: string): Record<string, unknown> | null {
  const tokens = xml.match(/<\?xml[^?]*\?>|<[^>]+>|[^<]+/g) || [];
  let i = 0;

  function parseElement(): Record<string, unknown> | string | null {
    while (i < tokens.length) {
      const token = tokens[i].trim();
      if (!token || token.startsWith("<?xml")) {
        i++;
        continue;
      }
      if (token.startsWith("</")) {
        i++;
        return null;
      }
      if (token.startsWith("<")) {
        const match = token.match(/^<([a-zA-Z_:][\w:.-]*)([^>]*)\/??>/);
        if (!match) {
          i++;
          continue;
        }
        const tag = match[1];
        const selfClosing = token.endsWith("/>");
        i++;
        if (selfClosing) {
          return { [tag]: "" };
        }
        const children: Record<string, unknown> = {};
        let hasChildren = false;
        let textContent = "";
        while (i < tokens.length) {
          const peek = tokens[i].trim();
          if (peek.startsWith(`</${tag}>`)) {
            i++;
            break;
          }
          if (peek.startsWith("<")) {
            const child = parseElement();
            if (child !== null) {
              if (typeof child === "string") {
                textContent = child;
              } else {
                for (const [k, v] of Object.entries(child)) {
                  if (k in children) {
                    const existing = children[k];
                    if (Array.isArray(existing)) {
                      existing.push(v);
                    } else {
                      children[k] = [existing, v];
                    }
                  } else {
                    children[k] = v;
                  }
                }
                hasChildren = true;
              }
            }
          } else {
            textContent = peek;
            i++;
          }
        }
        if (hasChildren) {
          return { [tag]: children };
        }
        return { [tag]: textContent };
      }
      i++;
    }
    return null;
  }

  const result = parseElement();
  if (result === null || typeof result === "string") return null;
  return result;
}

function objectToXml(obj: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (obj === null || obj === undefined) return "";
  if (typeof obj !== "object") return String(obj);
  if (Array.isArray(obj)) {
    return obj.map((item) => objectToXml(item, indent)).join("");
  }
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      lines.push(`${pad}<${key}></${key}>`);
    } else if (typeof value === "object") {
      if (Array.isArray(value)) {
        for (const item of value) {
          lines.push(`${pad}<${key}>`);
          lines.push(objectToXml(item, indent + 1));
          lines.push(`${pad}</${key}>`);
        }
      } else {
        lines.push(`${pad}<${key}>`);
        lines.push(objectToXml(value, indent + 1));
        lines.push(`${pad}</${key}>`);
      }
    } else {
      const escaped = escapeXmlValue(String(value));
      lines.push(`${pad}<${key}>${escaped}</${key}>`);
    }
  }
  return lines.join("\n");
}

function flattenObjectToTextLines(
  obj: unknown,
  prefix: string[],
  lines: string[],
): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj !== "object") {
    if (prefix.length) {
      lines.push(`${prefix.join("/")}=${obj}`);
    }
    return;
  }
  if (Array.isArray(obj)) {
    for (let idx = 0; idx < obj.length; idx++) {
      flattenObjectToTextLines(obj[idx], [...prefix, `[${idx}]`], lines);
    }
    return;
  }
  for (const [key, value] of Object.entries(obj)) {
    const path = [...prefix, key];
    if (value === null || typeof value !== "object") {
      lines.push(`${path.join("/")}=${value ?? ""}`);
    } else {
      flattenObjectToTextLines(value, path, lines);
    }
  }
}

export { DYNAMIC_HEADER_FIELDS };
