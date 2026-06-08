import { http } from '@/api/client';
import type {
  ApiCaseExpected,
  ApiCasePolarity,
  ApiCasePriority,
  ApiCaseRequest,
  ApiCaseStatus,
  ApiEndpointPayload,
  ApiStructuringStatus,
  AssertionResult,
  ApiRunItemStatus,
} from '@case-forge/shared';

export interface ApiDocDetail {
  id: string;
  projectId: string;
  sourceDocName?: string;
  sourceDocUrl?: string;
  structuredMarkdown?: string;
  tempStructuredMarkdown?: string;
  structuringStatus: ApiStructuringStatus;
  structuringError?: string;
  endpoints: ApiEndpointRow[];
  canEnterCases: boolean;
  canEnterRunner: boolean;
  endpointCount: number;
}

export interface ApiEndpointRow {
  id: string;
  projectId: string;
  name: string;
  method: string;
  path: string;
  summary?: string;
}

export interface ApiTestCaseRow {
  id: string;
  projectId: string;
  endpointId: string;
  title: string;
  description: string;
  priority: ApiCasePriority;
  polarity: ApiCasePolarity;
  status: ApiCaseStatus;
  enabled: boolean;
  preconditions?: string[];
  request: ApiCaseRequest;
  expected: ApiCaseExpected;
  endpoint?: ApiEndpointRow;
  metadata?: { source?: string };
}

export interface ApiEnvironmentRow {
  id: string;
  projectId: string;
  name: string;
  baseUrl: string;
  headers: Record<string, string>;
  variables: Record<string, string>;
  tokenMasked: string;
  hasToken: boolean;
  isDefault: boolean;
  enabled: boolean;
}

export interface ApiRunItemRow {
  id: string;
  caseId: string;
  caseTitle: string;
  status: ApiRunItemStatus;
  durationMs: number;
  requestSnapshot: Record<string, unknown>;
  responseSnapshot?: {
    status: number;
    headers: Record<string, string>;
    body: unknown;
    error?: string;
  };
  assertions: AssertionResult[];
}

export interface ApiRunDetail {
  id: string;
  projectId: string;
  environmentId: string;
  status: string;
  totalCount: number;
  passedCount: number;
  failedCount: number;
  errorCount: number;
  concurrency: number;
  createdAt: string;
  finishedAt?: string;
  items: ApiRunItemRow[];
}

export async function getApiDocUploadStatus(projectId: string) {
  const { data } = await http.get<{ hasExisting: boolean; sourceDocName?: string }>(
    `/api-test/${projectId}/upload-status`,
  );
  return data;
}

export async function uploadApiDocument(projectId: string, file: File, force = false) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await http.post<ApiDocDetail>(`/api-test/${projectId}/document/upload`, form, {
    params: force ? { force: true } : undefined,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function structureApiDocument(projectId: string) {
  const { data } = await http.post<ApiDocDetail>(`/api-test/${projectId}/document/structure`);
  return data;
}

export async function getApiDocument(projectId: string) {
  const { data } = await http.get<ApiDocDetail | null>(`/api-test/${projectId}/document`);
  return data;
}

export async function autoSaveApiDocument(projectId: string, tempStructuredMarkdown: string) {
  const { data } = await http.patch<ApiDocDetail>(`/api-test/${projectId}/document/auto-save`, {
    tempStructuredMarkdown,
  });
  return data;
}

export async function saveApiDocument(
  projectId: string,
  payload: { structuredMarkdown: string; endpoints?: ApiEndpointPayload[] },
) {
  const { data } = await http.patch<ApiDocDetail>(`/api-test/${projectId}/document`, payload);
  return data;
}

export async function listApiCases(projectId: string) {
  const { data } = await http.get<ApiTestCaseRow[]>(`/api-test/${projectId}/cases`);
  return data;
}

export async function createApiCase(projectId: string, payload: Record<string, unknown>) {
  const { data } = await http.post<ApiTestCaseRow>(`/api-test/${projectId}/cases`, payload);
  return data;
}

export async function updateApiCase(
  projectId: string,
  caseId: string,
  payload: Record<string, unknown>,
) {
  const { data } = await http.patch<ApiTestCaseRow>(
    `/api-test/${projectId}/cases/${caseId}`,
    payload,
  );
  return data;
}

export async function deleteApiCase(projectId: string, caseId: string) {
  await http.delete(`/api-test/${projectId}/cases/${caseId}`);
}

export async function generateApiCases(projectId: string, endpointIds?: string[]) {
  const { data } = await http.post<{ count: number }>(`/api-test/${projectId}/cases/generate`, {
    endpointIds,
  });
  return data;
}

export async function listApiEnvironments(projectId: string) {
  const { data } = await http.get<ApiEnvironmentRow[]>(`/api-test/${projectId}/environments`);
  return data;
}

export async function createApiEnvironment(projectId: string, payload: Record<string, unknown>) {
  const { data } = await http.post<ApiEnvironmentRow>(`/api-test/${projectId}/environments`, payload);
  return data;
}

export async function updateApiEnvironment(
  projectId: string,
  environmentId: string,
  payload: Record<string, unknown>,
) {
  const { data } = await http.patch<ApiEnvironmentRow>(
    `/api-test/${projectId}/environments/${environmentId}`,
    payload,
  );
  return data;
}

export async function deleteApiEnvironment(projectId: string, environmentId: string) {
  await http.delete(`/api-test/${projectId}/environments/${environmentId}`);
}

export async function runApiCases(
  projectId: string,
  payload: { caseIds: string[]; environmentId: string; concurrency?: number },
) {
  const { data } = await http.post<ApiRunDetail>(`/api-test/${projectId}/runs`, payload);
  return data;
}

export async function listApiRuns(projectId: string) {
  const { data } = await http.get<ApiRunDetail[]>(`/api-test/${projectId}/runs`);
  return data;
}

export async function getApiRun(projectId: string, runId: string) {
  const { data } = await http.get<ApiRunDetail>(`/api-test/${projectId}/runs/${runId}`);
  return data;
}

export async function getApiReportSummary(projectId: string, runId?: string) {
  const { data } = await http.get(`/api-test/${projectId}/reports/summary`, {
    params: runId ? { runId } : undefined,
  });
  return data;
}

export async function exportApiReport(projectId: string, runId: string, format: 'xlsx' | 'pdf') {
  const response = await http.post(
    `/api-test/${projectId}/reports/export`,
    { runId, format },
    { responseType: 'blob' },
  );
  return response.data as Blob;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
