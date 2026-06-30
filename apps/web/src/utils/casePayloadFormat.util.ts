import {
  looksLikeXml,
  prettyPrintXml,
  unescapeLiteralXmlEscapes,
} from "@case-forge/shared";
import type {
  ApiCaseRequest,
  ApiMessageFraming,
  ApiTransport,
} from "@case-forge/shared";

/** 案例编辑器协议（UI 展示用，tcp 映射为 socket） */
export type CaseProtocol = "http" | "socket" | "mq";

export type CaseBodyFormat = "json" | "xml" | "text";

export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export type RequestEditorMode =
  | "http-json"
  | "http-xml"
  | "http-text"
  | "socket-xml"
  | "socket-json"
  | "socket-text"
  | "mq-xml"
  | "mq-json"
  | "mq-text";

export interface KeyValueRow {
  id: string;
  key: string;
  value: string;
}

export interface SocketRequestMeta {
  transport: "tcp";
  encoding?: string;
  contentType?: string;
  framing?: ApiMessageFraming;
}

let keyValueRowSeq = 0;

export function createEmptyKeyValueRow(): KeyValueRow {
  keyValueRowSeq += 1;
  return { id: `kv-${keyValueRowSeq}`, key: "", value: "" };
}

export function createDefaultKeyValueRows(
  preset?: Record<string, string>,
): KeyValueRow[] {
  const entries = Object.entries(preset ?? {});
  if (!entries.length) return [createEmptyKeyValueRow()];
  return entries.map(([key, value]) => ({
    id: `kv-${++keyValueRowSeq}`,
    key,
    value,
  }));
}

export function keyValueRowsToRecord(
  rows: KeyValueRow[],
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    record[key] = row.value;
  }
  return record;
}

export function recordToKeyValueRows(
  record?: Record<string, string | number | boolean>,
  options?: { emptyWhenMissing?: boolean },
): KeyValueRow[] {
  if (!record || !Object.keys(record).length) {
    return options?.emptyWhenMissing ? [] : [createEmptyKeyValueRow()];
  }
  return Object.entries(record).map(([key, value]) => ({
    id: `kv-${++keyValueRowSeq}`,
    key,
    value: String(value),
  }));
}

export function buildDefaultHeaderRows(
  protocol: CaseProtocol,
  bodyFormat: CaseBodyFormat,
): KeyValueRow[] {
  if (protocol !== "http") return [];
  return createDefaultKeyValueRows({
    "Content-Type": defaultContentType(bodyFormat),
  });
}

export function buildDefaultExpected(
  protocol: CaseProtocol,
  bodyFormat: CaseBodyFormat,
  polarity: "positive" | "negative" = "positive",
) {
  const isNegative = polarity === "negative";
  if (protocol === "http") {
    if (bodyFormat === "json") {
      return {
        statusCode: isNegative ? [400, 422, 500] : [200, 201],
        statusOnly: true,
        skipStatusCheck: false,
      };
    }
    return {
      statusCode: isNegative ? [400, 422, 500] : [200, 201],
      statusOnly: false,
      skipStatusCheck: false,
      bodyAssertions: [
        {
          type: "contains" as const,
          expected: isNegative ? "error" : "success",
          description: "响应体关键内容",
        },
      ],
    };
  }
  if (protocol === "socket" && bodyFormat === "xml") {
    return {
      skipStatusCheck: true,
      statusOnly: false,
      bodyAssertions: isNegative
        ? [
            {
              type: "contains" as const,
              expected: "bizResCode",
              description: "响应报文含业务返回码",
            },
          ]
        : [
            {
              type: "contains" as const,
              expected: "000000",
              description: "响应 bizResCode 成功",
            },
            {
              type: "contains" as const,
              expected: "</Transaction>",
              description: "响应为完整 XML",
            },
          ],
    };
  }
  return {
    skipStatusCheck: true,
    statusOnly: false,
    bodyAssertions: isNegative
      ? [
          {
            type: "contains" as const,
            expected: "bizResCode",
            description: "响应报文含业务返回码",
          },
        ]
      : [
          {
            type: "contains" as const,
            expected: "000000",
            description: "响应业务码成功",
          },
        ],
  };
}

export function buildDefaultExpectedJson(
  protocol: CaseProtocol,
  bodyFormat: CaseBodyFormat,
  polarity: "positive" | "negative" = "positive",
): string {
  return JSON.stringify(
    buildDefaultExpected(protocol, bodyFormat, polarity),
    null,
    2,
  );
}

function inferTransport(request: ApiCaseRequest): ApiTransport {
  if (request.transport) return request.transport;
  if (request.framing?.type === "length-prefix") return "tcp";
  return "http";
}

export function transportToProtocol(transport: ApiTransport): CaseProtocol {
  if (transport === "tcp") return "socket";
  if (transport === "mq") return "mq";
  return "http";
}

