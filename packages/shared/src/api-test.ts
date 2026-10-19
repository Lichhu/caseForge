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

export const API_SERVICE_PROPERTIES = [
  "query_non_accounting",
  "query_accounting",
  "management_non_accounting",
  "management_accounting",
  "accounting",
  "reversal",
  "file",
  "push",
] as const;
export type ApiServiceProperty = (typeof API_SERVICE_PROPERTIES)[number];

export interface ApiDocChannel {
  id: string;
  name: string;
  clientCd: string;
  serviceCd: string;
}

export interface ApiDocGenerationProfile {
  serviceProperty: ApiServiceProperty;
  transport: "http" | "socket";
  messageFormat: "json" | "xml" | "text";
  exampleMessage: string;
  channels: ApiDocChannel[];
}

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
 *
 * expected 另支持 ${共享变量} 与数据函数调用（如 ${DB_BALANCE('003').amt}
 * 取数据库值作比较基准）：执行时先替换变量再解析函数，最后与响应实际值比较；
 * 函数参数中的 $. 路径相对本步骤实际发出的请求报文解析。
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
 * @param expected - 预期值（部分类型可省略，如 string/re/default；支持 ${变量} 与数据函数调用）
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
  /** JSON body source text kept for editor round-tripping; execution uses body. */
  bodyText?: string;
  contentType?: string;
  encoding?: string;
  framing?: ApiMessageFraming;
  repeatCount?: number;
}

export interface ApiCaseExpected {
  assertions?: ApiAssertion[];
}

export interface ApiStepTarget {
  name: string;
  address: string;
  headers?: Record<string, string>;
  /** 步骤绑定的执行环境与服务，执行时用于继承服务级配置（如忽略证书校验） */
  environmentId?: string;
  environmentServiceId?: string;
}

/** 步骤类型：缺省为请求步骤，兼容历史数据 */
export type ApiCaseStepKind = "http" | "db";

/** SQL 步骤用法：query 只查数据，execute 改数据 */
export type ApiDbStepMode = "query" | "execute";

/**
 * SQL 步骤的变量提取来源：
 * row=第一行的某个字段，rows=整个结果集，rowCount=查询条数，affectedRows=update 影响行数
 */
export const DB_EXPORT_SOURCES = [
  "row",
  "rows",
  "rowCount",
  "affectedRows",
] as const;

/** 是否为 SQL 步骤专用的提取来源 */
export function isDbExportSource(source: string) {
  return (DB_EXPORT_SOURCES as readonly string[]).includes(source);
}

/** 改数据的影响行数上限默认值 */
export const DB_STEP_DEFAULT_MAX_AFFECTED_ROWS = 500;
/** SQL 执行超时默认值与上限（毫秒） */
export const DB_STEP_DEFAULT_TIMEOUT_MS = 10000;
export const DB_STEP_MAX_TIMEOUT_MS = 60000;
/** SQL 步骤结果快照最多保留的行数，超出只记行数不记明细 */
export const DB_STEP_SNAPSHOT_MAX_ROWS = 100;

/** 归一化 SQL 执行超时：缺省 10 秒，范围 1 秒 ~ 60 秒 */
export function resolveDbStepTimeoutMs(raw?: number | null): number {
  if (raw === undefined || raw === null || !Number.isFinite(raw))
    return DB_STEP_DEFAULT_TIMEOUT_MS;
  return Math.min(
    Math.max(Math.floor(raw), 1000),
    DB_STEP_MAX_TIMEOUT_MS,
  );
}

/** 归一化影响行数上限：缺省 500 行，范围 1 ~ 100000 行 */
export function resolveDbStepMaxAffectedRows(raw?: number | null): number {
  if (raw === undefined || raw === null || !Number.isFinite(raw))
    return DB_STEP_DEFAULT_MAX_AFFECTED_ROWS;
  return Math.min(
    Math.max(Math.floor(raw), 1),
    DB_STEP_DEFAULT_MAX_AFFECTED_ROWS * 200,
  );
}

/**
 * SQL 步骤配置。
 * @param connectionId - 手动选择的数据库连接 id
 * @param mode - 查询 / 改数据，需与 SQL 语句类型一致
 * @param sql - 单条 SQL；取值直接在语句里写 `${共享变量}`，执行前替换（值按 SQL 字面量转义）
 * @param maxAffectedRows - execute 模式的影响行数上限，超过直接报错
 * @param timeoutMs - 单条 SQL 超时
 */
export interface ApiDbStepConfig {
  connectionId: string;
  mode: ApiDbStepMode;
  sql: string;
  maxAffectedRows?: number;
  timeoutMs?: number;
}

/** 请求步骤（原有步骤类型） */
export interface ApiHttpCaseStep {
  id: string;
  kind?: "http";
  name: string;
  /** AI 生成案例中的主请求步骤；前置/后置步骤不设置 */
  isMainRequest?: boolean;
  target?: ApiStepTarget;
  request: ApiCaseRequest;
  expected: ApiCaseExpected;
  exports: ApiCaseExport[];
  /** 与上一步并发执行：相邻开启标记的步骤归入同一并行组，同时发出 */
  parallelWithPrevious?: boolean;
}

