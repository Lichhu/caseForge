import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
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
import { ApiTransactionService } from "../service/api-transaction.service";
import {
  AutoSaveApiDocDto,
  SaveApiDocDto,
} from "../dto/save-api-doc.dto";
import { SaveApiDocGenerationDto } from "../dto/save-api-doc-generation.dto";
import {
  ExportApiReportDto,
  GenerateApiCasesDto,
  RunApiCasesDto,
  SaveApiCaseDto,
} from "../dto/save-api-case.dto";
import { ApiExecutionSetService } from "../service/api-execution-set.service";
import {
  ReplaceExecutionSetCasesDto,
  RunExecutionSetDto,
  ReorderEnvironmentServiceDto,
  SaveApiEnvironmentServiceDto,
  SaveApiExecutionSetDto,
} from "../dto/execution-platform.dto";
import { SaveApiEnvironmentDto } from "../dto/save-environment.dto";
import { SaveApiTransactionDto } from "../dto/save-transaction.dto";
import { BatchDeleteTransactionsDto } from "../dto/batch-delete-transactions.dto";
import { ListApiCasesDto } from "../dto/list-api-cases.dto";
import { ListApiExecutionSetsDto } from "../dto/list-api-execution-sets.dto";

const UPLOAD_EXTENSIONS = ["xls", "xlsx"];

@ApiTags("api-test")
@Controller("api-test")
export class ApiTestController {
  constructor(
    private readonly apiDocService: ApiDocService,
    private readonly apiCaseService: ApiCaseService,
    private readonly apiEnvironmentService: ApiEnvironmentService,
    private readonly apiExecutionService: ApiExecutionService,
    private readonly apiExecutionSetService: ApiExecutionSetService,
    private readonly apiReportService: ApiReportService,
    private readonly apiTransactionService: ApiTransactionService,
    private readonly minio: MinioStorageService,
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
  ) {}

  @Get(":projectId/transactions")
  @ApiOperation({ summary: "列出需求下的交易码" })
  listTransactions(@Param("projectId") projectId: string) {
    return this.apiTransactionService.listTransactions(projectId);
  }

  @Post(":projectId/transactions")
  @ApiOperation({ summary: "新建交易码" })
  createTransaction(
    @Param("projectId") projectId: string,
    @Body() body: SaveApiTransactionDto,
  ) {
    return this.apiTransactionService.createTransaction(projectId, body);
  }

  @Patch(":projectId/transactions/:transactionId")
  @ApiOperation({ summary: "更新交易码" })
  updateTransaction(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Body() body: SaveApiTransactionDto,
  ) {
    return this.apiTransactionService.updateTransaction(
      projectId,
      transactionId,
      body,
    );
  }

  @Delete(":projectId/transactions/:transactionId")
  @ApiOperation({ summary: "删除交易码" })
  deleteTransaction(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
  ) {
    return this.apiTransactionService.deleteTransaction(
      projectId,
      transactionId,
    );
  }

  @Post(":projectId/transactions/batch-delete")
  @ApiOperation({ summary: "批量删除交易码" })
  batchDeleteTransactions(
    @Param("projectId") projectId: string,
    @Body() body: BatchDeleteTransactionsDto,
  ) {
    return this.apiTransactionService.batchDeleteTransactions(
      projectId,
      body.ids,
    );
  }

  @Get(":projectId/transactions/:transactionId/upload-status")
  getUploadStatus(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
  ) {
    return this.apiDocService.getUploadStatus(projectId, transactionId);
  }

  @ApiOperation({ summary: "上传接口测试文档（Excel）" })
  @ApiConsumes("multipart/form-data")
  @ApiQuery({ name: "force", required: false })
  @UseInterceptors(FileInterceptor("file"))
  @Post(":projectId/transactions/:transactionId/document/upload")
  async uploadDocument(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query("force") force?: string,
  ) {
    if (!file) {
      throw new BadRequestException("请选择接口文档文件");
    }
    const fileName = this.normalizeUploadFileName(file.originalname);
    const extension = fileName.split(".").pop()?.toLowerCase();
    if (!extension || !UPLOAD_EXTENSIONS.includes(extension)) {
      throw new BadRequestException("仅支持 xls、xlsx");
    }
    await findOwnedProject(this.projectRepo, projectId);
    const objectPath = this.minio.buildProjectObjectPath(
      projectId,
      `${transactionId}/${fileName}`,
    );
    await this.minio.uploadFile(objectPath, file.buffer);
    await touchProjectUpdatedAt(this.projectRepo, projectId);
    return this.apiDocService.saveUploadedDocument(projectId, transactionId, {
      fileName,
      objectPath,
      force: force === "true",
    });
  }

