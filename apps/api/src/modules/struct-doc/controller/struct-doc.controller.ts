/**
 * 结构化需求文档 HTTP 接口层。
 * 提供需求文档上传、AI 结构化、查询、自动保存与正式保存等 REST 端点。
 */
import { MinioStorageService } from "@minio/service/minio.service";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { AutoSaveStructDocDto } from "@struct-doc/dto/auto-save-struct-doc.dto";
import { SaveStructDocDto } from "@struct-doc/dto/save-struct-doc.dto";
import { findOwnedProject } from "../../../common/audit/user-scope";
import { touchProjectUpdatedAt } from "../../../common/project/touch-project.util";
import { StructDocService } from "@struct-doc/service/struct-doc.service";
import { stripDocumentExtension } from "@struct-doc/util/struct-doc.parser";
import {
  MAX_REQUIREMENT_DOC_SIZE_BYTES,
  MAX_REQUIREMENT_DOC_SIZE_MB,
} from "@case-forge/shared";
import { Repository } from "typeorm";

@ApiTags("struct-doc")
@Controller("struct-doc")
export class StructDocController {
  constructor(
    @Inject(MinioStorageService)
    private readonly minioService: MinioStorageService,
    @Inject(StructDocService)
    private readonly structDocService: StructDocService,
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
  ) {}

  /** 查询项目是否已上传需求文档。 */
  @Get(":projectId/upload-status")
  @ApiOperation({ summary: "查询项目是否已上传需求文档" })
  getUploadStatus(@Param("projectId") projectId: string) {
    return this.structDocService.getUploadStatus(projectId);
  }

  /** 上传 doc/docx 需求文档至 MinIO 并记录元数据。 */
  @ApiOperation({ summary: "上传 doc/docx 需求文档" })
  @ApiConsumes("multipart/form-data")
  @ApiQuery({
    name: "force",
    required: false,
    description: "已存在需求文档时，传 true 强制重新上传",
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_REQUIREMENT_DOC_SIZE_BYTES },
    }),
  )
  @Post(":projectId/document/upload")
  async uploadRequirement(
    @Param("projectId") projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query("force") force?: string,
  ) {
    if (!file) {
      throw new BadRequestException("请选择 doc 或 docx 需求文档");
    }

    if (file.size > MAX_REQUIREMENT_DOC_SIZE_BYTES) {
      throw new BadRequestException(
        `需求文档大小不能超过 ${MAX_REQUIREMENT_DOC_SIZE_MB}MB`,
      );
    }

    const extension = file.originalname.split(".").pop()?.toLowerCase();
    if (!extension || !["doc", "docx"].includes(extension)) {
      throw new BadRequestException("仅支持上传 doc 或 docx 格式的需求文档");
    }

    await findOwnedProject(this.projectRepo, projectId);

    const fileName = this.normalizeUploadFileName(file.originalname);
    const objectPath = this.minioService.buildProjectObjectPath(
      projectId,
      fileName,
    );

    await this.minioService.uploadFile(objectPath, file.buffer);
    await touchProjectUpdatedAt(this.projectRepo, projectId, {
      title: stripDocumentExtension(fileName),
    });

    return this.structDocService.saveUploadedRequirement(projectId, {
      reqDocName: fileName,
      reqDocPath: objectPath,
      force: force === "true",
    });
  }

  /** 异步触发 AI Chat 结构化需求文档。 */
  @Post(":projectId/document/structure")
  @HttpCode(202)
  @ApiOperation({ summary: "异步调用 AI Chat 结构化需求文档" })
  startStructRequirement(@Param("projectId") projectId: string) {
    return this.structDocService.startStructRequirement(projectId);
  }

  /** 取消进行中的结构化任务（如服务重启后仍显示「结构化中」） */
  @Post(":projectId/document/structure/cancel")
  @ApiOperation({ summary: "取消结构化任务" })
  cancelStructRequirement(@Param("projectId") projectId: string) {
    return this.structDocService.cancelStructuring(projectId);
  }

  /** 查询项目结构化文档详情及测试要点列表。 */
  @Get(":projectId")
  @ApiOperation({ summary: "查询项目结构化文档和测试要点" })
  @ApiQuery({
    name: "includeTestPoints",
    required: false,
    description: "设为 false 时仅返回文档元数据与状态，不下发测试要点列表",
  })
  async getProjectStructDoc(
    @Param("projectId") projectId: string,
    @Query("includeTestPoints") includeTestPoints?: string,
  ) {
    return this.structDocService.getByProjectId(projectId, {
      includeTestPoints: includeTestPoints !== "false",
    });
  }

  /** 自动保存在线编辑中的临时结构化 Markdown。 */
  @Patch(":projectId/auto-save")
  @ApiOperation({ summary: "自动保存在线编辑中的结构化文档" })
  autoSaveStructDoc(
    @Param("projectId") projectId: string,
    @Body() dto: AutoSaveStructDocDto,
  ) {
    return this.structDocService.autoSaveTempStructDoc(
      projectId,
      dto.tempStructDoc,
    );
  }

  /** 将结构化文档保存至 MinIO 并同步测试要点。 */
  @Patch(":projectId")
  @ApiOperation({ summary: "保存结构化文档到 MinIO 并同步测试要点" })
  async saveStructDoc(
    @Param("projectId") projectId: string,
    @Body() dto: SaveStructDocDto,
  ) {
    return this.structDocService.saveStructDoc(projectId, dto);
  }

  /**
   * 修正 multipart 上传文件名可能出现的 Latin1 乱码。
   *
   * @param fileName 原始文件名
   */
  private normalizeUploadFileName(fileName: string) {
    const decoded = Buffer.from(fileName, "latin1").toString("utf8");
    const looksMojibake = /[ÃÂâåæçèéäöü]/.test(fileName);
    const decodedLooksReadable =
      !decoded.includes("�") && /[\u4e00-\u9fff]/.test(decoded);
    return looksMojibake && decodedLooksReadable ? decoded : fileName;
  }
}
