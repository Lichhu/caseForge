import axios from 'axios';
import { getUserApiBaseUrl } from '@/utils/apiPath';
import { getUserName } from '@/utils/userContext';
import type {
  CaseExcelRow,
  CaseExcelRowListPage,
  CaseForgeProject,
  CaseNature,
  CasePriority,
  CaseTreeNode,
  GenerationRun,
  GenerationRunSummary,
  MindMapExtras,
  ProjectPlatform,
  RunNodeChildrenResponse,
  type ScenarioScope,
} from '@case-forge/shared';
import {
  DEFAULT_PROJECT_PAGE_SIZE,
  normalizeProjectPageSize,
  SCENARIO_SCOPE_CASE,
} from '@case-forge/shared';

export const http = axios.create({
  timeout: 60000,
});

http.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  config.headers['X-User-Name'] = getUserName();
  config.baseURL = getUserApiBaseUrl();
  return config;
});

export interface ProjectListItem extends CaseForgeProject {
  runCount: number;
}

export interface ProjectListQuery {
  platform?: ProjectPlatform;
  page?: number;
  size?: number;
  input?: string;
}

export interface ProjectListResult {
  rows: ProjectListItem[];
  count: number;
}

function mapProjectListRow(raw: {
  id: string;
  title: string;
  description?: string | null;
  requirementNo?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  generationCount?: number;
}): ProjectListItem {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? '',
    requirementNo: raw.requirementNo ?? undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : raw.createdAt.toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : raw.updatedAt.toISOString(),
    runCount: raw.generationCount ?? 0,
  };
}

function mapProjectDetail(raw: {
  id: string;
  title: string;
  description?: string | null;
  requirementNo?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  generationCount?: number;
}): CaseForgeProject {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? '',
    requirementNo: raw.requirementNo,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : raw.createdAt.toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : raw.updatedAt.toISOString(),
    runCount: raw.generationCount,
  };
}

export interface PromptLibraryItem {
  id: string;
  scenarioId: string;
  name: string;
  content: string;
  tags: string[];
  usageCount: number;
  sortOrder: number;
  isSystem: boolean;
  isActive: boolean;
  isDefault: boolean;
}

export interface ScenarioLibraryItem {
  id: string;
  name: string;
  description: string;
  category: string;
  scope?: ScenarioScope;
  isActive: boolean;
  prompts: PromptLibraryItem[];
}

export interface ScenarioLibraryPayload {
  name: string;
  description: string;
  category: string;
  scope?: ScenarioScope;
  isActive: boolean;
  prompts: Array<{
    id?: string;
    scenarioId?: string;
    name: string;
    content: string;
    tags: string[];
    usageCount: number;
    sortOrder: number;
    isSystem: boolean;
    isActive: boolean;
    isDefault: boolean;
  }>;
}

