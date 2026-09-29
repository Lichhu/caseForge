/** 案例管理列表、筛选项和跨页选择的 HTTP 合约。 */
export interface ManagedCaseQuery {
  page?: number;
  pageSize?: number;
  projectId?: string;
  transactionId?: string;
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
  versions: { value: string; label: string }[];
}
