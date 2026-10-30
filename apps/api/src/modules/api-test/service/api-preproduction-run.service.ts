import type {
  ApiPreproductionRunRecord,
  ApiPreproductionRunExecutionStatus,
  ApiPreproductionRunSet,
  ApiPreproductionRunSetCase,
} from "@case-forge/shared";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Like, Repository, type FindOptionsWhere } from "typeorm";
import { scopedWhere } from "@common/audit/user-scope";
import {
  auditFieldsForCreate,
  RequestContext,
} from "@common/audit/request-context";
import { ApiPreproductionRunRecordEntity } from "../entity/api-preproduction-run-record.entity";
import { ApiPreproductionRunSetCaseEntity } from "../entity/api-preproduction-run-set-case.entity";
import { ApiPreproductionRunSetEntity } from "../entity/api-preproduction-run-set.entity";
import { ApiPreproductionCaseEntity } from "../entity/api-preproduction-case.entity";
import { ApiExecutionService } from "./api-execution.service";
import { ApiCaseReportDeliveryService } from "./api-case-report-delivery.service";

interface PushSelection {
  versionId: string;
  applicationId: string;
  roundId: string;
}

interface CreateRunSetInput {
  name?: string;
  versionId: string;
  versionLabel: string;
  applicationId?: string | null;
  applicationLabel?: string | null;
  roundId?: string | null;
  roundLabel?: string | null;
  totalCount?: number;
}

type StepSnapshot = {
  stepName?: string;
  status?: string;
  response?: { error?: string } | null;
  assertions?: Array<{ name?: string; passed?: boolean; message?: string }>;
};

@Injectable()
export class ApiPreproductionRunService {
  constructor(
    @InjectRepository(ApiPreproductionRunRecordEntity)
    private readonly records: Repository<ApiPreproductionRunRecordEntity>,
    @InjectRepository(ApiPreproductionRunSetEntity)
    private readonly runSets: Repository<ApiPreproductionRunSetEntity>,
    @InjectRepository(ApiPreproductionRunSetCaseEntity)
    private readonly runSetCases: Repository<ApiPreproductionRunSetCaseEntity>,
    @InjectRepository(ApiPreproductionCaseEntity)
    private readonly preproductionCases: Repository<ApiPreproductionCaseEntity>,
    private readonly execution: ApiExecutionService,
    private readonly delivery: ApiCaseReportDeliveryService,
  ) {}

  async createRunSet(input: CreateRunSetInput) {
    const totalCount = input.totalCount ?? 0;
    if (!Number.isInteger(totalCount) || totalCount < 0) {
      throw new BadRequestException("执行推送集案例数量不合法");
    }
    const row = await this.runSets.save(
      this.runSets.create({
        ...input,
        name: input.name?.trim() || null,
        totalCount,
        status: totalCount > 0 ? "running" : "pending",
        ...auditFieldsForCreate(),
      }),
    );
    return toPublicRunSet(row);
  }

  /**
   * 把准生产案例关联进执行推送集。
   *
   * 关联只是编组，不会触发执行；真正执行由前端在「执行推送集」页签逐条调用
   * run-push 完成，集合上的版本/应用/轮次在执行时复用。
   */
  async attachCases(runSetId: string, caseIds: string[]) {
    const runSet = await this.findRunSet(runSetId);
    const uniqueCaseIds = [...new Set(caseIds.filter(Boolean))];
    if (!uniqueCaseIds.length) {
      throw new BadRequestException("请选择要关联的案例");
    }
    const cases = await this.preproductionCases.find({
      where: scopedWhere({ id: In(uniqueCaseIds) }),
    });
    if (cases.length !== uniqueCaseIds.length) {
      throw new NotFoundException("部分案例不存在或无权访问");
    }
    const disabled = cases.filter((item) => !item.enabled);
    if (disabled.length) {
      throw new BadRequestException(
        `案例「${disabled[0].title}」未启用，无法关联到执行推送集`,
      );
    }

    const existing = await this.runSetCases.find({
      where: { runSetId },
      order: { sortOrder: "DESC" },
    });
    const existingCaseIds = new Set(existing.map((item) => item.caseId));
    const nextSortOrder =
      existing.length > 0 ? existing[0].sortOrder + 1 : 0;
    const additions = cases
      .filter((item) => !existingCaseIds.has(item.id))
      .map((item, index) =>
        this.runSetCases.create({
          runSetId,
          caseId: item.id,
          projectId: item.projectId,
          transactionId: item.transactionId,
          caseTitle: item.title,
          sortOrder: nextSortOrder + index,
          ...auditFieldsForCreate(),
        }),
      );
    if (additions.length) {
      await this.runSetCases.save(additions);
    }
    await this.syncRunSetTotal(runSet);
    return this.listRunSetCases(runSetId);
  }

