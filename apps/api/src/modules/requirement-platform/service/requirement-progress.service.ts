/**
 * @file 分发人只读查看需求完成情况。
 *
 * 数据链路保持与需求接口测试工作台一致：
 * 需求项目 -> 交易 -> 案例/步骤 -> 接口执行及准生产执行推送记录。
 */
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  ApiCaseStep,
  RequirementCaseExecution,
  RequirementExecutionStatus,
  RequirementPlatformItem,
  RequirementProgressCase,
  RequirementProgressDetail,
  RequirementProgressStatus,
  RequirementProgressStep,
  RequirementProgressTransaction,
} from "@case-forge/shared";
import { isDbStep } from "@case-forge/shared";
import { getScopedUserName } from "@common/audit/user-scope";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { In, Repository } from "typeorm";
import { ApiPreproductionRunRecordEntity } from "@api-test/entity/api-preproduction-run-record.entity";
import { ApiTestCaseEntity } from "@api-test/entity/api-test-case.entity";
import { ApiTestRunItemEntity } from "@api-test/entity/api-test-run-item.entity";
import { ApiTestRunEntity } from "@api-test/entity/api-test-run.entity";
import { ApiTransactionEntity } from "@api-test/entity/api-transaction.entity";
import { ApiRequirementDispatcherEntity } from "../entity/api-requirement-dispatcher.entity";
import { ApiRequirementEntity } from "../entity/api-requirement.entity";

const VIEWABLE_REQUIREMENT_STATUSES = new Set<RequirementProgressStatus>([
  "testing",
  "completed",
  "returned",
]);

type RuntimeStep = {
  stepId?: string;
  stepName?: string;
  status?: RequirementExecutionStatus;
  durationMs?: number;
  response?: { error?: string } | null;
  assertions?: Array<{ name?: string; passed?: boolean; message?: string }>;
};

type DirectExecution = {
  run: ApiTestRunEntity;
  item: ApiTestRunItemEntity;
};

type DirectExecutionIndex = {
  latestByCase: Map<string, DirectExecution>;
  byRunAndCase: Map<string, ApiTestRunItemEntity>;
};

@Injectable()
export class RequirementProgressService {
  constructor(
    @InjectRepository(ApiRequirementEntity)
    private readonly requirementRepo: Repository<ApiRequirementEntity>,
    @InjectRepository(ApiRequirementDispatcherEntity)
    private readonly dispatcherRepo: Repository<ApiRequirementDispatcherEntity>,
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
    @InjectRepository(ApiTransactionEntity)
    private readonly transactionRepo: Repository<ApiTransactionEntity>,
    @InjectRepository(ApiTestCaseEntity)
    private readonly caseRepo: Repository<ApiTestCaseEntity>,
    @InjectRepository(ApiTestRunEntity)
    private readonly runRepo: Repository<ApiTestRunEntity>,
    @InjectRepository(ApiTestRunItemEntity)
    private readonly runItemRepo: Repository<ApiTestRunItemEntity>,
    @InjectRepository(ApiPreproductionRunRecordEntity)
    private readonly preproductionRunRepo: Repository<ApiPreproductionRunRecordEntity>,
  ) {}

