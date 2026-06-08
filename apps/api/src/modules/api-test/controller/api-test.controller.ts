import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { Response } from "express";
import { Repository } from "typeorm";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { MinioStorageService } from "@minio/service/minio.service";
import { findOwnedProject } from "../../../common/audit/user-scope";
import { touchProjectUpdatedAt } from "../../../common/project/touch-project.util";
import { ApiDocService } from "../service/api-doc.service";
import { ApiCaseService } from "../service/api-case.service";
import { ApiEnvironmentService } from "../service/api-environment.service";
import { ApiExecutionService } from "../service/api-execution.service";
import { ApiReportService } from "../service/api-report.service";
import {
  AutoSaveApiDocDto,
  SaveApiDocDto,
} from "../dto/save-api-doc.dto";
import {
  ExportApiReportDto,
  GenerateApiCasesDto,
  RunApiCasesDto,
  SaveApiCaseDto,
} from "../dto/save-api-case.dto";
import { SaveApiEnvironmentDto } from "../dto/save-environment.dto";

const UPLOAD_EXTENSIONS = ["xls", "xlsx", "doc", "docx", "md", "markdown", "txt"];

@ApiTags("api-test")
@Controller("api-test")
export class ApiTestController {
  constructor(
    private readonly apiDocService: ApiDocService,
    private readonly apiCaseService: ApiCaseService,
    private readonly apiEnvironmentService: ApiEnvironmentService,
    private readonly apiExecutionService: ApiExecutionService,
    private readonly apiReportService: ApiReportService,
    private readonly minio: MinioStorageService,
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
  ) {}

  @Get(":projectId/upload-status")
  getUploadStatus(@Param("projectId") projectId: string) {
    return this.apiDocService.getUploadStatus(projectId);
  }

  @ApiOperation({ summary: "上传接口测试文档（Excel/Word/Markdown）" })
  @ApiConsumes("multipart/form-data")
  @ApiQuery({ name: "force", required: false })
  @UseInterceptors(FileInterceptor("file"))
  @Post(":projectId/document/upload")
  async uploadDocument(
    @Param("projectId") projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query("force") force?: string,
  ) {
    if (!file) {
      throw new BadRequestException("请选择接口文档文件");
    }
    const extension = file.originalname.split(".").pop()?.toLowerCase();
    if (!extension || !UPLOAD_EXTENSIONS.includes(extension)) {
      throw new BadRequestException(
        "仅支持 xls、xlsx、doc、docx、md、markdown、txt",
      );
    }
    await findOwnedProject(this.projectRepo, projectId);
    const objectPath = this.minio.buildProjectObjectPath(
      projectId,
      file.originalname,
    );
    await this.minio.uploadFile(objectPath, file.buffer);
    await touchProjectUpdatedAt(this.projectRepo, projectId);
    return this.apiDocService.saveUploadedDocument(projectId, {
      fileName: file.originalname,
      objectPath,
      force: force === "true",
    });
  }

  @Post(":projectId/document/structure")
  @ApiOperation({ summary: "解析并结构化接口文档" })
  structureDocument(@Param("projectId") projectId: string) {
    return this.apiDocService.extractAndStructureFromUpload(projectId);
  }

  @Get(":projectId/document")
  getDocument(@Param("projectId") projectId: string) {
    return this.apiDocService.getByProjectId(projectId);
  }

  @Patch(":projectId/document/auto-save")
  autoSaveDocument(
    @Param("projectId") projectId: string,
    @Body() body: AutoSaveApiDocDto,
  ) {
    return this.apiDocService.autoSave(projectId, body.tempStructuredMarkdown);
  }

  @Patch(":projectId/document")
  saveDocument(
    @Param("projectId") projectId: string,
    @Body() body: SaveApiDocDto,
  ) {
    return this.apiDocService.saveDocument(projectId, body);
  }

  @Get(":projectId/endpoints")
  async listEndpoints(@Param("projectId") projectId: string) {
    const doc = await this.apiDocService.getByProjectId(projectId);
    return doc?.endpoints ?? [];
  }

  @Get(":projectId/cases")
  listCases(@Param("projectId") projectId: string) {
    return this.apiCaseService.listCases(projectId);
  }

  @Post(":projectId/cases")
  createCase(
    @Param("projectId") projectId: string,
    @Body() body: SaveApiCaseDto,
  ) {
    return this.apiCaseService.createCase(projectId, body);
  }

  @Patch(":projectId/cases/:caseId")
  updateCase(
    @Param("projectId") projectId: string,
    @Param("caseId") caseId: string,
    @Body() body: SaveApiCaseDto,
  ) {
    return this.apiCaseService.updateCase(projectId, caseId, body);
  }

  @Delete(":projectId/cases/:caseId")
  deleteCase(
    @Param("projectId") projectId: string,
    @Param("caseId") caseId: string,
  ) {
    return this.apiCaseService.deleteCase(projectId, caseId);
  }

  @Post(":projectId/cases/generate")
  generateCases(
    @Param("projectId") projectId: string,
    @Body() body: GenerateApiCasesDto,
  ) {
    return this.apiCaseService.generateCases(projectId, body.endpointIds);
  }

  @Get(":projectId/environments")
  listEnvironments(@Param("projectId") projectId: string) {
    return this.apiEnvironmentService.listEnvironments(projectId);
  }

  @Post(":projectId/environments")
  createEnvironment(
    @Param("projectId") projectId: string,
    @Body() body: SaveApiEnvironmentDto,
  ) {
    return this.apiEnvironmentService.createEnvironment(projectId, body);
  }

  @Patch(":projectId/environments/:environmentId")
  updateEnvironment(
    @Param("projectId") projectId: string,
    @Param("environmentId") environmentId: string,
    @Body() body: SaveApiEnvironmentDto,
  ) {
    return this.apiEnvironmentService.updateEnvironment(
      projectId,
      environmentId,
      body,
    );
  }

  @Delete(":projectId/environments/:environmentId")
  deleteEnvironment(
    @Param("projectId") projectId: string,
    @Param("environmentId") environmentId: string,
  ) {
    return this.apiEnvironmentService.deleteEnvironment(
      projectId,
      environmentId,
    );
  }

  @Post(":projectId/runs")
  runCases(
    @Param("projectId") projectId: string,
    @Body() body: RunApiCasesDto,
  ) {
    return this.apiExecutionService.runCases({
      projectId,
      caseIds: body.caseIds,
      environmentId: body.environmentId,
      concurrency: body.concurrency,
    });
  }

  @Get(":projectId/runs")
  listRuns(@Param("projectId") projectId: string) {
    return this.apiExecutionService.listRuns(projectId);
  }

  @Get(":projectId/runs/:runId")
  getRun(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
  ) {
    return this.apiExecutionService.getRunDetail(projectId, runId);
  }

  @Get(":projectId/reports/summary")
  reportSummary(
    @Param("projectId") projectId: string,
    @Query("runId") runId?: string,
  ) {
    return this.apiReportService.summary(projectId, runId);
  }

  @Post(":projectId/reports/export")
  async exportReport(
    @Param("projectId") projectId: string,
    @Body() body: ExportApiReportDto,
    @Res() res: Response,
  ) {
    const result = await this.apiReportService.exportReport(
      projectId,
      body.runId,
      body.format,
    );
    res.setHeader("Content-Type", result.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.fileName}"`,
    );
    res.send(result.buffer);
  }
}
