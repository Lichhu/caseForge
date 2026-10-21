import type {
  PreproductionSyncCasePreview,
  PreproductionSyncPreview,
  PreproductionSyncResult,
} from "@case-forge/shared";
import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import {
  auditFieldsForCreate,
  auditFieldsForUpdate,
  RequestContext,
} from "@common/audit/request-context";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { ApiRequirementEntity } from "@requirement-platform/entity/api-requirement.entity";
import { assertApiTestProject } from "@api-test/util/assert-api-project.util";
import { ApiPreproductionCaseEntity } from "../entity/api-preproduction-case.entity";
import { ApiTestCaseEntity } from "../entity/api-test-case.entity";
import { ApiTransactionEntity } from "../entity/api-transaction.entity";

@Injectable()
export class ApiPreproductionCaseService {
  constructor(
    @InjectRepository(ApiTestCaseEntity)
    private readonly sourceCases: Repository<ApiTestCaseEntity>,
    @InjectRepository(ApiPreproductionCaseEntity)
    private readonly preproductionCases: Repository<ApiPreproductionCaseEntity>,
    @InjectRepository(ApiTransactionEntity)
    private readonly transactions: Repository<ApiTransactionEntity>,
    @InjectRepository(CaseProjectEntity)
    private readonly projects: Repository<CaseProjectEntity>,
    @InjectRepository(ApiRequirementEntity)
    private readonly requirements: Repository<ApiRequirementEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 预检当前需求的归属应用、选中交易及执行平台关联案例。
   * 失效关联只计数并跳过，不阻断整批预检。
   */
  async preview(
    projectId: string,
    transactionIds: string[],
  ): Promise<PreproductionSyncPreview> {
    await assertApiTestProject(this.projects, projectId);
    const user = RequestContext.getUserName();
    const requirement = await this.requirements.findOne({
      where: { claimedProjectId: projectId },
    });
    const applicationName = requirement?.applicationName?.trim() || null;
    const requestedIds = [
      ...new Set((transactionIds ?? []).map((id) => id.trim()).filter(Boolean)),
    ];
    const transactions = requestedIds.length
      ? await this.requireTransactions(projectId, requestedIds, user)
      : [];
    const requirementPreview = requirement
      ? {
          id: requirement.id,
          projectCode: requirement.projectCode,
          projectName: requirement.projectName,
          applicationName,
        }
      : null;
    if (!transactions.length) {
      return {
        requirement: requirementPreview,
        applicationMissing: !applicationName,
        transactions: [],
        cases: [],
        invalidCaseCount: 0,
        totalLinkedCount: 0,
        syncableCount: 0,
      };
    }
    const linkedByTransaction = new Map<string, string[]>();
    const linkedCaseIds: string[] = [];
    for (const transaction of transactions) {
      const ids = Array.isArray(transaction.runnerCaseIds)
        ? [
            ...new Set(
              transaction.runnerCaseIds
                .map((id) => String(id).trim())
                .filter(Boolean),
            ),
          ]
        : [];
      linkedByTransaction.set(transaction.id, ids);
      linkedCaseIds.push(...ids);
    }
    const uniqueCaseIds = [...new Set(linkedCaseIds)];
    const sourceRows = uniqueCaseIds.length
      ? await this.sourceCases.find({
          where: {
            projectId,
            createdBy: user,
            id: In(uniqueCaseIds),
          },
          relations: ["endpoint"],
        })
      : [];
    const sourceById = new Map(sourceRows.map((row) => [row.id, row]));
    const preproductionRows = uniqueCaseIds.length
      ? await this.preproductionCases.find({
          where: { id: In(uniqueCaseIds) },
          select: ["id"],
        })
      : [];
    const preproductionIds = new Set(preproductionRows.map((row) => row.id));

    const cases: PreproductionSyncCasePreview[] = [];
    let invalidCaseCount = 0;
    for (const transaction of transactions) {
      for (const caseId of linkedByTransaction.get(transaction.id) ?? []) {
        const source = sourceById.get(caseId);
        if (
          !source ||
          !source.endpoint ||
          source.endpoint.transactionId !== transaction.id
        ) {
          invalidCaseCount += 1;
          continue;
        }
        cases.push({
          id: source.id,
          transactionId: transaction.id,
          transactionCode: transaction.code,
          caseNo: source.caseNo ?? null,
          title: source.title,
          versionCode: source.metadata?.versionCode ?? null,
          generateVersion: source.metadata?.generateVersion ?? null,
          polarity: source.polarity,
          priority: source.priority,
          enabled: Boolean(Number(source.enabled)),
          stepCount: source.steps?.length ?? 0,
          alreadySynced: preproductionIds.has(source.id),
        });
      }
    }
    cases.sort(
      (left, right) =>
        left.transactionCode.localeCompare(right.transactionCode, undefined, {
          numeric: true,
        }) ||
        (left.caseNo ?? "").localeCompare(right.caseNo ?? "", undefined, {
          numeric: true,
        }),
    );

    return {
      requirement: requirementPreview,
      applicationMissing: !applicationName,
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        code: transaction.code,
        name: transaction.name,
        linkedCount: linkedByTransaction.get(transaction.id)?.length ?? 0,
      })),
      cases,
      invalidCaseCount,
      totalLinkedCount: linkedCaseIds.length,
      syncableCount: cases.filter((item) => item.enabled).length,
    };
  }

  /**
   * 按用户勾选的案例写入准生产快照。
   * 覆盖案例内容及归属应用；未勾选案例不删除。
   */
  async syncSelectedCases(
    projectId: string,
    transactionIds: string[],
    caseIds: string[],
  ): Promise<PreproductionSyncResult> {
    await assertApiTestProject(this.projects, projectId);
    const user = RequestContext.getUserName();
    const transactions = await this.requireTransactions(
      projectId,
      transactionIds,
      user,
    );
    const requirement = await this.requirements.findOne({
      where: { claimedProjectId: projectId },
    });
    if (!requirement?.applicationName?.trim()) {
      throw new BadRequestException(
        "请先在需求管理中维护需求所属应用后再同步准生产",
      );
    }
    const applicationName = requirement.applicationName.trim();

    const selectedIds = [
      ...new Set(caseIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (!selectedIds.length) {
      throw new BadRequestException("请至少勾选一条案例");
    }

    const transactionById = new Map(
      transactions.map((transaction) => [transaction.id, transaction]),
    );
    const linkedByTransaction = new Map(
      transactions.map((transaction) => [
        transaction.id,
        new Set(
          Array.isArray(transaction.runnerCaseIds)
            ? transaction.runnerCaseIds.map((id) => String(id))
            : [],
        ),
      ]),
    );
    const sourceRows = await this.sourceCases.find({
      where: {
        projectId,
        createdBy: user,
        id: In(selectedIds),
      },
      relations: ["endpoint"],
    });
    const sourceById = new Map(sourceRows.map((row) => [row.id, row]));
    const existingRows = await this.preproductionCases.find({
      where: { id: In(selectedIds) },
      withDeleted: true,
    });
    const existingById = new Map(existingRows.map((row) => [row.id, row]));

    const now = new Date();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const rows: ApiPreproductionCaseEntity[] = [];

    for (const caseId of selectedIds) {
      const source = sourceById.get(caseId);
      const transactionId = source?.endpoint?.transactionId;
      const transaction = transactionId
        ? transactionById.get(transactionId)
        : undefined;
      if (
        !source ||
        !transaction ||
        !linkedByTransaction.get(transactionId!)?.has(caseId) ||
        !Boolean(Number(source.enabled))
      ) {
        skipped += 1;
        continue;
      }
      const existing = existingById.get(caseId);
      // 准生产案例一旦存在就视为独立副本，不自动覆盖；删除后才允许重新同步。
      if (existing && !existing.deletedAt) {
        skipped += 1;
        continue;
      }
      rows.push(
        this.preproductionCases.create({
          id: source.id,
          projectId,
          transactionId: transaction.id,
          endpointId: source.endpointId,
          caseNo: source.caseNo ?? null,
          title: source.title,
          description: source.description ?? "",
          remark: source.remark ?? null,
          // 准生产的归属应用统一取需求的应用，全量覆盖。
          applicationPath: applicationName,
          transactionCode: source.transactionCode ?? transaction.code ?? null,
          owner: source.owner ?? null,
          priority: source.priority,
          polarity: source.polarity,
          status: source.status,
          enabled: Boolean(Number(source.enabled)),
          versionCode: source.metadata?.versionCode ?? null,
          generateVersion: source.metadata?.generateVersion ?? null,
          snapshot: {
            description: source.description ?? "",
            remark: source.remark,
            preconditions: source.preconditions ?? [],
            createdBy: source.createdBy,
            request: source.request,
            expected: source.expected,
            steps: source.steps,
            metadata: source.metadata,
          },
          sourceUpdatedAt: source.updatedAt,
          syncedAt: now,
          syncedBy: user,
          ...(existing
            ? {
                createdBy: existing.createdBy ?? user,
                ...auditFieldsForUpdate(),
                ...(existing.deletedAt ? { deletedAt: null } : {}),
              }
            : auditFieldsForCreate()),
        }),
      );
      if (existing) updated += 1;
      else created += 1;
    }

    await this.dataSource.transaction(async (manager) => {
      if (rows.length) {
        await manager.save(ApiPreproductionCaseEntity, rows);
      }
    });

    return {
      created,
      updated,
      skipped,
      total: selectedIds.length,
      transactionCount: transactions.length,
      syncedAt: now.toISOString(),
    };
  }

  private async requireTransactions(
    projectId: string,
    transactionIds: string[],
    user: string,
  ) {
    const ids = [
      ...new Set((transactionIds ?? []).map((id) => id.trim()).filter(Boolean)),
    ];
    if (!ids.length) {
      throw new BadRequestException("请至少选择一条交易码");
    }
    const rows = await this.transactions.find({
      where: {
        projectId,
        createdBy: user,
        id: In(ids),
      },
    });
    if (rows.length !== ids.length) {
      throw new BadRequestException("部分交易码不存在或无权同步");
    }
    return rows;
  }
}
