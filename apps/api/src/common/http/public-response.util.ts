import { ApiDocEntity } from "../../modules/api-test/entity/api-doc.entity";
import { ApiEndpointEntity } from "../../modules/api-test/entity/api-endpoint.entity";
import { ApiTestCaseEntity } from "../../modules/api-test/entity/api-test-case.entity";
import { ApiTestEnvironmentServiceEntity } from "../../modules/api-test/entity/api-test-environment-service.entity";
import { ApiTestExecutionSetEntity } from "../../modules/api-test/entity/api-test-execution-set.entity";
import { ApiTestRunEntity } from "../../modules/api-test/entity/api-test-run.entity";
import { ApiTestRunItemEntity } from "../../modules/api-test/entity/api-test-run-item.entity";
import { ApiTransactionEntity } from "../../modules/api-test/entity/api-transaction.entity";
import { CaseProjectEntity } from "../../modules/project-manage/entity/project.entity";
import { PromptEntity } from "../../modules/scenario/entity/prompt.entity";
import { ScenarioEntity } from "../../modules/scenario/entity/scenario.entity";
import { StructDocEntity } from "../../modules/struct-doc/entity/struct-doc.entity";
import { TestPointEntity } from "../../modules/struct-doc/entity/test-point.entity";

export function toPublicProject(
  project: CaseProjectEntity,
  extra?: { generationCount?: number },
) {
  return {
    id: project.id,
    title: project.title,
    description: project.description,
    platform: project.platform,
    requirementNo: project.requirementNo,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    ...(extra?.generationCount !== undefined
      ? { generationCount: extra.generationCount }
      : {}),
  };
}

export function toPublicScenario(scenario: ScenarioEntity) {
  return {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    category: scenario.category,
    scope: scenario.scope,
    isActive: scenario.isActive,
    prompts: (scenario.prompts ?? []).map(toPublicPrompt),
  };
}

export function toPublicPrompt(prompt: PromptEntity) {
  return {
    id: prompt.id,
    scenarioId: prompt.scenarioId,
    name: prompt.name,
    content: prompt.content,
    tags: prompt.tags ?? [],
    usageCount: prompt.usageCount,
    sortOrder: prompt.sortOrder,
    isSystem: prompt.isSystem,
    isActive: prompt.isActive,
    isDefault: prompt.isDefault,
  };
}

export function toPublicTestPoint(testPoint: TestPointEntity) {
  return {
    id: testPoint.id,
    projectId: testPoint.projectId,
    structDocId: testPoint.structDocId,
    system: testPoint.system,
    systemDesc: testPoint.systemDesc,
    featureModule: testPoint.featureModule,
    featureDesc: testPoint.featureDesc,
    testPoint: testPoint.testPoint,
    testPointDesc: testPoint.testPointDesc,
    createdAt: testPoint.createdAt,
    updatedAt: testPoint.updatedAt,
  };
}

/** 列表摘要：不含动态指令正文与提示词详情 */
export function toPublicTestPointSummary(testPoint: TestPointEntity) {
  return toPublicTestPoint(testPoint);
}

export function toPublicStructDocDetail(
  structDoc: StructDocEntity,
  testPoints: TestPointEntity[],
  urls: { reqDocUrl?: string; structDocUrl?: string },
) {
  return {
    id: structDoc.id,
    projectId: structDoc.projectId,
    reqDocName: structDoc.reqDocName,
    reqDocUrl: urls.reqDocUrl,
    structuredDocName: structDoc.structuredDocName,
    structDocUrl: urls.structDocUrl,
    tempStructDoc: structDoc.tempStructDoc,
    structuringStatus: structDoc.structuringStatus,
    structuringError: structDoc.structuringError,
    structuringStartedAt: structDoc.structuringStartedAt,
    canStructure:
      Boolean(structDoc.reqDocPath) &&
      structDoc.structuringStatus !== "processing",
    canSave:
      Boolean(structDoc.tempStructDoc?.trim()) &&
      structDoc.structuringStatus !== "processing",
    isStructuring: structDoc.structuringStatus === "processing",
    canEnterDynamicInstruct: Boolean(structDoc.structDocPath),
    testPoints: testPoints.map(toPublicTestPoint),
  };
}

export function toPublicApiTransaction(
  row: ApiTransactionEntity,
  extra?: { docStatus?: string; hasDocument?: boolean },
) {
  return {
    id: row.id,
    projectId: row.projectId,
    code: row.code,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    ...(extra?.docStatus !== undefined ? { docStatus: extra.docStatus } : {}),
    ...(extra?.hasDocument !== undefined
      ? { hasDocument: extra.hasDocument }
      : {}),
  };
}

