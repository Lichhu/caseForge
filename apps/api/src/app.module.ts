/**
 * @file 根应用模块：聚合配置、基础设施与各业务模块
 */
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { UserContextMiddleware } from "./common/audit/user-context.middleware";
import { HttpAccessLogMiddleware } from "./common/http";
import { ConfigModule } from "@nestjs/config";
import configuration from "@config/configuration";
import { getNestEnvFilePaths } from "@config/load-env";
import { CaseEditorModule } from "./modules/case-editor";
import { DynamicInstructModule } from "./modules/dynamic-instruct";
import { ProjectManageModule } from "./modules/project-manage";
import { StructDocModule } from "./modules/struct-doc";
import { MinioStorageModule } from "@minio/index";
import { ScenarioModule } from "@scenario/index";
import { AiWorkflowModule } from "./common/ai-workflow";
import { TypeormModule } from "./common/typeorm";
import { TestPlatformModule } from "./common/test-platform";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: getNestEnvFilePaths(),
    }),
    TypeormModule,
    TestPlatformModule,
    MinioStorageModule,
    AiWorkflowModule,
    CaseEditorModule,
    DynamicInstructModule,
    ProjectManageModule,
    StructDocModule,
    ScenarioModule,
  ],
})
/** CaseForge API 根模块 */
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(UserContextMiddleware, HttpAccessLogMiddleware)
      .forRoutes("*");
  }
}