  async detachCase(runSetId: string, caseId: string) {
    await this.findRunSet(runSetId);
    const existing = await this.runSetCases.findOne({
      where: { runSetId, caseId },
    });
    if (!existing) {
      throw new NotFoundException("该案例不在执行推送集中");
    }
    // 软删除：保留成员行以便复用历史 sortOrder，唯一性由服务层按未删除行保证。
    await this.runSetCases.softDelete({ id: existing.id });
    const runSet = await this.findRunSet(runSetId);
    await this.syncRunSetTotal(runSet);
    return this.listRunSetCases(runSetId);
  }

  /**
   * 删除执行推送集。
   *
   * 集合与成员标记删除；已产生的执行记录（api_preprod_run_record）保留，
   * 需求进度视图仍能看到案例的准生产执行结果。
   */
  async deleteRunSet(runSetId: string) {
    const runSet = await this.findRunSet(runSetId);
    if (runSet.status === "running") {
      throw new BadRequestException("执行推送中的集合不能删除，请等待执行完成");
    }
    await this.runSetCases.softDelete({ runSetId });
    await this.runSets.softDelete({ id: runSetId });
    return { ok: true };
  }

  async listRunSetCases(runSetId: string) {
    await this.findRunSet(runSetId);
    const rows = await this.runSetCases.find({
      where: { runSetId },
      order: { sortOrder: "ASC" },
    });
    return rows.map(toPublicRunSetCase);
  }

  /** 关联/取消关联后同步集合的案例总数。 */
  private async syncRunSetTotal(runSet: ApiPreproductionRunSetEntity) {
    const count = await this.runSetCases.count({ where: { runSetId: runSet.id } });
    if (runSet.totalCount === count) return runSet;
    runSet.totalCount = count;
    return this.runSets.save(runSet);
  }

  async finishRunSet(runSetId: string) {
    const runSet = await this.findRunSet(runSetId);
    await this.refreshRunSet(runSet);
    return toPublicRunSet(runSet);
  }

  async listRunSets(
    options: { page?: number; size?: number; keyword?: string } = {},
  ) {
    const page = Math.max(1, Math.floor(options.page || 1));
    const size = Math.min(100, Math.max(1, Math.floor(options.size || 10)));
    const keyword = options.keyword?.trim();
    const baseWhere = { createdBy: RequestContext.getUserName() };
    const where: FindOptionsWhere<ApiPreproductionRunSetEntity>[] = keyword
      ? [
          { ...baseWhere, name: Like(`%${keyword}%`) },
          { ...baseWhere, versionLabel: Like(`%${keyword}%`) },
        ]
      : [baseWhere];
    const [rows, count] = await this.runSets.findAndCount({
      where,
      order: { createdAt: "DESC" },
      skip: (page - 1) * size,
      take: size,
    });
    for (const row of rows.filter((item) => item.status === "running")) {
      await this.refreshRunSet(row);
    }
    const executionRecords = rows.length
      ? await this.records.find({
          where: {
            runSetId: In(rows.map((row) => row.id)),
            createdBy: RequestContext.getUserName(),
          },
          order: { createdAt: "DESC" },
          select: ["runSetId", "createdAt"],
        })
      : [];
    const lastExecutedAtByRunSet = new Map<string, Date>();
    for (const record of executionRecords) {
      if (record.runSetId && !lastExecutedAtByRunSet.has(record.runSetId)) {
        lastExecutedAtByRunSet.set(record.runSetId, record.createdAt);
      }
    }
    return {
      rows: rows.map((row) =>
        toPublicRunSet(row, lastExecutedAtByRunSet.get(row.id)),
      ),
      count,
      page,
      size,
    };
  }