export function toPublicApiEndpoint(endpoint: ApiEndpointEntity) {
  return {
    id: endpoint.id,
    projectId: endpoint.projectId,
    transactionId: endpoint.transactionId,
    name: endpoint.name,
    method: endpoint.method,
    path: endpoint.path,
    summary: endpoint.summary,
  };
}

export function toPublicApiDoc(
  doc: ApiDocEntity,
  extra: {
    transactionId: string;
    sourceDocUrl?: string;
    endpoints: ApiEndpointEntity[];
    canEnterCases: boolean;
    canGenerateCases: boolean;
    canEnterRunner: boolean;
    endpointCount: number;
    caseCount: number;
  },
) {
  return {
    id: doc.id,
    projectId: doc.projectId,
    transactionId: extra.transactionId,
    sourceDocName: doc.sourceDocName,
    sourceDocUrl: extra.sourceDocUrl,
    structuredMarkdown: doc.structuredMarkdown,
    tempStructuredMarkdown: doc.tempStructuredMarkdown,
    structuringStatus: doc.structuringStatus,
    structuringError: doc.structuringError,
    generationPromptIds: doc.metadata?.promptIds ?? [],
    endpoints: extra.endpoints.map(toPublicApiEndpoint),
    canEnterCases: extra.canEnterCases,
    canGenerateCases: extra.canGenerateCases,
    canEnterRunner: extra.canEnterRunner,
    endpointCount: extra.endpointCount,
    caseCount: extra.caseCount,
  };
}

export function toPublicApiCase(testCase: ApiTestCaseEntity) {
  return {
    id: testCase.id,
    projectId: testCase.projectId,
    endpointId: testCase.endpointId,
    title: testCase.title,
    caseNo: testCase.caseNo,
    description: testCase.description ?? "",
    remark: testCase.remark,
    transactionCode: testCase.transactionCode,
    owner: testCase.owner,
    priority: testCase.priority,
    polarity: testCase.polarity,
    status: testCase.status,
    enabled: testCase.enabled,
    preconditions: testCase.preconditions,
    request: testCase.request,
    expected: testCase.expected,
    metadata: testCase.metadata,
    createdBy: testCase.createdBy,
    ...(testCase.endpoint
      ? { endpoint: toPublicApiEndpoint(testCase.endpoint) }
      : {}),
  };
}

export function toPublicApiEnvironmentService(
  row: ApiTestEnvironmentServiceEntity,
) {
  return {
    id: row.id,
    projectId: row.projectId,
    environmentId: row.environmentId,
    name: row.name,
    transport: row.transport ?? "http",
    payloadFormat: row.payloadFormat,
    baseUrl: row.baseUrl,
    pathPrefix: row.pathPrefix,
    host: row.host,
    port: row.port,
    encoding: row.encoding,
    framing: row.framing,
    headers: row.headers ?? {},
    variables: row.variables ?? {},
    sortOrder: row.sortOrder,
    enabled: row.enabled,
  };
}

export function toPublicApiExecutionSet(
  set: ApiTestExecutionSetEntity,
  extra?: { caseCount?: number; caseIds?: string[] },
) {
  return {
    id: set.id,
    projectId: set.projectId,
    transactionId: set.transactionId,
    name: set.name,
    description: set.description,
    enabled: set.enabled,
    lastRunId: set.lastRunId,
    lastRunStatus: set.lastRunStatus,
    lastRunAt: set.lastRunAt,
    lastPassedCount: set.lastPassedCount,
    lastTotalCount: set.lastTotalCount,
    ...(extra?.caseCount !== undefined ? { caseCount: extra.caseCount } : {}),
    ...(extra?.caseIds !== undefined ? { caseIds: extra.caseIds } : {}),
  };
}

export function toPublicApiRunItem(item: ApiTestRunItemEntity) {
  return {
    id: item.id,
    caseId: item.caseId,
    caseTitle: item.caseTitle,
    status: item.status,
    durationMs: item.durationMs,
    requestSnapshot: item.requestSnapshot,
    responseSnapshot: item.responseSnapshot,
    assertions: item.assertions,
    createdAt: item.createdAt,
  };
}

export function toPublicApiRun(
  run: ApiTestRunEntity,
  items: ApiTestRunItemEntity[] = [],
) {
  return {
    id: run.id,
    projectId: run.projectId,
    environmentId: run.environmentId,
    environmentServiceId: run.environmentServiceId,
    executionSetId: run.executionSetId,
    transactionId: run.transactionId,
    status: run.status,
    totalCount: run.totalCount,
    passedCount: run.passedCount,
    failedCount: run.failedCount,
    errorCount: run.errorCount,
    concurrency: run.concurrency,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
    items: items.map(toPublicApiRunItem),
  };
}
