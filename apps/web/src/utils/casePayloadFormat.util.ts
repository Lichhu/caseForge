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

/** json=完整 JSON；tcp-xml=仅 XML 报文体；http-xml=HTTP 元数据 JSON + XML 报文体 */
export type RequestEditorMode = "json" | "tcp-xml" | "http-xml";

export interface TcpRequestMeta {
  transport: "tcp";
  encoding?: string;
  contentType?: string;
  framing?: ApiMessageFraming;
}

function inferTransport(request: ApiCaseRequest): ApiTransport {
  if (request.transport) return request.transport;
  if (request.framing?.type === "length-prefix") return "tcp";
  return "http";
}

/** 编辑器展示用：还原转义并 Tab 缩进美化 */
export function formatXmlForEditor(value: string): string {
  const raw = unescapeLiteralXmlEscapes(value).trim();
  if (!raw) return "";
  return prettyPrintXml(raw);
}

export function resolveRequestEditorMode(
  request: ApiCaseRequest,
): RequestEditorMode {
  if (typeof request.body !== "string" || !looksLikeXml(request.body)) {
    return "json";
  }
  return inferTransport(request) === "tcp" ? "tcp-xml" : "http-xml";
}

export function splitRequestForEditor(request: ApiCaseRequest) {
  const mode = resolveRequestEditorMode(request);
  if (mode === "tcp-xml" && typeof request.body === "string") {
    return {
      mode,
      requestJson: "",
      requestMetaJson: "",
      requestTcpMeta: {
        transport: "tcp" as const,
        encoding: request.encoding,
        contentType: request.contentType,
        framing: request.framing ?? {
          type: "length-prefix" as const,
          width: 8,
          encoding: request.encoding?.toUpperCase().includes("GBK")
            ? "GBK"
            : request.encoding,
        },
      },
      requestBodyXml: formatXmlForEditor(request.body),
    };
  }
  if (mode === "http-xml" && typeof request.body === "string") {
    const { body, ...meta } = request;
    return {
      mode,
      requestJson: "",
      requestMetaJson: JSON.stringify(meta, null, 2),
      requestTcpMeta: null,
      requestBodyXml: formatXmlForEditor(body),
    };
  }
  return {
    mode: "json" as const,
    requestJson: JSON.stringify(request, null, 2),
    requestMetaJson: "",
    requestTcpMeta: null,
    requestBodyXml: "",
  };
}

export function mergeRequestFromEditor(input: {
  mode: RequestEditorMode;
  requestJson: string;
  requestMetaJson: string;
  requestTcpMeta: TcpRequestMeta | null;
  requestBodyXml: string;
}): ApiCaseRequest {
  if (input.mode === "tcp-xml" && input.requestTcpMeta) {
    return {
      method: "",
      path: "",
      transport: "tcp",
      encoding: input.requestTcpMeta.encoding,
      contentType: input.requestTcpMeta.contentType,
      framing: input.requestTcpMeta.framing,
      body: input.requestBodyXml,
    };
  }
  if (input.mode === "http-xml") {
    const meta = JSON.parse(input.requestMetaJson.trim()) as Omit<
      ApiCaseRequest,
      "body"
    >;
    return {
      ...meta,
      body: input.requestBodyXml,
    };
  }
  return JSON.parse(input.requestJson.trim()) as ApiCaseRequest;
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
