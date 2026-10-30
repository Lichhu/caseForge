import { ExportApiCaseTemplateDto } from "../dto/api-case-template.dto";
import { ApiCaseTemplateService } from "../service/api-case-template.service";
import { ApiCaseManagementService } from "../service/api-case-management.service";
import {
  DeleteManagedCasesDto,
  ListManagedCasesDto,
  ManagedCaseDetailsDto,
} from "../dto/list-managed-cases.dto";
import { UpdatePreproductionStepDto } from "../dto/update-preproduction-step.dto";
import { UpdatePreproductionCaseDto } from "../dto/update-preproduction-case.dto";
import { PublishCaseReportDto } from "@api-test/dto/publish-case-report.dto";
import { ExportRequirementReportDto } from "@api-test/dto/export-requirement-report.dto";
import { ApiCaseReportDeliveryService } from "@api-test/service/api-case-report-delivery.service";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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
import { ApiPreproductionCaseService } from "@api-test/service/api-preproduction-case.service";
import { ApiPreproductionRunService } from "@api-test/service/api-preproduction-run.service";
import {
  PreviewPreproductionSyncDto,
  SyncPreproductionCasesDto,
} from "@api-test/dto/sync-preproduction-cases.dto";
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
import { ListPreproductionRunSetsDto } from "@api-test/dto/list-preproduction-run-sets.dto";
import { AiWorkflowService } from "@common/ai-workflow/service/ai-workflow.service";
import { ApiAssertionGenerateQueueService } from "@api-test/service/api-assertion-generate-queue.service";
import { ApiDataFunctionService } from "@api-test/service/api-data-function.service";
import { ApiStepLibraryService } from "@api-test/service/api-step-library.service";
import type {
  ApiCaseStep,
  ApiDebugRecordScope,
  ApiStepDebugRecord,
} from "@case-forge/shared";
import { detectDbSqlKind } from "@case-forge/shared";
import { ApiStepDebugRecordEntity } from "@api-test/entity/api-step-debug-record.entity";
import {
  RequestContext,
  auditFieldsForCreate,
} from "@common/audit/request-context";
import {
  DebugSqlStepDto,
  GenerateDataFunctionScriptDto,
  PreviewDataFunctionDto,
  PreviewSqlStepDto,
  SaveDataFunctionDto,
  SaveDatabaseConnectionDto,
} from "@api-test/dto/save-data-function.dto";
import { SqlStepRunnerService } from "@api-test/service/sql-step-runner.service";

const UPLOAD_EXTENSIONS = ["xls", "xlsx"];

function redactDebugHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      /authorization|token|secret|cookie|api[-_]?key/i.test(key)
        ? "****"
        : value,
    ]),
  );
}

function debugRequestSnapshot(request: Record<string, unknown>) {
  const snapshot = { ...request };
  if (
    snapshot.headers &&
    typeof snapshot.headers === "object" &&
    !Array.isArray(snapshot.headers)
  ) {
    snapshot.headers = redactDebugHeaders(
      snapshot.headers as Record<string, string>,
    );
  }
  return snapshot;
}

function normalizeDebugRecordScope(scope?: string): ApiDebugRecordScope {
  if (!scope) return "project";
  if (scope === "project" || scope === "preproduction") return scope;
  throw new BadRequestException("无效的调试记录来源");
}

@ApiTags("api-test")
@Controller("api-test")
export class ApiTestController {
  constructor(
    private readonly caseTemplate: ApiCaseTemplateService,
    private readonly caseManagement: ApiCaseManagementService,
    private readonly reportDelivery: ApiCaseReportDeliveryService,
    private readonly apiDocService: ApiDocService,
    private readonly apiCaseService: ApiCaseService,
    private readonly apiEnvironmentService: ApiEnvironmentService,
    private readonly apiExecutionService: ApiExecutionService,
    private readonly apiExecutionSetService: ApiExecutionSetService,
    private readonly apiReportService: ApiReportService,
    private readonly apiTransactionService: ApiTransactionService,
    private readonly smpSyncService: SmpSyncService,
    private readonly preproductionCaseService: ApiPreproductionCaseService,
    private readonly preproductionRunService: ApiPreproductionRunService,
    private readonly minio: MinioStorageService,
    private readonly aiWorkflow: AiWorkflowService,
    private readonly assertionGenerateQueueService: ApiAssertionGenerateQueueService,
    private readonly dataFunctionService: ApiDataFunctionService,
    private readonly stepLibraryService: ApiStepLibraryService,
    private readonly sqlStepRunner: SqlStepRunnerService,
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
    @InjectRepository(ApiStepDebugRecordEntity)
    private readonly stepDebugRepo: Repository<ApiStepDebugRecordEntity>,
  ) {}

