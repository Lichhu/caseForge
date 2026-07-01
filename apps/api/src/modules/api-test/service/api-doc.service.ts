import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { Repository } from "typeorm";
import { MinioStorageService } from "@minio/service/minio.service";
import { auditFieldsForUpdate } from "@common/audit/request-context";
import { scopedWhere } from "@common/audit/user-scope";
import { assertApiTestProject } from "@api-test/util/assert-api-project.util";
import { touchProjectUpdatedAt } from "@common/project/touch-project.util";
import { ApiDocEntity } from "@api-test/entity/api-doc.entity";
import { ApiEndpointEntity } from "@api-test/entity/api-endpoint.entity";
import { ApiTestCaseEntity } from "@api-test/entity/api-test-case.entity";
import { ApiTransactionEntity } from "@api-test/entity/api-transaction.entity";
import {
  extractDocumentText,
  structureEndpointsFromRawText,
} from "@api-test/util/api-doc-extract.util";
import {
  ensureEndpointIds,
  parseEndpointsFromText,
} from "@api-test/util/api-doc.parser";
import type { ApiEndpointPayload } from "@case-forge/shared";
import { SaveApiDocDto } from "@api-test/dto/save-api-doc.dto";
import { SaveApiDocGenerationDto } from "@api-test/dto/save-api-doc-generation.dto";
import { toPublicApiDoc } from "@common/http/public-response.util";
import { RequestContext } from "@common/audit/request-context";

@Injectable()
export class ApiDocService {
  constructor(
    @InjectRepository(ApiDocEntity)
    private readonly apiDocRepo: Repository<ApiDocEntity>,
    @InjectRepository(ApiEndpointEntity)
    private readonly endpointRepo: Repository<ApiEndpointEntity>,
    @InjectRepository(ApiTestCaseEntity)
    private readonly caseRepo: Repository<ApiTestCaseEntity>,
    @InjectRepository(ApiTransactionEntity)
    private readonly transactionRepo: Repository<ApiTransactionEntity>,
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
    private readonly minio: MinioStorageService,
  ) {}

  async getUploadStatus(projectId: string, transactionId: string) {
    await this.assertTransaction(projectId, transactionId);
    const doc = await this.apiDocRepo.findOne({
      where: scopedWhere({ projectId, transactionId }),
    });
    return {
      hasExisting: Boolean(doc?.sourceDocPath),
      sourceDocName: doc?.sourceDocName,
    };
  }

  async saveUploadedDocument(
    projectId: string,
    transactionId: string,
    input: { fileName: string; objectPath: string; force?: boolean },
  ) {
    await this.assertTransaction(projectId, transactionId);
    let doc = await this.apiDocRepo.findOne({
      where: scopedWhere({ projectId, transactionId }),
    });
    if (doc?.sourceDocPath && !input.force) {
      throw new BadRequestException("已存在接口文档，请传 force=true 覆盖上传");
    }
    if (!doc) {
      doc = this.apiDocRepo.create({
        projectId,
        transactionId,
        source: "upload",
      });
    }
    doc.source = "upload";
    doc.sourceDocName = input.fileName;
    doc.sourceDocPath = input.objectPath;
    doc.structuringStatus = "idle";
    doc.structuringError = undefined;
    await this.apiDocRepo.save({ ...doc, ...auditFieldsForUpdate() });
    return this.getByTransactionId(projectId, transactionId);
  }

  async extractAndStructureFromUpload(
    projectId: string,
    transactionId: string,
  ) {
    const transaction = await this.assertTransaction(projectId, transactionId);
    const doc = await this.ensureDoc(projectId, transactionId);
    if (!doc.sourceDocPath) {
      throw new BadRequestException("请先上传接口文档");
    }
    doc.structuringStatus = "processing";
    doc.structuringError = undefined;
    await this.apiDocRepo.save({ ...doc, ...auditFieldsForUpdate() });

    try {
      const buffer = await this.minio.getObjectBuffer(doc.sourceDocPath);
      const rawText = await extractDocumentText(
        buffer,
        doc.sourceDocName ?? "api-doc.txt",
      );
      const { endpoints } = structureEndpointsFromRawText(rawText);
      if (!endpoints.length) {
        throw new BadRequestException(
          "未能从文档中识别接口，请检查是否包含 METHOD + 路径 或标准表格",
        );
      }
      const normalized = endpoints.map((endpoint, index) =>
        index === 0
          ? { ...endpoint, name: endpoint.name || transaction.name }
          : endpoint,
      );
      await this.replaceEndpoints(projectId, transactionId, doc.id, normalized);
      doc.source = "upload";
      doc.extractedRawText = rawText;
      doc.structuredMarkdown = rawText;
      doc.tempStructuredMarkdown = rawText;
      doc.structuringStatus = "completed";
      await this.apiDocRepo.save({ ...doc, ...auditFieldsForUpdate() });
      await touchProjectUpdatedAt(this.projectRepo, projectId);
      return this.getByTransactionId(projectId, transactionId);
    } catch (error) {
      doc.structuringStatus = "failed";
      doc.structuringError =
        error instanceof Error ? error.message : "结构化失败";
      await this.apiDocRepo.save({ ...doc, ...auditFieldsForUpdate() });
      throw error;
    }
  }

