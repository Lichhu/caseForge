/** 准生产管理列表、筛选项和跨页选择的 HTTP 合约。 */
export interface ManagedCaseQuery {
  page?: number;
  pageSize?: number;
  projectId?: string;
  transactionId?: string;
  applicationPath?: string;
  versionCode?: string;
  keyword?: string;
  latestOnly?: boolean;
}

export interface ManagedCaseSelection {
  id: string;
  projectId: string;
  transactionId: string;
  title: string;
  enabled: boolean;
  /** 案例归属应用，用于执行推送时校验并匹配执行计划应用 */
  applicationPath?: string | null;
}

export interface ManagedCaseOptions {
  projects: { value: string; label: string }[];
  transactions: { value: string; label: string }[];
  applications: { value: string; label: string }[];
  versions: { value: string; label: string }[];
}

export type ApiPreproductionRunExecutionStatus =
  | "running"
  | "passed"
  | "failed"
  | "error";

export type ApiPreproductionRunPushStatus =
  | "pending"
  | "success"
  | "failed";

export type ApiPreproductionRunSetStatus =
  | "pending"
  | "running"
  | "completed"
  | "partial_failed"
  | "failed";

/** 一次“运行推送”或“批量执行”产生的执行推送集。 */
export interface ApiPreproductionRunSet {
  id: string;
  name?: string | null;
  versionId: string;
  versionLabel: string;
  applicationId?: string | null;
  applicationLabel?: string | null;
  roundId?: string | null;
  roundLabel?: string | null;
  status: ApiPreproductionRunSetStatus;
  totalCount: number;
  completedCount: number;
  passedCount: number;
  failedCount: number;
  errorCount: number;
  pushSuccessCount: number;
  pushFailedCount: number;
  createdBy: string;
  createdAt: string;
  /** 最近一次实际执行时间；从未执行时为空 */
  lastExecutedAt?: string | null;
  finishedAt?: string | null;
}

/** 执行推送集服务端分页结果。 */
export interface ApiPreproductionRunSetListResult {
  rows: ApiPreproductionRunSet[];
  count: number;
  page: number;
  size: number;
}

/** 执行推送集成员：预先关联进集合、等待统一执行的案例。 */
export interface ApiPreproductionRunSetCase {
  id: string;
  runSetId: string;
  caseId: string;
  projectId: string;
  transactionId: string;
  caseTitle: string;
  sortOrder: number;
  createdAt: string;
}

/** 准生产案例一次“执行步骤列表并推送测管”的持久化记录。 */
export interface ApiPreproductionRunRecord {
  id: string;
  projectId: string;
  transactionId: string;
  caseId: string;
  caseTitle: string;
  runSetId?: string | null;
  executionStatus: ApiPreproductionRunExecutionStatus;
  currentStepIndex?: number | null;
  currentStepName?: string | null;
  totalSteps: number;
  executionError?: string | null;
  runId?: string | null;
  pushStatus: ApiPreproductionRunPushStatus;
  pushError?: string | null;
  reportUrl?: string | null;
  createdAt: string;
  finishedAt?: string | null;
  pushFinishedAt?: string | null;
}

/** 准生产同步预检中的单条关联案例 */
export interface PreproductionSyncCasePreview {
  id: string;
  transactionId: string;
  transactionCode: string;
  caseNo?: string | null;
  title: string;
  versionCode?: string | null;
  generateVersion?: number | null;
  polarity: "positive" | "negative";
  priority: string;
  enabled: boolean;
  stepCount: number;
  alreadySynced: boolean;
}

/** 准生产同步预检结果 */
export interface PreproductionSyncPreview {
  requirement: {
    id: string;
    projectCode: string;
    projectName: string;
    applicationName: string | null;
  } | null;
  applicationMissing: boolean;
  transactions: Array<{
    id: string;
    code: string;
    name: string;
    linkedCount: number;
  }>;
  cases: PreproductionSyncCasePreview[];
  invalidCaseCount: number;
  totalLinkedCount: number;
  syncableCount: number;
}

/** 准生产同步结果 */
export interface PreproductionSyncResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
  transactionCount: number;
  syncedAt: string;
}
