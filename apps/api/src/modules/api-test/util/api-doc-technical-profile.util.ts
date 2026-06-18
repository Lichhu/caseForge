import type {
  ApiCaseExpected,
  ApiCasePolarity,
  ApiCaseRequest,
  ApiMessageFormat,
  ApiTechnicalProfile,
  ApiTransport,
} from "@case-forge/shared";
import {
  extractApiDocSection,
  getApiDocFieldValue,
} from "./api-doc.parser";
import { buildXmlGuidanceExtra } from "./api-xml-request-template.util";

const DEFAULT_PROFILE: ApiTechnicalProfile = {
  transport: "http",
  messageFormat: "json",
  encoding: "UTF-8",
};

function normalizeTransport(value: string): ApiTransport {
  const text = value.trim().toUpperCase();
  if (text.includes("HTTP")) return "http";
  if (text.includes("SOCKET") || text.includes("TCP")) return "tcp";
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

  const transport = normalizeTransport(getApiDocFieldValue(section, "通讯方式"));
  const messageFormat = normalizeMessageFormat(
    getApiDocFieldValue(section, "报文类型"),
  );
  const encoding =
    getApiDocFieldValue(section, "报文编码").trim() ||
    DEFAULT_PROFILE.encoding;
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

export function buildProtocolGuidance(
  profile: ApiTechnicalProfile,
  structuredDoc?: string,
  transactionCode?: string,
): string {
  const transportLabel =
    profile.transport === "http"
      ? "HTTP"
      : profile.transport === "tcp"
        ? "Socket"
        : profile.transport === "mq"
          ? "MQ"
          : profile.transport === "tuxedo"
            ? "TUXEDO"
            : "其它通讯方式";
  const formatLabel =
    profile.messageFormat === "json"
      ? "JSON"
      : profile.messageFormat === "xml"
        ? "XML"
        : profile.messageFormat === "soap"
          ? "SOAP"
          : profile.messageFormat === "text"
            ? "文本"
            : "其它报文类型";

  const lines = [
    `本接口通讯方式为 **${transportLabel}**，报文类型为 **${formatLabel}**${
      profile.encoding ? `，编码 **${profile.encoding}**` : ""
    }。`,
    "",
    "### 请求报文生成规则",
  ];

  if (profile.messageFormat === "json") {
    lines.push(
      "- `requestBody` 输出 **JSON 对象字符串**（仅业务报文体，不含 HTTP 头）。",
      "- 字段名须与文档「请求报文」表中的**节点代码**一致。",
    );
  } else if (profile.messageFormat === "xml" || profile.messageFormat === "soap") {
    lines.push(
      "- `requestBody` 输出 **完整 XML 字符串**（非 JSON 对象）。",
      "- 按文档「请求报文」表的**节点路径**嵌套生成标签，标签名取**节点代码**。",
      "- 根节点为 `Transaction`，须包含 `Header/sysHeader`、`Body/request/bizHeader`、`Body/request/bizBody` 三层。",
    );
    if (
      profile.transport === "tcp" &&
      structuredDoc?.trim() &&
      transactionCode
    ) {
      lines.push(buildXmlGuidanceExtra(structuredDoc, transactionCode));
    }
    if (profile.messageFormat === "soap") {
      lines.push(
        "- 若文档要求 SOAP 封装，在业务 XML 外套上标准 SOAP Envelope/Body。",
      );
    }
  } else if (profile.messageFormat === "text") {
    lines.push(
      "- `requestBody` 输出 **纯文本字符串**，按文档字段顺序或定长格式拼接。",
    );
  } else {
    lines.push(
      "- `requestBody` 按文档「请求报文」定义的格式输出字符串。",
    );
  }

  lines.push("", "### 预期结果生成规则");

  if (profile.transport === "http") {
    lines.push(
      "- `expectedResult` 须写明 **HTTP 状态码**（如 HTTP 200、HTTP 400）及关键响应字段/报文片段断言。",
    );
    if (profile.messageFormat === "xml" || profile.messageFormat === "soap") {
      lines.push(
        "- 响应为 XML 时，断言响应报文中的业务节点取值或错误码节点（如 `retCode`、`retMsg`）。",
      );
    }
  } else if (profile.transport === "tcp") {
    lines.push(
      "- **不要写 HTTP 状态码**；`expectedResult` 描述 **Socket 响应报文**中的业务返回码、错误信息或关键 XML 节点。",
      "- 正向案例示例：`响应报文 bizResCode=000000，bizBody 含目标字段`；反向示例：`响应报文 bizResCode 非 000000，bizResText 提示参数非法`。",
    );
    if (profile.messageFormat === "xml") {
      lines.push(
        "- 响应通常以 `</Transaction>` 结尾；断言中可引用响应 XML 节点路径。",
      );
    }
  } else if (profile.transport === "mq") {
    lines.push(
      "- **不要写 HTTP 状态码**；`expectedResult` 描述 **MQ 响应报文**中的业务返回码、错误信息或关键节点。",
    );
  } else {
    lines.push(
      "- `expectedResult` 描述业务返回码或响应报文关键字段，不要编造 HTTP 语义（除非文档明确为 HTTP）。",
    );
  }

  if (profile.businessHeaderMark) {
    lines.push(
      "",
      `### 业务头`,
      `- 文档标注业务头标示为 \`${profile.businessHeaderMark}\`，请求/响应报文生成时须保留对应头字段。`,
    );
  }

  return lines.join("\n");
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
    "- expectedResult 断言响应报文 bizResCode/resCode 及关键业务节点。",
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
  },
): string {
  const formatLabel =
    profile.messageFormat === "json"
      ? "JSON"
      : profile.messageFormat === "xml"
        ? "XML"
        : profile.messageFormat.toUpperCase();

  if (profile.transport === "tcp") {
    const basic = extractApiDocSection(input.structuredDoc, "基础信息");
    const serviceUrl = getApiDocFieldValue(basic, "服务URL").trim();
    return [
      `- 通讯方式：Socket`,
      `- 报文类型：${formatLabel}`,
      `- 连接地址：${serviceUrl || "（由执行环境 host:port 配置，如 32.114.71.6:60030）"}`,
      `- **禁止**生成 HTTP 方法、URL、HTTP 状态码；requestBody 仅输出报文体`,
    ].join("\n");
  }

  if (profile.transport === "mq") {
    return [
      `- 通讯方式：MQ`,
      `- 报文类型：${formatLabel}`,
      `- **禁止**生成 HTTP 方法、URL、HTTP 状态码；requestBody 仅输出消息体`,
    ].join("\n");
  }

  if (profile.transport === "http") {
    return [
      `- 通讯方式：HTTP`,
      `- 报文类型：${formatLabel}`,
      `- HTTP 方法：${input.endpointMethod}`,
      `- 接口路径：${input.endpointPath}`,
    ].join("\n");
  }

  return [
    `- 通讯方式：${profile.transport.toUpperCase()}`,
    `- 报文类型：${formatLabel}`,
    `- 接口标识：${input.endpointPath || input.endpointMethod}`,
  ].join("\n");
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

  if (profile.transport === "tcp" && profile.messageFormat === "xml") {
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
  if (profile.transport !== "http") {
    return {
      skipStatusCheck: true,
      statusOnly: false,
      bodyAssertions:
        polarity === "negative"
          ? [
              {
                type: "contains",
                expected: "bizResCode",
                description: "响应报文含业务返回码",
              },
            ]
          : [
              {
                type: "contains",
                expected: "000000",
                description: "响应报文 bizResCode 为成功",
              },
            ],
    };
  }
  return {
    statusCode: polarity === "negative" ? [400, 422, 500] : [200, 201],
    statusOnly: true,
    skipStatusCheck: false,
  };
}