/**
 * SQL 步骤：选一个数据库连接执行单条 SQL。
 * 查询结果可通过 exports 提取成变量给后续步骤用；SQL 步骤始终串行，不参与并发组。
 */
export interface ApiDbCaseStep {
  id: string;
  kind: "db";
  name: string;
  db: ApiDbStepConfig;
  exports: ApiCaseExport[];
}

export type ApiCaseStep = ApiHttpCaseStep | ApiDbCaseStep;

/** 是否为 SQL 步骤 */
export function isDbStep(
  step: { kind?: string } | null | undefined,
): step is ApiDbCaseStep {
  return step?.kind === "db";
}

/** 是否为请求步骤（kind 缺省按请求步骤处理，兼容历史数据） */
export function isHttpStep(
  step: { kind?: string } | null | undefined,
): step is ApiHttpCaseStep {
  return !isDbStep(step);
}

/**
 * 按 parallelWithPrevious 标记分组：相邻开启标记的步骤同组，未标记的步骤自成一组。
 * SQL 步骤始终自成一组（开关类操作有先后依赖，不与请求步骤并发）。
 */
export function groupParallelSteps<
  T extends { parallelWithPrevious?: boolean; kind?: string },
>(steps: T[]): T[][] {
  const groups: T[][] = [];
  for (const step of steps) {
    const last = groups[groups.length - 1];
    const previous = last?.[last.length - 1];
    const canJoin =
      Boolean(step.parallelWithPrevious) &&
      !isDbStep(step) &&
      Boolean(previous) &&
      !isDbStep(previous);
    if (canJoin) last.push(step);
    else groups.push([step]);
  }
  return groups;
}

/** SQL 语句最简归一化：去掉注释与字符串字面量，便于判断语句类型和安全性 */
function normalizeSqlForCheck(sql: string) {
  return String(sql ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\s+/g, " ")
    .trim();
}

/** SQL 语句类型：query=查询，execute=改数据，unsupported=第一版不支持，unknown=空语句 */
export function detectDbSqlKind(
  sql: string,
): "query" | "execute" | "unsupported" | "unknown" {
  const source = normalizeSqlForCheck(sql);
  if (!source) return "unknown";
  if (/^(?:select|with)\b/i.test(source)) return "query";
  if (/^update\b/i.test(source)) return "execute";
  return "unsupported";
}

/**
 * SQL 步骤的统一校验，保存时和执行时都会调用（前后端共用，避免两处漂移）。
 * 通过校验返回 null，否则返回可直接展示的错误文案。
 */
export function validateDbStepSql(
  sql: string,
  mode: ApiDbStepMode,
): string | null {
  const source = normalizeSqlForCheck(sql);
  if (!source) return "请填写 SQL";
  if (/;\s*\S/.test(source)) return "只允许单条 SQL，不要用分号拼接多条语句";
  // 已经改成直接在 SQL 里写 ${变量名}，老的 :参数名 写法给明确提示，避免丢给数据库报语法错
  if (/(?<!:):([A-Za-z_]\w*)/.test(source))
    return "SQL 里不再支持 :参数名 占位，请改成 ${变量名}（可用「插入变量」选择）";
  const kind = detectDbSqlKind(sql);
  if (kind === "unsupported")
    return "第一版 SQL 步骤只支持 select 查询和 update 改数据";
  if (mode === "query" && kind === "execute")
    return "当前是查询模式，不能执行 update 语句";
  if (mode === "execute" && kind === "query")
    return "当前是改数据模式，请填写 update 语句";
  if (kind === "execute" && !/\bwhere\b/i.test(source))
    return "update 必须带 where 条件，避免改动整张表";
  return null;
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
  steps?: ApiCaseStep[];
  request: ApiCaseRequest;
  expected: ApiCaseExpected;
  metadata?: {
    exports?: ApiCaseExport[];
    source?: ApiCaseSource;
    inferredFields?: string[];
    promptIds?: string[];
    promptId?: string;
    scenarioName?: string;
    promptName?: string;
    bodyOverrides?: Record<string, unknown>;
    generateVersion?: number;
    debugEnvironmentId?: string;
    debugEnvironmentServiceId?: string;
    debugEncoding?: string;
    lastDebugRun?: CaseLastDebugRun;
  };
}

export interface ApiCaseExport {
  name: string;
  /**
   * 提取来源：
   * - 请求步骤：`request` 表示从本步骤实际发出的请求报文（函数解析后）中提取，其余取自响应
   * - SQL 步骤：`row`/`rows` 取查询结果，`rowCount`/`affectedRows` 取行数
   */
  source:
    | "body"
    | "header"
    | "status"
    | "request"
    | "row"
    | "rows"
    | "rowCount"
    | "affectedRows";
  expression?: string;
  required?: boolean;
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

export interface ApiStepDebugRecord extends CaseLastDebugRun {
  id: string;
  stepId: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  extracted: Record<string, string>;
  target?: { name: string; address: string } | null;
}

export interface AiCasePlanItem {
  caseNo?: string;
  caseName: string;
  caseDesc: string;
  caseType: "正" | "反";
  priority?: "高" | "中" | "低";
  remark?: string;
  bodyOverrides?: Record<string, string>;
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
              description: "响应体含业务返回码",
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
            description: "响应体含业务返回码",
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
