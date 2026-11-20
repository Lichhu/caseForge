import {
  formatRunSnapshotField,
  formatRunSnapshotForDisplay,
  formatXmlForEditor,
} from "@/utils/casePayloadFormat.util";

/** 执行快照展示用：把请求/响应报文整理成可读的结构 */
export type RunSnapshotKind = "request" | "response";

export interface RunSnapshotMetaEntry {
  key: string;
  value: string;
  /** 多行或超长值，展示时按代码块处理 */
  block: boolean;
}

export interface RunSnapshotMetaGroup {
  key: string;
  label: string;
  entries: RunSnapshotMetaEntry[];
}

export interface RunSnapshotBody {
  text: string;
  highlighted: string;
  language: "json" | "xml" | "text";
  lineCount: number;
  /** 来自 SQL 步骤的语句，而不是报文 */
  fromSql: boolean;
}

export interface RunSnapshotView {
  method: string | null;
  status: number | null;
  target: string | null;
  error: string | null;
  chips: Array<{ label: string; value: string }>;
  body: RunSnapshotBody | null;
  metaGroups: RunSnapshotMetaGroup[];
  metaEntryCount: number;
  rawText: string;
}

interface MetaLabel {
  label: string;
  /** 收纳进概要行的字段 */
  chip?: boolean;
}

const META_LABELS: Record<string, MetaLabel> = {
  kind: { label: "步骤类型" },
  mode: { label: "执行模式", chip: true },
  connectionId: { label: "连接 ID" },
  connectionName: { label: "连接名称" },
  connection: { label: "连接信息" },
  sql: { label: "执行 SQL" },
  query: { label: "查询参数" },
  framing: { label: "分帧配置" },
  transport: { label: "传输协议", chip: true },
  encoding: { label: "字符编码", chip: true },
  service: { label: "目标服务", chip: true },
};

const SUMMARY_KEYS = new Set(["method", "url", "target", "status", "error"]);

const CHIP_LABELS: Record<string, string> = {
  transport: "传输",
  encoding: "编码",
  service: "服务",
  mode: "模式",
};

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  415: "Unsupported Media Type",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

export function httpStatusText(status: number): string {
  return STATUS_TEXT[status] ?? "";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const JSON_TOKEN_RE =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/** JSON 语法高亮，输入先转义，输出可直接 v-html */
export function highlightJson(code: string): string {
  let out = "";
  let last = 0;
  JSON_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = JSON_TOKEN_RE.exec(code))) {
    out += escapeHtml(code.slice(last, match.index));
    const [raw, stringToken, colon, literal, numberToken] = match;
    if (stringToken) {
      const tone = colon ? "tok-key" : "tok-string";
      out += `<span class="${tone}">${escapeHtml(stringToken)}</span>`;
      if (colon) out += `<span class="tok-punct">${escapeHtml(colon)}</span>`;
    } else if (literal) {
      const tone = literal === "null" ? "tok-null" : "tok-literal";
      out += `<span class="${tone}">${literal}</span>`;
    } else if (numberToken) {
      out += `<span class="tok-number">${numberToken}</span>`;
    }
    last = match.index + raw.length;
  }
  out += escapeHtml(code.slice(last));
  return out;
}

const XML_TOKEN_RE =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z_][\w:.-]*|\/?>|[A-Za-z_][\w:.-]*(?=\s*=)|"[^"]*"|'[^']*'/g;

/** XML 轻量高亮，只处理标签、属性与注释 */
export function highlightXml(code: string): string {
  let out = "";
  let last = 0;
  XML_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = XML_TOKEN_RE.exec(code))) {
    out += escapeHtml(code.slice(last, match.index));
    const [raw] = match;
    let tone = "tok-attr";
    if (raw.startsWith("<!--") || raw.startsWith("<![CDATA[")) tone = "tok-comment";
    else if (raw.startsWith("<") || raw === ">" || raw === "/>") tone = "tok-tag";
    else if (raw.startsWith('"') || raw.startsWith("'")) tone = "tok-string";
    out += `<span class="${tone}">${escapeHtml(raw)}</span>`;
    last = match.index + raw.length;
  }
  out += escapeHtml(code.slice(last));
  return out;
}

export function detectPayloadLanguage(
  text: string,
): "json" | "xml" | "text" {
  const trimmed = text.trim();
  if (!trimmed) return "text";
  if (/^<[!?]?[A-Za-z]/.test(trimmed)) return "xml";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // 截断或长度前缀报文，按纯文本处理
    }
  }
  return "text";
}

export function highlightPayload(text: string): {
  highlighted: string;
  language: "json" | "xml" | "text";
} {
  const language = detectPayloadLanguage(text);
  if (language === "json") {
    return { highlighted: highlightJson(text), language };
  }
  if (language === "xml") {
    return { highlighted: highlightXml(text), language };
  }
  return { highlighted: escapeHtml(text), language };
}

