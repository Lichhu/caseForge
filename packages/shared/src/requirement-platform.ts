/** 需求平台：需求分发/认领状态 */
export const REQUIREMENT_STATUSES = [
  "pending_dispatch",
  "pending_claim",
  "testing",
  "completed",
  "returned",
] as const;

export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

/** 需求状态中文标签 */
export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  pending_dispatch: "待分发",
  pending_claim: "待受理",
  testing: "测试中",
  completed: "已完成",
  returned: "已打回",
};

/** 需求平台列表条目 */
export interface RequirementPlatformItem {
  id: string;
  /** 需求 code（源库 b_project.project_code） */
  projectCode: string;
  /** 需求名（源库 b_project.project_name） */
  projectName: string;
  /** 所属应用（源库 b_project.application_name） */
  applicationName?: string | null;
  /** 需求版本（源库 b_project.version_name） */
  versionName?: string | null;
  status: RequirementStatus;
  /** 被分发人（认领候选人账号） */
  dispatchedTo?: string | null;
  /** 被分发人姓名快照 */
  dispatchedToName?: string | null;
  dispatchedBy?: string | null;
  dispatchedAt?: string | null;
  claimedBy?: string | null;
  claimedByName?: string | null;
  claimedAt?: string | null;
  /** 认领时自动创建的接口测试项目 id */
  claimedProjectId?: string | null;
  completedAt?: string | null;
  sourceUpdatedAt?: string | null;
  refuseReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequirementDispatcher {
  id: string;
  userName: string;
  remark?: string | null;
}

/** 需求平台列表响应 */
export interface RequirementPlatformListResult {
  rows: RequirementPlatformItem[];
  count: number;
  /** 当前用户是否为分发人（白名单） */
  isDispatcher: boolean;
  isMember?: boolean;
  /** 是否正在同步 */
  syncing: boolean;
}

/** 需求完成情况中可查看的状态（分发人只读查看） */
export const REQUIREMENT_PROGRESS_STATUSES = [
  "testing",
  "completed",
  "returned",
] as const;

export type RequirementProgressStatus =
  (typeof REQUIREMENT_PROGRESS_STATUSES)[number];

export type RequirementExecutionStatus =
  | "running"
  | "passed"
  | "failed"
  | "error"
  | "skipped";

export type RequirementExecutionSource = "api-test" | "preproduction";

export type RequirementPushStatus = "pending" | "success" | "failed";

/** 案例步骤的只读摘要，不返回请求头、报文等可能包含凭证的内容。 */
export interface RequirementProgressStep {
  id: string;
  name: string;
  kind: "http" | "db";
  summary: string;
  /** 步骤在当前案例最近一次执行中的结果；无执行记录时为空 */
  executionStatus?: RequirementExecutionStatus | null;
  durationMs?: number | null;
  error?: string | null;
}

/** 案例最近一次执行情况。 */
export interface RequirementCaseExecution {
  source: RequirementExecutionSource;
  status: RequirementExecutionStatus;
  runId?: string | null;
  createdAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  error?: string | null;
  pushStatus?: RequirementPushStatus | null;
  pushError?: string | null;
  reportUrl?: string | null;
}

export interface RequirementProgressCase {
  id: string;
  caseNo?: string | null;
  title: string;
  priority: string;
  polarity: "positive" | "negative";
  enabled: boolean;
  stepCount: number;
  steps: RequirementProgressStep[];
  latestExecution?: RequirementCaseExecution | null;
}

export interface RequirementProgressTransaction {
  id: string;
  code: string;
  name: string;
  syncStatus?: string | null;
  createdAt: string;
  caseCount: number;
  executedCaseCount: number;
  passedCount: number;
  failedCount: number;
  errorCount: number;
  cases: RequirementProgressCase[];
}

export interface RequirementProgressSummary {
  transactionCount: number;
  caseCount: number;
  stepCount: number;
  executedCaseCount: number;
  passedCount: number;
  failedCount: number;
  errorCount: number;
  pushSuccessCount: number;
  pushFailedCount: number;
}

/** 分发人查看的需求完成情况（需求 → 交易 → 案例 → 步骤 → 执行结果）。 */
export interface RequirementProgressDetail {
  requirement: RequirementPlatformItem;
  projectId?: string | null;
  summary: RequirementProgressSummary;
  transactions: RequirementProgressTransaction[];
  refreshedAt: string;
}

/** 认领候选人（源库 sys_user） */
export interface RequirementClaimCandidate {
  /** 账号（user_name） */
  userName: string;
  /** 姓名（nick_name） */
  nickName: string;
}

/** 同步结果 */
export interface RequirementSyncResult {
  /** 新增入库条数 */
  added: number;
  /** 源库候选总数 */
  candidates: number;
  /** SMP 校验失败/无数据被跳过的条数 */
  skipped: number;
}