  async listRunSetRecords(runSetId: string) {
    await this.findRunSet(runSetId);
    const rows = await this.records.find({
      where: {
        runSetId,
        createdBy: RequestContext.getUserName(),
      },
      order: { createdAt: "ASC" },
      take: 1000,
    });
    return rows.map(toPublicRunRecord);
  }

  async runCaseAndPush(
    projectId: string,
    caseId: string,
    selection: PushSelection,
    runSetId?: string,
  ) {
    const testCase = await this.preproductionCases.findOne({
      where: scopedWhere({ projectId, id: caseId }),
    });
    if (!testCase) throw new NotFoundException("准生产案例不存在或无权访问");
    if (!testCase.enabled) {
      throw new BadRequestException("未启用案例不可执行");
    }
    if (runSetId) {
      await this.findRunSet(runSetId);
      // 集合内执行只允许跑已关联的案例，避免把任意案例记录写进集合。
      const member = await this.runSetCases.findOne({
        where: { runSetId, caseId },
      });
      if (!member) {
        throw new BadRequestException("该案例未关联到此执行推送集");
      }
    }
    const totalSteps = Math.max(1, testCase.snapshot.steps?.length ?? 0);
    const record = await this.records.save(
      this.records.create({
        projectId,
        transactionId: testCase.transactionId,
        caseId,
        runSetId: runSetId ?? null,
        caseTitle: testCase.title,
        executionStatus: "running",
        totalSteps,
        pushStatus: "pending",
        versionId: selection.versionId,
        applicationId: selection.applicationId,
        roundId: selection.roundId,
        ...auditFieldsForCreate(),
      }),
    );

    let run: Awaited<ReturnType<ApiExecutionService["getRunDetail"]>>;
    try {
      run = await this.execution.runCases({
        projectId,
        caseIds: [caseId],
        caseSource: "preproduction",
        transactionId: testCase.transactionId,
        concurrency: 1,
      });
    } catch (error) {
      return this.saveExecutionFailure(record, error);
    }

    const outcome = this.executionOutcome(run.items[0], totalSteps);
    record.executionStatus = outcome.status;
    record.currentStepIndex = outcome.stepIndex;
    record.currentStepName = outcome.stepName;
    record.executionError = outcome.error;
    record.runId = run.id;
    record.finishedAt = new Date();
    await this.records.save(record);
    return this.pushRecord(record, selection);
  }

  async retryPush(projectId: string, recordId: string) {
    const record = await this.records.findOne({
      where: scopedWhere({ projectId, id: recordId }),
    });
    if (!record) throw new NotFoundException("运行推送记录不存在或无权访问");
    if (!record.runId) {
      throw new BadRequestException("执行未完成，无法单独重试推送");
    }
    if (!record.versionId || !record.applicationId || !record.roundId) {
      throw new BadRequestException("原执行记录缺少版本、应用或轮次，无法重试推送");
    }
    return this.pushRecord(record, {
      versionId: record.versionId,
      applicationId: record.applicationId,
      roundId: record.roundId,
    });
  }

  async listCaseRecords(projectId: string, caseId: string) {
    const rows = await this.records.find({
      where: {
        projectId,
        caseId,
        createdBy: RequestContext.getUserName(),
      },
      order: { createdAt: "DESC" },
      take: 30,
    });
    return rows.map(toPublicRunRecord);
  }

  async latestByCaseIds(caseIds: string[]) {
    const ids = [...new Set(caseIds.filter(Boolean))];
    if (!ids.length) return [];
    const rows = await this.records.find({
      where: {
        caseId: In(ids),
        createdBy: RequestContext.getUserName(),
      },
      order: { createdAt: "DESC" },
      take: Math.min(3000, ids.length * 30),
    });
    const latest = new Map<string, ApiPreproductionRunRecordEntity>();
    for (const row of rows) {
      if (!latest.has(row.caseId)) latest.set(row.caseId, row);
    }
    return [...latest.values()].map(toPublicRunRecord);
  }

