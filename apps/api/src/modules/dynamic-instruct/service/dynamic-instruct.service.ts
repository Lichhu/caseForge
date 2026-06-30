/**
 * @file 动态指令业务服务：测试要点约束（场景提示词 + 自然语言）的查询与保存
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { BatchSaveDynamicInstructDto } from "@dynamic-instruct/dto/batch-save-dynamic-instruct.dto";
import { CreateDynamicTestPointDto } from "@dynamic-instruct/dto/create-dynamic-test-point.dto";
import { ListDynamicTestPointsDto } from "@dynamic-instruct/dto/list-dynamic-test-points.dto";
import { SaveDynamicInstructDto } from "@dynamic-instruct/dto/save-dynamic-instruct.dto";
import {
  TestPointInstructEntity,
  TestPointInstructStatus,
} from "@dynamic-instruct/entity/test-point-instruct.entity";
import { TestPointPromptEntity } from "@dynamic-instruct/entity/test-point-prompt.entity";
import { PromptEntity } from "@scenario/entity/prompt.entity";
import { TestPointEntity } from "@struct-doc/entity/test-point.entity";
import { FindOptionsWhere, In, Repository } from "typeorm";
import {
  assertOwned,
  findOwnedProject,
  scopedWhere,
  scopedWhereWithSystem,
} from "@common/audit/user-scope";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import {
  toPublicPrompt,
  toPublicTestPoint,
  toPublicTestPointSummary,
} from "@common/http/public-response.util";
import { touchProjectUpdatedAt } from "@common/project/touch-project.util";
import { normalizeCaseForgePageSize } from "@case-forge/shared";

const TEST_POINT_STATUS_ORDER_SQL = `
  CASE COALESCE(instruct.status, '待编辑')
    WHEN '生成失败' THEN 0
    WHEN '待编辑' THEN 1
    WHEN '已编辑' THEN 2
    WHEN '再编辑' THEN 2
    WHEN '生成中' THEN 3
    WHEN '生成完成' THEN 4
    ELSE 99
  END
`;

/**
 * 动态指令服务：管理测试要点与场景提示词、自然语言约束的关联及状态
 */
@Injectable()
export class DynamicInstructService {
  constructor(
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
    @InjectRepository(TestPointEntity)
    private readonly testPointRepo: Repository<TestPointEntity>,
    @InjectRepository(TestPointInstructEntity)
    private readonly instructRepo: Repository<TestPointInstructEntity>,
    @InjectRepository(TestPointPromptEntity)
    private readonly promptSelectionRepo: Repository<TestPointPromptEntity>,
    @InjectRepository(PromptEntity)
    private readonly promptRepo: Repository<PromptEntity>,
  ) {}

  /**
   * 分页列出测试要点摘要（不含 naturalText / prompts 正文，适合大数据量列表）
   */
  async listByStructDoc(query: ListDynamicTestPointsDto) {
    const { projectId, structDocId } = query;
    await findOwnedProject(this.projectRepo, projectId);

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = normalizeCaseForgePageSize(query.pageSize);
    const system = query.system?.trim() || undefined;
    const featureModule = query.featureModule?.trim() || undefined;

    const countQb = this.buildListQuery(
      projectId,
      structDocId,
      system,
      featureModule,
    );
    const total = await countQb.getCount();
    const [systems, featureModules] = await Promise.all([
      this.listSystems(projectId, structDocId),
      this.listFeatureModules(projectId, structDocId, system),
    ]);

    if (!total) {
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        systems,
        featureModules,
      };
    }

    const idRows = await this.buildListQuery(
      projectId,
      structDocId,
      system,
      featureModule,
    )
      .select("tp.id", "id")
      .addSelect(TEST_POINT_STATUS_ORDER_SQL, "statusOrder")
      .orderBy("statusOrder", "ASC")
      .addOrderBy("tp.createdAt", "ASC")
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getRawMany<{ id: string }>();