  @Get("case-management/cases")
  listManagedCases(@Query() query: ListManagedCasesDto) {
    return this.caseManagement.list(query);
  }

  @Get("case-management/options")
  managedCaseOptions(@Query() query: ListManagedCasesDto) {
    return this.caseManagement.options(query);
  }

  @Get("case-management/execution-versions")
  listExecutionVersions() {
    return this.caseManagement.executionVersions();
  }

  @Get("case-management/execution-plans")
  listExecutionPlans(
    @Query("versionId", ParseIntPipe) versionId: number,
    @Query("parentId", ParseIntPipe) parentId: number,
  ) {
    return this.caseManagement.executionPlans(versionId, parentId);
  }

  @Get("case-management/selection")
  managedCaseSelection(@Query() query: ListManagedCasesDto) {
    return this.caseManagement.selection(query);
  }

  @Post("case-management/details")
  managedCaseDetails(@Body() body: ManagedCaseDetailsDto) {
    return this.caseManagement.details(body.ids);
  }

  @Delete("case-management/cases/:caseId")
  @ApiOperation({ summary: "删除单条准生产案例" })
  deleteManagedCase(@Param("caseId") caseId: string) {
    return this.caseManagement.deleteCases([caseId]);
  }

  @Post("case-management/cases/delete")
  @ApiOperation({ summary: "批量删除准生产案例" })
  deleteManagedCases(@Body() body: DeleteManagedCasesDto) {
    return this.caseManagement.deleteCases(body.caseIds);
  }

  @Patch("case-management/cases/:caseId/steps/:stepId")
  @ApiOperation({ summary: "更新准生产案例步骤配置" })
  updateManagedCaseStep(
    @Param("caseId") caseId: string,
    @Param("stepId") stepId: string,
    @Body() body: UpdatePreproductionStepDto,
  ) {
    return this.caseManagement.updateCaseStep(caseId, stepId, body);
  }

  @Delete("case-management/cases/:caseId/steps/:stepId")
  @ApiOperation({ summary: "删除准生产案例步骤" })
  deleteManagedCaseStep(
    @Param("caseId") caseId: string,
    @Param("stepId") stepId: string,
  ) {
    return this.caseManagement.deleteCaseStep(caseId, stepId);
  }

  @Patch("case-management/cases/:caseId")
  @ApiOperation({ summary: "更新准生产案例基础信息" })
  updateManagedCaseInfo(
    @Param("caseId") caseId: string,
    @Body() body: UpdatePreproductionCaseDto,
  ) {
    return this.caseManagement.updateCaseInfo(caseId, body);
  }

  @Post("case-management/run-records/latest")
  latestPreproductionRunRecords(@Body() body: { caseIds: string[] }) {
    return this.preproductionRunService.latestByCaseIds(body.caseIds ?? []);
  }

  @Post(":projectId/preproduction/run-sets")
  createPreproductionRunSet(
    @Param("projectId") _projectId: string,
    @Body()
    body: {
      name?: string;
      versionId?: string;
      versionLabel?: string;
      applicationId?: string;
      applicationLabel?: string;
      roundId?: string;
      roundLabel?: string;
      totalCount?: number;
    },
  ) {
    if (!body.versionId) {
      throw new BadRequestException("请选择执行版本");
    }
    return this.preproductionRunService.createRunSet({
      versionId: body.versionId,
      versionLabel: body.versionLabel?.trim() || body.versionId,
      applicationId: body.applicationId || null,
      applicationLabel: body.applicationLabel?.trim() || null,
      roundId: body.roundId || null,
      roundLabel: body.roundLabel?.trim() || null,
      name: body.name,
      totalCount: body.totalCount,
    });
  }

  @Post(":projectId/preproduction/run-sets/:runSetId/cases")
  attachPreproductionRunSetCases(
    @Param("projectId") _projectId: string,
    @Param("runSetId") runSetId: string,
    @Body() body: { caseIds?: string[] },
  ) {
    return this.preproductionRunService.attachCases(
      runSetId,
      body.caseIds ?? [],
    );
  }

  @Get(":projectId/preproduction/run-sets/:runSetId/cases")
  listPreproductionRunSetCases(
    @Param("projectId") _projectId: string,
    @Param("runSetId") runSetId: string,
  ) {
    return this.preproductionRunService.listRunSetCases(runSetId);
  }

