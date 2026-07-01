import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { Repository } from "typeorm";
import {
  auditFieldsForCreate,
  auditFieldsForUpdate,
} from "@common/audit/request-context";
import { scopedWhere } from "@common/audit/user-scope";
import { assertApiTestProject } from "@api-test/util/assert-api-project.util";
import { touchProjectUpdatedAt } from "@common/project/touch-project.util";
import { ApiDocEntity } from "@api-test/entity/api-doc.entity";
import { ApiTransactionEntity } from "@api-test/entity/api-transaction.entity";
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
    return rows.map((row) => {
      const doc = docByTransaction.get(row.id);
      return toPublicApiTransaction(row, {
        docStatus: doc?.structuringStatus ?? "idle",
        hasDocument: Boolean(doc?.sourceDocName),
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
}
