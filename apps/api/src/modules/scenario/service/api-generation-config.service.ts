import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { RequestContext } from "@common/audit/request-context";
import { toPublicScenario } from "@common/http/public-response.util";
import { ApiRequirementDispatcherEntity } from "@requirement-platform/entity/api-requirement-dispatcher.entity";
import { In, Repository } from "typeorm";
import type { SaveServicePropertyDto } from "../dto/save-service-property.dto";
import { ApiServicePropertyEntity } from "../entity/api-service-property.entity";
import { ScenarioEntity } from "../entity/scenario.entity";

@Injectable()
export class ApiGenerationConfigService {
  constructor(
    @InjectRepository(ApiServicePropertyEntity)
    private readonly propertyRepo: Repository<ApiServicePropertyEntity>,
    @InjectRepository(ScenarioEntity)
    private readonly scenarioRepo: Repository<ScenarioEntity>,
    @InjectRepository(ApiRequirementDispatcherEntity)
    private readonly dispatcherRepo: Repository<ApiRequirementDispatcherEntity>,
  ) {}

  async listConfig() {
    const [properties, scenarios, canEdit] = await Promise.all([
      this.propertyRepo.find({ order: { sortOrder: "ASC", createdAt: "ASC" } }),
      this.scenarioRepo.find({
        where: { scope: "api" },
        relations: ["prompts"],
        order: {
          updatedAt: "DESC",
          prompts: { sortOrder: "ASC", createdAt: "ASC" },
        },
      }),
      this.canEdit(),
    ]);
    return {
      canEdit,
      rows: properties.map((row) => this.toPublic(row)),
      scenarios: scenarios.map(toPublicScenario),
    };
  }

  async resolveForGeneration(servicePropertyCode: string) {
    const property = await this.propertyRepo.findOne({
      where: { code: servicePropertyCode.trim(), isActive: true },
    });
    if (!property) {
      throw new BadRequestException("所选服务属性不存在或已停用");
    }
    const scenarios = await this.loadScenarios(property.scenarioIds, true);
    if (!scenarios.length) {
      throw new BadRequestException("所选服务属性未配置可用场景");
    }
    return {
      property: this.toPublic(property),
      scenarios: scenarios
        .filter(
          (scenario) =>
            scenario.prompts.some((prompt) => prompt.isActive) ||
            ["positive_flow", "all_fields_empty"].includes(
              scenario.generationKey ?? "",
            ),
        )
        .map(toPublicScenario),
    };
  }

  async create(dto: SaveServicePropertyDto) {
    await this.assertCanEdit();
    const code = dto.code.trim();
    await this.ensureCodeUnique(code);
    await this.validateScenarioIds(dto.scenarioIds);
    const row = await this.propertyRepo.save(
      this.propertyRepo.create({
        code,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        scenarioIds: [...new Set(dto.scenarioIds)],
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      }),
    );
    return this.toPublic(row);
  }

  async update(id: string, dto: SaveServicePropertyDto) {
    await this.assertCanEdit();
    const row = await this.propertyRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException("服务属性不存在");
    const code = dto.code.trim();
    if (code !== row.code) await this.ensureCodeUnique(code, id);
    await this.validateScenarioIds(dto.scenarioIds);
    Object.assign(row, {
      code,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      scenarioIds: [...new Set(dto.scenarioIds)],
      sortOrder: dto.sortOrder ?? row.sortOrder,
      isActive: dto.isActive ?? row.isActive,
    });
    return this.toPublic(await this.propertyRepo.save(row));
  }

  async remove(id: string) {
    await this.assertCanEdit();
    const row = await this.propertyRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException("服务属性不存在");
    await this.propertyRepo.softDelete({ id });
    return { id, deleted: true };
  }

  private async loadScenarios(ids: string[], activeOnly: boolean) {
    if (!ids.length) return [];
    const rows = await this.scenarioRepo.find({
      where: activeOnly
        ? { id: In(ids), scope: "api", isActive: true }
        : { id: In(ids), scope: "api" },
      relations: ["prompts"],
      order: { prompts: { sortOrder: "ASC", createdAt: "ASC" } },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids
      .map((id) => byId.get(id))
      .filter((row): row is ScenarioEntity => Boolean(row));
  }

  private async validateScenarioIds(ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return;
    const count = await this.scenarioRepo.count({
      where: { id: In(uniqueIds), scope: "api" },
    });
    if (count !== uniqueIds.length) {
      throw new BadRequestException("包含不存在或非接口测试用途的场景");
    }
  }

  private async ensureCodeUnique(code: string, excludeId?: string) {
    const existing = await this.propertyRepo.findOne({ where: { code } });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException(`服务属性编码「${code}」已存在`);
    }
  }

  private async canEdit() {
    return this.dispatcherRepo.exists({
      where: { userName: RequestContext.getUserName() },
    });
  }

  private async assertCanEdit() {
    if (!(await this.canEdit())) {
      throw new ForbiddenException("仅分发人可维护服务属性与生成场景");
    }
  }

  private toPublic(row: ApiServicePropertyEntity) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description ?? "",
      scenarioIds: row.scenarioIds ?? [],
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