  async getByRequirementId(id: string): Promise<RequirementProgressDetail> {
    await this.assertDispatcher();
    const requirement = await this.requirementRepo.findOne({
      where: { id },
    });
    if (!requirement) {
      throw new NotFoundException("需求不存在");
    }
    if (
      !VIEWABLE_REQUIREMENT_STATUSES.has(
        requirement.status as RequirementProgressStatus,
      )
    ) {
      throw new ForbiddenException(
        "仅可查看测试中、已完成或已打回需求的完成情况",
      );
    }

    const project = await this.findRequirementProject(requirement);
    const publicRequirement = toPublicRequirement(
      requirement,
      requirement.status as RequirementProgressStatus,
      project,
    );
    if (!project) {
      return {
        requirement: publicRequirement,
        projectId: null,
        summary: emptySummary(),
        transactions: [],
        refreshedAt: new Date().toISOString(),
      };
    }

    const transactions = await this.transactionRepo.find({
      where: { projectId: project.id },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    const transactionIds = transactions.map((transaction) => transaction.id);
    const runnerCaseIds = [
      ...new Set(
        transactions.flatMap((transaction) =>
          Array.isArray(transaction.runnerCaseIds)
            ? transaction.runnerCaseIds.filter(Boolean)
            : [],
        ),
      ),
    ];
    const cases = runnerCaseIds.length
      ? await this.caseRepo.find({
          where: {
            projectId: project.id,
            id: In(runnerCaseIds),
          },
          relations: ["endpoint"],
        })
      : [];
    const caseById = new Map(cases.map((testCase) => [testCase.id, testCase]));
    const directExecutions = await this.loadLatestDirectExecutions(
      project.id,
      transactionIds,
    );
    const preproductionByCase = await this.loadLatestPreproductionExecutions(
      project.id,
      transactionIds,
    );

    const progressTransactions = transactions.map((transaction) => {
      const linkedCaseIds = Array.isArray(transaction.runnerCaseIds)
        ? transaction.runnerCaseIds
        : [];
      const transactionCases = linkedCaseIds
        .map((caseId) => caseById.get(caseId))
        .filter((testCase): testCase is ApiTestCaseEntity => Boolean(testCase));
      const progressCases = transactionCases.map((testCase) => {
        const direct = directExecutions.latestByCase.get(testCase.id);
        const preproduction = preproductionByCase.get(testCase.id);
        const runtimeSteps = runtimeStepsOf(
          preproduction?.runId
            ? directExecutions.byRunAndCase.get(
                runtimeItemKey(preproduction.runId, testCase.id),
              )
            : direct?.item,
        );
        const latestExecution = chooseExecution(direct, preproduction);
        return {
          id: testCase.id,
          caseNo: testCase.caseNo ?? null,
          title: testCase.title,
          priority: testCase.priority,
          polarity: testCase.polarity,
          enabled: testCase.enabled,
          stepCount: caseStepsOf(testCase).length,
          steps: caseStepsOf(testCase).map((step, index) =>
            toProgressStep(step, index, runtimeSteps),
          ),
          latestExecution,
        } satisfies RequirementProgressCase;
      });
      return toTransactionProgress(transaction, progressCases);
    });

    return {
      requirement: publicRequirement,
      projectId: project.id,
      summary: summarizeTransactions(progressTransactions),
      transactions: progressTransactions,
      refreshedAt: new Date().toISOString(),
    };
  }

  private async assertDispatcher() {
    const exists = await this.dispatcherRepo.exists({
      where: { userName: getScopedUserName() },
    });
    if (!exists) {
      throw new ForbiddenException("仅分发人可查看需求完成情况");
    }
  }

  private async findRequirementProject(requirement: ApiRequirementEntity) {
    if (requirement.claimedProjectId) {
      const claimedProject = await this.projectRepo.findOne({
        where: {
          id: requirement.claimedProjectId,
          platform: "api-test",
        },
      });
      if (claimedProject) return claimedProject;
    }
    return this.projectRepo.findOne({
      where: {
        requirementNo: requirement.projectCode,
        platform: "api-test",
      },
      order: { updatedAt: "DESC" },
    });
  }

  private async loadLatestDirectExecutions(
    projectId: string,
    transactionIds: string[],
  ): Promise<DirectExecutionIndex> {
    const emptyIndex: DirectExecutionIndex = {
      latestByCase: new Map(),
      byRunAndCase: new Map(),
    };
    if (!transactionIds.length) return emptyIndex;
    const runs = await this.runRepo.find({
      where: {
        projectId,
        transactionId: In(transactionIds),
      },
      order: { createdAt: "DESC" },
      take: 3000,
    });
    if (!runs.length) return emptyIndex;
    const runById = new Map(runs.map((run) => [run.id, run]));
    const items = await this.runItemRepo.find({
      where: { runId: In(runs.map((run) => run.id)) },
      order: { createdAt: "DESC" },
    });
    const seen = new Set<string>();
    const byRunAndCase = new Map<string, ApiTestRunItemEntity>();
    const latest = new Map<string, DirectExecution>();
    for (const item of items) {
      byRunAndCase.set(runtimeItemKey(item.runId, item.caseId), item);
      if (seen.has(item.caseId)) continue;
      const run = runById.get(item.runId);
      if (!run) continue;
      seen.add(item.caseId);
      latest.set(item.caseId, { run, item });
    }
    return { latestByCase: latest, byRunAndCase };
  }

  private async loadLatestPreproductionExecutions(
    projectId: string,
    transactionIds: string[],
  ) {
    if (!transactionIds.length) {
      return new Map<string, ApiPreproductionRunRecordEntity>();
    }
    const rows = await this.preproductionRunRepo.find({
      where: {
        projectId,
        transactionId: In(transactionIds),
      },
      order: { createdAt: "DESC" },
      take: 3000,
    });
    const latest = new Map<string, ApiPreproductionRunRecordEntity>();
    for (const row of rows) {
      if (!latest.has(row.caseId)) latest.set(row.caseId, row);
    }
    return latest;
  }
}

function caseStepsOf(testCase: ApiTestCaseEntity): ApiCaseStep[] {
  if (testCase.steps?.length) return testCase.steps;
  return [
    {
      id: testCase.id,
      name: testCase.title,
      isMainRequest: true,
      request: testCase.request,
      expected: testCase.expected,
      exports: testCase.metadata?.exports ?? [],
    },
  ];
}

function toProgressStep(
  step: ApiCaseStep,
  index: number,
  runtimeSteps: RuntimeStep[],
): RequirementProgressStep {
  const runtime =
    runtimeSteps.find((item) => item.stepId === step.id) ?? runtimeSteps[index];
  const summary = isDbStep(step)
    ? `${step.db?.mode === "execute" ? "更新数据" : "查询数据"} · SQL`
    : [
        step.request?.method || "POST",
        step.request?.path || "-",
        step.target?.name ? `@ ${step.target.name}` : "",
      ]
        .filter(Boolean)
        .join(" ");
  return {
    id: step.id,
    name: step.name || `步骤 ${index + 1}`,
    kind: isDbStep(step) ? "db" : "http",
    summary,
    executionStatus: runtime?.status ?? null,
    durationMs: runtime?.durationMs ?? null,
    error: runtimeError(runtime),
  };
}

function runtimeStepsOf(item?: ApiTestRunItemEntity) {
  const steps = item?.requestSnapshot?.steps;
  return Array.isArray(steps) ? (steps as RuntimeStep[]) : [];
}

function runtimeItemKey(runId: string, caseId: string) {
  return `${runId}:${caseId}`;
}

function runtimeError(step?: RuntimeStep) {
  if (!step) return null;
  const failedAssertion = step.assertions?.find(
    (assertion) => assertion.passed === false,
  );
  return (
    step.response?.error ||
    failedAssertion?.message ||
    (failedAssertion
      ? `断言「${failedAssertion.name || "未命名"}」未通过`
      : null)
  );
}

function chooseExecution(
  direct: DirectExecution | undefined,
  preproduction: ApiPreproductionRunRecordEntity | undefined,
): RequirementCaseExecution | null {
  if (!direct && !preproduction) return null;
  const directAt = direct?.run.createdAt
    ? new Date(direct.run.createdAt).getTime()
    : 0;
  const preproductionAt = preproduction?.createdAt
    ? new Date(preproduction.createdAt).getTime()
    : 0;
  if (preproduction && preproductionAt >= directAt) {
    return {
      source: "preproduction",
      status: preproduction.executionStatus,
      runId: preproduction.runId ?? null,
      createdAt: toIsoString(preproduction.createdAt)!,
      finishedAt: toIsoString(preproduction.finishedAt),
      error: preproduction.executionError ?? null,
      pushStatus: preproduction.pushStatus,
      pushError: preproduction.pushError ?? null,
      reportUrl: preproduction.reportUrl ?? null,
    };
  }
  if (!direct) return null;
  return {
    source: "api-test",
    status: direct.item.status,
    runId: direct.run.id,
    createdAt: toIsoString(direct.run.createdAt)!,
    finishedAt: toIsoString(direct.run.finishedAt),
    durationMs: direct.item.durationMs,
    error:
      direct.item.responseSnapshot?.error ||
      assertionError(direct.item.assertions),
  };
}

function assertionError(
  assertions: Array<{ name?: string; passed?: boolean; message?: string }>,
) {
  const failed = assertions.find((item) => item.passed === false);
  if (!failed) return null;
  return failed.message || `断言「${failed.name || "未命名"}」未通过`;
}

function toTransactionProgress(
  transaction: ApiTransactionEntity,
  cases: RequirementProgressCase[],
): RequirementProgressTransaction {
  const executed = cases.filter((item) => item.latestExecution);
  return {
    id: transaction.id,
    code: transaction.code,
    name: transaction.name,
    syncStatus: transaction.syncStatus ?? null,
    createdAt: toIsoString(transaction.createdAt)!,
    caseCount: cases.length,
    executedCaseCount: executed.length,
    passedCount: countExecution(cases, "passed"),
    failedCount: countExecution(cases, "failed"),
    errorCount: countExecution(cases, "error"),
    cases,
  };
}

function countExecution(
  cases: RequirementProgressCase[],
  status: RequirementExecutionStatus,
) {
  return cases.filter((item) => item.latestExecution?.status === status).length;
}

function summarizeTransactions(transactions: RequirementProgressTransaction[]) {
  const cases = transactions.flatMap((transaction) => transaction.cases);
  return {
    transactionCount: transactions.length,
    caseCount: cases.length,
    stepCount: cases.reduce((total, testCase) => total + testCase.stepCount, 0),
    executedCaseCount: cases.filter((item) => item.latestExecution).length,
    passedCount: cases.filter(
      (item) => item.latestExecution?.status === "passed",
    ).length,
    failedCount: cases.filter(
      (item) => item.latestExecution?.status === "failed",
    ).length,
    errorCount: cases.filter((item) => item.latestExecution?.status === "error")
      .length,
    pushSuccessCount: cases.filter(
      (item) => item.latestExecution?.pushStatus === "success",
    ).length,
    pushFailedCount: cases.filter(
      (item) => item.latestExecution?.pushStatus === "failed",
    ).length,
  };
}

function emptySummary() {
  return {
    transactionCount: 0,
    caseCount: 0,
    stepCount: 0,
    executedCaseCount: 0,
    passedCount: 0,
    failedCount: 0,
    errorCount: 0,
    pushSuccessCount: 0,
    pushFailedCount: 0,
  };
}

function toPublicRequirement(
  row: ApiRequirementEntity,
  status: RequirementProgressStatus,
  project?: CaseProjectEntity | null,
): RequirementPlatformItem {
  return {
    id: row.id,
    projectCode: row.projectCode,
    projectName: row.projectName,
    applicationName: row.applicationName,
    versionName: row.versionName,
    status,
    dispatchedTo: row.dispatchedTo,
    dispatchedToName: row.dispatchedToName,
    dispatchedBy: row.dispatchedBy,
    dispatchedAt: toIsoString(row.dispatchedAt),
    claimedBy: row.claimedBy,
    claimedByName: row.claimedByName,
    claimedAt: toIsoString(row.claimedAt),
    claimedProjectId: project?.id ?? row.claimedProjectId ?? null,
    completedAt: toIsoString(row.completedAt),
    sourceUpdatedAt: toIsoString(row.sourceUpdatedAt),
    refuseReason: row.refuseReason,
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
  };
}

function toIsoString(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