  private async saveExecutionFailure(
    record: ApiPreproductionRunRecordEntity,
    error: unknown,
  ) {
    const message =
      error instanceof Error ? error.message : "案例步骤执行失败";
    const stepName = /步骤「([^」]+)」/.exec(message)?.[1];
    record.executionStatus = "error";
    record.currentStepName = stepName ?? "执行前校验";
    record.executionError = message;
    record.pushStatus = "failed";
    record.pushError = "执行未完成，未推送测管";
    record.finishedAt = new Date();
    record.pushFinishedAt = record.finishedAt;
    await this.records.save(record);
    if (record.runSetId) await this.refreshRunSetById(record.runSetId);
    return toPublicRunRecord(record);
  }

  private async pushRecord(
    record: ApiPreproductionRunRecordEntity,
    selection: PushSelection,
  ) {
    record.pushStatus = "pending";
    record.pushError = null;
    record.pushFinishedAt = null;
    await this.records.save(record);
    try {
      const published = await this.delivery.publish(
        record.projectId,
        record.transactionId,
        record.runId!,
        selection,
      );
      record.pushStatus = "success";
      record.reportUrl = published.reportUrl;
    } catch (error) {
      record.pushStatus = "failed";
      record.pushError =
        error instanceof Error ? error.message : "推送测管失败";
    }
    record.pushFinishedAt = new Date();
    await this.records.save(record);
    if (record.runSetId) await this.refreshRunSetById(record.runSetId);
    return toPublicRunRecord(record);
  }

  private async findRunSet(runSetId: string) {
    const runSet = await this.runSets.findOne({
      where: scopedWhere({ id: runSetId }),
    });
    if (!runSet) {
      throw new NotFoundException("执行推送集不存在或无权访问");
    }
    return runSet;
  }

  private async refreshRunSetById(runSetId: string) {
    const runSet = await this.findRunSet(runSetId);
    await this.refreshRunSet(runSet);
  }

  private async refreshRunSet(runSet: ApiPreproductionRunSetEntity) {
    const rows = await this.records.find({
      where: {
        runSetId: runSet.id,
        createdBy: RequestContext.getUserName(),
      },
      order: { createdAt: "DESC" },
    });
    // 同一案例可能多次执行，只取最新一条参与汇总，避免重复计数。
    const latest = new Map<string, ApiPreproductionRunRecordEntity>();
    for (const row of rows) {
      if (!latest.has(row.caseId)) latest.set(row.caseId, row);
    }
    const completed = [...latest.values()].filter(
      (row) => row.executionStatus !== "running",
    );
    runSet.completedCount = completed.length;
    runSet.passedCount = completed.filter(
      (row) => row.executionStatus === "passed",
    ).length;
    runSet.failedCount = completed.filter(
      (row) => row.executionStatus === "failed",
    ).length;
    runSet.errorCount = completed.filter(
      (row) => row.executionStatus === "error",
    ).length;
    runSet.pushSuccessCount = completed.filter(
      (row) => row.pushStatus === "success",
    ).length;
    runSet.pushFailedCount = completed.filter(
      (row) => row.pushStatus === "failed",
    ).length;
    const pushPending = completed.some(
      (row) => row.pushStatus === "pending",
    );
    if (latest.size === 0) {
      // 尚无执行记录：关联了案例但还没开始跑的集合保持「待执行」。
      if (runSet.status !== "running") {
        runSet.status = "pending";
        runSet.finishedAt = null;
      }
    } else if (
      completed.length < runSet.totalCount ||
      pushPending ||
      latest.size < runSet.totalCount
    ) {
      runSet.status = "running";
      runSet.finishedAt = null;
    } else if (
      runSet.passedCount === runSet.totalCount &&
      runSet.pushSuccessCount === runSet.totalCount
    ) {
      runSet.status = "completed";
      runSet.finishedAt ??= new Date();
    } else if (runSet.passedCount > 0 || runSet.pushSuccessCount > 0) {
      runSet.status = "partial_failed";
      runSet.finishedAt ??= new Date();
    } else {
      runSet.status = "failed";
      runSet.finishedAt ??= new Date();
    }
    return this.runSets.save(runSet);
  }

