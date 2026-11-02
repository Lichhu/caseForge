/**
 * @file 场景维护 Nest 模块
 */
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScenarioEntity } from "./entity/scenario.entity";
import { ScenarioController } from "./controller/scenario.controller";
import { ScenarioService } from "./service/scenario.service";
import { ApiScenarioBootstrapService } from "./service/api-scenario-bootstrap.service";
import { PromptEntity } from "./entity/prompt.entity";
import { ApiServicePropertyEntity } from "./entity/api-service-property.entity";
import { ApiRequirementDispatcherEntity } from "@requirement-platform/entity/api-requirement-dispatcher.entity";
import { ApiGenerationConfigService } from "./service/api-generation-config.service";
import { ApiGenerationConfigController } from "./controller/api-generation-config.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ScenarioEntity,
      PromptEntity,
      ApiServicePropertyEntity,
      ApiRequirementDispatcherEntity,
    ]),
  ],
  controllers: [ScenarioController, ApiGenerationConfigController],
  providers: [
    ScenarioService,
    ApiGenerationConfigService,
    ApiScenarioBootstrapService,
  ],
  exports: [ScenarioService, ApiGenerationConfigService],
})
/** 场景维护功能模块 */
export class ScenarioModule {}
