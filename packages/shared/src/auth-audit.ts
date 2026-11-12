/**
 * @file 统一认证与代登录审计的共享类型定义。
 * 前后端共同消费事件类型、明细、汇总和导出任务结构。
 */

/** 第一版记录的认证审计事件类型。 */
export const AUTH_AUDIT_EVENT_TYPES = [
  "login_success",
  "login_failure",
  "logout",
  "impersonation_start",
  "impersonation_exit",
] as const;

export type AuthAuditEventType = (typeof AUTH_AUDIT_EVENT_TYPES)[number];

/** 页面和导出中使用的中文事件名称。 */
export const AUTH_AUDIT_EVENT_TYPE_LABELS: Record<AuthAuditEventType, string> = {
  login_success: "登录成功",
  login_failure: "登录失败",
  logout: "退出登录",
  impersonation_start: "开始代登录",
  impersonation_exit: "退出代登录",
};

/** 单条认证审计事件（敏感字段不会出现在这里）。 */
export interface AuthAuditEvent {
  id: string;
  /** UTC 时间，ISO 8601 字符串。 */
  occurredAt: string;
  eventType: AuthAuditEventType;
  /** 登录或操作的目标账号；失败登录未知账号时为空。 */
  userName: string | null;
  /** 原始操作人；代登录时为 system。 */
  actorUserName: string | null;
  /** 规范化后的 IPv4 / IPv6 文本。 */
  clientIp: string | null;
  /** 与 JWT jti 对应的会话 ID。 */
  sessionId: string | null;
  requestId: string;
  /** SSO、local-jwt、impersonation 等来源。 */
  sourceApp: string | null;
  userAgent: string | null;
  /** 稳定的失败码，成功事件为空。 */
  failureCode: string | null;
  /** 代登录原因或失败说明摘要。 */
  reason: string | null;
  /** 扩展字段，不参与索引。 */
  metadata: Record<string, unknown> | null;
}

/** 明细查询的游标分页结果。 */
export interface AuthAuditEventPage {
  items: AuthAuditEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** 明细筛选条件，导出任务复用。 */
export interface AuthAuditEventFilters {
  eventType?: AuthAuditEventType;
  userName?: string;
  ip?: string;
  requestId?: string;
  sessionId?: string;
}

/** 日汇总中的单点数据。 */
export interface AuthAuditSummaryPoint {
  /** UTC 日期，格式 YYYY-MM-DD。 */
  statDate: string;
  eventType: AuthAuditEventType;
  count: number;
}

/** 日汇总接口返回结构。 */
export interface AuthAuditSummary {
  from: string;
  to: string;
  /** 每种事件的区间合计。 */
  totals: Record<AuthAuditEventType, number>;
  items: AuthAuditSummaryPoint[];
}

/** 异步导出任务状态。 */
export const AUTH_AUDIT_EXPORT_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;

export type AuthAuditExportStatus = (typeof AUTH_AUDIT_EXPORT_STATUSES)[number];

/** 异步导出任务。 */
export interface AuthAuditExportJob {
  id: string;
  status: AuthAuditExportStatus;
  /** 查询开始时间，ISO 8601。 */
  from: string;
  /** 查询结束时间，ISO 8601。 */
  to: string;
  filters: AuthAuditEventFilters;
  totalRows: number;
  fileName: string | null;
  errorMessage: string | null;
  requestedBy: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** 明细接口单页最大条数。 */
export const AUTH_AUDIT_MAX_PAGE_SIZE = 100;

/** 明细接口默认页大小。 */
export const AUTH_AUDIT_DEFAULT_PAGE_SIZE = 50;

/** 明细交互查询允许的最大时间范围（天）。 */
export const AUTH_AUDIT_MAX_QUERY_DAYS = 31;

/** 单次导出允许的最大数据行数。 */
export const AUTH_AUDIT_MAX_EXPORT_ROWS = 100_000;