  private executionOutcome(item: unknown, totalSteps: number) {
    const runItem = item as
      | {
          status?: string;
          requestSnapshot?: { steps?: StepSnapshot[] };
          responseSnapshot?: { error?: string };
        }
      | undefined;
    if (!runItem) {
      return {
        status: "error" as ApiPreproductionRunExecutionStatus,
        stepIndex: null,
        stepName: "执行结果",
        error: "执行未返回案例结果",
      };
    }
    const steps = Array.isArray(runItem.requestSnapshot?.steps)
      ? runItem.requestSnapshot.steps
      : [];
    const failedIndex = steps.findIndex((step) => step.status !== "passed");
    const failed = failedIndex >= 0 ? steps[failedIndex] : undefined;
    const status: ApiPreproductionRunExecutionStatus =
      runItem.status === "passed"
        ? "passed"
        : runItem.status === "failed"
          ? "failed"
          : "error";
    const failedAssertion = failed?.assertions?.find(
      (assertion) => assertion.passed === false,
    );
    const assertionError = failedAssertion
      ? failedAssertion.message ||
        `断言「${failedAssertion.name || "未命名"}」未通过`
      : undefined;
    return {
      status,
      stepIndex:
        status === "passed"
          ? totalSteps
          : failed
            ? failedIndex + 1
            : steps.length
              ? null
              : 1,
      stepName:
        status === "passed"
          ? `全部 ${totalSteps} 个步骤执行完成`
          : failed?.stepName ?? (steps.length ? "案例步骤" : "主请求"),
      error:
        status === "passed"
          ? null
          : failed?.response?.error ||
            assertionError ||
            runItem.responseSnapshot?.error ||
            "步骤执行未通过",
    };
  }
}

function toPublicRunRecord(
  row: ApiPreproductionRunRecordEntity,
): ApiPreproductionRunRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    transactionId: row.transactionId,
    caseId: row.caseId,
    caseTitle: row.caseTitle,
    runSetId: row.runSetId ?? null,
    executionStatus: row.executionStatus,
    currentStepIndex: row.currentStepIndex ?? null,
    currentStepName: row.currentStepName ?? null,
    totalSteps: row.totalSteps,
    executionError: row.executionError ?? null,
    runId: row.runId ?? null,
    pushStatus: row.pushStatus,
    pushError: row.pushError ?? null,
    reportUrl: row.reportUrl ?? null,
    createdAt: toIsoString(row.createdAt)!,
    finishedAt: toIsoString(row.finishedAt),
    pushFinishedAt: toIsoString(row.pushFinishedAt),
  };
}

function toPublicRunSet(
  row: ApiPreproductionRunSetEntity,
  lastExecutedAt?: Date,
): ApiPreproductionRunSet {
  return {
    id: row.id,
    name: row.name ?? null,
    versionId: row.versionId,
    versionLabel: row.versionLabel,
    applicationId: row.applicationId ?? null,
    applicationLabel: row.applicationLabel ?? null,
    roundId: row.roundId ?? null,
    roundLabel: row.roundLabel ?? null,
    status: row.status,
    totalCount: row.totalCount,
    completedCount: row.completedCount,
    passedCount: row.passedCount,
    failedCount: row.failedCount,
    errorCount: row.errorCount,
    pushSuccessCount: row.pushSuccessCount,
    pushFailedCount: row.pushFailedCount,
    createdBy: row.createdBy,
    createdAt: toIsoString(row.createdAt)!,
    lastExecutedAt: toIsoString(lastExecutedAt),
    finishedAt: toIsoString(row.finishedAt),
  };
}

function toIsoString(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toPublicRunSetCase(
  row: ApiPreproductionRunSetCaseEntity,
): ApiPreproductionRunSetCase {
  return {
    id: row.id,
    runSetId: row.runSetId,
    caseId: row.caseId,
    projectId: row.projectId,
    transactionId: row.transactionId,
    caseTitle: row.caseTitle,
    sortOrder: row.sortOrder,
    createdAt: toIsoString(row.createdAt)!,
  };
}