  @Delete(":projectId/preproduction/run-sets/:runSetId/cases/:caseId")
  detachPreproductionRunSetCase(
    @Param("projectId") _projectId: string,
    @Param("runSetId") runSetId: string,
    @Param("caseId") caseId: string,
  ) {
    return this.preproductionRunService.detachCase(runSetId, caseId);
  }

  @Delete(":projectId/preproduction/run-sets/:runSetId")
  @ApiOperation({ summary: "删除执行推送集" })
  deletePreproductionRunSet(
    @Param("projectId") _projectId: string,
    @Param("runSetId") runSetId: string,
  ) {
    return this.preproductionRunService.deleteRunSet(runSetId);
  }

  @Get(":projectId/preproduction/run-sets")
  listPreproductionRunSets(
    @Param("projectId") _projectId: string,
    @Query() query: ListPreproductionRunSetsDto,
  ) {
    return this.preproductionRunService.listRunSets(query);
  }

  @Get(":projectId/preproduction/run-sets/:runSetId/records")
  listPreproductionRunSetRecords(
    @Param("projectId") _projectId: string,
    @Param("runSetId") runSetId: string,
  ) {
    return this.preproductionRunService.listRunSetRecords(runSetId);
  }

  @Post(":projectId/preproduction/run-sets/:runSetId/finish")
  finishPreproductionRunSet(
    @Param("projectId") _projectId: string,
    @Param("runSetId") runSetId: string,
  ) {
    return this.preproductionRunService.finishRunSet(runSetId);
  }

  @Get(":projectId/preproduction/cases/:caseId/run-records")
  listPreproductionRunRecords(
    @Param("projectId") projectId: string,
    @Param("caseId") caseId: string,
  ) {
    return this.preproductionRunService.listCaseRecords(projectId, caseId);
  }

  @Post(":projectId/preproduction/cases/:caseId/run-push")
  runPreproductionCaseAndPush(
    @Param("projectId") projectId: string,
    @Param("caseId") caseId: string,
    @Body()
    body: {
      versionId?: string;
      applicationId?: string;
      roundId?: string;
      runSetId?: string;
    },
  ) {
    if (
      !body.versionId ||
      !body.applicationId ||
      !body.roundId ||
      !body.runSetId
    ) {
      throw new BadRequestException("请选择版本、应用和轮次");
    }
    return this.preproductionRunService.runCaseAndPush(
      projectId,
      caseId,
      {
        versionId: body.versionId,
        applicationId: body.applicationId,
        roundId: body.roundId,
      },
      body.runSetId,
    );
  }

  @Post(":projectId/preproduction/run-records/:recordId/retry-push")
  retryPreproductionRunPush(
    @Param("projectId") projectId: string,
    @Param("recordId") recordId: string,
  ) {
    return this.preproductionRunService.retryPush(projectId, recordId);
  }

  @Get("case-management/application-systems")
  listCaseApplicationSystems() {
    return this.caseTemplate.listSystems();
  }

  @Get("case-management/application-systems/:parentId/children")
  listCaseApplicationChildren(@Param("parentId") parentId: string) {
    return this.caseTemplate.listTreeChildren(parentId);
  }

  @Get("case-management/designers")
  listCaseDesigners() {
    return this.caseTemplate.listDesigners();
  }

