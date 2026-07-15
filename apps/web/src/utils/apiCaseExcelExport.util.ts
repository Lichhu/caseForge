import type { ApiTestCaseRow } from "@/api/apiTestClient";
import * as XLSX from "xlsx";

const EXPORT_BASE_HEADERS = ["序号", "属性", "描述", "启用状态"] as const;
const REMARK_HEADER = "备注";

function looksLikeXml(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^<\?xml\s/.test(trimmed) ||
    /^<[a-zA-Z_][\w.-]*(?:\s+[^>]*)?>/.test(trimmed)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function flattenObject(value: unknown, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  if (value === null || value === undefined) {
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const arrayPrefix = prefix ? `${prefix}[${index}]` : `[${index}]`;
      Object.assign(result, flattenObject(item, arrayPrefix));
    });
    return result;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      Object.assign(result, flattenObject(child, path));
    }
    return result;
  }
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    if (prefix) {
      result[prefix] = String(value);
    }
    return result;
  }
  if (prefix) {
    result[prefix] = String(value);
  }
  return result;
}

function parseXmlString(xmlString: string): unknown {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");
    const errorNode = doc.querySelector("parsererror");
    if (errorNode) {
      return xmlString;
    }
    const root = doc.documentElement;
    if (!root) {
      return xmlString;
    }

    function nodeToObject(node: Node): unknown {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return undefined;
      }
      const element = node as Element;
      const childElements = Array.from(element.childNodes).filter(
        (n): n is Element => n.nodeType === Node.ELEMENT_NODE,
      );
      if (childElements.length === 0) {
        return element.textContent?.trim() ?? "";
      }
      const obj: Record<string, unknown> = {};
      for (const child of childElements) {
        const key = child.localName || child.tagName || "item";
        const childObj = nodeToObject(child);
        if (key in obj) {
          const existing = obj[key];
          if (Array.isArray(existing)) {
            existing.push(childObj);
          } else {
            obj[key] = [existing, childObj];
          }
        } else {
          obj[key] = childObj;
        }
      }
      return obj;
    }

    return { [root.tagName || root.localName || "root"]: nodeToObject(root) };
  } catch {
    return xmlString;
  }
}

function parseBody(body: unknown): unknown {
  if (body === null || body === undefined) {
    return undefined;
  }
  if (typeof body === "string") {
    if (looksLikeXml(body)) {
      return parseXmlString(body);
    }
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

function stripNamespace(key: string): string {
  const colonIndex = key.indexOf(":");
  return colonIndex >= 0 ? key.slice(colonIndex + 1) : key;
}

function findKeyCaseInsensitive(
  value: Record<string, unknown>,
  target: string,
): string | undefined {
  const targetLower = target.toLowerCase();
  return Object.keys(value).find((k) => {
    const localName = stripNamespace(k);
    return localName.toLowerCase() === targetLower;
  });
}

function findBizBody(value: unknown): unknown {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const matchedKey = findKeyCaseInsensitive(value, "bizBody");
  if (matchedKey) {
    return value[matchedKey];
  }
  for (const child of Object.values(value)) {
    const found = findBizBody(child);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function extractBodyFields(body: unknown): Record<string, string> {
  const parsed = parseBody(body);
  if (parsed === undefined) {
    return {};
  }
  const bizBody = findBizBody(parsed);
  if (bizBody !== undefined) {
    if (isPlainObject(bizBody) || Array.isArray(bizBody)) {
      return flattenObject(bizBody);
    }
    if (bizBody === null) {
      return {};
    }
    return { bizBody: String(bizBody) };
  }
  if (typeof parsed === "string") {
    return parsed.trim() ? { body: parsed } : {};
  }
  return flattenObject(parsed);
}

function resolveFieldDisplayNames(paths: string[]): string[] {
  const leafCounts = new Map<string, number>();
  for (const path of paths) {
    const leaf = path.split(".").pop() || path;
    leafCounts.set(leaf, (leafCounts.get(leaf) ?? 0) + 1);
  }
  return paths.map((path) => {
    const leaf = path.split(".").pop() || path;
    if ((leafCounts.get(leaf) ?? 0) === 1) {
      return leaf;
    }
    return path;
  });
}

export function buildCaseExportData(cases: ApiTestCaseRow[]) {
  if (!cases.length) {
    return { headers: [...EXPORT_BASE_HEADERS, REMARK_HEADER], rows: [] };
  }

  const caseFieldMaps = cases.map((c) => extractBodyFields(c.request.body));
  const allPathsSet = new Set<string>();
  for (const fields of caseFieldMaps) {
    for (const path of Object.keys(fields)) {
      allPathsSet.add(path);
    }
  }
  const allPaths = Array.from(allPathsSet);
  const displayNames = resolveFieldDisplayNames(allPaths);
  const pathToHeader = new Map<string, string>();
  allPaths.forEach((path, index) => {
    pathToHeader.set(path, displayNames[index]);
  });

  const dynamicHeaders = displayNames;
  const headers = [...EXPORT_BASE_HEADERS, ...dynamicHeaders, REMARK_HEADER];

  const rows = cases.map((c, index) => {
    const fields = caseFieldMaps[index];
    const serialNumber = String(index + 1);
    const polarityLabel = c.polarity === "negative" ? "反案例" : "正案例";
    const enabledLabel = c.enabled ? "是" : "否";
    const base = [
      serialNumber,
      polarityLabel,
      c.description ?? "",
      enabledLabel,
    ];
    const dynamicValues = dynamicHeaders.map((header) => {
      const path = allPaths.find((p) => pathToHeader.get(p) === header);
      if (!path) return "";
      return fields[path] ?? "";
    });
    return [...base, ...dynamicValues, c.remark ?? ""];
  });

  return { headers, rows };
}

export function exportApiCasesToExcel(
  cases: ApiTestCaseRow[],
  fileName?: string,
) {
  const { headers, rows } = buildCaseExportData(cases);
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "案例");

  const defaultName = `接口测试案例_${new Date().toISOString().slice(0, 10)}`;
  XLSX.writeFile(workbook, `${fileName || defaultName}.xlsx`);
}
