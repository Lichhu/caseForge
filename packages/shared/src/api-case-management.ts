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
}

export interface ManagedCaseOptions {
  projects: { value: string; label: string }[];
  transactions: { value: string; label: string }[];
  applications: { value: string; label: string }[];
  versions: { value: string; label: string }[];
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
