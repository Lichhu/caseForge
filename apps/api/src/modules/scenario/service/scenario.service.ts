/**
 * @file 场景与提示词库业务服务
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  SavePromptDto,
  SaveScenarioDto,
} from "@scenario/dto/save-scenario.dto";
import { PromptEntity } from "@scenario/entity/prompt.entity";
import { ScenarioEntity } from "@scenario/entity/scenario.entity";
import {
  normalizeScenarioScope,
  SCENARIO_SCOPE_CASE,
  type ScenarioScope,
} from "@case-forge/shared";
import { In, Repository } from "typeorm";
import {
  assertAccessible,
  assertOwned,
  scopedWhere,
  scopedWhereWithSystem,
} from "../../../common/audit/user-scope";
import { toPublicScenario } from "../../../common/http/public-response.util";

/**
 * 场景服务：场景的增删改查及下属提示词的同步保存
 */
@Injectable()
export class ScenarioService {
  constructor(
    @InjectRepository(ScenarioEntity)
    private readonly scenarioRepo: Repository<ScenarioEntity>,
    @InjectRepository(PromptEntity)
    private readonly promptRepo: Repository<PromptEntity>,
  ) {}

  /** 按归属列出系统预置与当前用户维护的场景及其提示词 */
  async listScenarios(scope: ScenarioScope = SCENARIO_SCOPE_CASE) {
    const rows = await this.scenarioRepo.find({
      where: scopedWhereWithSystem({ scope }),
      relations: ["prompts"],
      order: {
        updatedAt: "DESC",
        prompts: {
          createdAt: "DESC",
          sortOrder: "ASC",
        },
      },
    });
    return rows.map(toPublicScenario);
  }

  /**
   * 按 ID 获取场景详情（含提示词）
   * @param id - 场景 ID
   */
  async getScenario(id: string) {
    return toPublicScenario(await this.findScenarioEntity(id));
  }

  private async findScenarioEntity(id: string) {
    const scenario = await this.scenarioRepo.findOne({
      where: { id },
      relations: ["prompts"],
      order: {
        prompts: {
          createdAt: "DESC",
          sortOrder: "ASC",
        },
      },
    });
    assertAccessible(scenario, "场景");
    return scenario;
  }

  private async getOwnedScenario(id: string) {
    const scenario = await this.findScenarioEntity(id);
    assertOwned(scenario, "场景");
    return scenario;
  }

  /**
   * 创建场景及可选的初始提示词
   * @param dto - 保存载荷
   */
  async createScenario(dto: SaveScenarioDto) {
    const scope = normalizeScenarioScope(dto.scope, SCENARIO_SCOPE_CASE);
    await this.ensureScenarioNameUnique(dto.name.trim(), scope);
    const scenario = await this.scenarioRepo.save(
      this.scenarioRepo.create({
        name: dto.name.trim(),
        description: dto.description?.trim() || "",
        category: dto.category.trim(),
        scope,
        isActive: dto.isActive ?? true,
      }),
    );

    if (dto.prompts?.length) {
      await this.savePrompts(scenario.id, dto.prompts);
    }
    return this.getScenario(scenario.id);
  }

  /**
   * 更新场景信息，若传入 prompts 则全量替换提示词列表
   * @param id - 场景 ID
   * @param dto - 保存载荷
   */
  async updateScenario(id: string, dto: SaveScenarioDto) {
    const scenario = await this.getOwnedScenario(id);
    await this.ensureScenarioNameUnique(dto.name.trim(), scenario.scope, id);
    await this.scenarioRepo.save(
      this.scenarioRepo.create({
        ...scenario,
        name: dto.name.trim(),
        description: dto.description?.trim() || "",
        category: dto.category.trim(),
        isActive: dto.isActive !== undefined ? dto.isActive : scenario.isActive,
      }),
    );

    if (dto.prompts !== undefined) {
      await this.replacePrompts(id, dto.prompts);
    }
    return this.getScenario(id);
  }

  /**
   * 删除场景（级联删除其提示词）
   * @param id - 场景 ID
   */
  async deleteScenario(id: string) {
    const scenario = await this.getOwnedScenario(id);
    await this.scenarioRepo.remove(scenario);
    return { id, deleted: true };
  }

  private async replacePrompts(scenarioId: string, prompts: SavePromptDto[]) {
    await this.getOwnedScenario(scenarioId);
    const existing = await this.promptRepo.find({
      where: scopedWhere({ scenarioId }),
      select: ["id"],
    });
    const keepIds = prompts
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id));
    const deleteIds = existing
      .map((item) => item.id)
      .filter((id) => !keepIds.includes(id));
    if (deleteIds.length) {
      await this.promptRepo.delete({ id: In(deleteIds) });
    }
    await this.savePrompts(scenarioId, prompts);
  }

  private async ensureScenarioNameUnique(
    name: string,
    scope: ScenarioScope,
    excludeId?: string,
  ) {
    const existing = await this.scenarioRepo.findOne({
      where: scopedWhereWithSystem({ name, scope }),
    });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException(`场景名称「${name}」已存在`);
    }
  }

  private ensurePromptNamesUnique(prompts: SavePromptDto[]) {
    const seen = new Set<string>();
    for (const prompt of prompts) {
      const key = prompt.name.trim();
      if (!key) {
        continue;
      }
      if (seen.has(key)) {
        throw new BadRequestException(`提示词「${key}」在同一场景下不能重复`);
      }
      seen.add(key);
    }
  }

  private async savePrompts(scenarioId: string, prompts: SavePromptDto[]) {
    this.ensurePromptNamesUnique(prompts);
    const entities = prompts.map((prompt, index) =>
      this.promptRepo.create({
        id: prompt.id,
        scenarioId,
        name: prompt.name.trim(),
        content: prompt.content,
        tags: prompt.tags ?? [],
        usageCount: prompt.usageCount ?? 0,
        sortOrder: prompt.sortOrder ?? index + 1,
        isSystem: prompt.isSystem ?? false,
        isActive: prompt.isActive ?? true,
        isDefault: prompt.isDefault ?? false,
      }),
    );
    if (entities.length) {
      await this.promptRepo.save(entities);
    }
  }
}
