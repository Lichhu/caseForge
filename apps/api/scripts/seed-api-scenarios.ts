/**
 * 手动写入/更新系统预置接口测试场景。
 *
 * 用法：pnpm --filter @case-forge/api seed:api-scenarios
 */
import { NestFactory } from "@nestjs/core";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AppModule } from "../src/app.module";
import { ensureDefaultApiScenarios } from "../src/modules/scenario/data/ensure-default-api-scenarios";
import { PromptEntity } from "../src/modules/scenario/entity/prompt.entity";
import { ScenarioEntity } from "../src/modules/scenario/entity/scenario.entity";
import { DEFAULT_API_SCENARIOS } from "../src/modules/scenario/data/default-api-scenarios";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const scenarioRepo = app.get<Repository<ScenarioEntity>>(
      getRepositoryToken(ScenarioEntity),
    );
    const promptRepo = app.get<Repository<PromptEntity>>(
      getRepositoryToken(PromptEntity),
    );

    await ensureDefaultApiScenarios(scenarioRepo, promptRepo);

    console.log("\n系统预置接口测试场景已写入：");
    console.log(`  场景数量: ${DEFAULT_API_SCENARIOS.length}`);
    console.log(
      `  提示词数量: ${DEFAULT_API_SCENARIOS.reduce((sum, item) => sum + item.prompts.length, 0)}`,
    );
    console.log("\n前端：接口文档 → AI 生成案例 → 选择场景提示词。\n");
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("seed:api-scenarios 失败:", error);
  process.exit(1);
});
