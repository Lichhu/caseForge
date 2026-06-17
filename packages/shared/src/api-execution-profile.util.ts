import type {
  ApiCaseExpected,
  ApiCaseRequest,
  ApiMessageFormat,
  ApiTransport,
} from "./api-test";

export interface ApiExecutionProfile {
  transport: ApiTransport;
  messageFormat: ApiMessageFormat;
  label: string;
  summary: string;
  httpMethod?: string;
  contentType?: string;
  encoding?: string;
  framing?: string;
  targetHint: string;
  assertionHint: string;
  supported: boolean;
  unsupportedReason?: string;
}

const TRANSPORT_LABEL: Record<ApiTransport, string> = {
  http: "HTTP",
  tcp: "TCP",
  tuxedo: "TUXEDO",
  other: "其它",
};

const FORMAT_LABEL: Record<ApiMessageFormat, string> = {
  json: "JSON",
  xml: "XML",
  soap: "SOAP",
  text: "文本",
  other: "其它",
};

function isXmlBody(body: unknown): boolean {
  if (typeof body !== "string") return false;
  const trimmed = body.trim();
  return trimmed.startsWith("<") && trimmed.includes("</");
}

function inferMessageFormat(request: ApiCaseRequest): ApiMessageFormat {
  if (request.contentType?.includes("xml")) {
    return request.contentType.includes("soap") ? "soap" : "xml";
  }
  if (request.contentType?.includes("json")) return "json";
  if (request.contentType?.includes("text/plain")) return "text";
  if (isXmlBody(request.body)) return "xml";
  if (request.body && typeof request.body === "object") return "json";
  if (typeof request.body === "string" && request.body.trim()) return "text";
  return "json";
}

function inferTransport(request: ApiCaseRequest): ApiTransport {
  if (request.transport) return request.transport;
  if (request.framing?.type === "length-prefix") return "tcp";
  return "http";
}

function resolveContentType(
  request: ApiCaseRequest,
  messageFormat: ApiMessageFormat,
): string | undefined {
  if (request.contentType?.trim()) return request.contentType.trim();
  const header =
    request.headers?.["Content-Type"] ?? request.headers?.["content-type"];
  if (header?.trim()) return header.trim();
  switch (messageFormat) {
    case "xml":
      return "application/xml; charset=UTF-8";
    case "soap":
      return "text/xml; charset=UTF-8";
    case "text":
      return "text/plain; charset=UTF-8";
    case "json":
    default:
      return "application/json; charset=UTF-8";
  }
}

function buildSummary(
  transport: ApiTransport,
  messageFormat: ApiMessageFormat,
  httpMethod?: string,
): string {
  if (transport === "http") {
    const method = (httpMethod ?? "POST").toUpperCase();
    if (messageFormat === "json") {
      return `${method} 请求，Body 为 JSON`;
    }
    if (messageFormat === "xml" || messageFormat === "soap") {
      return `${method} 请求，Body 为 XML`;
    }
    return `${method} 请求，Body 为 ${FORMAT_LABEL[messageFormat]}`;
  }
  if (transport === "tcp") {
    if (messageFormat === "xml") {
      return "TCP 连接，GBK 编码 + 8 位长度前缀 + XML 报文";
    }
    return `TCP 裸连接，报文格式 ${FORMAT_LABEL[messageFormat]}`;
  }
  return `${TRANSPORT_LABEL[transport]} + ${FORMAT_LABEL[messageFormat]}`;
}

