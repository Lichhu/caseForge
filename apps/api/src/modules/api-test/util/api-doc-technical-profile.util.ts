import { buildDefaultExpected as sharedBuildDefaultExpected } from "@case-forge/shared";
import type {
  ApiCaseExpected,
  ApiCasePolarity,
  ApiCaseRequest,
  ApiMessageFormat,
  ApiTechnicalProfile,
  ApiTransport,
} from "@case-forge/shared";
import { extractApiDocSection, getApiDocFieldValue } from "./api-doc.parser";

const DEFAULT_PROFILE: ApiTechnicalProfile = {
  transport: "http",
  messageFormat: "json",
  encoding: "UTF-8",
};

function normalizeTransport(value: string): ApiTransport {
  const text = value.trim().toUpperCase();
  if (text.includes("HTTP")) return "http";
  if (text.includes("SOCKET") || text.includes("TCP") || text.includes("TEP"))
    return "tcp";
  if (text.includes("MQ") || text.includes("消息队列")) return "mq";
  if (text.includes("TUXEDO")) return "tuxedo";
  if (text) return "other";
  return DEFAULT_PROFILE.transport;
}

function normalizeMessageFormat(value: string): ApiMessageFormat {
  const text = value.trim().toUpperCase();
  if (text.includes("JSON")) return "json";
  if (text.includes("XML")) return "xml";
  if (text.includes("SOAP")) return "soap";
  if (text.includes("TEXT") || text.includes("文本")) return "text";
  if (text) return "other";
  return DEFAULT_PROFILE.messageFormat;
}

/** 从结构化接口文档「技术信息」段解析通讯方式与报文类型 */
export function parseApiTechnicalProfile(
  structuredDoc: string,
): ApiTechnicalProfile {
  const section = extractApiDocSection(structuredDoc, "技术信息");
  if (!section.trim()) {
    return { ...DEFAULT_PROFILE };
  }

  const transport = normalizeTransport(
    getApiDocFieldValue(section, "通讯方式"),
  );
  const messageFormat = normalizeMessageFormat(
    getApiDocFieldValue(section, "报文类型"),
  );
  const encoding =
    getApiDocFieldValue(section, "报文编码").trim() || DEFAULT_PROFILE.encoding;
  const invocationMode =
    getApiDocFieldValue(section, "调用模式").trim() || undefined;
  const maxMessageSize =
    getApiDocFieldValue(section, "最大报文大小").trim() || undefined;
  const businessHeaderMark =
    getApiDocFieldValue(section, "业务头标示").trim() || undefined;

  return {
    transport,
    messageFormat,
    encoding,
    invocationMode,
    maxMessageSize,
    businessHeaderMark,
  };
}

export interface TechnicalProfileEndpointHint {
  method?: string | null;
  path?: string | null;
  requestNotes?: string | null;
}

/** 文档「技术信息」段是否已填写通讯方式或报文类型（非空即视为用户/上传文档的明确配置） */
export function hasExplicitTechnicalInfoSection(
  structuredDoc: string,
): boolean {
  const section = extractApiDocSection(structuredDoc, "技术信息");
  if (!section.trim()) {
    return false;
  }
  return (
    getApiDocFieldValue(section, "通讯方式").trim().length > 0 ||
    getApiDocFieldValue(section, "报文类型").trim().length > 0
  );
}

function deriveTechnicalProfileFromEndpoint(
  endpoint: TechnicalProfileEndpointHint,
): ApiTechnicalProfile {
  const method = (endpoint.method || "").toUpperCase();
  const path = (endpoint.path || "").toLowerCase();
  const requestNotes = (endpoint.requestNotes || "").trim();
  const sample = requestNotes;

  const isTcp =
    ["TCP", "TEP", "SOCKET"].includes(method) ||
    path.startsWith("tcp://") ||
    path.startsWith("socket://");
  const transport = isTcp ? ("tcp" as const) : ("http" as const);

  const isXml =
    sample.startsWith("<") || sample.includes("</") || sample.includes("<?xml");
  const messageFormat = isXml ? ("xml" as const) : ("json" as const);

  return {
    transport,
    messageFormat,
    encoding: DEFAULT_PROFILE.encoding,
  };
}

