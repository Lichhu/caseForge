/**
 * @file 系统预置接口场景 upsert（幂等，按 name + scope + createdBy 匹配）
 */
import { SCENARIO_SCOPE_API } from "@case-forge/shared";
import { Repository } from "typeorm";
import { SYSTEM_OWNER } from "@common/audit/user-scope";
import { PromptEntity } from "@scenario/entity/prompt.entity";
import { ScenarioEntity } from "@scenario/entity/scenario.entity";
import {
  DEFAULT_API_SCENARIO_KEYS,
  DEFAULT_API_SCENARIO_RENAMES,
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
    const previousName = Object.entries(DEFAULT_API_SCENARIO_RENAMES).find(
      ([, nextName]) => nextName === definition.name,
    )?.[0];
    if (previousName) {
      scenario = await scenarioRepo.findOne({
        where: {
          name: previousName,
          scope: SCENARIO_SCOPE_API,
          createdBy: SYSTEM_OWNER,
        },
        relations: ["prompts"],
      });
      if (scenario) {
        scenario.name = definition.name;
        await scenarioRepo.save(scenario);
      }
    }
  }

  if (!scenario) {
    scenario = await scenarioRepo.save(
      scenarioRepo.create({
        name: definition.name,
        description: definition.description,
        category: definition.category,
        generationKey: DEFAULT_API_SCENARIO_KEYS[definition.name] ?? null,
        scope: SCENARIO_SCOPE_API,
        isActive: definition.isActive,
        createdBy: SYSTEM_OWNER,
        modifiedBy: SYSTEM_OWNER,
      }),
    );
  } else {
    const generationKey = DEFAULT_API_SCENARIO_KEYS[definition.name] ?? null;
    if (scenario.generationKey !== generationKey) {
      scenario.generationKey = generationKey;
      await scenarioRepo.save(scenario);
    }
  }

  const existingPrompts = await promptRepo.find({
    where: { scenarioId: scenario.id },
  });
  const existingByName = new Map(
    existingPrompts.map((prompt) => [prompt.name, prompt]),
  );
  for (const promptDef of definition.prompts) {
    const current = existingByName.get(promptDef.name);
    if (current) {
      if ((current.modifiedBy || SYSTEM_OWNER) === SYSTEM_OWNER) {
        Object.assign(current, {
          content: promptDef.content,
          tags: promptDef.tags,
          sortOrder: promptDef.sortOrder,
          isSystem: true,
          isActive: promptDef.isActive,
          isDefault: promptDef.isDefault,
          modifiedBy: SYSTEM_OWNER,
        });
        await promptRepo.save(current);
      }
      continue;
    }

    await promptRepo.save(
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
  }
}
