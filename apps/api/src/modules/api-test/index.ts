import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { MinioStorageModule } from "@minio/index";
import { ApiTestController } from "./controller/api-test.controller";
import { ApiDocEntity } from "./entity/api-doc.entity";
import { ApiEndpointEntity } from "./entity/api-endpoint.entity";
import { ApiTestCaseEntity } from "./entity/api-test-case.entity";
import { ApiTestEnvironmentEntity } from "./entity/api-test-environment.entity";
import { ApiTestRunEntity } from "./entity/api-test-run.entity";
import { ApiTestRunItemEntity } from "./entity/api-test-run-item.entity";
import { ApiDocService } from "./service/api-doc.service";
import { ApiCaseService } from "./service/api-case.service";
import { ApiEnvironmentService } from "./service/api-environment.service";
import { ApiExecutionService } from "./service/api-execution.service";
import { ApiReportService } from "./service/api-report.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApiDocEntity,
      ApiEndpointEntity,
      ApiTestCaseEntity,
      ApiTestEnvironmentEntity,
      ApiTestRunEntity,
      ApiTestRunItemEntity,
      CaseProjectEntity,
    ]),
    MinioStorageModule,
  ],
  controllers: [ApiTestController],
  providers: [
    ApiDocService,
    ApiCaseService,
    ApiEnvironmentService,
    ApiExecutionService,
    ApiReportService,
  ],
  exports: [
    ApiDocService,
    ApiCaseService,
    ApiEnvironmentService,
    ApiExecutionService,
    ApiReportService,
  ],
})
export class ApiTestModule {}