    const ids = idRows.map((row) => row.id);
    const testPoints = ids.length
      ? await this.testPointRepo.find({ where: { id: In(ids) } })
      : [];
    const testPointMap = new Map(testPoints.map((item) => [item.id, item]));
    const orderedTestPoints = ids
      .map((id) => testPointMap.get(id))
      .filter((item): item is TestPointEntity => Boolean(item));

    const instructs = await this.instructRepo.find({
      where: { testPointId: In(ids) },
    });
    const instructMap = new Map(
      instructs.map((item) => [item.testPointId, item]),
    );

    return {
      items: orderedTestPoints.map((testPoint) =>
        this.toSummaryViewModel(testPoint, instructMap.get(testPoint.id)),
      ),
      total,
      page,
      pageSize,
      systems,
      featureModules,
    };
  }

  /** 列出项目下全部系统（筛选用） */
  async listSystems(projectId: string, structDocId?: string) {
    await findOwnedProject(this.projectRepo, projectId);
    const qb = this.testPointRepo
      .createQueryBuilder("tp")
      .select("DISTINCT tp.system", "system")
      .where("tp.projectId = :projectId", { projectId })
      .andWhere("TRIM(tp.system) != ''");
    if (structDocId) {
      qb.andWhere("tp.structDocId = :structDocId", { structDocId });
    }
    const rows = await qb
      .orderBy("tp.system", "ASC")
      .getRawMany<{ system: string }>();
    return rows.map((row) => row.system).filter(Boolean);
  }

  /** 列出项目下功能模块（筛选用，可按系统收窄） */
  async listFeatureModules(
    projectId: string,
    structDocId?: string,
    system?: string,
  ) {
    await findOwnedProject(this.projectRepo, projectId);
    const qb = this.testPointRepo
      .createQueryBuilder("tp")
      .select("DISTINCT tp.featureModule", "featureModule")
      .where("tp.projectId = :projectId", { projectId })
      .andWhere("TRIM(tp.featureModule) != ''");
    if (structDocId) {
      qb.andWhere("tp.structDocId = :structDocId", { structDocId });
    }
    if (system) {
      qb.andWhere("tp.system = :system", { system });
    }
    const rows = await qb
      .orderBy("tp.featureModule", "ASC")
      .getRawMany<{ featureModule: string }>();
    return rows.map((row) => row.featureModule).filter(Boolean);
  }

  /** 编辑区自动完成：返回项目下全部要点的定义字段（不含动态指令正文） */
  async getWorkspaceMeta(projectId: string, structDocId?: string) {
    await findOwnedProject(this.projectRepo, projectId);
    const [systems, featureModules, rows] = await Promise.all([
      this.listSystems(projectId, structDocId),
      this.listFeatureModules(projectId, structDocId),
      this.testPointRepo.find({
        where: scopedWhere(
          (structDocId
            ? { projectId, structDocId }
            : { projectId }) as FindOptionsWhere<TestPointEntity>,
        ),
        select: [
          "id",
          "system",
          "systemDesc",
          "featureModule",
          "featureDesc",
          "testPoint",
          "testPointDesc",
        ],
        order: { createdAt: "ASC" },
      }),
    ]);
    return {
      featureModules,
      systems,
      definitionSamples: rows.map((item) => ({
        ...toPublicTestPointSummary(item),
        status: "待编辑" as TestPointInstructStatus,
        generateError: "",
      })),
    };
  }

  /** 列出服务端仍为「生成中」的测试要点（用于进入项目时恢复轮询） */
  async listGeneratingTestPoints(projectId: string, structDocId?: string) {
    await findOwnedProject(this.projectRepo, projectId);
    const qb = this.testPointRepo
      .createQueryBuilder("tp")
      .innerJoin(
        TestPointInstructEntity,
        "instruct",
        "instruct.testPointId = tp.id",
      )
      .select(["tp.id", "tp.testPoint"])
      .where("tp.projectId = :projectId", { projectId })
      .andWhere("instruct.status = :status", { status: "生成中" });
    if (structDocId) {
      qb.andWhere("tp.structDocId = :structDocId", { structDocId });
    }
    const rows = await qb.orderBy("tp.createdAt", "ASC").getMany();
    return rows.map((item) => ({
      id: item.id,
      testPoint: item.testPoint,
    }));
  }

  /** 新增单条测试要点 */
  async createTestPoint(dto: CreateDynamicTestPointDto) {
    await findOwnedProject(this.projectRepo, dto.projectId);
    const saved = await this.testPointRepo.save(
      this.testPointRepo.create({
        projectId: dto.projectId,
        structDocId: dto.structDocId,
        system: dto.system?.trim() || "新系统",
        systemDesc: dto.systemDesc?.trim() || "",
        featureModule: dto.featureModule?.trim() || "新功能模块",
        featureDesc: dto.featureDesc?.trim() || "",
        testPoint: dto.testPoint?.trim() || "新测试要点",
        testPointDesc: dto.testPointDesc?.trim() || "",
      }),
    );
    await touchProjectUpdatedAt(this.projectRepo, dto.projectId);
    return this.toSummaryViewModel(saved);
  }

  /** 更新单条测试要点定义（不触发全量替换） */
  async updateTestPointDefinition(
    testPointId: string,
    dto: {
      system?: string;
      systemDesc?: string;
      featureModule?: string;
      featureDesc?: string;
      testPoint?: string;
      testPointDesc?: string;
    },
  ) {
    const testPoint = await this.testPointRepo.findOne({
      where: scopedWhere({ id: testPointId }),
    });
    assertOwned(testPoint, "测试要点");

    if (dto.system !== undefined) {
      testPoint.system = dto.system.trim();
    }
    if (dto.systemDesc !== undefined) {
      testPoint.systemDesc = dto.systemDesc.trim();
    }
    if (dto.featureModule !== undefined) {
      testPoint.featureModule = dto.featureModule.trim();
    }
    if (dto.featureDesc !== undefined) {
      testPoint.featureDesc = dto.featureDesc.trim();
    }
    if (dto.testPoint !== undefined) {
      testPoint.testPoint = dto.testPoint.trim();
    }
    if (dto.testPointDesc !== undefined) {
      testPoint.testPointDesc = dto.testPointDesc.trim();
    }

    if (
      !testPoint.system.trim() ||
      !testPoint.featureModule.trim() ||
      !testPoint.testPoint.trim()
    ) {
      throw new BadRequestException("系统、功能模块、测试要点均不能为空");
    }

    await this.testPointRepo.save(testPoint);
    await touchProjectUpdatedAt(this.projectRepo, testPoint.projectId);
    return this.listOne(testPointId);
  }

  /** 删除测试要点（级联清理动态指令与提示词选择） */
  async deleteTestPoints(testPointIds: string[]) {
    const uniqueIds = [...new Set(testPointIds.filter(Boolean))];
    if (!uniqueIds.length) {
      throw new BadRequestException("请指定要删除的测试要点");
    }
    const rows = await this.testPointRepo.find({
      where: scopedWhere({ id: In(uniqueIds) }),
      select: ["id", "projectId"],
    });
    if (!rows.length) {
      throw new NotFoundException("测试要点不存在");
    }
    const ownedIds = rows.map((item) => item.id);
    await this.testPointRepo.delete({ id: In(ownedIds) });
    await touchProjectUpdatedAt(this.projectRepo, rows[0].projectId);
    return { deleted: ownedIds.length, testPointIds: ownedIds };
  }

  /**
   * 保存单个测试要点的动态指令（状态、自然语言、提示词选择等）
   * @param testPointId - 测试要点 ID
   * @param dto - 保存载荷
   */
  async saveByTestPoint(testPointId: string, dto: SaveDynamicInstructDto) {
    const testPoint = await this.testPointRepo.findOne({
      where: scopedWhere({ id: testPointId }),
    });
    assertOwned(testPoint, "测试要点");

    const promptIds = [...new Set(dto.promptIds ?? [])];
    const prompts = promptIds.length
      ? await this.promptRepo.find({
          where: scopedWhereWithSystem({ id: In(promptIds) }),
        })
      : [];
    const promptMap = new Map(prompts.map((prompt) => [prompt.id, prompt]));

    for (const promptId of promptIds) {
      if (!promptMap.has(promptId)) {
        throw new NotFoundException(`Prompt ${promptId} not found`);
      }
    }

    const status =
      dto.status ??
      (promptIds.length || dto.naturalText?.trim() ? "已编辑" : "待编辑");

    const existingInstruct = await this.instructRepo.findOne({
      where: { testPointId },
    });
    await this.instructRepo.save(
      this.instructRepo.create({
        ...existingInstruct,
        testPointId,
        testPoint,
        status,
        naturalText: dto.naturalText ?? "",
        generateError:
          status === "生成失败"
            ? (existingInstruct?.generateError ?? null)
            : null,
        isFull: dto.isFull ?? true,
        isAppend: dto.isAppend ?? false,
      }),
    );

    await this.promptSelectionRepo.delete({ testPointId });
    if (promptIds.length) {
      await this.promptSelectionRepo.save(
        promptIds.map((promptId) =>
          this.promptSelectionRepo.create({
            testPointId,
            promptId,
            testPoint,
            prompt: promptMap.get(promptId)!,
          }),
        ),
      );
    }

    await touchProjectUpdatedAt(this.projectRepo, testPoint.projectId);

    return this.listOne(testPointId);
  }

  /**
   * 批量保存多个测试要点的动态指令（共用同一套约束配置）
   * @param dto - 批量保存载荷，含 testPointIds 与约束字段
   */
  async batchSave(dto: BatchSaveDynamicInstructDto) {
    const results = [];
    for (const testPointId of dto.testPointIds) {
      results.push(await this.saveByTestPoint(testPointId, dto));
    }
    return results;
  }

  /**
   * 查询单个测试要点的动态指令详情
   * @param testPointId - 测试要点 ID
   */
  async listOne(testPointId: string) {
    const testPoint = await this.testPointRepo.findOne({
      where: scopedWhere({ id: testPointId }),
    });
    assertOwned(testPoint, "测试要点");

    const [instruct, selections] = await Promise.all([
      this.instructRepo.findOne({ where: { testPointId } }),
      this.promptSelectionRepo.find({
        where: { testPointId },
        relations: ["prompt"],
        order: { createdAt: "ASC" },
      }),
    ]);

    return this.toDetailViewModel(testPoint, instruct ?? undefined, selections);
  }

  private buildListQuery(
    projectId: string,
    structDocId?: string,
    system?: string,
    featureModule?: string,
  ) {
    const qb = this.testPointRepo
      .createQueryBuilder("tp")
      .leftJoin(
        TestPointInstructEntity,
        "instruct",
        "instruct.testPointId = tp.id",
      )
      .where("tp.projectId = :projectId", { projectId });
    if (structDocId) {
      qb.andWhere("tp.structDocId = :structDocId", { structDocId });
    }
    if (system) {
      qb.andWhere("tp.system = :system", { system });
    }
    if (featureModule) {
      qb.andWhere("tp.featureModule = :featureModule", { featureModule });
    }
    return qb;
  }

  private toSummaryViewModel(
    testPoint: TestPointEntity,
    instruct?: TestPointInstructEntity,
  ) {
    return {
      ...toPublicTestPointSummary(testPoint),
      status: instruct?.status ?? ("待编辑" as TestPointInstructStatus),
      generateError: instruct?.generateError ?? "",
    };
  }

  private toDetailViewModel(
    testPoint: TestPointEntity,
    instruct?: TestPointInstructEntity,
    selections: TestPointPromptEntity[] = [],
  ) {
    return {
      ...toPublicTestPoint(testPoint),
      status: instruct?.status ?? ("待编辑" as TestPointInstructStatus),
      naturalText: instruct?.naturalText ?? "",
      generateError: instruct?.generateError ?? "",
      isFull: instruct?.isFull ?? true,
      isAppend: instruct?.isAppend ?? false,
      promptIds: selections.map((item) => item.prompt?.id).filter(Boolean),
      prompts: selections
        .map((item) => item.prompt)
        .filter(Boolean)
        .map((prompt) => toPublicPrompt(prompt!)),
    };
  }
}
