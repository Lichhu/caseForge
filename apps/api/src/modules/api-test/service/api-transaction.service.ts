import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { In, Repository } from "typeorm";
import {
  auditFieldsForCreate,
  auditFieldsForUpdate,
} from "@common/audit/request-context";
import { scopedWhere } from "@common/audit/user-scope";
import { assertApiTestProject } from "@api-test/util/assert-api-project.util";
import { touchProjectUpdatedAt } from "@common/project/touch-project.util";
import { ApiDocEntity } from "@api-test/entity/api-doc.entity";
import { ApiTestCaseEntity } from "@api-test/entity/api-test-case.entity";
import { ApiTransactionEntity } from "@api-test/entity/api-transaction.entity";
import { ApiReportExportEntity } from "@api-test/entity/api-report-export.entity";
import { SaveApiTransactionDto } from "@api-test/dto/save-transaction.dto";
import { toPublicApiTransaction } from "@common/http/public-response.util";
import { ApiCaseGenerateQueueService } from "./api-case-generate-queue.service";

@Injectable()
export class ApiTransactionService {
  constructor(
    @InjectRepository(ApiTransactionEntity)
    private readonly transactionRepo: Repository<ApiTransactionEntity>,
    @InjectRepository(ApiDocEntity)
    private readonly apiDocRepo: Repository<ApiDocEntity>,
    @InjectRepository(ApiTestCaseEntity)
    private readonly caseRepo: Repository<ApiTestCaseEntity>,
    @InjectRepository(ApiReportExportEntity)
    private readonly exportRepo: Repository<ApiReportExportEntity>,
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
    private readonly generateQueueService: ApiCaseGenerateQueueService,
  ) {}

