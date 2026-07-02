/**
 * @file SMP 同步服务：将服务管理平台数据同步到本地交易码
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { createHash } from "crypto";
import { DataSource, EntityManager, In, Repository } from "typeorm";
import { assertApiTestProject } from "@api-test/util/assert-api-project.util";
import { auditFieldsForCreate } from "@common/audit/request-context";
import { scopedWhere } from "@common/audit/user-scope";
import { touchProjectUpdatedAt } from "@common/project/touch-project.util";
import { ApiDocEntity } from "@api-test/entity/api-doc.entity";
import { ApiEndpointEntity } from "@api-test/entity/api-endpoint.entity";
import {
  ApiTransactionEntity,
  type ApiTransactionSyncStatus,
} from "@api-test/entity/api-transaction.entity";
import { parseEndpointsFromSmpData } from "@api-test/util/smp-doc.parser";
import { buildStructuredMarkdownFromSmp } from "@api-test/util/smp-structured-doc.builder";
import {
  type SmpServiceInfoItem,
  type SmpCallServiceInfoItem,
  type SmpTestInfoItem,
  SmpClientService,
} from "./smp-client.service";

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

@Injectable()
export class SmpSyncService {
  constructor(
    @InjectRepository(ApiTransactionEntity)
    private readonly transactionRepo: Repository<ApiTransactionEntity>,
    @InjectRepository(ApiDocEntity)
    private readonly apiDocRepo: Repository<ApiDocEntity>,
    @InjectRepository(ApiEndpointEntity)
    private readonly endpointRepo: Repository<ApiEndpointEntity>,
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly smpClient: SmpClientService,
  ) {}

  /**
   * 从 SMP 拉取交易码候选列表（供前端弹窗选择）
   */
  async fetchServiceInfoList(
    projectId: string,
  ): Promise<SmpTransactionCandidate[]> {
    const project = await this.getApiTestProject(projectId);
    const reqCode = project.requirementNo?.trim();
    if (!reqCode) {
      throw new BadRequestException("项目未配置需求编号，无法同步服管数据");
    }

    const response = await this.smpClient.selectServiceInfoList(reqCode);
    if (response.bizResCode !== "000000") {
      throw new BadRequestException(
        `SMP 查询失败: ${response.bizResCode} ${response.bizResText}`,
      );
    }

    const existing = await this.findExistingSmpKeys(projectId);
    return response.data.map((item) => this.toCandidate(item, existing));
  }

  /**
   * 将用户勾选的 SMP 交易码 upsert 到本地 DB
   */
  async syncTransactions(
    projectId: string,
    candidates: SmpTransactionCandidate[],
  ): Promise<{ created: number; updated: number }> {
    if (!candidates.length) {
      throw new BadRequestException("请选择要同步的交易码");
    }

    await this.getApiTestProject(projectId);

    const existingRows = await this.transactionRepo.find({
      where: scopedWhere({ projectId }),
      select: [
        "id",
        "code",
        "reqCode",
        "taskId",
        "serviceCode",
        "reqSystemId",
        "sortOrder",
      ],
    });

    this.validateSyncBatch(candidates, existingRows);

    const existingBySmpKey = new Map<string, ApiTransactionEntity>();
    for (const row of existingRows) {
      if (row.reqCode) {
        existingBySmpKey.set(
          this.smpKey(
            row.reqCode,
            row.taskId!,
            row.serviceCode!,
            row.reqSystemId!,
            row.code,
          ),
          row,
        );
      }
    }

    const baseSortOrder = existingRows.length;

    return this.dataSource.transaction(async (manager) => {
      let created = 0;
      let updated = 0;
      let createOffset = 0;

      for (const candidate of candidates) {
        const key = this.smpKey(
          candidate.reqCode,
          candidate.taskId,
          candidate.serviceCode,
          candidate.reqSystemId,
          candidate.code,
        );
        const existing = existingBySmpKey.get(key);
        if (existing) {
          await this.updateSmpTransaction(manager, existing, candidate);
          updated++;
        } else {
          await this.createSmpTransaction(
            manager,
            projectId,
            candidate,
            baseSortOrder + createOffset,
          );
          createOffset++;
          created++;
        }
      }

      await touchProjectUpdatedAt(
        manager.getRepository(CaseProjectEntity),
        projectId,
      );
      return { created, updated };
    });
  }

  /**
   * 更新本地 SMP 交易码的同步状态
   */
  async updateSyncStatus(
    projectId: string,
    transactionId: string,
    status: ApiTransactionSyncStatus,
    error?: string,
  ): Promise<ApiTransactionEntity> {
    const transaction = await this.transactionRepo.findOne({
      where: scopedWhere({ projectId, id: transactionId }),
    });
    if (!transaction) {
      throw new NotFoundException("交易码不存在");
    }
    transaction.syncStatus = status;
    transaction.syncError = error?.trim() || undefined;
    return this.transactionRepo.save(transaction);
  }

  /**
   * 从 SMP 拉取交易详情数据，检测是否变更。
   * 通过 callServiceList 的 hash 与上次对比判断是否变更，不再调用 selectChangeInfoByReqCode。
   */
  async refreshTransactionDocumentFromSmp(
    projectId: string,
    transactionId: string,
  ): Promise<{
    changed: boolean;
    callServiceList: SmpCallServiceInfoItem[];
    serviceTestList: SmpTestInfoItem[];
    approvalInfoList: unknown[];
  }> {
    const transaction = await this.transactionRepo.findOne({
      where: scopedWhere({ projectId, id: transactionId }),
    });
    if (!transaction) {
      throw new NotFoundException("交易码不存在");
    }
    if (!transaction.reqCode) {
      throw new BadRequestException("该交易码非 SMP 来源，无法刷新服管数据");
    }

    const [callService, testInfo] = await Promise.all([
      this.smpClient.selectCallServiceInfoList(
        transaction.reqCode,
        transaction.taskId!,
        transaction.code,
        transaction.serviceCode!,
        transaction.reqSystemId!,
      ),
      this.smpClient.selectTestInfoList(
        transaction.reqCode,
        transaction.taskId!,
        transaction.code,
        transaction.serviceCode!,
        transaction.reqSystemId!,
      ),
    ]);

    if (callService.bizResCode !== "000000") {
      throw new BadRequestException(
        `SMP 服务调用信息查询失败: ${callService.bizResCode} ${callService.bizResText}`,
      );
    }
    if (testInfo.bizResCode !== "000000") {
      throw new BadRequestException(
        `SMP 接口测试信息查询失败: ${testInfo.bizResCode} ${testInfo.bizResText}`,
      );
    }

    const callServiceHash = this.hashData(callService.data);
    const testInfoHash = this.hashData(testInfo.data);

    let doc = await this.apiDocRepo.findOne({
      where: scopedWhere({ projectId, transactionId }),
    });
    if (!doc) {
      doc = await this.apiDocRepo.save(
        this.apiDocRepo.create({
          projectId,
          transactionId,
          structuringStatus: "idle",
          ...auditFieldsForCreate(),
        }),
      );
    }

    const previousCallServiceHash = doc.lastSmpCallServiceHash;
    const hasPreviousHash = Boolean(previousCallServiceHash);
    const changed =
      hasPreviousHash && previousCallServiceHash !== callServiceHash;

    if (changed) {
      transaction.syncStatus = "changed";
      transaction.syncError = undefined;
      await this.transactionRepo.save(transaction);
    }

    doc.source = "smp";
    doc.smpData = {
      callServiceList: callService.data,
      serviceTestList: testInfo.data,
      approvalInfoList: [],
    };
    doc.structuredMarkdown = buildStructuredMarkdownFromSmp(
      callService.data,
      testInfo.data,
    );
    doc.lastSmpCallServiceHash = callServiceHash;
    doc.lastSmpTestInfoHash = testInfoHash;
    doc.structuringStatus = "completed";
    await this.apiDocRepo.save(doc);

    await this.replaceSmpEndpoints(
      projectId,
      transactionId,
      doc.id,
      callService.data,
      testInfo.data,
    );

    return {
      changed,
      callServiceList: callService.data,
      serviceTestList: testInfo.data,
      approvalInfoList: [],
    };
  }

  private async replaceSmpEndpoints(
    projectId: string,
    transactionId: string,
    apiDocId: string,
    callServiceList: SmpCallServiceInfoItem[],
    serviceTestList: SmpTestInfoItem[],
  ) {
    const endpoints = parseEndpointsFromSmpData(
      callServiceList,
      serviceTestList,
    );
    const existing = await this.endpointRepo.find({
      where: { projectId, transactionId, apiDocId },
      order: { sortOrder: "ASC" },
    });
    if (!endpoints.length) {
      await this.endpointRepo.delete({ projectId, transactionId, apiDocId });
      return;
    }

    const updatedIds = new Set<string>();
    const rows: ApiEndpointEntity[] = [];
    for (let index = 0; index < endpoints.length; index += 1) {
      const endpoint = endpoints[index];
      const match = existing.find(
        (item) =>
          !updatedIds.has(item.id) &&
          item.sortOrder === index &&
          item.method === endpoint.method &&
          item.path === endpoint.path,
      );
      if (match) {
        updatedIds.add(match.id);
        rows.push(
          this.endpointRepo.merge(match, {
            name: endpoint.name,
            summary: endpoint.summary,
            requestNotes: endpoint.requestNotes,
            responseNotes: endpoint.responseNotes,
            tags: endpoint.tags,
          }),
        );
      } else {
        rows.push(
          this.endpointRepo.create({
            projectId,
            transactionId,
            apiDocId,
            name: endpoint.name,
            method: endpoint.method,
            path: endpoint.path,
            summary: endpoint.summary,
            requestNotes: endpoint.requestNotes,
            responseNotes: endpoint.responseNotes,
            tags: endpoint.tags,
            sortOrder: index,
          }),
        );
      }
    }

    const removed = existing.filter((item) => !updatedIds.has(item.id));
    if (removed.length) {
      await this.endpointRepo.delete({
        id: In(removed.map((item) => item.id)),
      });
    }
    if (rows.length) {
      await this.endpointRepo.save(rows);
    }
  }

  private hashData(data: unknown): string {
    return createHash("sha256").update(JSON.stringify(data)).digest("hex");
  }

  private async getApiTestProject(projectId: string) {
    return assertApiTestProject(this.projectRepo, projectId);
  }

  private async findExistingSmpKeys(projectId: string): Promise<Set<string>> {
    const rows = await this.transactionRepo.find({
      where: scopedWhere({ projectId }),
      select: ["reqCode", "taskId", "serviceCode", "reqSystemId", "code"],
    });
    return new Set(
      rows
        .filter((r) => r.reqCode)
        .map((r) =>
          this.smpKey(
            r.reqCode!,
            r.taskId!,
            r.serviceCode!,
            r.reqSystemId!,
            r.code,
          ),
        ),
    );
  }

  private toCandidate(
    item: SmpServiceInfoItem,
    existingKeys: Set<string>,
  ): SmpTransactionCandidate {
    return {
      code: item.tranCode,
      name: item.serviceCname,
      description: item.reqName,
      reqCode: item.reqCode,
      taskId: item.taskId,
      serviceCode: item.serviceCode,
      reqSystemId: item.reqSystemId,
      resSystemName: item.resSystemName,
      serviceAttribute: item.serviceAttribute,
      serviceType: item.serviceType,
      selected: !existingKeys.has(
        this.smpKey(
          item.reqCode,
          item.taskId,
          item.serviceCode,
          item.reqSystemId,
          item.tranCode,
        ),
      ),
    };
  }

  private smpKey(
    reqCode: string,
    taskId: string,
    serviceCode: string,
    reqSystemId: string,
    code: string,
  ): string {
    return `${reqCode}|${taskId}|${serviceCode}|${reqSystemId}|${code}`;
  }

  private validateSyncBatch(
    candidates: SmpTransactionCandidate[],
    existingRows: Pick<
      ApiTransactionEntity,
      "id" | "code" | "reqCode" | "taskId" | "serviceCode" | "reqSystemId"
    >[],
  ): void {
    const seenSmpKeys = new Set<string>();
    const seenCodes = new Set<string>();
    const existingBySmpKey = new Map<string, (typeof existingRows)[number]>();
    const existingByCode = new Map<string, (typeof existingRows)[number]>();

    for (const row of existingRows) {
      if (row.reqCode) {
        const key = this.smpKey(
          row.reqCode,
          row.taskId!,
          row.serviceCode!,
          row.reqSystemId!,
          row.code,
        );
        existingBySmpKey.set(key, row);
      }
      existingByCode.set(row.code, row);
    }

    for (const candidate of candidates) {
      this.validateCandidate(candidate);

      const key = this.smpKey(
        candidate.reqCode,
        candidate.taskId,
        candidate.serviceCode,
        candidate.reqSystemId,
        candidate.code,
      );

      if (seenSmpKeys.has(key)) {
        throw new BadRequestException(
          `批量中存在重复服管记录：交易码 ${candidate.code}`,
        );
      }
      seenSmpKeys.add(key);

      if (seenCodes.has(candidate.code)) {
        throw new BadRequestException(
          `批量中存在相同交易码 ${candidate.code}，无法同时同步`,
        );
      }
      seenCodes.add(candidate.code);

      if (!existingBySmpKey.has(key) && existingByCode.has(candidate.code)) {
        throw new BadRequestException(
          `交易码 ${candidate.code} 已在项目中存在，且非同一服管记录`,
        );
      }
    }
  }

  private validateCandidate(candidate: SmpTransactionCandidate) {
    if (!candidate.code?.trim()) {
      throw new BadRequestException("交易码不能为空");
    }
    if (!candidate.reqCode?.trim()) {
      throw new BadRequestException("需求编号不能为空");
    }
    if (!candidate.taskId?.trim()) {
      throw new BadRequestException("任务ID不能为空");
    }
    if (!candidate.serviceCode?.trim()) {
      throw new BadRequestException("服务编码不能为空");
    }
    if (!candidate.reqSystemId?.trim()) {
      throw new BadRequestException("需求系统ID不能为空");
    }
  }

  private async createSmpTransaction(
    manager: EntityManager,
    projectId: string,
    candidate: SmpTransactionCandidate,
    sortOrder: number,
  ): Promise<void> {
    const txRepo = manager.getRepository(ApiTransactionEntity);
    const docRepo = manager.getRepository(ApiDocEntity);
    const transaction = await txRepo.save(
      txRepo.create({
        projectId,
        code: candidate.code.trim(),
        name: candidate.name?.trim() || candidate.code.trim(),
        description: candidate.description?.trim() || undefined,
        reqCode: candidate.reqCode.trim(),
        taskId: candidate.taskId.trim(),
        serviceCode: candidate.serviceCode.trim(),
        reqSystemId: candidate.reqSystemId.trim(),
        syncStatus: "pending",
        sortOrder,
        ...auditFieldsForCreate(),
      }),
    );
    await docRepo.save(
      docRepo.create({
        projectId,
        transactionId: transaction.id,
        source: "smp",
        structuringStatus: "idle",
        ...auditFieldsForCreate(),
      }),
    );
  }

  private async updateSmpTransaction(
    manager: EntityManager,
    existing: ApiTransactionEntity,
    candidate: SmpTransactionCandidate,
  ): Promise<void> {
    existing.name = candidate.name?.trim() || existing.name;
    existing.description = candidate.description?.trim() || undefined;
    const keepStatuses: ApiTransactionSyncStatus[] = [
      "generating",
      "success",
      "failed",
      "cancelled",
      "changed",
    ];
    if (!existing.syncStatus || !keepStatuses.includes(existing.syncStatus)) {
      existing.syncStatus = "pending";
    }
    await manager.getRepository(ApiTransactionEntity).save(existing);
  }
}
