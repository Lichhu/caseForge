/**
 * @file 应用启动时写入系统预置接口测试场景
 */
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { PromptEntity } from "@scenario/entity/prompt.entity";
import { ScenarioEntity } from "@scenario/entity/scenario.entity";
import { ensureDefaultApiScenarios } from "@scenario/data/ensure-default-api-scenarios";
import { ApiServicePropertyEntity } from "@scenario/entity/api-service-property.entity";
import { DEFAULT_API_SERVICE_PROPERTIES } from "@scenario/data/default-api-service-properties";
import { SYSTEM_OWNER } from "@common/audit/user-scope";

@Injectable()
export class ApiScenarioBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(ApiScenarioBootstrapService.name);

  constructor(
    @InjectRepository(ScenarioEntity)
    private readonly scenarioRepo: Repository<ScenarioEntity>,
    @InjectRepository(PromptEntity)
    private readonly promptRepo: Repository<PromptEntity>,
    @InjectRepository(ApiServicePropertyEntity)
    private readonly servicePropertyRepo: Repository<ApiServicePropertyEntity>,
  ) {}

  async onModuleInit() {
    try {
      await ensureDefaultApiScenarios(this.scenarioRepo, this.promptRepo);
      await this.ensureDefaultServiceProperties();
      this.logger.log("系统预置接口测试场景已就绪");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`写入系统预置接口场景失败: ${message}`);
    }
  }

  private async ensureDefaultServiceProperties() {
    for (const [index, definition] of DEFAULT_API_SERVICE_PROPERTIES.entries()) {
      const existing = await this.servicePropertyRepo.findOne({
        where: { code: definition.code },
      });
      const scenarios = definition.scenarioNames.length
        ? await this.scenarioRepo.find({
            where: {
              name: In(definition.scenarioNames),
              scope: "api",
              createdBy: SYSTEM_OWNER,
            },
            select: ["id", "name"],
          })
        : [];
      const byName = new Map(
        scenarios.map((scenario) => [scenario.name, scenario]),
      );
      const scenarioIds = definition.scenarioNames
        .map((name) => byName.get(name)?.id)
        .filter((id): id is string => Boolean(id));
      if (existing) {
        if ((existing.modifiedBy || SYSTEM_OWNER) === SYSTEM_OWNER) {
          Object.assign(existing, {
            name: definition.name,
            description: definition.description,
            scenarioIds,
            sortOrder: index + 1,
            modifiedBy: SYSTEM_OWNER,
          });
          await this.servicePropertyRepo.save(existing);
        }
        continue;
      }
      await this.servicePropertyRepo.save(
        this.servicePropertyRepo.create({
          code: definition.code,
          name: definition.name,
          description: definition.description,
          scenarioIds,
          sortOrder: index + 1,
          isActive: true,
          createdBy: SYSTEM_OWNER,
          modifiedBy: SYSTEM_OWNER,
        }),
      );
    }
  }
}