/**
 * 按优先级解析技术画像：
 * 1. structuredDoc「技术信息」段（含明确填写时，即使为 HTTP/JSON/UTF-8 也优先）
 * 2. smpData.callServiceList（无技术信息段时的兜底）
 * 3. endpoint method / requestNotes 启发式推断
 */
export function resolveApiTechnicalProfile(
  structuredDoc: string,
  options?: {
    endpoint?: TechnicalProfileEndpointHint | null;
    smpData?: {
      callServiceList?: unknown[];
      serviceTestList?: unknown[];
    } | null;
  },
): ApiTechnicalProfile {
  if (hasExplicitTechnicalInfoSection(structuredDoc)) {
    return parseApiTechnicalProfile(structuredDoc);
  }

  const smpProfile = resolveTechnicalProfileFromSmpData(options?.smpData);
  if (smpProfile) {
    return smpProfile;
  }

  if (options?.endpoint) {
    return deriveTechnicalProfileFromEndpoint(options.endpoint);
  }

  return parseApiTechnicalProfile(structuredDoc);
}

export function resolveContentType(profile: ApiTechnicalProfile): string {
  switch (profile.messageFormat) {
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

/** 非 HTTP 接口生成时，在场景约束后追加通讯方式适配说明 */
export function appendScenarioProtocolAdaptation(
  scenarioPromptText: string,
  profile: ApiTechnicalProfile,
): string {
  const base = scenarioPromptText.trim();
  if (profile.transport === "http") {
    return base;
  }

  const formatLabel =
    profile.messageFormat === "xml"
      ? "XML"
      : profile.messageFormat === "json"
        ? "JSON"
        : profile.messageFormat.toUpperCase();

  const adaptation = [
    "【场景提示词通讯适配】",
    `本接口为 ${profile.transport.toUpperCase()} + ${formatLabel}，须以「通讯与报文格式」为准：`,
    "- 忽略场景约束中的 HTTP 方法、URL、HTTP 状态码表述；",
    profile.messageFormat === "xml"
      ? "- requestBody 输出完整 XML 字符串（含 sysHeader/bizHeader/bizBody）；"
      : "- requestBody 按报文类型输出对应格式；",
    "- 案例 remark 描述预期业务返回码及关键业务节点。",
  ].join("\n");

  return base ? `${base}\n\n${adaptation}` : adaptation;
}

/** 构建 AI Prompt 中的接口上下文（TCP 不出现 HTTP 方法/路径） */
export function buildEndpointContextForPrompt(
  profile: ApiTechnicalProfile,
  input: {
    endpointMethod: string;
    endpointPath: string;
    structuredDoc: string;
    requestNotes?: string;
  },
): string {
  const formatLabel =
    profile.messageFormat === "json"
      ? "JSON"
      : profile.messageFormat === "xml"
        ? "XML"
        : profile.messageFormat.toUpperCase();

  const lines: string[] = [];

  if (profile.transport === "tcp") {
    const basic = extractApiDocSection(input.structuredDoc, "基础信息");
    const serviceUrl = getApiDocFieldValue(basic, "服务URL").trim();
    lines.push(
      `- 通讯方式：Socket`,
      `- 报文类型：${formatLabel}`,
      `- 连接地址：${serviceUrl || input.endpointPath || "（由执行环境 host:port 配置，如 32.114.71.6:60030）"}`,
      `- **禁止**生成 HTTP 方法、URL、HTTP 状态码；requestBody 仅输出报文体`,
    );
  } else if (profile.transport === "mq") {
    lines.push(
      `- 通讯方式：MQ`,
      `- 报文类型：${formatLabel}`,
      `- **禁止**生成 HTTP 方法、URL、HTTP 状态码；requestBody 仅输出消息体`,
    );
  } else if (profile.transport === "http") {
    lines.push(
      `- 通讯方式：HTTP`,
      `- 报文类型：${formatLabel}`,
      `- HTTP 方法：${input.endpointMethod}`,
      `- 接口路径：${input.endpointPath}`,
    );
  } else {
    lines.push(
      `- 通讯方式：${profile.transport.toUpperCase()}`,
      `- 报文类型：${formatLabel}`,
      `- 接口标识：${input.endpointPath || input.endpointMethod}`,
    );
  }

  if (input.requestNotes?.trim()) {
    lines.push(
      "",
      "- 请求报文示例（请严格参照字段结构与数据类型）：",
      "```",
      truncateText(input.requestNotes.trim(), 3000),
      "```",
    );
  }
  return lines.join("\n");
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n...（已截断）";
}

export function buildCaseRequestFromProfile(
  endpoint: { method: string; path: string },
  profile: ApiTechnicalProfile,
  body: unknown,
): ApiCaseRequest {
  const contentType = resolveContentType(profile);
  const isHttp = profile.transport === "http";

  const request: ApiCaseRequest = {
    method: isHttp ? endpoint.method : "",
    path: isHttp ? endpoint.path : "",
    transport: profile.transport,
    contentType,
    encoding: profile.encoding,
    body,
  };

  if (isHttp) {
    request.headers = { "Content-Type": contentType };
  }

  if (
    profile.transport === "tcp" &&
    (profile.messageFormat === "xml" || profile.messageFormat === "json")
  ) {
    request.framing = {
      type: "length-prefix",
      width: 8,
      encoding: profile.encoding?.toUpperCase().includes("GBK")
        ? "GBK"
        : profile.encoding,
    };
  }

  if (profile.transport === "mq") {
    request.transport = "mq";
  }

  return request;
}

export function buildDefaultExpected(
  profile: ApiTechnicalProfile,
  polarity: ApiCasePolarity,
): ApiCaseExpected {
  return sharedBuildDefaultExpected(
    profile.transport,
    profile.messageFormat,
    polarity,
  );
}

/** SMP socketWay → ApiTransport */
export function mapSocketWayToTransport(socketWay: string): ApiTransport {
  return normalizeTransport(socketWay);
}

/** SMP messageType → ApiMessageFormat */
export function mapMessageTypeToFormat(messageType: string): ApiMessageFormat {
  return normalizeMessageFormat(messageType);
}

/**
 * 从 SMP smpData 兜底解析技术画像。
 * 当 structuredDoc 无「技术信息」段时，用 smpData.callServiceList 的 socketWay / messageType 推断。
 */
export function resolveTechnicalProfileFromSmpData(
  smpData?: {
    callServiceList?: unknown[];
    serviceTestList?: unknown[];
  } | null,
): ApiTechnicalProfile | null {
  if (!smpData?.callServiceList?.length) return null;
  const callItem = smpData.callServiceList[0] as Record<string, unknown>;
  const testItem = (smpData.serviceTestList?.[0] ?? {}) as Record<
    string,
    unknown
  >;

  const socketWay = String(callItem.socketWay ?? "");
  const messageType = String(
    callItem.messageType ?? testItem.requestMessageType ?? "",
  );
  const messageCoding = String(
    callItem.messageCoding ?? testItem.requestEncoding ?? "",
  );

  if (!socketWay && !messageType) return null;

  return {
    transport: mapSocketWayToTransport(socketWay),
    messageFormat: mapMessageTypeToFormat(messageType),
    encoding: messageCoding.trim() || DEFAULT_PROFILE.encoding,
    invocationMode: String(callItem.callMethod ?? "").trim() || undefined,
    maxMessageSize: String(callItem.maxMessageSize ?? "").trim() || undefined,
    businessHeaderMark: String(callItem.headId ?? "").trim() || undefined,
  };
}
