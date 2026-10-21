import { ApiCaseTemplateService } from "./service/api-case-template.service";
import { ApiCaseManagementService } from "./service/api-case-management.service";
import { NotifyModule } from "@common/notify";
import { ApiCaseReportDeliveryService } from "./service/api-case-report-delivery.service";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { ApiRequirementEntity } from "@requirement-platform/entity/api-requirement.entity";
import { MinioStorageModule } from "@minio/index";
import { AiWorkflowModule } from "@common/ai-workflow";
import { ApiTestController } from "./controller/api-test.controller";
import { ApiCaseGenerateJobEntity } from "./entity/api-case-generate-job.entity";
import { ApiCaseGenerateScenarioEntity } from "./entity/api-case-generate-scenario.entity";
import { ApiAssertionGenerateJobEntity } from "./entity/api-assertion-generate-job.entity";
import { ApiDocEntity } from "./entity/api-doc.entity";
import { ApiEndpointEntity } from "./entity/api-endpoint.entity";
import { ApiTestCaseEntity } from "./entity/api-test-case.entity";
import { ApiPreproductionCaseEntity } from "./entity/api-preproduction-case.entity";
import { ApiTestEnvironmentEntity } from "./entity/api-test-environment.entity";
import { ApiTestEnvironmentServiceEntity } from "./entity/api-test-environment-service.entity";
import { ApiTestExecutionSetEntity } from "./entity/api-test-execution-set.entity";
import { ApiTestExecutionSetCaseEntity } from "./entity/api-test-execution-set-case.entity";
import { ApiTestRunEntity } from "./entity/api-test-run.entity";
import { ApiTestRunItemEntity } from "./entity/api-test-run-item.entity";
import { ApiTransactionEntity } from "./entity/api-transaction.entity";
import { ApiDatabaseConnectionEntity } from "./entity/api-database-connection.entity";
import { ApiDataFunctionEntity } from "./entity/api-data-function.entity";
import { ApiStepLibraryEntity } from "./entity/api-step-library.entity";
import { ApiStepDebugRecordEntity } from "./entity/api-step-debug-record.entity";
import { ApiReportExportEntity } from "./entity/api-report-export.entity";
import { ApiDocService } from "./service/api-doc.service";
import { ApiCaseService } from "./service/api-case.service";
import { ApiCaseGenerateQueueService } from "./service/api-case-generate-queue.service";
import { ApiAssertionGenerateQueueService } from "./service/api-assertion-generate-queue.service";
import { ApiTransactionService } from "./service/api-transaction.service";
import { ApiExecutionSetService } from "./service/api-execution-set.service";
import { ApiEnvironmentService } from "./service/api-environment.service";
import { ApiExecutionService } from "./service/api-execution.service";
import { ApiReportService } from "./service/api-report.service";
import { SmpClientService } from "./service/smp-client.service";
import { SmpSyncService } from "./service/smp-sync.service";
import { ApiPreproductionCaseService } from "./service/api-preproduction-case.service";
import { ApiDataFunctionService } from "./service/api-data-function.service";
import { SqlStepRunnerService } from "./service/sql-step-runner.service";
import { ApiStepLibraryService } from "./service/api-step-library.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApiCaseGenerateJobEntity,
      ApiCaseGenerateScenarioEntity,
      ApiAssertionGenerateJobEntity,
      ApiDocEntity,
      ApiEndpointEntity,
      ApiTestCaseEntity,
      ApiPreproductionCaseEntity,
      ApiTestEnvironmentEntity,
      ApiTestEnvironmentServiceEntity,
      ApiTestExecutionSetEntity,
      ApiTestExecutionSetCaseEntity,
      ApiTestRunEntity,
      ApiTestRunItemEntity,
      ApiTransactionEntity,
      ApiDatabaseConnectionEntity,
      ApiDataFunctionEntity,
      ApiStepLibraryEntity,
      ApiStepDebugRecordEntity,
      ApiReportExportEntity,
      CaseProjectEntity,
      ApiRequirementEntity,
    ]),
    NotifyModule,
    MinioStorageModule,
    AiWorkflowModule,
  ],
  controllers: [ApiTestController],
  providers: [
    ApiCaseManagementService,
    ApiCaseTemplateService,
    ApiCaseReportDeliveryService,
    ApiDocService,
    ApiCaseService,
    ApiCaseGenerateQueueService,
    ApiAssertionGenerateQueueService,
    ApiExecutionSetService,
    ApiEnvironmentService,
    ApiExecutionService,
    ApiReportService,
    ApiTransactionService,
    SmpClientService,
    SmpSyncService,
    ApiPreproductionCaseService,
    ApiDataFunctionService,
    ApiStepLibraryService,
    SqlStepRunnerService,
  ],
  exports: [
    ApiDocService,
    ApiCaseService,
    ApiExecutionSetService,
    ApiEnvironmentService,
    ApiExecutionService,
    ApiReportService,
    ApiTransactionService,
    SmpClientService,
    SmpSyncService,
    ApiPreproductionCaseService,
    ApiDataFunctionService,
  ],
})
export class ApiTestModule {}
