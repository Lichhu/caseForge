import { http } from "@/api/client";
import {
  DEFAULT_CASE_FORGE_PAGE_SIZE,
  normalizeCaseForgePageSize,
} from "@case-forge/shared";
import type {
  ApiCaseExport,
  ApiAssertion,
  ApiCaseExpected,
  ApiCasePolarity,
  ApiCasePriority,
  ApiCaseRequest,
  ApiCaseStatus,
  ApiEndpointPayload,
  ApiMessageFormat,
  ApiMessageFraming,
  ApiStructuringStatus,
  ApiTransport,
  AssertionResult,
  ApiRunItemStatus,
  ApiDocGenerationProfile,
} from "@case-forge/shared";

export interface ApiTransactionRow {
  id: string;
  projectId: string;
  createdAt: string;
  code: string;
  name: string;
  description?: string;
  sortOrder: number;
  docStatus?: ApiStructuringStatus;
  hasDocument?: boolean;
  reqCode?: string;
  taskId?: string;
  serviceCode?: string;
  reqSystemId?: string;
  syncStatus?:
    | "pending"
    | "generating"
    | "success"
    | "failed"
    | "cancelled"
    | "changed";
  syncError?: string;
}

export interface SmpTransactionCandidate {
  code: string;
  name: string;
  description?: string;
  reqCode: string;
  taskId: string;
  serviceCode: string;
  reqSystemId: string;
  resSystemName?: string;
  serviceAttribute?: string;
  serviceType?: string;
  selected?: boolean;
}

export interface SmpDocumentData {
  callServiceList: unknown[];
  serviceTestList: unknown[];
  approvalInfoList: unknown[];
}

export interface ApiDocDetail {
  id: string;
  projectId: string;
  transactionId?: string;
  sourceDocName?: string;
  sourceDocUrl?: string;
  source?: "smp" | "upload";
  smpData?: SmpDocumentData;
  structuredMarkdown?: string;
  tempStructuredMarkdown?: string;
  structuringStatus: ApiStructuringStatus;
  structuringError?: string;
  endpoints: ApiEndpointRow[];
  generationPromptIds?: string[];
  generationProfile?: ApiDocGenerationProfile | null;
  canEnterCases: boolean;
  canGenerateCases: boolean;
  canEnterRunner: boolean;
  endpointCount: number;
  caseCount?: number;
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
  metadata?: {
    exports?: ApiCaseExport[];
    source?: string;
    promptIds?: string[];
    generateVersion?: number;
    versionCode?: string;
    channelId?: string;
    channelName?: string;
    debugEnvironmentId?: string;
    debugEnvironmentServiceId?: string;
    debugEncoding?: string;
    lastDebugRun?: DebugRunResult & { executedAt?: string };
  };
}

export interface ApiEnvironmentRow {
  id: string;
  projectId: string;
  name: string;
  scope?: "global" | "system" | "personal";
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
  serverAddress?: string;
  jdbcUrl?: string;
  remoteConnection?: string;
  objectStorage?: string;
  remark?: string;
  transport?: Extract<ApiTransport, "http" | "tcp">;
  payloadFormat?: ApiMessageFormat;
  baseUrl?: string;
  pathPrefix?: string;
  host?: string;
  port?: number;
  encoding?: string;
  framing?: ApiMessageFraming;
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
  lastRunStatus?: "running" | "completed" | "failed";
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
  const { data } = await http.get<ApiTransactionRow[]>(
    `/api-test/${projectId}/transactions`,
  );
  return data;
}

