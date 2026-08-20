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
import { findOwnedProject } from "@common/audit/user-scope";
import { touchProjectUpdatedAt } from "@common/project/touch-project.util";
import { ApiDocService } from "@api-test/service/api-doc.service";
import { ApiCaseService } from "@api-test/service/api-case.service";
import { ApiEnvironmentService } from "@api-test/service/api-environment.service";
import { ApiExecutionService } from "@api-test/service/api-execution.service";
import { ApiReportService } from "@api-test/service/api-report.service";
import { ApiTransactionService } from "@api-test/service/api-transaction.service";
import {
  AutoSaveApiDocDto,
  SaveApiDocDto,
} from "@api-test/dto/save-api-doc.dto";
import { SaveApiDocGenerationDto } from "@api-test/dto/save-api-doc-generation.dto";
import {
  ExportApiReportDto,
  BatchPatchApiCaseRequestDto,
  GenerateApiCasesDto,
  RunApiCasesDto,
  SaveApiCaseDto,
} from "@api-test/dto/save-api-case.dto";
import { ApiExecutionSetService } from "@api-test/service/api-execution-set.service";
import { SmpSyncService } from "@api-test/service/smp-sync.service";
import {
  ReplaceExecutionSetCasesDto,
  ReplaceRunnerCasesDto,
  RunExecutionSetDto,
  ReorderEnvironmentServiceDto,
  SaveApiEnvironmentServiceDto,
  SaveApiExecutionSetDto,
} from "@api-test/dto/execution-platform.dto";
import { SaveApiEnvironmentDto } from "@api-test/dto/save-environment.dto";
import { SaveApiTransactionDto } from "@api-test/dto/save-transaction.dto";
import { BatchDeleteTransactionsDto } from "@api-test/dto/batch-delete-transactions.dto";
import { SmpSyncTransactionsDto } from "@api-test/dto/smp-sync-transactions.dto";
import { ListApiCasesDto } from "@api-test/dto/list-api-cases.dto";
import { ListApiExecutionSetsDto } from "@api-test/dto/list-api-execution-sets.dto";
import { AiWorkflowService } from "@common/ai-workflow/service/ai-workflow.service";
import { ApiAssertionGenerateQueueService } from "@api-test/service/api-assertion-generate-queue.service";
import { ApiDataFunctionService } from "@api-test/service/api-data-function.service";
import { ApiStepLibraryService } from "@api-test/service/api-step-library.service";
import type { ApiCaseStep } from "@case-forge/shared";
import { ApiStepDebugRecordEntity } from "@api-test/entity/api-step-debug-record.entity";
import { RequestContext, auditFieldsForCreate } from "@common/audit/request-context";
import {
  GenerateDataFunctionScriptDto,
  PreviewDataFunctionDto,
  SaveDataFunctionDto,
  SaveDatabaseConnectionDto,
} from "@api-test/dto/save-data-function.dto";

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
    private readonly smpSyncService: SmpSyncService,
    private readonly minio: MinioStorageService,
    private readonly aiWorkflow: AiWorkflowService,
    private readonly assertionGenerateQueueService: ApiAssertionGenerateQueueService,
    private readonly dataFunctionService: ApiDataFunctionService,
    private readonly stepLibraryService: ApiStepLibraryService,
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
    @InjectRepository(ApiStepDebugRecordEntity)
    private readonly stepDebugRepo: Repository<ApiStepDebugRecordEntity>,
  ) {}

  @Get("step-library")
  listStepLibrary() {
    return this.stepLibraryService.list();
  }

  @Post("step-library")
  createStepLibrary(@Body() body: { name: string; step: ApiCaseStep }) {
    return this.stepLibraryService.save(body);
  }

  @Patch("step-library/:id")
  updateStepLibrary(
    @Param("id") id: string,
    @Body() body: { name: string; step: ApiCaseStep },
  ) {
    return this.stepLibraryService.save(body, id);
  }

  @Delete("step-library/:id")
  deleteStepLibrary(@Param("id") id: string) {
    return this.stepLibraryService.remove(id);
  }

  @Get(":projectId/database-connections")
  listDatabaseConnections(@Param("projectId") projectId: string) {
    return this.dataFunctionService.listConnections(projectId);
  }
  @Post(":projectId/database-connections")
  createDatabaseConnection(
    @Param("projectId") projectId: string,
    @Body() body: SaveDatabaseConnectionDto,
  ) {
    return this.dataFunctionService.saveConnection(projectId, body);
  }
  @Patch(":projectId/database-connections/:id")
  updateDatabaseConnection(
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Body() body: SaveDatabaseConnectionDto,
  ) {
    return this.dataFunctionService.saveConnection(projectId, body, id);
  }
  @Delete(":projectId/database-connections/:id")
  deleteDatabaseConnection(
    @Param("projectId") projectId: string,
    @Param("id") id: string,
  ) {
    return this.dataFunctionService.deleteConnection(projectId, id);
  }
  @Post(":projectId/database-connections/:id/test")
  testDatabaseConnection(
    @Param("projectId") projectId: string,
    @Param("id") id: string,
  ) {
    return this.dataFunctionService.testConnection(projectId, id);
  }
  @Get(":projectId/database-connections/:id/metadata")
  getDatabaseMetadata(
    @Param("projectId") projectId: string,
    @Param("id") id: string,
  ) {
    return this.dataFunctionService.metadata(projectId, id);
  }

  @Get(":projectId/data-functions")
  listDataFunctions(@Param("projectId") projectId: string) {
    return this.dataFunctionService.listFunctions(projectId);
  }
  @Post(":projectId/data-functions")
  createDataFunction(
    @Param("projectId") projectId: string,
    @Body() body: SaveDataFunctionDto,
  ) {
    return this.dataFunctionService.saveFunction(projectId, body);
  }
  @Patch(":projectId/data-functions/:id")
  updateDataFunction(
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Body() body: SaveDataFunctionDto,
  ) {
    return this.dataFunctionService.saveFunction(projectId, body, id);
  }
  @Delete(":projectId/data-functions/:id")
  deleteDataFunction(
    @Param("projectId") projectId: string,
    @Param("id") id: string,
  ) {
    return this.dataFunctionService.deleteFunction(projectId, id);
  }
  @Post(":projectId/data-functions/preview")
  previewDataFunction(
    @Param("projectId") projectId: string,
    @Body() body: PreviewDataFunctionDto,
  ) {
    return this.dataFunctionService.preview(projectId, body);
  }
  @Post(":projectId/data-functions/generate-script")
  async generateDataFunctionScript(
    @Body() body: GenerateDataFunctionScriptDto,
  ) {
    const syntax =
      body.language === "javascript"
        ? `function(${body.params.join(", ")}) { ... }`
        : `def function(${body.params.join(", ")}):`;
    const { text } = await this.aiWorkflow.runWithAiChat(
      [
        `生成一个 ${body.language} 数据处理函数。`,
        `函数入口必须严格为：${syntax}`,
        `需求：${body.requirement}`,
        body.language === "python"
          ? "可直接使用 datetime 和 random，不要写 import。"
          : "可使用 JavaScript 标准内置对象。",
        "只输出完整函数代码，不要 Markdown 代码块、解释或依赖第三方库。",
      ].join("\n"),
    );
    return { script: text.trim().replace(/^```\w*\s*|\s*```$/g, "") };
  }

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

  @Post(":projectId/transactions/smp-list")
  @ApiOperation({ summary: "从服管平台拉取交易码候选列表" })
  fetchSmpTransactionList(@Param("projectId") projectId: string) {
    return this.smpSyncService.fetchServiceInfoList(projectId);
  }

  @Post(":projectId/transactions/smp-sync")
  @ApiOperation({ summary: "同步选中的服管交易码到本地" })
  syncSmpTransactions(
    @Param("projectId") projectId: string,
    @Body() body: SmpSyncTransactionsDto,
  ) {
    return this.smpSyncService.syncTransactions(projectId, body.items);
  }

  @Post(":projectId/transactions/:transactionId/smp-refresh")
  @ApiOperation({ summary: "从服管平台刷新交易详情并检测变更" })
  refreshSmpTransactionDocument(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
  ) {
    return this.smpSyncService.refreshTransactionDocumentFromSmp(
      projectId,
      transactionId,
    );
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

  @Patch(":projectId/transactions/:transactionId/cases/request-config")
  batchPatchCaseRequest(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Body() body: BatchPatchApiCaseRequestDto,
  ) {
    return this.apiCaseService.batchPatchCaseRequest(
      projectId,
      transactionId,
      body.caseIds,
      body.patch,
      body.environmentId,
      body.environmentServiceId,
      body.encoding,
    );
  }

  @Patch(":projectId/transactions/:transactionId/cases/:caseId")
  updateCase(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Param("caseId") caseId: string,
    @Body() body: SaveApiCaseDto,
  ) {
    return this.apiCaseService.updateCase(
      projectId,
      transactionId,
      caseId,
      body,
    );
  }

  @Delete(":projectId/transactions/:transactionId/cases/:caseId")
  deleteCase(
    @Param("projectId") projectId: string,
    @Param("caseId") caseId: string,
  ) {
    return this.apiCaseService.deleteCase(projectId, caseId);
  }

  @Get(":projectId/transactions/:transactionId/doc-readiness")
  @ApiOperation({ summary: "检查接口文档就绪状态" })
  checkDocReadiness(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
  ) {
    return this.apiCaseService.checkDocReadiness(projectId, transactionId);
  }

  @Post(":projectId/transactions/:transactionId/cases/generate")
  @ApiOperation({ summary: "入队生成接口案例" })
  generateCases(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Body() body: GenerateApiCasesDto,
  ) {
    return this.apiCaseService.generateCases(projectId, transactionId, {
      channelIds: body.channelIds,
      beforeSteps: body.beforeSteps,
      afterSteps: body.afterSteps,
    });
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

  @Get(":projectId/transactions/:transactionId/cases/generate/history")
  @ApiOperation({ summary: "查询接口案例生成历史（含版本号与场景提示词）" })
  listGenerateHistory(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
  ) {
    return this.apiCaseService.listGenerateHistory(projectId, transactionId);
  }

  @Get(":projectId/transactions/:transactionId/case-versions/:jobId")
  getGenerateVersion(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Param("jobId") jobId: string,
  ) {
    return this.apiCaseService.getGenerateVersion(
      projectId,
      transactionId,
      jobId,
    );
  }

  @Post(
    ":projectId/transactions/:transactionId/case-versions/:jobId/scenarios/:scenarioId/retry",
  )
  retryGenerateScenario(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Param("jobId") jobId: string,
    @Param("scenarioId") scenarioId: string,
  ) {
    return this.apiCaseService.retryGenerateScenario(
      projectId,
      transactionId,
      jobId,
      scenarioId,
    );
  }

  @Delete(":projectId/transactions/:transactionId/case-versions/:jobId")
  deleteGenerateVersion(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Param("jobId") jobId: string,
  ) {
    return this.apiCaseService.deleteGenerateVersion(
      projectId,
      transactionId,
      jobId,
    );
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
    return this.apiExecutionSetService.listSets(
      projectId,
      transactionId,
      query,
    );
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

  @Get(":projectId/transactions/:transactionId/runner-cases")
  listRunnerCases(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
  ) {
    return this.apiTransactionService.listRunnerCaseIds(
      projectId,
      transactionId,
    );
  }

  @Put(":projectId/transactions/:transactionId/runner-cases")
  replaceRunnerCases(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Body() body: ReplaceRunnerCasesDto,
  ) {
    return this.apiTransactionService.replaceRunnerCases(
      projectId,
      transactionId,
      body.caseIds,
    );
  }

  @Post(":projectId/transactions/:transactionId/cases/debug-run")
  @ApiOperation({ summary: "调试执行单案例（不保存执行记录）" })
  async debugRunCase(
    @Param("projectId") projectId: string,
    @Body()
    body: {
      request: Record<string, unknown>;
      expected?: Record<string, unknown>;
      polarity?: "positive" | "negative";
      environmentId?: string;
      target?: { name: string; address: string; headers?: Record<string, string> };
      stepId?: string;
      environmentServiceId?: string;
      caseId?: string;
      encoding?: string;
      ignoreSslVerify?: boolean;
    },
  ) {
    if (!body.target?.address && !body.environmentId) throw new BadRequestException("请指定环境地址");
    const result = await this.apiExecutionService.debugRun({
      projectId,
      request: body.request as any,
      expected: body.expected as any,
      polarity: body.polarity,
      environmentId: body.environmentId,
      target: body.target,
      environmentServiceId: body.environmentServiceId,
      encoding: body.encoding,
      caseId: body.caseId,
      ignoreSslVerify: body.ignoreSslVerify,
    });
    if (body.caseId) {
      await this.apiCaseService.persistLastDebugRun(projectId, body.caseId, {
        statusCode: result.statusCode,
        headers: result.headers,
        body: result.body,
        bodySize: result.bodySize,
        durationMs: result.durationMs,
        error: result.error,
        assertions: result.assertions,
        executedAt: new Date().toISOString(),
      });
      if (body.stepId) {
        const { request: resolvedRequest, ...restResult } = result;
        const record = { id: crypto.randomUUID(), stepId: body.stepId, request: (resolvedRequest ?? body.request) as Record<string, unknown>, response: { statusCode: result.statusCode, headers: result.headers, body: result.body, error: result.error }, extracted: {}, target: body.target ?? null, ...restResult, executedAt: new Date().toISOString() };
        await this.stepDebugRepo.save(this.stepDebugRepo.create({ projectId, caseId: body.caseId, stepId: body.stepId, record, ...auditFieldsForCreate() }));
        const rows = await this.stepDebugRepo.find({ where: { caseId: body.caseId, stepId: body.stepId, createdBy: RequestContext.getUserName() }, order: { createdAt: "DESC" }, skip: 30, take: 1000 });
        if (rows.length) await this.stepDebugRepo.delete(rows.map((row) => row.id));
      }
    }
    return result;
  }

  @Get(":projectId/cases/:caseId/steps/:stepId/debug-records")
  listStepDebugRecords(@Param("projectId") projectId: string, @Param("caseId") caseId: string, @Param("stepId") stepId: string) {
    return this.stepDebugRepo.find({ where: { projectId, caseId, stepId, createdBy: RequestContext.getUserName() }, order: { createdAt: "DESC" }, take: 30 });
  }

  @Delete(":projectId/cases/:caseId/steps/:stepId/debug-records")
  clearStepDebugRecords(@Param("projectId") projectId: string, @Param("caseId") caseId: string, @Param("stepId") stepId: string) {
    return this.stepDebugRepo.delete({ projectId, caseId, stepId, createdBy: RequestContext.getUserName() });
  }

  @Post(":projectId/transactions/:transactionId/cases/generate-assertions")
  @ApiOperation({ summary: "AI 根据响应体生成断言（入队）" })
  async generateAssertions(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Body()
    body: {
      caseId?: string;
      transport: string;
      messageFormat: string;
      polarity: "positive" | "negative";
      statusCode: number;
      headers: Record<string, string>;
      body: unknown;
    },
  ) {
    if (!this.aiWorkflow.canUseAiChat()) {
      throw new BadRequestException("AI Chat 未配置，请检查 AI_CHAT_URL");
    }
    const job = await this.assertionGenerateQueueService.enqueue({
      projectId,
      transactionId,
      caseId: body.caseId,
      transport: body.transport,
      messageFormat: body.messageFormat,
      polarity: body.polarity,
      statusCode: body.statusCode,
      headers: body.headers,
      body: body.body,
    });
    return { jobId: job.id, phase: job.status };
  }

  @Get(
    ":projectId/transactions/:transactionId/cases/generate-assertions/status",
  )
  @ApiOperation({ summary: "查询断言生成任务状态" })
  async getAssertionGenerateStatus(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Query("caseId") caseId?: string,
    @Query("jobId") jobId?: string,
  ) {
    return this.assertionGenerateQueueService.getStatus(
      projectId,
      transactionId,
      caseId,
      jobId,
    );
  }

  @Get(
    ":projectId/transactions/:transactionId/cases/generate-assertions/result",
  )
  @ApiOperation({ summary: "获取断言生成结果" })
  async getAssertionGenerateResult(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Query("caseId") caseId?: string,
    @Query("jobId") jobId?: string,
  ) {
    const result = await this.assertionGenerateQueueService.getResult(
      projectId,
      transactionId,
      caseId,
      jobId,
    );
    if (!result) {
      throw new BadRequestException("断言生成结果不存在或尚未完成");
    }
    return result;
  }

  @Post(
    ":projectId/transactions/:transactionId/cases/generate-assertions/cancel",
  )
  @ApiOperation({ summary: "取消断言生成任务" })
  async cancelAssertionGenerate(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Body() body: { caseId?: string; jobId?: string },
  ) {
    return this.assertionGenerateQueueService.cancel(
      projectId,
      transactionId,
      body?.caseId,
      body?.jobId,
    );
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
      encoding: body.encoding,
      executionSetId: body.executionSetId,
      runId: body.runId,
    });
  }

  @Get(":projectId/runs")
  listRuns(@Param("projectId") projectId: string) {
    return this.apiExecutionService.listRuns(projectId);
  }

  @Get(":projectId/runs/:runId")
  getRun(@Param("projectId") projectId: string, @Param("runId") runId: string) {
    return this.apiExecutionService.getRunDetail(projectId, runId);
  }

  @Delete(":projectId/runs/:runId")
  deleteRun(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
  ) {
    return this.apiExecutionService.deleteRun(projectId, runId);
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
    try {
      await this.apiReportService.recordExport({
        projectId,
        transactionId,
        format: body.format,
        runId: body.runId,
        fileName: result.fileName,
        contentType: result.contentType,
        buffer: result.buffer,
      });
    } catch {
      /* 历史记录失败不影响导出 */
    }
    res.setHeader("Content-Type", result.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.fileName}"`,
    );
    res.send(result.buffer);
  }

  @Get(":projectId/transactions/:transactionId/report-exports")
  listReportExports(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
  ) {
    return this.apiReportService.listReportExports(projectId, transactionId);
  }

  @Get(":projectId/transactions/:transactionId/report-exports/:id")
  getReportExport(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Param("id") id: string,
  ) {
    return this.apiReportService.getReportExport(projectId, transactionId, id);
  }
}
