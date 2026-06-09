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

export interface ApiTransactionRow {
  id: string;
  projectId: string;
  code: string;
  name: string;
  description?: string;
  sortOrder: number;
  docStatus?: ApiStructuringStatus;
  hasDocument?: boolean;
}

export interface ApiDocDetail {
  id: string;
  projectId: string;
  transactionId?: string;
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
  transactionId?: string;
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
  caseNo?: string;
  description: string;
  remark?: string;
  transactionCode?: string;
  owner?: string;
  priority: ApiCasePriority;
  polarity: ApiCasePolarity;
  status: ApiCaseStatus;
  enabled: boolean;
  preconditions?: string[];
  request: ApiCaseRequest;
  expected: ApiCaseExpected;
  endpoint?: ApiEndpointRow;
  createdBy?: string;
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

export interface ApiEnvironmentServiceRow {
  id: string;
  projectId: string;
  environmentId: string;
  name: string;
  baseUrl?: string;
  pathPrefix?: string;
  headers?: Record<string, string>;
  variables?: Record<string, string>;
  sortOrder: number;
  enabled: boolean;
}

export interface ApiExecutionSetRow {
  id: string;
  projectId: string;
  transactionId: string;
  name: string;
  description?: string;
  enabled: boolean;
  caseCount?: number;
  caseIds?: string[];
  lastRunId?: string;
  lastRunStatus?: 'running' | 'completed' | 'failed';
  lastRunAt?: string;
  lastPassedCount?: number;
  lastTotalCount?: number;
}

export interface ApiRunDetail {
  id: string;
  projectId: string;
  environmentId: string;
  environmentServiceId?: string;
  executionSetId?: string;
  transactionId?: string;
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

function transactionBase(projectId: string, transactionId: string) {
  return `/api-test/${projectId}/transactions/${transactionId}`;
}

export async function listApiTransactions(projectId: string) {
  const { data } = await http.get<ApiTransactionRow[]>(`/api-test/${projectId}/transactions`);
  return data;
}

export async function createApiTransaction(
  projectId: string,
  payload: { code: string; name: string; description?: string },
) {
  const { data } = await http.post<ApiTransactionRow>(`/api-test/${projectId}/transactions`, payload);
  return data;
}

export async function updateApiTransaction(
  projectId: string,
  transactionId: string,
  payload: { code: string; name: string; description?: string },
) {
  const { data } = await http.patch<ApiTransactionRow>(
    `/api-test/${projectId}/transactions/${transactionId}`,
    payload,
  );
  return data;
}

export async function deleteApiTransaction(projectId: string, transactionId: string) {
  await http.delete(`/api-test/${projectId}/transactions/${transactionId}`);
}

export async function batchDeleteApiTransactions(projectId: string, ids: string[]) {
  const { data } = await http.post<{ ok: boolean; count: number }>(
    `/api-test/${projectId}/transactions/batch-delete`,
    { ids },
  );
  return data;
}

export async function getApiDocUploadStatus(projectId: string, transactionId: string) {
  const { data } = await http.get<{ hasExisting: boolean; sourceDocName?: string }>(
    `${transactionBase(projectId, transactionId)}/upload-status`,
  );
  return data;
}

export async function uploadApiDocument(
  projectId: string,
  transactionId: string,
  file: File,
  force = false,
) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await http.post<ApiDocDetail>(
    `${transactionBase(projectId, transactionId)}/document/upload`,
    form,
    {
      params: force ? { force: true } : undefined,
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  );
  return data;
}

export async function structureApiDocument(projectId: string, transactionId: string) {
  const { data } = await http.post<ApiDocDetail>(
    `${transactionBase(projectId, transactionId)}/document/structure`,
  );
  return data;
}

export async function getApiDocument(projectId: string, transactionId: string) {
  const { data } = await http.get<ApiDocDetail | null>(
    `${transactionBase(projectId, transactionId)}/document`,
  );
  return data;
}

export async function autoSaveApiDocument(
  projectId: string,
  transactionId: string,
  tempStructuredMarkdown: string,
) {
  const { data } = await http.patch<ApiDocDetail>(
    `${transactionBase(projectId, transactionId)}/document/auto-save`,
    { tempStructuredMarkdown },
  );
  return data;
}

export async function saveApiDocument(
  projectId: string,
  transactionId: string,
  payload: { structuredMarkdown: string; endpoints?: ApiEndpointPayload[] },
) {
  const { data } = await http.patch<ApiDocDetail>(
    `${transactionBase(projectId, transactionId)}/document`,
    payload,
  );
  return data;
}

export async function listApiCases(projectId: string, transactionId: string) {
  const { data } = await http.get<ApiTestCaseRow[]>(
    `${transactionBase(projectId, transactionId)}/cases`,
  );
  return data;
}

export async function createApiCase(
  projectId: string,
  transactionId: string,
  payload: Record<string, unknown>,
) {
  const { data } = await http.post<ApiTestCaseRow>(
    `${transactionBase(projectId, transactionId)}/cases`,
    payload,
  );
  return data;
}

export async function updateApiCase(
  projectId: string,
  transactionId: string,
  caseId: string,
  payload: Record<string, unknown>,
) {
  const { data } = await http.patch<ApiTestCaseRow>(
    `${transactionBase(projectId, transactionId)}/cases/${caseId}`,
    payload,
  );
  return data;
}

export async function deleteApiCase(projectId: string, transactionId: string, caseId: string) {
  await http.delete(`${transactionBase(projectId, transactionId)}/cases/${caseId}`);
}

export async function generateApiCases(
  projectId: string,
  transactionId: string,
  endpointIds?: string[],
) {
  const { data } = await http.post<{ count: number; cases?: ApiTestCaseRow[] }>(
    `${transactionBase(projectId, transactionId)}/cases/generate`,
    { endpointIds },
  );
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

export async function listApiEnvironmentServices(projectId: string, environmentId: string) {
  const { data } = await http.get<ApiEnvironmentServiceRow[]>(
    `/api-test/${projectId}/environments/${environmentId}/services`,
  );
  return data;
}

export async function createApiEnvironmentService(
  projectId: string,
  environmentId: string,
  payload: Record<string, unknown>,
) {
  const { data } = await http.post<ApiEnvironmentServiceRow>(
    `/api-test/${projectId}/environments/${environmentId}/services`,
    payload,
  );
  return data;
}

export async function updateApiEnvironmentService(
  projectId: string,
  environmentId: string,
  serviceId: string,
  payload: Record<string, unknown>,
) {
  const { data } = await http.patch<ApiEnvironmentServiceRow>(
    `/api-test/${projectId}/environments/${environmentId}/services/${serviceId}`,
    payload,
  );
  return data;
}

export async function deleteApiEnvironmentService(
  projectId: string,
  environmentId: string,
  serviceId: string,
) {
  await http.delete(
    `/api-test/${projectId}/environments/${environmentId}/services/${serviceId}`,
  );
}

export async function listApiExecutionSets(projectId: string, transactionId: string) {
  const { data } = await http.get<ApiExecutionSetRow[]>(
    `${transactionBase(projectId, transactionId)}/execution-sets`,
  );
  return data;
}

export async function createApiExecutionSet(
  projectId: string,
  transactionId: string,
  payload: { name: string; description?: string },
) {
  const { data } = await http.post<ApiExecutionSetRow>(
    `${transactionBase(projectId, transactionId)}/execution-sets`,
    payload,
  );
  return data;
}

export async function updateApiExecutionSet(
  projectId: string,
  transactionId: string,
  setId: string,
  payload: { name: string; description?: string },
) {
  const { data } = await http.patch<ApiExecutionSetRow>(
    `${transactionBase(projectId, transactionId)}/execution-sets/${setId}`,
    payload,
  );
  return data;
}

export async function deleteApiExecutionSet(
  projectId: string,
  transactionId: string,
  setId: string,
) {
  await http.delete(`${transactionBase(projectId, transactionId)}/execution-sets/${setId}`);
}

export async function replaceApiExecutionSetCases(
  projectId: string,
  transactionId: string,
  setId: string,
  caseIds: string[],
) {
  const { data } = await http.put<{ caseIds: string[] }>(
    `${transactionBase(projectId, transactionId)}/execution-sets/${setId}/cases`,
    { caseIds },
  );
  return data;
}

export async function runApiExecutionSet(
  projectId: string,
  transactionId: string,
  setId: string,
  payload: { environmentId: string; environmentServiceId?: string; concurrency?: number },
) {
  const { data } = await http.post<ApiRunDetail>(
    `${transactionBase(projectId, transactionId)}/execution-sets/${setId}/runs`,
    payload,
  );
  return data;
}

export async function runApiCases(
  projectId: string,
  transactionId: string,
  payload: {
    caseIds: string[];
    environmentId: string;
    environmentServiceId?: string;
    concurrency?: number;
  },
) {
  const { data } = await http.post<ApiRunDetail>(
    `${transactionBase(projectId, transactionId)}/runs`,
    payload,
  );
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

export async function getApiReportSummary(
  projectId: string,
  transactionId: string,
  runId?: string,
) {
  const { data } = await http.get(
    `${transactionBase(projectId, transactionId)}/reports/summary`,
    { params: runId ? { runId } : undefined },
  );
  return data;
}

export async function exportApiReport(
  projectId: string,
  transactionId: string,
  runId: string,
  format: 'xlsx' | 'pdf',
) {
  const response = await http.post(
    `${transactionBase(projectId, transactionId)}/reports/export`,
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