export function protocolToTransport(protocol: CaseProtocol): ApiTransport {
  if (protocol === "socket") return "tcp";
  if (protocol === "mq") return "mq";
  return "http";
}

function inferBodyFormat(request: ApiCaseRequest): CaseBodyFormat {
  if (request.contentType?.includes("xml")) return "xml";
  if (request.contentType?.includes("json")) return "json";
  if (request.contentType?.includes("text/plain")) return "text";
  if (typeof request.body === "string" && looksLikeXml(request.body))
    return "xml";
  if (request.body && typeof request.body === "object") return "json";
  if (typeof request.body === "string" && request.body.trim()) return "text";
  return "json";
}

export function resolveEditorMode(
  protocol: CaseProtocol,
  bodyFormat: CaseBodyFormat,
): RequestEditorMode {
  return `${protocol}-${bodyFormat}` as RequestEditorMode;
}

export function httpMethodHasBody(method: HttpMethod): boolean {
  return !["GET", "HEAD"].includes(method);
}

/** 编辑器展示用：还原转义并 Tab 缩进美化 */
export function formatXmlForEditor(value: string): string {
  const raw = unescapeLiteralXmlEscapes(value).trim();
  if (!raw) return "";
  return prettyPrintXml(raw);
}

function formatBodyForEditor(body: unknown, format: CaseBodyFormat): string {
  if (format === "xml" && typeof body === "string") {
    return formatXmlForEditor(body);
  }
  if (format === "json") {
    if (typeof body === "string") {
      try {
        return JSON.stringify(JSON.parse(body), null, 2);
      } catch {
        return body;
      }
    }
    return JSON.stringify(body ?? {}, null, 2);
  }
  if (typeof body === "string") return body;
  if (body === undefined || body === null) return "";
  return String(body);
}

export function defaultContentType(format: CaseBodyFormat): string {
  switch (format) {
    case "xml":
      return "application/xml; charset=UTF-8";
    case "text":
      return "text/plain; charset=UTF-8";
    case "json":
    default:
      return "application/json; charset=UTF-8";
  }
}

function defaultSocketFraming(encoding: string): ApiMessageFraming | undefined {
  if (!encoding.toUpperCase().includes("GBK")) return undefined;
  return {
    type: "length-prefix",
    width: 8,
    encoding: "GBK",
  };
}

function splitHeaderRows(request: ApiCaseRequest) {
  return recordToKeyValueRows(
    request.headers as Record<string, string | number | boolean> | undefined,
    { emptyWhenMissing: true },
  );
}

function splitQueryRows(request: ApiCaseRequest) {
  return recordToKeyValueRows(request.query);
}

export function splitRequestForEditor(request: ApiCaseRequest) {
  const protocol = transportToProtocol(inferTransport(request));
  const bodyFormat = inferBodyFormat(request);
  const mode = resolveEditorMode(protocol, bodyFormat);
  const headerRows = splitHeaderRows(request);
  const queryRows = splitQueryRows(request);

  if (protocol === "http") {
    const { body, ...meta } = request;
    return {
      mode,
      protocol,
      bodyFormat,
      httpMethod: (meta.method || "POST").toUpperCase() as HttpMethod,
      httpPath: meta.path || "",
      headerRows,
      queryRows,
      socketEncoding: "UTF-8",
      requestBodyText:
        bodyFormat === "text" ? formatBodyForEditor(body, "text") : "",
      requestBodyJson:
        bodyFormat === "json" ? formatBodyForEditor(body, "json") : "{}",
      requestJson: "",
      requestMetaJson: "",
      requestTcpMeta: null,
      requestBodyXml:
        bodyFormat === "xml" ? formatBodyForEditor(body, "xml") : "",
    };
  }

  if (protocol === "socket") {
    return {
      mode,
      protocol,
      bodyFormat,
      httpMethod: "POST" as HttpMethod,
      httpPath: "",
      headerRows,
      queryRows: [createEmptyKeyValueRow()],
      socketEncoding: request.encoding || "UTF-8",
      requestBodyText:
        bodyFormat === "text" ? formatBodyForEditor(request.body, "text") : "",
      requestBodyJson:
        bodyFormat === "json"
          ? formatBodyForEditor(request.body, "json")
          : "{}",
      requestJson: "",
      requestMetaJson: "",
      requestTcpMeta: {
        transport: "tcp" as const,
        encoding: request.encoding,
        contentType: request.contentType,
        framing:
          request.framing ?? defaultSocketFraming(request.encoding || "UTF-8"),
      },
      requestBodyXml:
        bodyFormat === "xml" ? formatBodyForEditor(request.body, "xml") : "",
    };
  }

  return {
    mode,
    protocol,
    bodyFormat,
    httpMethod: "POST" as HttpMethod,
    httpPath: "",
    headerRows,
    queryRows: [createEmptyKeyValueRow()],
    socketEncoding: "UTF-8",
    requestBodyText:
      bodyFormat === "text" ? formatBodyForEditor(request.body, "text") : "",
    requestBodyJson:
      bodyFormat === "json" ? formatBodyForEditor(request.body, "json") : "{}",
    requestJson: "",
    requestMetaJson: "",
    requestTcpMeta: null,
    requestBodyXml:
      bodyFormat === "xml" ? formatBodyForEditor(request.body, "xml") : "",
  };
}

