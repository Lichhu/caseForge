import { unescapeLiteralXmlEscapes } from "@case-forge/shared";

export interface ReportReturnInfo {
  code: string;
  message: string;
}

interface ReportResponseSnapshotLike {
  status?: unknown;
  body?: unknown;
  error?: unknown;
}

interface ReportRequestSnapshotLike {
  transport?: unknown;
  steps?: unknown;
}

interface ReportResponseSource {
  request?: Record<string, unknown>;
  response?: ReportResponseSnapshotLike;
}

const CODE_FIELD_NAMES = ["resCode", "bizResCode"] as const;
const MESSAGE_FIELD_NAMES = ["resText", "bizResText"] as const;
const SOCKET_TRANSPORTS = new Set(["tcp", "socket", "socket2", "tep"]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function scalarText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return "";
}

function decodeXmlText(value: string): string {
  const decodeCodePoint = (raw: string, radix: number, fallback: string) => {
    const codePoint = Number.parseInt(raw, radix);
    return Number.isInteger(codePoint) &&
      codePoint >= 0 &&
      codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : fallback;
  };
  return value
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-f]+);/gi, (entity, code: string) =>
      decodeCodePoint(code, 16, entity),
    )
    .replace(/&#(\d+);/g, (entity, code: string) =>
      decodeCodePoint(code, 10, entity),
    )
    .trim();
}

function extractXmlField(body: string, fieldNames: readonly string[]): string {
  const source = unescapeLiteralXmlEscapes(body);
  for (const fieldName of fieldNames) {
    const match = source.match(
      new RegExp(
        `<(?:[\\w.-]+:)?${fieldName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${fieldName}\\s*>`,
        "i",
      ),
    );
    const value = match ? decodeXmlText(match[1]) : "";
    if (value) return value;
  }
  return "";
}

function findObjectField(
  value: unknown,
  fieldNames: readonly string[],
  seen = new Set<object>(),
): string {
  const record = asRecord(value);
  if (!record || seen.has(record)) return "";
  seen.add(record);

  const entries = Object.entries(record);
  for (const fieldName of fieldNames) {
    const entry = entries.find(
      ([key]) => key.toLowerCase() === fieldName.toLowerCase(),
    );
    const fieldValue = entry ? scalarText(entry[1]) : "";
    if (fieldValue) return fieldValue;
  }
  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const nested = findObjectField(item, fieldNames, seen);
        if (nested) return nested;
      }
      continue;
    }
    const nested = findObjectField(child, fieldNames, seen);
    if (nested) return nested;
  }
  return "";
}

function extractField(body: unknown, fieldNames: readonly string[]): string {
  if (typeof body === "string") {
    return extractXmlField(body, fieldNames);
  }
  return findObjectField(body, fieldNames);
}

function isSocketSource(source: ReportResponseSource): boolean {
  const transport = scalarText(source.request?.transport).toLowerCase();
  return (
    SOCKET_TRANSPORTS.has(transport) || Number(source.response?.status) === -1
  );
}

function responseSources(item: {
  requestSnapshot?: ReportRequestSnapshotLike | null;
  responseSnapshot?: ReportResponseSnapshotLike;
}): ReportResponseSource[] {
  const steps = Array.isArray(item.requestSnapshot?.steps)
    ? item.requestSnapshot.steps
    : [];
  return [
    ...steps
      .slice()
      .reverse()
      .map((value) => {
        const step = asRecord(value);
        return {
          request: asRecord(step?.request),
          response: asRecord(step?.response) as
            | ReportResponseSnapshotLike
            | undefined,
        };
      }),
    {
      request: item.requestSnapshot as Record<string, unknown> | undefined,
      response: item.responseSnapshot,
    },
  ];
}

/**
 * TCP/Socket 没有 HTTP 状态码，报告优先使用响应报文中的
 * resCode/resText，并兼容 bizResCode/bizResText。
 */
export function resolveReportReturnInfo(item: {
  requestSnapshot?: ReportRequestSnapshotLike | null;
  responseSnapshot?: ReportResponseSnapshotLike;
}): ReportReturnInfo {
  const fallback: ReportReturnInfo = {
    code: scalarText(item.responseSnapshot?.status),
    message: scalarText(item.responseSnapshot?.error),
  };

  for (const source of responseSources(item)) {
    if (!isSocketSource(source)) continue;
    const code = extractField(source.response?.body, CODE_FIELD_NAMES);
    const message = extractField(source.response?.body, MESSAGE_FIELD_NAMES);
    if (code || message) {
      return {
        code: code || scalarText(source.response?.status),
        message: message || scalarText(source.response?.error),
      };
    }
  }

  return fallback;
}
