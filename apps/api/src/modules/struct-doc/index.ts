/**
 * 结构化需求文档模块入口。
 * 聚合 StructDoc 实体、控制器、服务，并引入 MinIO 存储与 AI Chat 能力。
 */
import { Module } from "@nestjs/common";
import { StructDocController } from "./controller/struct-doc.controller";
import { StructDocService } from "./service/struct-doc.service";
import { StructRequirementQueueService } from "./service/struct-requirement-queue.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { StructDocEntity } from "./entity/struct-doc.entity";
import { StructRequirementJobEntity } from "./entity/struct-requirement-job.entity";
import { TestPointEntity } from "./entity/test-point.entity";
import { MinioStorageModule } from "@minio/index";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { AiWorkflowModule } from "@common/ai-workflow";

/** NestJS 模块：提供结构化需求文档的上传、解析、保存与查询能力。 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      StructDocEntity,
      StructRequirementJobEntity,
      TestPointEntity,
      CaseProjectEntity,
    ]),
    MinioStorageModule,
    AiWorkflowModule,
  ],
  controllers: [StructDocController],
  providers: [StructDocService, StructRequirementQueueService],
  exports: [StructDocService],
})
export class StructDocModule {}