  async listTransactions(projectId: string) {
    await assertApiTestProject(this.projectRepo, projectId);
    const rows = await this.transactionRepo.find({
      where: scopedWhere({ projectId }),
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    const docs = await this.apiDocRepo.find({
      where: { projectId },
      select: ["id", "transactionId", "structuringStatus", "sourceDocName"],
    });
    const docByTransaction = new Map(
      docs.map((doc) => [doc.transactionId, doc]),
    );
    const caseCountRows = await this.caseRepo
      .createQueryBuilder("c")
      .innerJoin("c.endpoint", "e")
      .select("e.transactionId", "transactionId")
      .addSelect("COUNT(c.id)", "caseCount")
      .where("c.projectId = :projectId", { projectId })
      .groupBy("e.transactionId")
      .getRawMany<{ transactionId: string; caseCount: string }>();
    const caseCountByTransaction = new Map(
      caseCountRows.map((row) => [row.transactionId, Number(row.caseCount)]),
    );
    const exportRows = await this.exportRepo
      .createQueryBuilder("x")
      .select([
        "x.transactionId AS transactionId",
        "x.id AS id",
        "x.format AS format",
        "x.fileName AS fileName",
        "x.createdAt AS createdAt",
      ])
      .where("x.projectId = :projectId", { projectId })
      .orderBy("x.createdAt", "DESC")
      .getRawMany<{
        transactionId: string;
        id: string;
        format: string;
        fileName: string;
        createdAt: Date;
      }>();
    const lastExportByTransaction = new Map<
      string,
      { id: string; format: string; fileName: string; createdAt: Date }
    >();
    for (const row of exportRows) {
      if (!lastExportByTransaction.has(row.transactionId)) {
        lastExportByTransaction.set(row.transactionId, {
          id: row.id,
          format: row.format,
          fileName: row.fileName,
          createdAt: row.createdAt,
        });
      }
    }
    return rows.map((row) => {
      const doc = docByTransaction.get(row.id);
      return toPublicApiTransaction(row, {
        docStatus: doc?.structuringStatus ?? "idle",
        hasDocument: Boolean(doc?.sourceDocName),
        caseCount: caseCountByTransaction.get(row.id) ?? 0,
        lastReportExport: lastExportByTransaction.get(row.id) ?? null,
      });
    });
  }

  async createTransaction(projectId: string, payload: SaveApiTransactionDto) {
    await assertApiTestProject(this.projectRepo, projectId);
    const code = payload.code.trim();
    const name = payload.name?.trim() || code;
    if (!code) {
      throw new BadRequestException("请输入交易码");
    }
    const duplicate = await this.transactionRepo.findOne({
      where: scopedWhere({ projectId, code }),
    });
    if (duplicate) {
      throw new BadRequestException(`交易码「${code}」已存在`);
    }
    const count = await this.transactionRepo.count({
      where: scopedWhere({ projectId }),
    });
    const transaction = await this.transactionRepo.save(
      this.transactionRepo.create({
        projectId,
        code,
        name,
        description: payload.description?.trim() || undefined,
        sortOrder: count,
        ...auditFieldsForCreate(),
      }),
    );
    await this.apiDocRepo.save(
      this.apiDocRepo.create({
        projectId,
        transactionId: transaction.id,
        source: "upload",
        structuringStatus: "idle",
        ...auditFieldsForCreate(),
      }),
    );
    await touchProjectUpdatedAt(this.projectRepo, projectId);
    return this.requireTransaction(projectId, transaction.id);
  }

  async updateTransaction(
    projectId: string,
    transactionId: string,
    payload: SaveApiTransactionDto,
  ) {
    const transaction = await this.requireTransaction(projectId, transactionId);
    const code = payload.code.trim();
    const name = payload.name?.trim() || code;
    if (!code) {
      throw new BadRequestException("请输入交易码");
    }
    if (code !== transaction.code) {
      const duplicate = await this.transactionRepo.findOne({
        where: scopedWhere({ projectId, code }),
      });
      if (duplicate && duplicate.id !== transactionId) {
        throw new BadRequestException(`交易码「${code}」已存在`);
      }
    }
    transaction.code = code;
    transaction.name = name;
    transaction.description = payload.description?.trim() || undefined;
    await this.transactionRepo.save({
      ...transaction,
      ...auditFieldsForUpdate(),
    });
    await touchProjectUpdatedAt(this.projectRepo, projectId);
    return this.requireTransaction(projectId, transactionId);
  }

  async deleteTransaction(projectId: string, transactionId: string) {
    await this.requireTransaction(projectId, transactionId);
    await this.generateQueueService.cancel(projectId, transactionId);
    await this.apiDocRepo.delete({ projectId, transactionId });
    await this.transactionRepo.delete(
      scopedWhere({ projectId, id: transactionId }),
    );
    await touchProjectUpdatedAt(this.projectRepo, projectId);
    return { ok: true };
  }

  async batchDeleteTransactions(projectId: string, transactionIds: string[]) {
    await assertApiTestProject(this.projectRepo, projectId);
    const ids = [
      ...new Set(transactionIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (!ids.length) {
      throw new BadRequestException("请选择要删除的交易码");
    }
    for (const transactionId of ids) {
      await this.requireTransaction(projectId, transactionId);
      await this.generateQueueService.cancel(projectId, transactionId);
      await this.apiDocRepo.delete({ projectId, transactionId });
      await this.transactionRepo.delete(
        scopedWhere({ projectId, id: transactionId }),
      );
    }
    await touchProjectUpdatedAt(this.projectRepo, projectId);
    return { ok: true, count: ids.length };
  }

  async requireTransaction(projectId: string, transactionId: string) {
    await assertApiTestProject(this.projectRepo, projectId);
    const transaction = await this.transactionRepo.findOne({
      where: scopedWhere({ projectId, id: transactionId }),
    });
    if (!transaction) {
      throw new NotFoundException("交易码不存在");
    }
    return toPublicApiTransaction(transaction);
  }

  async listRunnerCaseIds(projectId: string, transactionId: string) {
    const transaction = await this.transactionRepo.findOne({
      where: scopedWhere({ projectId, id: transactionId }),
    });
    if (!transaction) {
      throw new NotFoundException("交易码不存在");
    }
    return transaction.runnerCaseIds ?? [];
  }

  async replaceRunnerCases(
    projectId: string,
    transactionId: string,
    caseIds: string[],
  ) {
    const transaction = await this.transactionRepo.findOne({
      where: scopedWhere({ projectId, id: transactionId }),
    });
    if (!transaction) {
      throw new NotFoundException("交易码不存在");
    }
    const uniqueIds = [...new Set(caseIds.map((id) => id.trim()).filter(Boolean))];
    let nextIds: string[] = [];
    if (uniqueIds.length) {
      const existing = await this.caseRepo.find({
        where: scopedWhere({ projectId, id: In(uniqueIds) }),
        select: ["id"],
      });
      const existingIds = new Set(existing.map((item) => item.id));
      nextIds = uniqueIds.filter((id) => existingIds.has(id));
    }
    transaction.runnerCaseIds = nextIds;
    await this.transactionRepo.save({
      ...transaction,
      ...auditFieldsForUpdate(),
    });
    await touchProjectUpdatedAt(this.projectRepo, projectId);
    return { caseIds: nextIds, caseCount: nextIds.length };
  }
}