/** 报文可能是压缩的 JSON 字符串或带长度前缀的 socket 报文，尽量还原可读格式 */
function prettyPayloadText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const stripped = trimmed.replace(/^\d{4,8}\s*(?=[<{[])/, "");
  const candidate = stripped !== trimmed ? stripped : trimmed;
  if (
    (candidate.startsWith("{") && candidate.endsWith("}")) ||
    (candidate.startsWith("[") && candidate.endsWith("]"))
  ) {
    try {
      return JSON.stringify(JSON.parse(candidate), null, 2);
    } catch {
      // 不是完整 JSON，保持原样
    }
  }
  if (/^<[!?]?[A-Za-z]/.test(candidate)) {
    return formatXmlForEditor(candidate);
  }
  return candidate;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatMetaValue(value: unknown): { value: string; block: boolean } {
  if (value == null) return { value: "—", block: false };
  if (typeof value === "string") {
    if (!value) return { value: "—", block: false };
    return {
      value,
      block: value.includes("\n") || value.length > 120,
    };
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return { value: String(value), block: false };
  }
  try {
    return { value: JSON.stringify(value, null, 2), block: true };
  } catch {
    return { value: String(value), block: true };
  }
}

function buildRecordEntries(
  record: Record<string, unknown>,
): RunSnapshotMetaEntry[] {
  return Object.entries(record).flatMap(([key, value]) => {
    if (value === undefined) return [];
    const formatted = formatMetaValue(value);
    return [{ key, value: formatted.value, block: formatted.block }];
  });
}

function buildBody(value: unknown, fromSql = false): RunSnapshotBody | null {
  if (value == null || value === "") return null;
  const text = fromSql
    ? formatRunSnapshotField(value)
    : prettyPayloadText(formatRunSnapshotField(value));
  if (!text) return null;
  const { highlighted, language } = highlightPayload(text);
  return {
    text,
    highlighted,
    language,
    lineCount: text.split("\n").length,
    fromSql,
  };
}

function buildMetaGroups(
  meta: Record<string, unknown>,
  kind: RunSnapshotKind,
  skipKeys?: Set<string>,
): RunSnapshotMetaGroup[] {
  const groups: RunSnapshotMetaGroup[] = [];
  const others: RunSnapshotMetaEntry[] = [];

  const pushGroup = (
    key: string,
    label: string,
    record: Record<string, unknown>,
  ) => {
    const entries = buildRecordEntries(record);
    if (entries.length) groups.push({ key, label, entries });
  };

  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || SUMMARY_KEYS.has(key)) continue;
    if (skipKeys?.has(key)) continue;
    if (key === "headers" && isPlainRecord(value)) {
      pushGroup(
        "headers",
        kind === "request" ? "请求头" : "响应头",
        value,
      );
      continue;
    }
    if (key === "query" && isPlainRecord(value)) {
      pushGroup("query", "查询参数", value);
      continue;
    }
    if (META_LABELS[key]?.chip) continue;
    const formatted = formatMetaValue(value);
    others.push({
      key: META_LABELS[key]?.label ?? key,
      value: formatted.value,
      block: formatted.block,
    });
  }

  if (others.length) {
    groups.push({ key: "others", label: "其他信息", entries: others });
  }
  return groups;
}

/** 把执行快照整理成概要、报文与元信息三部分 */
export function buildRunSnapshotView(
  snapshot: unknown,
  kind: RunSnapshotKind,
): RunSnapshotView {
  const rawText = formatRunSnapshotForDisplay(snapshot);
  const view: RunSnapshotView = {
    method: null,
    status: null,
    target: null,
    error: null,
    chips: [],
    body: null,
    metaGroups: [],
    metaEntryCount: 0,
    rawText,
  };

  if (!isPlainRecord(snapshot)) {
    view.body = buildBody(snapshot);
    return view;
  }

  const { body, bodyText, ...meta } = snapshot;
  const bodySource =
    typeof bodyText === "string" && bodyText.length ? bodyText : body;
  view.body = buildBody(bodySource);
  const skipMetaKeys = new Set<string>();
  // SQL 步骤没有报文，把语句当作正文展示，避免埋在元信息里
  if (!view.body && typeof meta.sql === "string" && meta.sql.trim()) {
    view.body = buildBody(meta.sql, true);
    skipMetaKeys.add("sql");
  }

  if (typeof meta.method === "string" && meta.method.trim()) {
    view.method = meta.method.trim().toUpperCase();
  }
  if (typeof meta.status === "number") {
    view.status = meta.status;
  }
  const target = meta.url ?? meta.target;
  if (typeof target === "string" && target.trim()) {
    view.target = target.trim();
  }
  if (typeof meta.error === "string" && meta.error.trim()) {
    view.error = meta.error.trim();
  }

  view.chips = Object.entries(CHIP_LABELS).flatMap(([key, label]) => {
    const value = meta[key];
    if (typeof value !== "string" || !value.trim()) return [];
    return [{ label, value: value.trim() }];
  });

  view.metaGroups = buildMetaGroups(meta, kind, skipMetaKeys);
  view.metaEntryCount = view.metaGroups.reduce(
    (total, group) => total + group.entries.length,
    0,
  );
  return view;
}
