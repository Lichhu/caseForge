export type ApiCasePolarity = "positive" | "negative";
export type ApiCasePriority = "P0" | "P1" | "P2";
export type ApiCaseSource = "ai" | "manual" | "ai_edited";
export type ApiCaseStatus = "draft" | "ready" | "disabled";
export type ApiRunItemStatus = "passed" | "failed" | "error" | "skipped";
export type ApiStructuringStatus =
  | "idle"
  | "processing"
  | "completed"
  | "failed";
export type ApiTransport = "http" | "tcp" | "mq" | "tuxedo" | "other";
export type ApiMessageFormat = "json" | "xml" | "text" | "soap" | "other";

export interface ApiMessageFraming {
  type: "length-prefix";
  width: number;
  encoding?: string;
}

export interface ApiTechnicalProfile {
  transport: ApiTransport;
  messageFormat: ApiMessageFormat;
  encoding?: string;
  invocationMode?: string;
  maxMessageSize?: string;
  businessHeaderMark?: string;
}

/**
 * 断言类型。各类型取值来源与 expression / expected 字段用法：
 *
 * | type           | 取值来源          | expression          | expected            | 适用 operator         |
 * |----------------|-------------------|---------------------|---------------------|-----------------------|
 * | status_code    | HTTP 状态码       | 留空                | 状态码如 "200"      | eq/nq/gt/lt/gte/lte  |
 * | headers        | 响应头            | header 名           | 预期值              | eq/nq                |
 * | jsonpath       | JSONPath 取值     | $.path.to.field     | 预期值              | eq/nq/gt/lt/gte/lte  |
 * | jmespath       | JMESPath 取值     | JMESPath 表达式     | 预期值（可省，省略=truthy 检查） | eq/nq/gt/lt/gte/lte |
 * | xpath          | XPath 取值        | XPath 表达式        | 预期值（可省，省略=节点存在检查） | eq/nq |
 * | raw            | 原始响应体全文    | 留空                | 预期全文            | eq/nq                |
 * | string         | 响应体包含检查    | 要匹配的字符串      | 不需要              | eq=包含 / nq=不包含  |
 * | re             | 正则匹配          | 正则表达式          | 不需要              | eq=匹配 / nq=不匹配  |
 * | response_size  | 响应体字节数      | 留空                | 字节数              | eq/nq/gt/lt/gte/lte  |
 * | default        | 业务码默认检查    | 留空                | 不需要              | eq（正向检查成功码，反向恒过）|
 * | rsp_download   | 下载响应检查      | 文件名模式（可省）  | 不需要              | eq=是下载 / nq=非下载|
 */
export type AssertionType =
  | "status_code"
  | "headers"
  | "jsonpath"
  | "jmespath"
  | "xpath"
  | "raw"
  | "string"
  | "re"
  | "response_size"
  | "default"
  | "rsp_download";

/**
 * 比较运算符。
 * - eq: 等于（string/re 类型语义为「包含/匹配」）
 * - nq: 不等于（string/re 类型语义为「不包含/不匹配」）
 * - gt / lt / gte / lte: 大于 / 小于 / 大于等于 / 小于等于（数值比较）
 */
export type AssertionOperator = "eq" | "nq" | "gt" | "lt" | "gte" | "lte";

/**
 * 单条断言定义。
 * @param type - 断言类型，决定取值来源
 * @param operator - 比较运算符
 * @param expression - 断言表达式（路径/正则/要匹配的字符串/header名等，含义随 type 变化）
 * @param expected - 预期值（部分类型可省略，如 string/re/default）
 * @param description - 人类可读的断言描述
 */
export interface ApiAssertion {
  description?: string;
  type: AssertionType;
  operator: AssertionOperator;
  expression: string;
  expected?: string;
}

export interface ApiCaseRequest {
  method: string;
  path: string;
  transport?: ApiTransport;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
  contentType?: string;
  encoding?: string;
  framing?: ApiMessageFraming;
}

export interface ApiCaseExpected {
  assertions?: ApiAssertion[];
}

export interface ApiTestCasePayload {
  title: string;
  caseNo?: string;
  description: string;
  remark?: string;
  transactionCode?: string;
  owner?: string;
  priority: ApiCasePriority;
  polarity: ApiCasePolarity;
  enabled: boolean;
  status: ApiCaseStatus;
  preconditions: string[];
  request: ApiCaseRequest;
  expected: ApiCaseExpected;
  metadata?: {
    source?: ApiCaseSource;
    inferredFields?: string[];
    promptIds?: string[];
    bodyOverrides?: Record<string, unknown>;
    generateVersion?: number;
    debugEnvironmentId?: string;
    debugEnvironmentServiceId?: string;
    lastDebugRun?: CaseLastDebugRun;
  };
}

export interface ApiEndpointPayload {
  id?: string;
  name: string;
  method: string;
  path: string;
  summary?: string;
  requestNotes?: string;
  responseNotes?: string;
  tags?: string[];
}

export interface AssertionResult {
  name: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  message?: string;
}

/** 案例最近一次调试执行快照，存入 metadata.lastDebugRun */
export interface CaseLastDebugRun {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  bodySize: number;
  durationMs: number;
  error?: string;
  assertions: AssertionResult[];
  executedAt?: string;
}

export interface AiCasePlanItem {
  caseNo?: string;
  caseName: string;
  caseDesc: string;
  caseType: "正" | "反";
  priority?: "高" | "中" | "低";
  remark?: string;
  bodyOverrides?: Record<string, string | number | boolean | null>;
  headerOverrides?: Record<string, string>;
  expectedResult: string;
  assertions?: ApiAssertion[];
}

/**
 * 根据传输协议、报文格式与极性生成默认断言配置。
 * 前端和后端共用此函数，避免两处 drift。
 */
export function buildDefaultExpected(
  transport: ApiTransport,
  messageFormat: ApiMessageFormat,
  polarity: ApiCasePolarity,
): ApiCaseExpected {
  const isNegative = polarity === "negative";
  const isHttp = transport === "http";

  if (isHttp) {
    return {
      assertions: [
        {
          description: "HTTP 状态码",
          type: "status_code",
          operator: "eq",
          expression: "",
          expected: isNegative ? "400" : "200",
        },
        ...(messageFormat === "json"
          ? []
          : [
              {
                description: "响应体关键内容",
                type: "string" as const,
                operator: "eq" as const,
                expression: isNegative ? "error" : "success",
              },
            ]),
      ],
    };
  }

  if (transport === "tcp" && messageFormat === "xml") {
    return {
      assertions: isNegative
        ? [
            {
              description: "响应报文含业务返回码",
              type: "string" as const,
              operator: "eq" as const,
              expression: "bizResCode",
            },
          ]
        : [
            {
              description: "响应 bizResCode 成功",
              type: "string" as const,
              operator: "eq" as const,
              expression: "000000",
            },
            {
              description: "响应为完整 XML",
              type: "string" as const,
              operator: "eq" as const,
              expression: "</Transaction>",
            },
          ],
    };
  }

  return {
    assertions: isNegative
      ? [
          {
            description: "响应报文含业务返回码",
            type: "string" as const,
            operator: "eq" as const,
            expression: "bizResCode",
          },
        ]
      : [
          {
            description: "响应业务码成功",
            type: "string" as const,
            operator: "eq" as const,
            expression: "000000",
          },
        ],
  };
}
