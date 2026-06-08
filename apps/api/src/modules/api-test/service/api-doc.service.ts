import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { Repository } from "typeorm";
import { MinioStorageService } from "@minio/service/minio.service";
import { auditFieldsForUpdate } from "../../../common/audit/request-context";
import { scopedWhere } from "../../../common/audit/user-scope";
import { assertApiTestProject } from "../util/assert-api-project.util";
import { touchProjectUpdatedAt } from "../../../common/project/touch-project.util";
import { ApiDocEntity } from "../entity/api-doc.entity";
import { ApiEndpointEntity } from "../entity/api-endpoint.entity";
import {
  extractDocumentText,
  structureEndpointsFromRawText,
} from "../util/api-doc-extract.util";
import {
  buildStructuredMarkdownFromEndpoints,
  ensureEndpointIds,
  parseEndpointsFromText,
} from "../util/api-doc.parser";
import type { ApiEndpointPayload } from "@case-forge/shared";
import { SaveApiDocDto } from "../dto/save-api-doc.dto";

@Injectable()
export class ApiDocService {
  constructor(
    @InjectRepository(ApiDocEntity)
    private readonly apiDocRepo: Repository<ApiDocEntity>,
    @InjectRepository(ApiEndpointEntity)
    private readonly endpointRepo: Repository<ApiEndpointEntity>,
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
    private readonly minio: MinioStorageService,
  ) {}

  async getUploadStatus(projectId: string) {
    await assertApiTestProject(this.projectRepo, projectId);
    const doc = await this.apiDocRepo.findOne({
      where: scopedWhere({ projectId }),
    });
    return {
      hasExisting: Boolean(doc?.sourceDocPath),
      sourceDocName: doc?.sourceDocName,
    };
  }

  async saveUploadedDocument(
    projectId: string,
    input: { fileName: string; objectPath: string; force?: boolean },
  ) {
    await assertApiTestProject(this.projectRepo, projectId);
    let doc = await this.apiDocRepo.findOne({ where: scopedWhere({ projectId }) });
    if (doc?.sourceDocPath && !input.force) {
      throw new BadRequestException("已存在接口文档，请传 force=true 覆盖上传");
    }
    if (!doc) {
      doc = this.apiDocRepo.create({ projectId });
    }
    doc.sourceDocName = input.fileName;
    doc.sourceDocPath = input.objectPath;
    doc.structuringStatus = "idle";
    doc.structuringError = undefined;
    await this.apiDocRepo.save({ ...doc, ...auditFieldsForUpdate() });
    return this.getByProjectId(projectId);
  }

  async extractAndStructureFromUpload(projectId: string) {
    const doc = await this.ensureDoc(projectId);
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
      const markdown = buildStructuredMarkdownFromEndpoints(
        endpoints,
        doc.sourceDocName ?? "接口文档",
      );
      await this.replaceEndpoints(projectId, doc.id, endpoints);
      doc.extractedRawText = rawText;
      doc.structuredMarkdown = markdown;
      doc.tempStructuredMarkdown = markdown;
      doc.structuringStatus = "completed";
      await this.apiDocRepo.save({ ...doc, ...auditFieldsForUpdate() });
      await touchProjectUpdatedAt(this.projectRepo, projectId);
      return this.getByProjectId(projectId);
    } catch (error) {
      doc.structuringStatus = "failed";
      doc.structuringError =
        error instanceof Error ? error.message : "结构化失败";
      await this.apiDocRepo.save({ ...doc, ...auditFieldsForUpdate() });
      throw error;
    }
  }

  async autoSave(projectId: string, tempStructuredMarkdown?: string) {
    const doc = await this.ensureDoc(projectId);
    doc.tempStructuredMarkdown = tempStructuredMarkdown;
    await this.apiDocRepo.save({ ...doc, ...auditFieldsForUpdate() });
    return this.getByProjectId(projectId);
  }

  async saveDocument(projectId: string, payload: SaveApiDocDto) {
    const doc = await this.ensureDoc(projectId);
    const markdown =
      payload.structuredMarkdown ??
      doc.tempStructuredMarkdown ??
      doc.structuredMarkdown;
    if (!markdown?.trim()) {
      throw new BadRequestException("结构化内容不能为空");
    }
    const endpoints =
      payload.endpoints?.length
        ? ensureEndpointIds(payload.endpoints)
        : parseEndpointsFromText(markdown);
    if (!endpoints.length) {
      throw new BadRequestException("至少保留一个接口端点");
    }
    await this.replaceEndpoints(projectId, doc.id, endpoints);
    doc.structuredMarkdown = markdown;
    doc.tempStructuredMarkdown = markdown;
    doc.structuringStatus = "completed";
    await this.apiDocRepo.save({ ...doc, ...auditFieldsForUpdate() });
    await touchProjectUpdatedAt(this.projectRepo, projectId);
    return this.getByProjectId(projectId);
  }

  async getByProjectId(projectId: string) {
    await assertApiTestProject(this.projectRepo, projectId);
    const doc = await this.apiDocRepo.findOne({
      where: scopedWhere({ projectId }),
    });
    if (!doc) return null;
    // 端点表无 createdBy，项目归属已在 assertApiTestProject 中校验
    const endpoints = await this.endpointRepo.find({
      where: { projectId, apiDocId: doc.id },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    const endpointCount = endpoints.length;
    return {
      ...doc,
      sourceDocUrl: await this.minio.getAccessUrl(doc.sourceDocPath),
      endpoints,
      canEnterCases: endpointCount > 0,
      canEnterRunner: endpointCount > 0,
      endpointCount,
    };
  }

  private async ensureDoc(projectId: string) {
    await assertApiTestProject(this.projectRepo, projectId);
    let doc = await this.apiDocRepo.findOne({ where: scopedWhere({ projectId }) });
    if (!doc) {
      doc = await this.apiDocRepo.save(
        this.apiDocRepo.create({ projectId, structuringStatus: "idle" }),
      );
    }
    return doc;
  }

  private async replaceEndpoints(
    projectId: string,
    apiDocId: string,
    endpoints: ApiEndpointPayload[],
  ) {
    await this.endpointRepo.delete({ projectId, apiDocId });
    const normalized = ensureEndpointIds(endpoints);
    const rows = normalized.map((endpoint, index) =>
      this.endpointRepo.create({
        projectId,
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