function parseBodyFromEditor(
  mode: RequestEditorMode,
  input: {
    requestBodyText: string;
    requestBodyJson: string;
    requestBodyXml: string;
  },
): unknown {
  if (mode.endsWith("-xml")) {
    return input.requestBodyXml;
  }
  if (mode.endsWith("-json")) {
    const text = input.requestBodyJson.trim();
    if (!text) return {};
    return JSON.parse(text);
  }
  return input.requestBodyText;
}

export function mergeRequestFromEditor(input: {
  mode: RequestEditorMode;
  protocol: CaseProtocol;
  bodyFormat: CaseBodyFormat;
  httpMethod: HttpMethod;
  httpPath: string;
  headerRows: KeyValueRow[];
  queryRows: KeyValueRow[];
  socketEncoding: string;
  requestBodyText: string;
  requestBodyJson: string;
  requestJson: string;
  requestMetaJson: string;
  requestTcpMeta: SocketRequestMeta | null;
  requestBodyXml: string;
}): ApiCaseRequest {
  const headers = keyValueRowsToRecord(input.headerRows);
  const contentType = defaultContentType(input.bodyFormat);
  const hasBody =
    input.protocol !== "http" || httpMethodHasBody(input.httpMethod);
  const body = hasBody ? parseBodyFromEditor(input.mode, input) : undefined;

  if (input.protocol === "http") {
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = contentType;
    }
    const query = keyValueRowsToRecord(input.queryRows);
    return {
      method: input.httpMethod,
      path: input.httpPath,
      transport: "http",
      headers,
      query: Object.keys(query).length ? query : undefined,
      contentType,
      encoding: "UTF-8",
      body,
    };
  }

  if (input.protocol === "socket") {
    const encoding = input.socketEncoding || "UTF-8";
    const framing =
      input.bodyFormat === "xml" && encoding.toUpperCase().includes("GBK")
        ? (input.requestTcpMeta?.framing ?? defaultSocketFraming(encoding))
        : input.requestTcpMeta?.framing;
    return {
      method: "",
      path: "",
      transport: "tcp",
      headers: Object.keys(headers).length ? headers : undefined,
      encoding,
      contentType,
      framing,
      body,
    };
  }

  return {
    method: "",
    path: "",
    transport: "mq",
    headers: Object.keys(headers).length ? headers : undefined,
    contentType,
    encoding: "UTF-8",
    body,
  };
}

function beautifyPayloadValue(value: unknown): unknown {
  if (typeof value === "string") {
    return looksLikeXml(value)
      ? prettyPrintXml(unescapeLiteralXmlEscapes(value))
      : value;
  }
  if (Array.isArray(value)) {
    return value.map(beautifyPayloadValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        beautifyPayloadValue(nested),
      ]),
    );
  }
  return value;
}

/** 美化案例请求/预期 JSON：缩进 JSON，并格式化内嵌 XML 字符串 */
export function beautifyCasePayloadJson(text: string): string {
  const parsed: unknown = JSON.parse(text.trim());
  return JSON.stringify(beautifyPayloadValue(parsed), null, 2);
}

export function beautifyRequestBodyXml(text: string): string {
  return formatXmlForEditor(text);
}

export function defaultEditorState(
  protocol: CaseProtocol = "http",
  bodyFormat: CaseBodyFormat = "json",
  endpoint?: { method: string; path: string },
): ReturnType<typeof splitRequestForEditor> {
  const request: ApiCaseRequest =
    protocol === "http"
      ? {
          method: "POST",
          path: endpoint?.path || "",
          transport: "http",
          headers: { "Content-Type": defaultContentType(bodyFormat) },
          query: {},
          body: bodyFormat === "json" ? {} : "",
        }
      : protocol === "socket"
        ? {
            method: "",
            path: "",
            transport: "tcp",
            headers: {},
            encoding: bodyFormat === "xml" ? "GBK" : "UTF-8",
            framing:
              bodyFormat === "xml"
                ? { type: "length-prefix", width: 8, encoding: "GBK" }
                : undefined,
            body: "",
          }
        : {
            method: "",
            path: "",
            transport: "mq",
            headers: {},
            body: "",
          };
  return splitRequestForEditor(request);
}
