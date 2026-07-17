/**
 * @file 动态指令 Nest 模块：注册控制器、服务及关联实体
 */
import { Module } from "@nestjs/common";
import { DynamicInstructController } from "./controller/dynamic-instruct.controller";
import { DynamicInstructService } from "./service/dynamic-instruct.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TestPointInstructEntity } from "./entity/test-point-instruct.entity";
import { TestPointPromptEntity } from "./entity/test-point-prompt.entity";
import { TestPointEntity } from "@struct-doc/entity/test-point.entity";
import { PromptEntity } from "@scenario/entity/prompt.entity";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CaseProjectEntity,
      TestPointInstructEntity,
      TestPointPromptEntity,
      TestPointEntity,
      PromptEntity,
    ]),
  ],
  controllers: [DynamicInstructController],
  providers: [DynamicInstructService],
  exports: [DynamicInstructService],
})
/** 动态指令功能模块 */
export class DynamicInstructModule {}