  /**
   * 修正 multipart 上传文件名可能出现的 Latin1 乱码。
   */
  private normalizeUploadFileName(fileName: string) {
    const decoded = Buffer.from(fileName, "latin1").toString("utf8");
    const looksMojibake = /[ÃÂâåæçèéäöü]/.test(fileName);
    const decodedLooksReadable =
      !decoded.includes("�") && /[\u4e00-\u9fff]/.test(decoded);
    return looksMojibake && decodedLooksReadable ? decoded : fileName;
  }

  @Post(":projectId/transactions/:transactionId/document/structure")
  @ApiOperation({ summary: "解析并结构化接口文档" })
  structureDocument(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
  ) {
    return this.apiDocService.extractAndStructureFromUpload(
      projectId,
      transactionId,
    );
  }

  @Get(":projectId/transactions/:transactionId/document")
  getDocument(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
  ) {
    return this.apiDocService.getByTransactionId(projectId, transactionId);
  }

  @Patch(":projectId/transactions/:transactionId/document/auto-save")
  autoSaveDocument(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Body() body: AutoSaveApiDocDto,
  ) {
    return this.apiDocService.autoSave(
      projectId,
      transactionId,
      body.tempStructuredMarkdown,
    );
  }

  @Patch(":projectId/transactions/:transactionId/document")
  saveDocument(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Body() body: SaveApiDocDto,
  ) {
    return this.apiDocService.saveDocument(projectId, transactionId, body);
  }

  @Patch(":projectId/transactions/:transactionId/document/generation")
  saveDocumentGeneration(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Body() body: SaveApiDocGenerationDto,
  ) {
    return this.apiDocService.saveGenerationPrompts(
      projectId,
      transactionId,
      body,
    );
  }

  @Get(":projectId/transactions/:transactionId/endpoints")
  async listEndpoints(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
  ) {
    const doc = await this.apiDocService.getByTransactionId(
      projectId,
      transactionId,
    );
    return doc?.endpoints ?? [];
  }

  @Get(":projectId/transactions/:transactionId/cases")
  listCases(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Query() query: ListApiCasesDto,
  ) {
    return this.apiCaseService.listCases(projectId, transactionId, query);
  }

  @Post(":projectId/transactions/:transactionId/cases")
  createCase(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Body() body: SaveApiCaseDto,
  ) {
    return this.apiCaseService.createCase(projectId, transactionId, body);
  }

  @Patch(":projectId/transactions/:transactionId/cases/:caseId")
  updateCase(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Param("caseId") caseId: string,
    @Body() body: SaveApiCaseDto,
  ) {
    return this.apiCaseService.updateCase(projectId, caseId, body);
  }

  @Delete(":projectId/transactions/:transactionId/cases/:caseId")
  deleteCase(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Param("caseId") caseId: string,
  ) {
    return this.apiCaseService.deleteCase(projectId, caseId);
  }

  @Post(":projectId/transactions/:transactionId/cases/generate")
  @ApiOperation({ summary: "入队生成接口案例" })
  generateCases(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Body() body: GenerateApiCasesDto,
  ) {
    return this.apiCaseService.generateCases(
      projectId,
      transactionId,
      {
        endpointIds: body.endpointIds,
        promptIds: body.promptIds,
      },
    );
  }

  @Get(":projectId/transactions/:transactionId/cases/generate/status")
  @ApiOperation({ summary: "查询接口案例生成队列状态" })
  getGenerateStatus(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
  ) {
    return this.apiCaseService.getGenerateStatus(projectId, transactionId);
  }