export async function createApiTransaction(
  projectId: string,
  payload: { code: string; name: string; description?: string },
) {
  const { data } = await http.post<ApiTransactionRow>(
    `/api-test/${projectId}/transactions`,
    payload,
  );
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

export async function deleteApiTransaction(
  projectId: string,
  transactionId: string,
) {
  await http.delete(`/api-test/${projectId}/transactions/${transactionId}`);
}

export async function batchDeleteApiTransactions(
  projectId: string,
  ids: string[],
) {
  const { data } = await http.post<{ ok: boolean; count: number }>(
    `/api-test/${projectId}/transactions/batch-delete`,
    { ids },
  );
  return data;
}

export async function fetchSmpTransactions(projectId: string) {
  const { data } = await http.post<SmpTransactionCandidate[]>(
    `/api-test/${projectId}/transactions/smp-list`,
  );
  return data;
}

export async function syncSmpTransactions(
  projectId: string,
  items: SmpTransactionCandidate[],
) {
  const { data } = await http.post<{ created: number; updated: number }>(
    `/api-test/${projectId}/transactions/smp-sync`,
    { items },
  );
  return data;
}

export interface SmpDocumentRefreshResult {
  changed: boolean;
  needsRegenerate: boolean;
  syncStatus: string;
  callServiceList: unknown[];
  serviceTestList: unknown[];
  approvalInfoList: unknown[];
}

export async function refreshSmpTransactionDocument(
  projectId: string,
  transactionId: string,
) {
  const { data } = await http.post<SmpDocumentRefreshResult>(
    `/api-test/${projectId}/transactions/${transactionId}/smp-refresh`,
  );
  return data;
}

export async function getApiDocUploadStatus(
  projectId: string,
  transactionId: string,
) {
  const { data } = await http.get<{
    hasExisting: boolean;
    sourceDocName?: string;
  }>(`${transactionBase(projectId, transactionId)}/upload-status`);
  return data;
}

export async function uploadApiDocument(
  projectId: string,
  transactionId: string,
  file: File,
  force = false,
) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await http.post<ApiDocDetail>(
    `${transactionBase(projectId, transactionId)}/document/upload`,
    form,
    {
      params: force ? { force: true } : undefined,
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return data;
}

export async function structureApiDocument(
  projectId: string,
  transactionId: string,
) {
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

export async function saveApiDocumentGeneration(
  projectId: string,
  transactionId: string,
  profile: ApiDocGenerationProfile,
) {
  const { data } = await http.patch<ApiDocDetail>(
    `${transactionBase(projectId, transactionId)}/document/generation`,
    profile,
  );
  return data;
}

export interface ApiCaseListResult {
  rows: ApiTestCaseRow[];
  count: number;
  page: number;
  pageSize: number;
}

export async function listApiCases(
  projectId: string,
  transactionId: string,
  params?: {
    page?: number;
    pageSize?: number;
    versionCode?: string;
    channelId?: string;
  },
): Promise<ApiCaseListResult> {
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = normalizeCaseForgePageSize(
    params?.pageSize ?? DEFAULT_CASE_FORGE_PAGE_SIZE,
  );
  const { data } = await http.get<ApiCaseListResult>(
    `${transactionBase(projectId, transactionId)}/cases`,
    {
      params: {
        page,
        pageSize,
        ...(params?.versionCode != null
          ? { versionCode: params.versionCode }
          : {}),
        ...(params?.channelId != null ? { channelId: params.channelId } : {}),
      },
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    },
  );
  return data;
}

/** 执行集管理等场景需要完整案例列表时，分页拉取直至取完 */
export async function listAllApiCases(
  projectId: string,
  transactionId: string,
  params?: { versionCode?: string; channelId?: string },
): Promise<ApiTestCaseRow[]> {
  const pageSize = 100;
  let page = 1;
  const rows: ApiTestCaseRow[] = [];
  let total = 0;
  do {
    const result = await listApiCases(projectId, transactionId, {
      page,
      pageSize,
      versionCode: params?.versionCode,
      channelId: params?.channelId,
    });
    rows.push(...result.rows);
    total = result.count;
    page += 1;
  } while (rows.length < total);
  return rows;
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

export async function deleteApiCase(
  projectId: string,
  transactionId: string,
  caseId: string,
) {
  await http.delete(
    `${transactionBase(projectId, transactionId)}/cases/${caseId}`,
  );
}

export async function batchPatchApiCaseRequest(
  projectId: string,
  transactionId: string,
  caseIds: string[],
  patch: Partial<ApiCaseRequest>,
  environmentId?: string,
  environmentServiceId?: string,
  encoding?: string,
) {
  const { data } = await http.patch<{ ok: boolean; updated: number }>(
    `${transactionBase(projectId, transactionId)}/cases/request-config`,
    { caseIds, patch, environmentId, environmentServiceId, encoding },
  );
  return data;
}

export async function generateApiCases(
  projectId: string,
  transactionId: string,
  options?: { channelIds?: string[] },
) {
  const { data } = await http.post<{
    jobId: string;
    status: string;
    phase: string;
  }>(
    `${transactionBase(projectId, transactionId)}/cases/generate`,
    options ?? {},
    {
      timeout: 30_000,
    },
  );
  return data;
}

export interface DocReadinessEndpointResult {
  endpointId: string;
  endpointName: string;
  ok: boolean;
  message: string;
  fieldCount: number;
  transport?: string;
  messageFormat?: string;
}

export interface DocReadinessResult {
  ok: boolean;
  message: string;
  fieldCount: number;
  endpoints: DocReadinessEndpointResult[];
}

export async function checkDocReadiness(
  projectId: string,
  transactionId: string,
) {
  const { data } = await http.get<DocReadinessResult>(
    `${transactionBase(projectId, transactionId)}/doc-readiness`,
  );
  return data;
}

export interface ApiCaseGenerateQueueStatus {
  jobId?: string;
  transactionId: string;
  phase:
    | "queued"
    | "running"
    | "completed"
    | "partial"
    | "failed"
    | "cancelled"
    | "none";
  queuePosition: number;
  estimatedWaitSeconds: number;
  estimatedRemainingSeconds: number;
  elapsedSeconds: number;
  resultCount?: number;
  errorMessage?: string;
  averageRunSeconds: number;
  concurrency: number;
  perUserMaxRunning: number;
  globalQueuedCount: number;
  globalRunningCount: number;
  slotWaitingCount: number;
}

export async function getApiCaseGenerateStatus(
  projectId: string,
  transactionId: string,
) {
  const { data } = await http.get<ApiCaseGenerateQueueStatus>(
    `${transactionBase(projectId, transactionId)}/cases/generate/status`,
  );
  return data;
}

export async function cancelApiCaseGenerate(
  projectId: string,
  transactionId: string,
) {
  const { data } = await http.post<{ ok: boolean }>(
    `${transactionBase(projectId, transactionId)}/cases/generate/cancel`,
  );
  return data;
}

export interface ApiCaseGenerateHistoryItem {
  jobId: string;
  version: number | null;
  versionCode: string | null;
  ruleVersion: string | null;
  status: string;
  resultCount: number | null;
  createdBy: string | null;
  queuedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  scenarioSummary: {
    total: number;
    completed: number;
    notApplicable: number;
    failed: number;
  };
}

export async function getApiCaseGenerateHistory(
  projectId: string,
  transactionId: string,
) {
  const { data } = await http.get<ApiCaseGenerateHistoryItem[]>(
    `${transactionBase(projectId, transactionId)}/cases/generate/history`,
  );
  return data;
}

export interface ApiCaseGenerateScenarioItem {
  id: string;
  scenarioKey: string;
  scenarioName: string;
  status:
    | "pending"
    | "running"
    | "completed"
    | "not_applicable"
    | "failed"
    | "retrying";
  applicableReason?: string | null;
  resultCount: number;
  attemptCount: number;
  durationMs?: number | null;
  errorMessage?: string | null;
}

export interface ApiCaseGenerateVersionDetail extends ApiCaseGenerateHistoryItem {
  id: string;
  scenarios: ApiCaseGenerateScenarioItem[];
}

export async function getApiCaseGenerateVersion(
  projectId: string,
  transactionId: string,
  jobId: string,
) {
  const { data } = await http.get<ApiCaseGenerateVersionDetail>(
    `${transactionBase(projectId, transactionId)}/case-versions/${jobId}`,
  );
  return data;
}

export async function retryApiCaseGenerateScenario(
  projectId: string,
  transactionId: string,
  jobId: string,
  scenarioId: string,
) {
  const { data } = await http.post<ApiCaseGenerateVersionDetail>(
    `${transactionBase(projectId, transactionId)}/case-versions/${jobId}/scenarios/${scenarioId}/retry`,
  );
  return data;
}

export async function deleteApiCaseGenerateVersion(
  projectId: string,
  transactionId: string,
  jobId: string,
) {
  await http.delete(
    `${transactionBase(projectId, transactionId)}/case-versions/${jobId}`,
  );
}

export async function listApiEnvironments(projectId: string) {
  const { data } = await http.get<ApiEnvironmentRow[]>(
    `/api-test/${projectId}/environments`,
  );
  return data;
}

export async function createApiEnvironment(
  projectId: string,
  payload: Record<string, unknown>,
) {
  const { data } = await http.post<ApiEnvironmentRow>(
    `/api-test/${projectId}/environments`,
    payload,
  );
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

export async function deleteApiEnvironment(
  projectId: string,
  environmentId: string,
) {
  await http.delete(`/api-test/${projectId}/environments/${environmentId}`);
}

export async function listApiEnvironmentServices(
  projectId: string,
  environmentId: string,
) {
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

export async function reorderApiEnvironmentService(
  projectId: string,
  environmentId: string,
  serviceId: string,
  direction: "up" | "down" | "top",
) {
  await http.patch(
    `/api-test/${projectId}/environments/${environmentId}/services/${serviceId}/reorder`,
    { direction },
  );
}

export interface ApiExecutionSetListResult {
  rows: ApiExecutionSetRow[];
  count: number;
  page: number;
  pageSize: number;
}

export async function listApiExecutionSets(
  projectId: string,
  transactionId: string,
  params?: { page?: number; pageSize?: number },
): Promise<ApiExecutionSetListResult> {
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = normalizeCaseForgePageSize(
    params?.pageSize ?? DEFAULT_CASE_FORGE_PAGE_SIZE,
  );
  const { data } = await http.get<ApiExecutionSetListResult>(
    `${transactionBase(projectId, transactionId)}/execution-sets`,
    {
      params: { page, pageSize },
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    },
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
  await http.delete(
    `${transactionBase(projectId, transactionId)}/execution-sets/${setId}`,
  );
}

export async function replaceApiExecutionSetCases(
  projectId: string,
  transactionId: string,
  setId: string,
  caseIds: string[],
) {
  const { data } = await http.put<{ caseIds: string[]; caseCount: number }>(
    `${transactionBase(projectId, transactionId)}/execution-sets/${setId}/cases`,
    { caseIds },
  );
  return data;
}

export async function runApiExecutionSet(
  projectId: string,
  transactionId: string,
  setId: string,
  payload: {
    environmentId?: string;
    environmentServiceId?: string;
    concurrency?: number;
    encoding?: string;
  },
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
    environmentId?: string;
    environmentServiceId?: string;
    concurrency?: number;
    encoding?: string;
    executionSetId?: string;
    runId?: string;
  },
) {
  const { data } = await http.post<ApiRunDetail>(
    `${transactionBase(projectId, transactionId)}/runs`,
    payload,
  );
  return data;
}

export interface DebugRunResult {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  bodySize: number;
  durationMs: number;
  error?: string;
  assertions: AssertionResult[];
}

export async function debugRunCase(
  projectId: string,
  transactionId: string,
  payload: {
    request: ApiCaseRequest;
    expected?: ApiCaseExpected;
    polarity?: "positive" | "negative";
    environmentId: string;
    environmentServiceId?: string;
    caseId?: string;
    encoding?: string;
  },
) {
  const { data } = await http.post<DebugRunResult>(
    `${transactionBase(projectId, transactionId)}/cases/debug-run`,
    payload,
  );
  return data;
}

export async function generateAssertions(
  projectId: string,
  transactionId: string,
  payload: {
    caseId?: string;
    transport: string;
    messageFormat: string;
    polarity: "positive" | "negative";
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
  },
) {
  const { data } = await http.post<{ jobId: string; phase: string }>(
    `${transactionBase(projectId, transactionId)}/cases/generate-assertions`,
    payload,
  );
  return data;
}

export interface ApiAssertionGenerateStatus {
  jobId: string;
  phase: "queued" | "running" | "completed" | "failed" | "cancelled" | "none";
  queuePosition: number;
  estimatedWaitSeconds: number;
  elapsedSeconds: number;
  resultCount?: number;
  errorMessage?: string;
  globalQueuedCount: number;
  globalRunningCount: number;
  slotWaitingCount: number;
}

export async function getAssertionGenerateStatus(
  projectId: string,
  transactionId: string,
  caseId?: string,
  jobId?: string,
) {
  const { data } = await http.get<ApiAssertionGenerateStatus>(
    `${transactionBase(projectId, transactionId)}/cases/generate-assertions/status`,
    { params: { caseId, jobId } },
  );
  return data;
}

export async function getAssertionGenerateResult(
  projectId: string,
  transactionId: string,
  caseId?: string,
  jobId?: string,
) {
  const { data } = await http.get<{ assertions: ApiAssertion[] }>(
    `${transactionBase(projectId, transactionId)}/cases/generate-assertions/result`,
    { params: { caseId, jobId } },
  );
  return data;
}

export async function cancelAssertionGenerate(
  projectId: string,
  transactionId: string,
  caseId?: string,
  jobId?: string,
) {
  const { data } = await http.post<{ ok: boolean }>(
    `${transactionBase(projectId, transactionId)}/cases/generate-assertions/cancel`,
    { caseId, jobId },
  );
  return data;
}

export async function listApiRuns(projectId: string) {
  const { data } = await http.get<ApiRunDetail[]>(
    `/api-test/${projectId}/runs`,
  );
  return data;
}

export async function getApiRun(projectId: string, runId: string) {
  const { data } = await http.get<ApiRunDetail>(
    `/api-test/${projectId}/runs/${runId}`,
  );
  return data;
}

export async function deleteApiRun(projectId: string, runId: string) {
  await http.delete(`/api-test/${projectId}/runs/${runId}`);
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

function parseContentDispositionFileName(header?: string): string | null {
  if (!header) return null;
  const utf8Match = /filename\*=UTF-8''([^;\n]+)/i.exec(header);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }
  const plainMatch = /filename="([^"]+)"|filename=([^;\n]+)/i.exec(header);
  const name = (plainMatch?.[1] ?? plainMatch?.[2])?.trim();
  return name || null;
}

async function readBlobPrefix(blob: Blob, length = 8) {
  const buffer = await blob.slice(0, length).arrayBuffer();
  return new TextDecoder().decode(buffer);
}

async function assertExportBlobFormat(
  blob: Blob,
  format: "xlsx" | "pdf" | "html",
) {
  const prefix = await readBlobPrefix(blob, 16);
  if (prefix.trimStart().startsWith("{")) {
    const payload = JSON.parse(await blob.text()) as { message?: string };
    throw new Error(payload.message?.trim() || "导出失败");
  }
  if (
    format === "html" &&
    !prefix.toLowerCase().includes("<!doctype") &&
    !prefix.toLowerCase().includes("<html")
  ) {
    throw new Error(
      "导出 HTML 失败：服务端返回了非 HTML 内容，请确认 API 已更新并重启",
    );
  }
  if (format === "pdf" && !prefix.startsWith("%PDF")) {
    throw new Error("导出 PDF 失败：服务端返回了非 PDF 内容");
  }
  if (format === "xlsx" && !prefix.startsWith("PK")) {
    throw new Error("导出 Excel 失败：服务端返回了非 xlsx 内容");
  }
}

export async function exportApiReport(
  projectId: string,
  transactionId: string,
  runId: string,
  format: "xlsx" | "pdf" | "html",
) {
  const response = await http.post(
    `${transactionBase(projectId, transactionId)}/reports/export`,
    { runId, format },
    { responseType: "blob" },
  );
  const contentType = String(response.headers["content-type"] ?? "");
  const blob = new Blob([response.data], {
    type: contentType || undefined,
  });
  await assertExportBlobFormat(blob, format);
  const headerDisposition = response.headers["content-disposition"];
  const fileName =
    parseContentDispositionFileName(
      typeof headerDisposition === "string" ? headerDisposition : undefined,
    ) ?? `api-test-${runId}.${format}`;
  return { blob, fileName };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface ApiDatabaseConnectionRow {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  readonly: boolean;
  hasPassword: boolean;
}
export interface ApiDatabaseConnectionPayload {
  name: string;
  type: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password?: string;
  readonly: boolean;
}
export interface ApiDataFunctionRow {
  id: string;
  name: string;
  params: string[];
  type: "template" | "sql";
  description: string;
  config: Record<string, any> & { builtin?: boolean };
}
export interface ApiDataFunctionPayload {
  name: string;
  params: string[];
  type: "template" | "sql";
  config: Record<string, any>;
  description?: string;
}

export async function listDatabaseConnections(projectId: string) {
  return (
    await http.get<ApiDatabaseConnectionRow[]>(
      `/api-test/${projectId}/database-connections`,
    )
  ).data;
}
export async function createDatabaseConnection(
  projectId: string,
  payload: ApiDatabaseConnectionPayload,
) {
  return (
    await http.post<ApiDatabaseConnectionRow>(
      `/api-test/${projectId}/database-connections`,
      payload,
    )
  ).data;
}
export async function updateDatabaseConnection(
  projectId: string,
  id: string,
  payload: ApiDatabaseConnectionPayload,
) {
  return (
    await http.patch<ApiDatabaseConnectionRow>(
      `/api-test/${projectId}/database-connections/${id}`,
      payload,
    )
  ).data;
}
export async function deleteDatabaseConnection(projectId: string, id: string) {
  await http.delete(`/api-test/${projectId}/database-connections/${id}`);
}
export async function testDatabaseConnection(projectId: string, id: string) {
  return (
    await http.post<{ ok: boolean }>(
      `/api-test/${projectId}/database-connections/${id}/test`,
    )
  ).data;
}
export async function getDatabaseMetadata(projectId: string, id: string) {
  return (
    await http.get<{
      tables: string[];
      columns: Record<
        string,
        Array<{ name: string; type: string; nullable: string }>
      >;
    }>(`/api-test/${projectId}/database-connections/${id}/metadata`)
  ).data;
}
export async function listDataFunctions(projectId: string) {
  return (
    await http.get<ApiDataFunctionRow[]>(
      `/api-test/${projectId}/data-functions`,
    )
  ).data;
}
export async function createDataFunction(
  projectId: string,
  payload: ApiDataFunctionPayload,
) {
  return (
    await http.post<ApiDataFunctionRow>(
      `/api-test/${projectId}/data-functions`,
      payload,
    )
  ).data;
}
export async function updateDataFunction(
  projectId: string,
  id: string,
  payload: ApiDataFunctionPayload,
) {
  return (
    await http.patch<ApiDataFunctionRow>(
      `/api-test/${projectId}/data-functions/${id}`,
      payload,
    )
  ).data;
}
export async function deleteDataFunction(projectId: string, id: string) {
  await http.delete(`/api-test/${projectId}/data-functions/${id}`);
}
export async function previewDataFunction(
  projectId: string,
  payload: ApiDataFunctionPayload & { values: Record<string, unknown> },
) {
  return (
    await http.post<unknown>(
      `/api-test/${projectId}/data-functions/preview`,
      payload,
    )
  ).data;
}
export async function generateDataFunctionScript(
  projectId: string,
  payload: { language: "javascript" | "python"; params: string[]; requirement: string },
) {
  return (
    await http.post<{ script: string }>(
      `/api-test/${projectId}/data-functions/generate-script`,
      payload,
    )
  ).data;
}