function buildTargetHint(
  transport: ApiTransport,
  request: ApiCaseRequest,
  envAddress?: string,
): string {
  const address = envAddress?.trim() || "（请在环境中配置地址）";
  if (transport === "http") {
    const path = request.path?.trim() || "/";
    const base = address.replace(/\/$/, "");
    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
  }
  if (transport === "tcp") {
    return address.includes("://")
      ? address.replace(/^https?:\/\//i, "")
      : address;
  }
  return address;
}

function buildAssertionHint(expected?: ApiCaseExpected): string {
  if (expected?.skipStatusCheck) {
    return "断言响应报文业务码（bizResCode / resCode），不校验 HTTP 状态码";
  }
  if (expected?.statusCode !== undefined) {
    const codes = Array.isArray(expected.statusCode)
      ? expected.statusCode.join(" / ")
      : String(expected.statusCode);
    return `断言 HTTP 状态码 ${codes}`;
  }
  return "断言 HTTP 状态码与响应体";
}

function buildFramingHint(request: ApiCaseRequest): string | undefined {
  if (!request.framing) return undefined;
  const width = request.framing.width ?? 8;
  const encoding = request.framing.encoding ?? request.encoding ?? "GBK";
  return `${width} 位长度前缀 · ${encoding} 编码`;
}

function detectEnvMismatch(
  transport: ApiTransport,
  envAddress?: string,
): string | undefined {
  if (!envAddress?.trim()) {
    return "请先选择执行环境并配置目标地址";
  }
  const addr = envAddress.trim();
  if (transport === "tcp") {
    if (/^https?:\/\//i.test(addr)) {
      return "TCP 案例建议使用 host:port 地址（如 32.114.71.6:60030），当前环境为 HTTP URL";
    }
    if (!/:\d+/.test(addr)) {
      return "TCP 案例的环境地址建议包含端口号（host:port）";
    }
  }
  if (transport === "http" && !/^https?:\/\//i.test(addr)) {
    return "HTTP 案例的环境 Base URL 建议以 http:// 或 https:// 开头";
  }
  return undefined;
}

/** 从案例 request 解析执行方式（通讯 + 报文 + 目标 + 断言） */
export function resolveExecutionProfile(
  request: ApiCaseRequest,
  options?: {
    envAddress?: string;
    expected?: ApiCaseExpected;
  },
): ApiExecutionProfile {
  const transport = inferTransport(request);
  const messageFormat = inferMessageFormat(request);
  const httpMethod =
    transport === "http" ? (request.method ?? "POST").toUpperCase() : undefined;
  const contentType =
    transport === "http"
      ? resolveContentType(request, messageFormat)
      : undefined;
  const encoding = request.encoding ?? request.framing?.encoding;
  const framing = buildFramingHint(request);
  const envMismatch = detectEnvMismatch(transport, options?.envAddress);
  const supported = transport === "http" || transport === "tcp";

  return {
    transport,
    messageFormat,
    label: `${TRANSPORT_LABEL[transport]} + ${FORMAT_LABEL[messageFormat]}`,
    summary: buildSummary(transport, messageFormat, httpMethod),
    httpMethod,
    contentType,
    encoding,
    framing,
    targetHint: buildTargetHint(transport, request, options?.envAddress),
    assertionHint: buildAssertionHint(options?.expected),
    supported,
    unsupportedReason:
      transport === "tuxedo"
        ? "TUXEDO 执行器尚未实现"
        : transport === "other"
          ? "暂不支持该通讯方式执行"
          : envMismatch,
  };
}

export function executionProfileBadgeColor(
  transport: ApiTransport,
): "blue" | "orange" | "purple" | "default" {
  if (transport === "tcp") return "orange";
  if (transport === "tuxedo") return "purple";
  if (transport === "http") return "blue";
  return "default";
}

export interface ApiExecutionProfileGroup {
  label: string;
  count: number;
  transport: ApiTransport;
  messageFormat: ApiMessageFormat;
}

/** 批量执行前汇总各通讯方式案例数量 */
export function groupExecutionProfiles(
  requests: ApiCaseRequest[],
): ApiExecutionProfileGroup[] {
  const map = new Map<string, ApiExecutionProfileGroup>();
  for (const request of requests) {
    const profile = resolveExecutionProfile(request);
    const key = `${profile.transport}:${profile.messageFormat}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    map.set(key, {
      label: profile.label,
      count: 1,
      transport: profile.transport,
      messageFormat: profile.messageFormat,
    });
  }
  return [...map.values()];
}

export function hasMixedTransports(requests: ApiCaseRequest[]): boolean {
  const transports = new Set(requests.map((r) => inferTransport(r)));
  return transports.size > 1;
}
