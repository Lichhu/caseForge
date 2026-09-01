/**
 * @file 需求平台接口封装：列表、同步、分发、认领、拒绝、候选人查询
 */
import type {
  RequirementClaimCandidate,
  RequirementPlatformItem,
  RequirementSyncResult,
} from "@case-forge/shared";
import { http } from "./client";

export interface RequirementPlatformListResponse {
  rows: RequirementPlatformItem[];
  count: number;
  isDispatcher: boolean;
  syncing: boolean;
}

/** 需求平台列表（分发人全量，普通用户仅与自己相关的） */
export async function fetchRequirementList(): Promise<RequirementPlatformListResponse> {
  const { data } = await http.get<RequirementPlatformListResponse>(
    "/requirement-platform/requirements",
  );
  return data;
}

/** 手动同步需求（仅分发人），SMP 逐条校验可能较慢，放宽超时 */
export async function syncRequirements(): Promise<RequirementSyncResult> {
  const { data } = await http.post<RequirementSyncResult>(
    "/requirement-platform/requirements/sync",
    null,
    { timeout: 600000 },
  );
  return data;
}

/** 认领候选人列表（源库在职用户，仅分发人） */
export async function fetchClaimCandidates(): Promise<
  RequirementClaimCandidate[]
> {
  const { data } = await http.get<RequirementClaimCandidate[]>(
    "/requirement-platform/requirements/claim-candidates",
  );
  return data;
}

/** 分发需求给指定候选人（仅分发人） */
export async function dispatchRequirement(
  id: string,
  dispatchedTo: string,
): Promise<RequirementPlatformItem> {
  const { data } = await http.post<RequirementPlatformItem>(
    `/requirement-platform/requirements/${id}/dispatch`,
    { dispatchedTo },
  );
  return data;
}

/** 认领需求（仅被分发人），后端自动创建接口测试项目 */
export async function claimRequirement(
  id: string,
): Promise<RequirementPlatformItem> {
  const { data } = await http.post<RequirementPlatformItem>(
    `/requirement-platform/requirements/${id}/claim`,
  );
  return data;
}

/** 拒绝认领（仅被分发人），需求回到待分发 */
export async function refuseRequirement(
  id: string,
  reason?: string,
): Promise<RequirementPlatformItem> {
  const { data } = await http.post<RequirementPlatformItem>(
    `/requirement-platform/requirements/${id}/refuse`,
    reason ? { reason } : {},
  );
  return data;
}
