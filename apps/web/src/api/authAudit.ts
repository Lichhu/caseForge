import type {
  AuthAuditEventFilters,
  AuthAuditEventPage,
  AuthAuditExportJob,
  AuthAuditSummary,
} from "@case-forge/shared";
import { http } from "./client";

export interface AuthAuditQueryParams extends AuthAuditEventFilters {
  from: string;
  to: string;
}

export interface AuthAuditEventQuery extends AuthAuditQueryParams {
  cursor?: string;
  limit?: number;
}

export async function fetchAuthAuditEvents(params: AuthAuditEventQuery) {
  const { data } = await http.get<AuthAuditEventPage>("/auth/audit/events", {
    params: cleanParams(params),
  });
  return data;
}

export async function fetchAuthAuditSummary(params: AuthAuditQueryParams) {
  const { data } = await http.get<AuthAuditSummary>("/auth/audit/summary", {
    params: cleanParams({ from: params.from, to: params.to }),
  });
  return data;
}

export async function createAuthAuditExport(params: AuthAuditQueryParams) {
  const { data } = await http.post<AuthAuditExportJob>(
    "/auth/audit/exports",
    cleanParams(params),
  );
  return data;
}

export async function fetchAuthAuditExport(id: string) {
  const { data } = await http.get<AuthAuditExportJob>(
    `/auth/audit/exports/${id}`,
  );
  return data;
}

export async function downloadAuthAuditExport(job: AuthAuditExportJob) {
  const response = await http.get<Blob>(
    `/auth/audit/exports/${job.id}/download`,
    {
      responseType: "blob",
      timeout: 300000,
    },
  );
  const blob =
    response.data instanceof Blob
      ? response.data
      : new Blob([response.data], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = job.fileName || `auth-audit-${job.id}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function cleanParams(params: object) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );
}
