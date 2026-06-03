import axios from 'axios';
import { getUserApiBaseUrl } from '@/utils/apiPath';
import { getUserName } from '@/utils/userContext';
import type {
  CaseForgeProject,
  CaseTreeNode,
  ConstraintInput,
  GenerationRun,
  MindMapExtras,
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

export interface ProjectListItem extends Omit<CaseForgeProject, 'runs'> {
  runCount: number;
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
  isActive: boolean;
  prompts: PromptLibraryItem[];
}

export interface ScenarioLibraryPayload {
  name: string;
  description: string;
  category: string;
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

export interface TestPointInstructionItem {
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
  naturalText: string;
  isFull: boolean;
  isAppend: boolean;
  promptIds: string[];
  prompts: PromptLibraryItem[];
}

export interface StructDocDetail {
  id: string;
  projectId: string;
  reqDocName?: string;
  reqDocPath?: string;
  reqDocUrl?: string;
  structuredDocName?: string;
  structDocPath?: string;
  structDocUrl?: string;
  tempStructDoc?: string;
  structuringStatus?: 'idle' | 'processing' | 'completed' | 'failed';
  structuringError?: string;
  structuringStartedAt?: string;
  canStructure?: boolean;
  canSave?: boolean;
  canEnterDynamicInstruct?: boolean;
  isStructuring?: boolean;
  testPoints: TestPointInstructionItem[];
}

export interface StructDocUploadStatus {
  hasExisting: boolean;
  reqDocName?: string;
  reqDocPath?: string;
  structDocPath?: string;
}

export async function listProjects() {
  const { data } = await http.get<ProjectListItem[]>('/project-manage/projects/sidebar');
  return data;
}

export async function createProject(payload: { title?: string; description?: string }) {
  const { data: created } = await http.post<{ id: string }>('/project-manage/project', payload);
  return getProject(created.id);
}

export async function getProject(projectId: string) {
  const { data } = await http.get<CaseForgeProject>(`/case-editor/projects/${projectId}/workspace`);
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

export async function getProjectStructDoc(projectId: string) {
  const { data } = await http.get<StructDocDetail | null>(`/struct-doc/${projectId}`);
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

export async function buildConstraints(projectId: string, payload: ConstraintInput) {
  const { data } = await http.post<CaseForgeProject>(`/case-editor/projects/${projectId}/constraints`, payload);
  return data;
}

/** 案例生成可能调用大模型，单独放宽超时 */
const GENERATE_CASES_TIMEOUT_MS = 180_000;

export async function generateCases(
  projectId: string,
  payload: { testPointIds?: string[]; model?: string },
) {
  const isBatch = (payload.testPointIds?.length ?? 0) > 1;
  const { data } = await http.post<CaseForgeProject>(
    `/case-editor/projects/${projectId}/generate`,
    payload,
    { timeout: isBatch ? 30_000 : GENERATE_CASES_TIMEOUT_MS },
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
  const { data } = await http.patch<GenerationRun>(`/case-editor/projects/${projectId}/runs/${runId}/tree`, {
    tree,
    mindMapExtras,
  });
  return data;
}

export async function listScenarioLibrary() {
  const { data } = await http.get<ScenarioLibraryItem[]>('/scenario/list');
  return data;
}

export async function createScenarioLibraryItem(payload: ScenarioLibraryPayload) {
  const { data } = await http.post<ScenarioLibraryItem>('/scenario', payload);
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

export async function listDynamicTestPoints(projectId: string, structDocId: string) {
  const { data } = await http.get<TestPointInstructionItem[]>('/dynamic-instruct/test-points', {
    params: { projectId, structDocId, _ts: Date.now() },
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
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

export function exportUrl(projectId: string, runId: string, format: 'json' | 'excel' | 'xmind') {
  return `${getUserApiBaseUrl()}/case-editor/projects/${projectId}/runs/${runId}/export?format=${format}`;
}