  async autoSave(
    projectId: string,
    transactionId: string,
    tempStructuredMarkdown?: string,
  ) {
    const doc = await this.ensureDoc(projectId, transactionId);
    doc.tempStructuredMarkdown = tempStructuredMarkdown;
    await this.apiDocRepo.save({ ...doc, ...auditFieldsForUpdate() });
    return this.getByTransactionId(projectId, transactionId);
  }

  async saveDocument(
    projectId: string,
    transactionId: string,
    payload: SaveApiDocDto,
  ) {
    const doc = await this.ensureDoc(projectId, transactionId);
    const markdown =
      payload.structuredMarkdown ??
      doc.tempStructuredMarkdown ??
      doc.structuredMarkdown;
    if (!markdown?.trim()) {
      throw new BadRequestException("结构化内容不能为空");
    }
    const endpoints = payload.endpoints?.length
      ? ensureEndpointIds(payload.endpoints)
      : parseEndpointsFromText(markdown);
    if (!endpoints.length) {
      throw new BadRequestException("至少保留一个接口端点");
    }
    await this.replaceEndpoints(projectId, transactionId, doc.id, endpoints);
    doc.structuredMarkdown = markdown;
    doc.tempStructuredMarkdown = markdown;
    doc.structuringStatus = "completed";
    await this.apiDocRepo.save({ ...doc, ...auditFieldsForUpdate() });
    await touchProjectUpdatedAt(this.projectRepo, projectId);
    return this.getByTransactionId(projectId, transactionId);
  }

  async saveGenerationPrompts(
    projectId: string,
    transactionId: string,
    payload: SaveApiDocGenerationDto,
  ) {
    const doc = await this.ensureDoc(projectId, transactionId);
    doc.metadata = {
      ...doc.metadata,
      promptIds: payload.promptIds ?? [],
    };
    await this.apiDocRepo.save({ ...doc, ...auditFieldsForUpdate() });
    await touchProjectUpdatedAt(this.projectRepo, projectId);
    return this.getByTransactionId(projectId, transactionId);
  }

  async getByTransactionId(projectId: string, transactionId: string) {
    await this.assertTransaction(projectId, transactionId);
    const doc = await this.apiDocRepo.findOne({
      where: scopedWhere({ projectId, transactionId }),
    });
    if (!doc) return null;
    const endpoints = await this.endpointRepo.find({
      where: { projectId, transactionId, apiDocId: doc.id },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    const endpointCount = endpoints.length;
    const transactionCaseCount = await this.caseRepo
      .createQueryBuilder("c")
      .innerJoin("c.endpoint", "e")
      .where("c.projectId = :projectId", { projectId })
      .andWhere("c.createdBy = :userName", {
        userName: RequestContext.getUserName(),
      })
      .andWhere("e.transactionId = :transactionId", { transactionId })
      .getCount();
    const canGenerateCases =
      endpointCount > 0 && doc.structuringStatus === "completed";
    return toPublicApiDoc(doc, {
      transactionId,
      sourceDocUrl: await this.minio.getAccessUrl(doc.sourceDocPath),
      endpoints,
      canEnterCases: transactionCaseCount > 0,
      canGenerateCases,
      canEnterRunner: transactionCaseCount > 0,
      endpointCount,
      caseCount: transactionCaseCount,
    });
  }

  private async ensureDoc(projectId: string, transactionId: string) {
    await this.assertTransaction(projectId, transactionId);
    let doc = await this.apiDocRepo.findOne({
      where: scopedWhere({ projectId, transactionId }),
    });
    if (!doc) {
      doc = await this.apiDocRepo.save(
        this.apiDocRepo.create({
          projectId,
          transactionId,
          structuringStatus: "idle",
        }),
      );
    }
    return doc;
  }

  private async assertTransaction(projectId: string, transactionId: string) {
    await assertApiTestProject(this.projectRepo, projectId);
    const transaction = await this.transactionRepo.findOne({
      where: scopedWhere({ projectId, id: transactionId }),
    });
    if (!transaction) {
      throw new NotFoundException("交易码不存在");
    }
    return transaction;
  }

  private async replaceEndpoints(
    projectId: string,
    transactionId: string,
    apiDocId: string,
    endpoints: ApiEndpointPayload[],
  ) {
    await this.endpointRepo.delete({ projectId, transactionId, apiDocId });
    const normalized = ensureEndpointIds(endpoints);
    const rows = normalized.map((endpoint, index) =>
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
    if (rows.length) {
      await this.endpointRepo.save(rows);
    }
  }
}
