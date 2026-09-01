/** 需求平台：需求分发/认领状态 */
export const REQUIREMENT_STATUSES = [
  'pending_dispatch',
  'pending_claim',
  'claimed',
] as const;

export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

/** 需求状态中文标签 */
export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  pending_dispatch: '待分发',
  pending_claim: '待认领',
  claimed: '已认领',
};

/** 需求平台列表条目 */
export interface RequirementPlatformItem {
  id: string;
  /** 需求 code（源库 b_project.project_code） */
  projectCode: string;
  /** 需求名（源库 b_project.project_name） */
  projectName: string;
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
  refuseReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 需求平台列表响应 */
export interface RequirementPlatformListResult {
  rows: RequirementPlatformItem[];
  count: number;
  /** 当前用户是否为分发人（白名单） */
  isDispatcher: boolean;
  /** 是否正在同步 */
  syncing: boolean;
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
