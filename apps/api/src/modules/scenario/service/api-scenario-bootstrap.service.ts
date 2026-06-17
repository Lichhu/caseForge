/**
 * @file 应用启动时写入系统预置接口测试场景
 */
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PromptEntity } from "../entity/prompt.entity";
import { ScenarioEntity } from "../entity/scenario.entity";
import { ensureDefaultApiScenarios } from "../data/ensure-default-api-scenarios";

@Injectable()
export class ApiScenarioBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(ApiScenarioBootstrapService.name);

  constructor(
    @InjectRepository(ScenarioEntity)
    private readonly scenarioRepo: Repository<ScenarioEntity>,
    @InjectRepository(PromptEntity)
    private readonly promptRepo: Repository<PromptEntity>,
  ) {}

  async onModuleInit() {
    try {
      await ensureDefaultApiScenarios(this.scenarioRepo, this.promptRepo);
      this.logger.log("系统预置接口测试场景已就绪");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`写入系统预置接口场景失败: ${message}`);
    }
  }
}
