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
  isMember?: boolean;
  ownerOptions: Array<{ userName: string; nickName: string }>;
  syncing: boolean;
  page: number;
  size: number;
}

export async function createRequirement(payload: { projectCode: string; projectName: string; applicationName: string }) {
  const { data } = await http.post<RequirementPlatformItem>("/requirement-platform/requirements", payload);
  return data;
}

export async function fetchRequirementApplications(): Promise<string[]> {
  const { data } = await http.get<string[]>("/requirement-platform/applications");
  return data;
}

export async function updateRequirement(
  id: string,
  payload: Partial<{
    projectCode: string;
    projectName: string;
    applicationName: string;
  }>,
) {
  const { data } = await http.patch<RequirementPlatformItem>(`/requirement-platform/requirements/${id}`, payload);
  return data;
}

export async function deleteRequirement(id: string) {
  const { data } = await http.delete<{ id: string; deleted: boolean }>(`/requirement-platform/requirements/${id}`);
  return data;
}

export interface RequirementPoolMember {
  id: string;
  userName: string;
  nickName: string;
  remark?: string | null;
  isDispatcher?: boolean;
}

export async function fetchPoolMembers(): Promise<RequirementPoolMember[]> {
  const { data } = await http.get<RequirementPoolMember[]>("/requirement-platform/members");
  return data;
}

export async function searchPoolCandidates(keyword: string): Promise<Array<{ userName: string; nickName: string }>> {
  const { data } = await http.get<Array<{ userName: string; nickName: string }>>("/requirement-platform/members/candidates", { params: { keyword } });
  return data;
}

export async function addPoolMember(userName: string): Promise<RequirementPoolMember> {
  const { data } = await http.post<RequirementPoolMember>("/requirement-platform/members", { userName });
  return data;
}

export async function removePoolMember(id: string): Promise<void> {
  await http.delete(`/requirement-platform/members/${id}`);
}

export async function setRequirementStatus(id: string, status: "testing" | "completed") {
  const { data } = await http.patch<RequirementPlatformItem>(`/requirement-platform/requirements/${id}/status`, { status });
  return data;
}

/** 需求平台列表（分发人全量，普通用户仅与自己相关的） */
export async function fetchRequirementList(params: { page: number; size: number; status: string; keyword: string; owner?: string; application?: string }): Promise<RequirementPlatformListResponse> {
  const { data } = await http.get<RequirementPlatformListResponse>(
    "/requirement-platform/requirements",
    { params },
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