  @Post("case-management/export")
  async exportCaseTemplate(
    @Body() body: ExportApiCaseTemplateDto,
    @Res() res: Response,
  ) {
    const file = await this.caseTemplate.export(body);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    );
    res.send(file.buffer);
  }

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

  /** SQL 步骤试运行：确认字段名后再配变量提取 */
  @Post(":projectId/sql-steps/preview")
  previewSqlStep(@Body() body: PreviewSqlStepDto) {
    return this.sqlStepRunner.preview(body);
  }

  /** SQL 单步调试：使用只读/回滚试运行，并按需写入步骤调试记录。 */
  @Post(":projectId/sql-steps/debug")
  @ApiOperation({ summary: "调试执行 SQL 步骤" })
  async debugSqlStep(
    @Param("projectId") projectId: string,
    @Body() body: DebugSqlStepDto,
  ) {
    const startedAt = Date.now();
    const caseSource = normalizeDebugRecordScope(body.caseSource);
    try {
      const result = await this.sqlStepRunner.preview({
        connectionId: body.connectionId,
        sql: body.sql,
        timeoutMs: body.timeoutMs,
      });
      if (body.caseId && body.stepId) {
        await this.saveSqlStepDebugRecord({
          projectId,
          caseId: body.caseId,
          stepId: body.stepId,
          caseSource,
          connectionId: body.connectionId,
          sql: body.sql,
          result,
        });
      }
      return result;
    } catch (error) {
      if (body.caseId && body.stepId) {
        await this.saveSqlStepDebugRecord({
          projectId,
          caseId: body.caseId,
          stepId: body.stepId,
          caseSource,
          connectionId: body.connectionId,
          sql: body.sql,
          error: error instanceof Error ? error.message : "SQL 执行失败",
          durationMs: Date.now() - startedAt,
        });
      }
      throw error;
    }
  }

  private async saveSqlStepDebugRecord(input: {
    projectId: string;
    caseId: string;
    stepId: string;
    caseSource: ApiDebugRecordScope;
    connectionId: string;
    sql: string;
    result?: Awaited<ReturnType<SqlStepRunnerService["preview"]>>;
    error?: string;
    durationMs?: number;
  }) {
    const responseBody = input.result
      ? {
          columns: input.result.columns,
          rows: input.result.rows,
          rowCount: input.result.rowCount,
          truncated: input.result.truncated,
          connectionName: input.result.connectionName,
          connection: input.result.connection,
          connectionReadonly: input.result.connectionReadonly,
          affectedRows: input.result.affectedRows,
          rolledBack: input.result.rolledBack,
        }
      : null;
    const statusCode = input.result ? 200 : 0;
    const record: ApiStepDebugRecord = {
      id: crypto.randomUUID(),
      stepId: input.stepId,
      request: {
        kind: "db",
        connectionId: input.connectionId,
        connectionName: input.result?.connectionName ?? null,
        mode: detectDbSqlKind(input.sql) === "execute" ? "execute" : "query",
        sql: input.sql,
      },
      response: {
        statusCode,
        headers: {},
        body: responseBody,
        error: input.error,
      },
      extracted: {},
      target: null,
      statusCode,
      headers: {},
      body: responseBody,
      bodySize: Buffer.byteLength(JSON.stringify(responseBody ?? "")),
      durationMs: input.result?.durationMs ?? input.durationMs ?? 0,
      error: input.error,
      assertions: [],
      executedAt: new Date().toISOString(),
    };
    await this.stepDebugRepo.save(
      this.stepDebugRepo.create({
        projectId: input.projectId,
        caseId: input.caseId,
        caseSource: input.caseSource,
        stepId: input.stepId,
        record,
        ...auditFieldsForCreate(),
      }),
    );
    const rows = await this.stepDebugRepo.find({
      where: {
        projectId: input.projectId,
        caseSource: input.caseSource,
        caseId: input.caseId,
        stepId: input.stepId,
        createdBy: RequestContext.getUserName(),
      },
      order: { createdAt: "DESC" },
      skip: 30,
      take: 1000,
    });
    if (rows.length)
      await this.stepDebugRepo.softDelete(rows.map((row) => row.id));
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

  @Post(":projectId/transactions/preprod-sync/preview")
  @ApiOperation({ summary: "预检准生产同步的关联案例" })
  previewPreproductionSync(
    @Param("projectId") projectId: string,
    @Body() body: PreviewPreproductionSyncDto,
  ) {
    return this.preproductionCaseService.preview(
      projectId,
      body.transactionIds ?? [],
    );
  }

  @Post(":projectId/transactions/preprod-sync")
  @ApiOperation({ summary: "同步项目案例到准生产管理" })
  syncPreproductionCases(
    @Param("projectId") projectId: string,
    @Body() body: SyncPreproductionCasesDto,
  ) {
    return this.preproductionCaseService.syncSelectedCases(
      projectId,
      body.transactionIds,
      body.caseIds,
    );
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
      largePayloadFieldPath: body.largePayloadFieldPath,
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
  @ApiOperation({ summary: "调试执行单案例（保存独立步骤调试记录）" })
  async debugRunCase(
    @Param("projectId") projectId: string,
    @Body()
    body: {
      request: Record<string, unknown>;
      expected?: Record<string, unknown>;
      polarity?: "positive" | "negative";
      environmentId?: string;
      target?: {
        name: string;
        address: string;
        headers?: Record<string, string>;
        environmentId?: string;
        environmentServiceId?: string;
      };
      stepId?: string;
      environmentServiceId?: string;
      caseId?: string;
      caseSource?: ApiDebugRecordScope;
      encoding?: string;
      ignoreSslVerify?: boolean;
      prerequisiteSteps?: Array<Record<string, unknown>>;
    },
  ) {
    if (!body.target?.address && !body.environmentId)
      throw new BadRequestException("请指定环境地址");
    const caseSource = normalizeDebugRecordScope(body.caseSource);
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
      prerequisiteSteps: body.prerequisiteSteps as any,
    });
    if (body.caseId) {
      if (caseSource === "project") {
        await this.apiCaseService.persistLastDebugRun(projectId, body.caseId, {
          statusCode: result.statusCode,
          headers: redactDebugHeaders(result.headers),
          body: result.body,
          bodySize: result.bodySize,
          durationMs: result.durationMs,
          error: result.error,
          assertions: result.assertions,
          executedAt: new Date().toISOString(),
        });
      }
      if (body.stepId) {
        const { request: resolvedRequest, ...restResult } = result;
        const record = {
          id: crypto.randomUUID(),
          stepId: body.stepId,
          request: debugRequestSnapshot(
            (resolvedRequest ?? body.request) as Record<string, unknown>,
          ),
          response: {
            statusCode: result.statusCode,
            headers: redactDebugHeaders(result.headers),
            body: result.body,
            error: result.error,
          },
          extracted: {},
          target: body.target
            ? {
                name: body.target.name,
                address: body.target.address,
              }
            : null,
          ...restResult,
          executedAt: new Date().toISOString(),
        };
        await this.stepDebugRepo.save(
          this.stepDebugRepo.create({
            projectId,
            caseId: body.caseId,
            caseSource,
            stepId: body.stepId,
            record,
            ...auditFieldsForCreate(),
          }),
        );
        const rows = await this.stepDebugRepo.find({
          where: {
            projectId,
            caseSource,
            caseId: body.caseId,
            stepId: body.stepId,
            createdBy: RequestContext.getUserName(),
          },
          order: { createdAt: "DESC" },
          skip: 30,
          take: 1000,
        });
        if (rows.length)
          await this.stepDebugRepo.softDelete(rows.map((row) => row.id));
      }
    }
    return result;
  }

  @Get(":projectId/cases/:caseId/steps/:stepId/debug-records")
  listStepDebugRecords(
    @Param("projectId") projectId: string,
    @Param("caseId") caseId: string,
    @Param("stepId") stepId: string,
    @Query("caseSource") caseSource?: string,
  ) {
    const normalizedScope = normalizeDebugRecordScope(caseSource);
    return this.stepDebugRepo.find({
      where: {
        projectId,
        caseSource: normalizedScope,
        caseId,
        stepId,
        createdBy: RequestContext.getUserName(),
      },
      order: { createdAt: "DESC" },
      take: 30,
    });
  }

  @Delete(":projectId/cases/:caseId/steps/:stepId/debug-records")
  clearStepDebugRecords(
    @Param("projectId") projectId: string,
    @Param("caseId") caseId: string,
    @Param("stepId") stepId: string,
    @Query("caseSource") caseSource?: string,
  ) {
    const normalizedScope = normalizeDebugRecordScope(caseSource);
    return this.stepDebugRepo.softDelete({
      projectId,
      caseSource: normalizedScope,
      caseId,
      stepId,
      createdBy: RequestContext.getUserName(),
    });
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
      caseSource: body.caseSource,
      environmentId: body.environmentId,
      environmentServiceId: body.environmentServiceId,
      transactionId,
      concurrency: body.concurrency,
      encoding: body.encoding,
      executionSetId: body.executionSetId,
      runId: body.runId,
    });
  }

  @Get(":projectId/transactions/:transactionId/runs")
  listTransactionRuns(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
  ) {
    return this.apiExecutionService.listRunsByTransaction(
      projectId,
      transactionId,
    );
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

  @Post(":projectId/transactions/:transactionId/reports/publish-case")
  publishCaseReport(
    @Param("projectId") projectId: string,
    @Param("transactionId") transactionId: string,
    @Body() body: PublishCaseReportDto,
  ) {
    return this.reportDelivery.publish(
      projectId,
      transactionId,
      body.runId,
      body,
    );
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

  @Post(":projectId/requirement-reports/export")
  async exportRequirementReport(
    @Param("projectId") projectId: string,
    @Body() body: ExportRequirementReportDto,
    @Res() res: Response,
  ) {
    const result = await this.apiReportService.exportRequirementReport(
      projectId,
      body.format,
      body.selections,
    );
    try {
      const transactionSelections = [
        ...new Map(
          result.selections.map((selection) => [
            selection.transactionId,
            selection,
          ]),
        ).values(),
      ];
      await Promise.all(
        transactionSelections.map((selection) =>
          this.apiReportService.recordExport({
            projectId,
            transactionId: selection.transactionId,
            format: body.format,
            runId: selection.runId,
            fileName: result.fileName,
            contentType: result.contentType,
            buffer: result.buffer,
          }),
        ),
      );
    } catch {
      /* 历史记录失败不影响导出 */
    }
    res.setHeader("Content-Type", result.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="requirement-test-report.${body.format}"; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
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
