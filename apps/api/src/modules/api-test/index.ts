import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { MinioStorageModule } from "@minio/index";
import { AiWorkflowModule } from "@common/ai-workflow";
import { ApiTestController } from "./controller/api-test.controller";
import { ApiCaseGenerateJobEntity } from "./entity/api-case-generate-job.entity";
import { ApiDocEntity } from "./entity/api-doc.entity";
import { ApiEndpointEntity } from "./entity/api-endpoint.entity";
import { ApiTestCaseEntity } from "./entity/api-test-case.entity";
import { ApiTestEnvironmentEntity } from "./entity/api-test-environment.entity";
import { ApiTestEnvironmentServiceEntity } from "./entity/api-test-environment-service.entity";
import { ApiTestExecutionSetEntity } from "./entity/api-test-execution-set.entity";
import { ApiTestExecutionSetCaseEntity } from "./entity/api-test-execution-set-case.entity";
import { ApiTestRunEntity } from "./entity/api-test-run.entity";
import { ApiTestRunItemEntity } from "./entity/api-test-run-item.entity";
import { ApiTransactionEntity } from "./entity/api-transaction.entity";
import { PromptEntity } from "@scenario/entity/prompt.entity";
import { ApiDocService } from "./service/api-doc.service";
import { ApiCaseService } from "./service/api-case.service";
import { ApiCaseGenerateQueueService } from "./service/api-case-generate-queue.service";
import { ApiTransactionService } from "./service/api-transaction.service";
import { ApiExecutionSetService } from "./service/api-execution-set.service";
import { ApiEnvironmentService } from "./service/api-environment.service";
import { ApiExecutionService } from "./service/api-execution.service";
import { ApiReportService } from "./service/api-report.service";
import { SmpClientService } from "./service/smp-client.service";
import { SmpSyncService } from "./service/smp-sync.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApiCaseGenerateJobEntity,
      ApiDocEntity,
      ApiEndpointEntity,
      ApiTestCaseEntity,
      ApiTestEnvironmentEntity,
      ApiTestEnvironmentServiceEntity,
      ApiTestExecutionSetEntity,
      ApiTestExecutionSetCaseEntity,
      ApiTestRunEntity,
      ApiTestRunItemEntity,
      ApiTransactionEntity,
      PromptEntity,
      CaseProjectEntity,
    ]),
    MinioStorageModule,
    AiWorkflowModule,
  ],
  controllers: [ApiTestController],
  providers: [
    ApiDocService,
    ApiCaseService,
    ApiCaseGenerateQueueService,
    ApiExecutionSetService,
    ApiEnvironmentService,
    ApiExecutionService,
    ApiReportService,
    ApiTransactionService,
    SmpClientService,
    SmpSyncService,
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
  ],
})
export class ApiTestModule {}