export interface TestPointSummaryItem {
  id: string;
  projectId: string;
  structDocId: string;
  system: string;
  systemDesc: string;
  featureModule: string;
  featureDesc: string;
  testPoint: string;
  testPointDesc: string;
  status: '待编辑' | '已编辑' | '再编辑' | '生成中' | '生成失败' | '生成完成';
  generateError?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TestPointInstructionItem extends TestPointSummaryItem {
  naturalText: string;
  isFull: boolean;
  isAppend: boolean;
  promptIds: string[];
  prompts: PromptLibraryItem[];
}

export interface TestPointListPage {
  items: TestPointSummaryItem[];
  total: number;
  page: number;
  pageSize: number;
  systems: string[];
  featureModules: string[];
}

export interface TestPointWorkspaceMeta {
  featureModules: string[];
  systems: string[];
  definitionSamples: TestPointSummaryItem[];
}

export interface GeneratingTestPointRef {
  id: string;
  testPoint: string;
}

export interface StructDocDetail {
  id: string;
  projectId: string;
  reqDocName?: string;
  reqDocUrl?: string;
  structuredDocName?: string;
  structDocUrl?: string;
  tempStructDoc?: string;
  structuringStatus?: 'idle' | 'processing' | 'completed' | 'failed';
  structuringError?: string;
  structuringStartedAt?: string;
  canStructure?: boolean;
  canSave?: boolean;
  canEnterDynamicInstruct?: boolean;
  isStructuring?: boolean;
  testPoints: Array<{
    id: string;
    system: string;
    systemDesc: string;
    featureModule: string;
    featureDesc: string;
    testPoint: string;
    testPointDesc: string;
  }>;
}

export interface StructDocUploadStatus {
  hasExisting: boolean;
  reqDocName?: string;
}

export async function listProjects(
  query: ProjectListQuery = {},
): Promise<ProjectListResult> {
  const platform = query.platform ?? 'case-forge';
  const page = query.page ?? 1;
  const size = normalizeProjectPageSize(query.size ?? DEFAULT_PROJECT_PAGE_SIZE);
  const input = query.input?.trim();
  const { data } = await http.get<{
    rows: Array<{
      id: string;
      title: string;
      description?: string | null;
      requirementNo?: string | null;
      createdAt: string | Date;
      updatedAt: string | Date;
      generationCount?: number;
    }>;
    count: number;
  }>('/project-manage/projects', {
    params: {
      platform,
      page,
      size,
      ...(input ? { input } : {}),
    },
  });
  return {
    rows: data.rows.map(mapProjectListRow),
    count: data.count,
  };
}

export async function createProject(payload: {
  title?: string;
  description?: string;
  requirementNo?: string;
  platform?: ProjectPlatform;
}) {
  const { data: created } = await http.post<{ id: string }>('/project-manage/project', payload);
  if ((payload.platform ?? 'case-forge') === 'api-test') {
    return {
      id: created.id,
      title: payload.title ?? '',
      description: payload.description ?? '',
      requirementNo: payload.requirementNo,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as CaseForgeProject & { requirementNo?: string };
  }
  return fetchProjectDetail(created.id);
}

/** 项目基础信息（project-manage）；不含 struct-doc / runs / 动态指令 */
export async function fetchProjectDetail(projectId: string) {
  const { data } = await http.get<{
    id: string;
    title: string;
    description?: string | null;
    requirementNo?: string | null;
    createdAt: string;
    updatedAt: string;
    generationCount?: number;
  }>(`/project-manage/projects/${projectId}`);
  return mapProjectDetail(data);
}

/** @deprecated 使用 fetchProjectDetail */
export async function getProject(projectId: string) {
  return fetchProjectDetail(projectId);
}

export async function listRunSummaries(projectId: string) {
  const { data } = await http.get<GenerationRunSummary[]>(
    `/case-editor/projects/${projectId}/runs`,
  );
  return data;
}

export async function getRun(projectId: string, runId: string) {
  const { data } = await http.get<GenerationRun>(
    `/case-editor/projects/${projectId}/runs/${runId}`,
    {
      params: { _ts: Date.now() },
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    },
  );
  return data;
}

export async function batchDeleteProjects(projectIds: string[]) {
  const { data } = await http.post<{ ids: string[]; deleted: boolean }>(
    '/project-manage/projects/batch-delete',
    { ids: projectIds },
  );
  return data;
}

export async function deleteProject(projectId: string) {
  const { data } = await http.delete<{ id: string; deleted: boolean }>(
    `/project-manage/projects/${projectId}`,
  );
  return data;
}

export async function updateProject(
  projectId: string,
  payload: { title?: string; description?: string; requirementNo?: string },
) {
  const { data } = await http.patch(`/project-manage/projects/${projectId}`, payload);
  return data;
}

export async function getStructDocUploadStatus(projectId: string) {
  const { data } = await http.get<StructDocUploadStatus>(`/struct-doc/${projectId}/upload-status`);
  return data;
}

export async function uploadStructDocRequirement(projectId: string, file: File, force = false) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await http.post<StructDocDetail>(`/struct-doc/${projectId}/document/upload`, form, {
    params: force ? { force: 'true' } : undefined,
  });
  return data;
}

export async function structureRequirement(projectId: string) {
  const { data } = await http.post<StructDocDetail>(`/struct-doc/${projectId}/document/structure`);
  return data;
}

export async function cancelStructureRequirement(projectId: string) {
  const { data } = await http.post<StructDocDetail>(`/struct-doc/${projectId}/document/structure/cancel`);
  return data;
}

export async function autoSaveStructDoc(projectId: string, payload: { tempStructDoc?: string }) {
  const { data } = await http.patch<StructDocDetail>(`/struct-doc/${projectId}/auto-save`, payload);
  return data;
}

export async function getProjectStructDoc(
  projectId: string,
  options?: { includeTestPoints?: boolean },
) {
  const { data } = await http.get<StructDocDetail | null>(`/struct-doc/${projectId}`, {
    params:
      options?.includeTestPoints === false
        ? { includeTestPoints: 'false' }
        : undefined,
  });
  return data;
}

export async function saveStructDocTestPoints(
  projectId: string,
  payload: {
    structuredDocName?: string;
    tempStructDoc?: string;
    testPoints?: Array<{
      id?: string;
      system?: string;
      systemDesc?: string;
      featureModule?: string;
      featureDesc?: string;
      testPoint?: string;
      testPointDesc?: string;
    }>;
  },
) {
  const { data } = await http.patch<StructDocDetail>(`/struct-doc/${projectId}`, payload);
  return data;
}

/** 案例生成可能调用大模型，单独放宽超时 */
const GENERATE_CASES_TIMEOUT_MS = 180_000;

export async function generateCases(
  projectId: string,
  payload: { testPointIds?: string[]; model?: string },
) {
  const { data } = await http.post<CaseForgeProject>(
    `/case-editor/projects/${projectId}/generate`,
    payload,
    { timeout: 30_000 },
  );
  return data;
}

export interface CaseGenerateQueueItemStatus {
  testPointId: string;
  jobId: string;
  phase: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'none';
  queuePosition: number;
  queuedAhead: number;
  runningAhead: number;
  estimatedWaitSeconds: number;
  estimatedRemainingSeconds: number;
  elapsedSeconds: number;
  averageRunSeconds: number;
  concurrency: number;
  globalQueuedCount: number;
  globalRunningCount: number;
  perUserMaxRunning?: number;
  userQueuedAhead?: number;
  errorMessage?: string;
}

export interface CaseGenerateQueueStatusResponse {
  averageRunSeconds: number;
  concurrency: number;
  globalQueuedCount: number;
  globalRunningCount: number;
  slotWaitingCount: number;
  items: CaseGenerateQueueItemStatus[];
}

export async function getGenerateQueueStatus(
  projectId: string,
  testPointIds?: string[],
) {
  const { data } = await http.get<CaseGenerateQueueStatusResponse>(
    `/case-editor/projects/${projectId}/generate/queue`,
    {
      params: testPointIds?.length ? { testPointIds: testPointIds.join(',') } : undefined,
    },
  );
  return data;
}

export async function cancelCaseGenerate(projectId: string, testPointIds: string[]) {
  const { data } = await http.post<CaseForgeProject>(
    `/case-editor/projects/${projectId}/generate/cancel`,
    { testPointIds },
  );
  return data;
}

export async function regenerateNode(
  projectId: string,
  payload: { runId: string; nodeId: string; instruction: string; mode: 'append' | 'replace' | 'complete' },
) {
  const { data } = await http.post<GenerationRun>(`/case-editor/projects/${projectId}/regenerate-node`, payload);
  return data;
}

export async function saveRunTree(
  projectId: string,
  runId: string,
  tree: CaseTreeNode,
  mindMapExtras?: MindMapExtras,
) {
  const { data } = await http.patch<Omit<GenerationRun, 'tree'> & { tree?: CaseTreeNode }>(
    `/case-editor/projects/${projectId}/runs/${runId}/tree`,
    {
      tree,
      mindMapExtras,
    },
  );
  return data;
}

export interface SyncToTestPlatformResult {
  projectCode: string;
  testPlatformProjectId: string;
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
}

export async function syncRunToTestPlatform(
  projectId: string,
  runId: string,
  tree: CaseTreeNode,
  caseNodeIds: string[],
) {
  const { data } = await http.post<SyncToTestPlatformResult>(
    `/case-editor/projects/${projectId}/runs/${runId}/sync-test-platform`,
    { tree, caseNodeIds },
  );
  return data;
}

export type { CaseExcelRowListPage, RunNodeChildrenResponse };

export async function listRunNodeChildren(
  projectId: string,
  runId: string,
  nodeId: string,
) {
  const { data } = await http.get<RunNodeChildrenResponse>(
    `/case-editor/projects/${projectId}/runs/${runId}/nodes/${nodeId}/children`,
    {
      params: { _ts: Date.now() },
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    },
  );
  return data;
}

export async function listRunCaseRows(
  projectId: string,
  runId: string,
  params: {
    page?: number;
    pageSize?: number;
    requirement?: string;
    priority?: CasePriority;
    caseNature?: CaseNature;
    keyword?: string;
    focusCaseNodeId?: string;
    idsOnly?: boolean;
  },
) {
  const { data } = await http.get<CaseExcelRowListPage>(
    `/case-editor/projects/${projectId}/runs/${runId}/case-rows`,
    {
      params: { ...params, _ts: Date.now() },
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    },
  );
  return data;
}

export async function listScenarioLibrary(scope: ScenarioScope = SCENARIO_SCOPE_CASE) {
  const { data } = await http.get<ScenarioLibraryItem[]>('/scenario/list', {
    params: { scope },
  });
  return data;
}

export async function createScenarioLibraryItem(payload: ScenarioLibraryPayload) {
  const { data } = await http.post<ScenarioLibraryItem>('/scenario', {
    ...payload,
    scope: payload.scope ?? SCENARIO_SCOPE_CASE,
  });
  return data;
}

export async function updateScenarioLibraryItem(
  id: string,
  payload: Omit<ScenarioLibraryPayload, 'prompts'> & { prompts?: ScenarioLibraryPayload['prompts'] },
) {
  const { data } = await http.patch<ScenarioLibraryItem>(`/scenario/${id}`, payload);
  return data;
}

export async function deleteScenarioLibraryItem(id: string) {
  const { data } = await http.delete<{ id: string; deleted: boolean }>(`/scenario/${id}`);
  return data;
}

export async function listDynamicTestPoints(params: {
  projectId: string;
  structDocId: string;
  system?: string;
  featureModule?: string;
  page?: number;
  pageSize?: number;
}) {
  const { data } = await http.get<TestPointListPage>('/dynamic-instruct/test-points', {
    params: { ...params, _ts: Date.now() },
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
  return data;
}

export async function getDynamicTestPointMeta(projectId: string, structDocId: string) {
  const { data } = await http.get<TestPointWorkspaceMeta>('/dynamic-instruct/test-points/meta', {
    params: { projectId, structDocId, _ts: Date.now() },
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
  return data;
}

export async function listGeneratingDynamicTestPoints(projectId: string, structDocId: string) {
  const { data } = await http.get<GeneratingTestPointRef[]>('/dynamic-instruct/test-points/generating', {
    params: { projectId, structDocId, _ts: Date.now() },
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
  return data;
}

export async function getDynamicTestPointInstruction(testPointId: string) {
  const { data } = await http.get<TestPointInstructionItem>(`/dynamic-instruct/test-points/${testPointId}`);
  return data;
}

export async function createDynamicTestPoint(payload: {
  projectId: string;
  structDocId: string;
  system?: string;
  systemDesc?: string;
  featureModule?: string;
  featureDesc?: string;
  testPoint?: string;
  testPointDesc?: string;
}) {
  const { data } = await http.post<TestPointSummaryItem>('/dynamic-instruct/test-points', payload);
  return data;
}

export async function deleteDynamicTestPoints(testPointIds: string[]) {
  const { data } = await http.delete<{ deleted: number; testPointIds: string[] }>(
    '/dynamic-instruct/test-points',
    { data: { testPointIds } },
  );
  return data;
}

export async function updateDynamicTestPointDefinition(
  testPointId: string,
  payload: Partial<
    Pick<
      TestPointSummaryItem,
      'system' | 'systemDesc' | 'featureModule' | 'featureDesc' | 'testPoint' | 'testPointDesc'
    >
  >,
) {
  const { data } = await http.patch<TestPointInstructionItem>(
    `/dynamic-instruct/test-points/${testPointId}/definition`,
    payload,
  );
  return data;
}

export async function saveDynamicTestPointInstruction(
  testPointId: string,
  payload: Partial<Pick<TestPointInstructionItem, 'promptIds' | 'naturalText' | 'status' | 'isFull' | 'isAppend'>>,
) {
  const { data } = await http.patch<TestPointInstructionItem>(`/dynamic-instruct/test-points/${testPointId}`, payload);
  return data;
}

export async function batchSaveDynamicTestPointInstruction(
  payload: {
    testPointIds: string[];
    promptIds?: string[];
    naturalText?: string;
    status?: TestPointInstructionItem['status'];
    isFull?: boolean;
    isAppend?: boolean;
  },
) {
  const { data } = await http.patch<TestPointInstructionItem[]>('/dynamic-instruct/test-points', payload);
  return data;
}

export function exportUrl(
  projectId: string,
  runId: string,
  format: 'excel' | 'xmind',
  caseNodeIds?: string[],
) {
  const params = new URLSearchParams({ format });
  if (caseNodeIds?.length) {
    params.set('caseNodeIds', caseNodeIds.join(','));
  }
  return `${getUserApiBaseUrl()}/case-editor/projects/${projectId}/runs/${runId}/export?${params.toString()}`;
}

export function exportExcelTemplateUrl(projectId: string, runId: string) {
  const params = new URLSearchParams({
    format: 'excel',
    template: '1',
  });
  return `${getUserApiBaseUrl()}/case-editor/projects/${projectId}/runs/${runId}/export?${params.toString()}`;
}
