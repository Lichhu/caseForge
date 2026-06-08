/**
 * @file 场景维护 Nest 模块
 */
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScenarioEntity } from "./entity/scenario.entity";
import { ScenarioController } from "./controller/scenario.controller";
import { ScenarioService } from "./service/scenario.service";
import { PromptEntity } from "./entity/prompt.entity";

@Module({
  imports: [TypeOrmModule.forFeature([ScenarioEntity, PromptEntity])],
  controllers: [ScenarioController],
  providers: [ScenarioService],
  exports: [ScenarioService],
})
/** 场景维护功能模块 */
export class ScenarioModule {}