  @Post(":projectId/transactions/:transactionId/cases/generate/cancel")
  @ApiOperation({ summary: "取消接口案例生成任务" })
  cancelGenerate(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
  ) {
    return this.apiCaseService.cancelGenerate(projectId, transactionId);
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

  @Get(":projectId/environments/:environmentId/services")
  listEnvironmentServices(
    @Param("projectId") projectId: string,
    @Param("environmentId") environmentId: string,
  ) {
    return this.apiEnvironmentService.listEnvironmentServices(
      projectId,
      environmentId,
    );
  }

  @Post(":projectId/environments/:environmentId/services")
  createEnvironmentService(
    @Param("projectId") projectId: string,
    @Param("environmentId") environmentId: string,
    @Body() body: SaveApiEnvironmentServiceDto,
  ) {
    return this.apiEnvironmentService.createEnvironmentService(
      projectId,
      environmentId,
      body,
    );
  }

  @Patch(":projectId/environments/:environmentId/services/:serviceId")
  updateEnvironmentService(
    @Param("projectId") projectId: string,
    @Param("environmentId") environmentId: string,
    @Param("serviceId") serviceId: string,
    @Body() body: SaveApiEnvironmentServiceDto,
  ) {
    return this.apiEnvironmentService.updateEnvironmentService(
      projectId,
      environmentId,
      serviceId,
      body,
    );
  }

  @Patch(":projectId/environments/:environmentId/services/:serviceId/reorder")
  reorderEnvironmentService(
    @Param("projectId") projectId: string,
    @Param("environmentId") environmentId: string,
    @Param("serviceId") serviceId: string,
    @Body() body: ReorderEnvironmentServiceDto,
  ) {
    return this.apiEnvironmentService.reorderEnvironmentService(
      projectId,
      environmentId,
      serviceId,
      body.direction,
    );
  }

  @Delete(":projectId/environments/:environmentId/services/:serviceId")
  deleteEnvironmentService(
    @Param("projectId") projectId: string,
    @Param("environmentId") environmentId: string,
    @Param("serviceId") serviceId: string,
  ) {
    return this.apiEnvironmentService.deleteEnvironmentService(
      projectId,
      environmentId,
      serviceId,
    );
  }

  @Get(":projectId/transactions/:transactionId/execution-sets")
  listExecutionSets(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Query() query: ListApiExecutionSetsDto,
  ) {
    return this.apiExecutionSetService.listSets(projectId, transactionId, query);
  }

  @Post(":projectId/transactions/:transactionId/execution-sets")
  createExecutionSet(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Body() body: SaveApiExecutionSetDto,
  ) {
    return this.apiExecutionSetService.createSet(
      projectId,
      transactionId,
      body,
    );
  }

  @Patch(":projectId/transactions/:transactionId/execution-sets/:setId")
  updateExecutionSet(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Param("setId") setId: string,
    @Body() body: SaveApiExecutionSetDto,
  ) {
    return this.apiExecutionSetService.updateSet(
      projectId,
      transactionId,
      setId,
      body,
    );
  }

  @Delete(":projectId/transactions/:transactionId/execution-sets/:setId")
  deleteExecutionSet(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Param("setId") setId: string,
  ) {
    return this.apiExecutionSetService.deleteSet(
      projectId,
      transactionId,
      setId,
    );
  }

  @Put(":projectId/transactions/:transactionId/execution-sets/:setId/cases")
  replaceExecutionSetCases(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Param("setId") setId: string,
    @Body() body: ReplaceExecutionSetCasesDto,
  ) {
    return this.apiExecutionSetService.replaceCases(
      projectId,
      transactionId,
      setId,
      body,
    );
  }

  @Post(":projectId/transactions/:transactionId/execution-sets/:setId/runs")
  runExecutionSet(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Param("setId") setId: string,
    @Body() body: RunExecutionSetDto,
  ) {
    return this.apiExecutionService.runExecutionSet({
      projectId,
      transactionId,
      executionSetId: setId,
      environmentId: body.environmentId,
      environmentServiceId: body.environmentServiceId,
      concurrency: body.concurrency,
      encoding: body.encoding,
    });
  }

  @Post(":projectId/transactions/:transactionId/runs")
  runCases(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Body() body: RunApiCasesDto,
  ) {
    return this.apiExecutionService.runCases({
      projectId,
      caseIds: body.caseIds,
      environmentId: body.environmentId,
      environmentServiceId: body.environmentServiceId,
      transactionId,
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

  @Get(":projectId/transactions/:transactionId/reports/summary")
  reportSummary(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Query("runId") runId?: string,
  ) {
    return this.apiReportService.summary(projectId, runId, transactionId);
  }

  @Post(":projectId/transactions/:transactionId/reports/export")
  async exportReport(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Body() body: ExportApiReportDto,
    @Res() res: Response,
  ) {
    const result = await this.apiReportService.exportReport(
      projectId,
      body.runId,
      body.format,
      transactionId,
    );
    res.setHeader("Content-Type", result.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.fileName}"`,
    );
    res.send(result.buffer);
  }
}
