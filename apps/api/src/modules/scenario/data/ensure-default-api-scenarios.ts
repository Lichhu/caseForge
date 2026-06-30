/**
 * @file 系统预置接口场景 upsert（幂等，按 name + scope + createdBy 匹配）
 */
import { SCENARIO_SCOPE_API } from "@case-forge/shared";
import { Repository } from "typeorm";
import { SYSTEM_OWNER } from "@common/audit/user-scope";
import { PromptEntity } from "@scenario/entity/prompt.entity";
import { ScenarioEntity } from "@scenario/entity/scenario.entity";
import {
  DEFAULT_API_SCENARIOS,
  type DefaultApiScenarioDefinition,
} from "./default-api-scenarios";

export async function ensureDefaultApiScenarios(
  scenarioRepo: Repository<ScenarioEntity>,
  promptRepo: Repository<PromptEntity>,
) {
  for (const definition of DEFAULT_API_SCENARIOS) {
    await upsertScenario(scenarioRepo, promptRepo, definition);
  }
}

async function upsertScenario(
  scenarioRepo: Repository<ScenarioEntity>,
  promptRepo: Repository<PromptEntity>,
  definition: DefaultApiScenarioDefinition,
) {
  let scenario = await scenarioRepo.findOne({
    where: {
      name: definition.name,
      scope: SCENARIO_SCOPE_API,
      createdBy: SYSTEM_OWNER,
    },
    relations: ["prompts"],
  });

  if (!scenario) {
    scenario = await scenarioRepo.save(
      scenarioRepo.create({
        name: definition.name,
        description: definition.description,
        category: definition.category,
        scope: SCENARIO_SCOPE_API,
        isActive: definition.isActive,
        createdBy: SYSTEM_OWNER,
        modifiedBy: SYSTEM_OWNER,
      }),
    );
  } else {
    await scenarioRepo.save(
      scenarioRepo.create({
        ...scenario,
        description: definition.description,
        category: definition.category,
        isActive: definition.isActive,
        modifiedBy: SYSTEM_OWNER,
      }),
    );
  }

  const existingPrompts = await promptRepo.find({
    where: { scenarioId: scenario.id },
  });
  const existingByName = new Map(
    existingPrompts.map((prompt) => [prompt.name, prompt]),
  );
  const keepIds = new Set<string>();

  for (const promptDef of definition.prompts) {
    const current = existingByName.get(promptDef.name);
    if (current) {
      keepIds.add(current.id);
      await promptRepo.save(
        promptRepo.create({
          ...current,
          content: promptDef.content,
          tags: promptDef.tags,
          sortOrder: promptDef.sortOrder,
          isSystem: true,
          isActive: promptDef.isActive,
          isDefault: promptDef.isDefault,
          modifiedBy: SYSTEM_OWNER,
        }),
      );
      continue;
    }

    const created = await promptRepo.save(
      promptRepo.create({
        scenarioId: scenario.id,
        name: promptDef.name,
        content: promptDef.content,
        tags: promptDef.tags,
        usageCount: 0,
        sortOrder: promptDef.sortOrder,
        isSystem: true,
        isActive: promptDef.isActive,
        isDefault: promptDef.isDefault,
        createdBy: SYSTEM_OWNER,
        modifiedBy: SYSTEM_OWNER,
      }),
    );
    keepIds.add(created.id);
  }

  const staleIds = existingPrompts
    .filter((prompt) => prompt.isSystem && !keepIds.has(prompt.id))
    .map((prompt) => prompt.id);
  if (staleIds.length) {
    await promptRepo.delete(staleIds);
  }
}
