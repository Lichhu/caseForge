/**
 * @file 动态指令业务服务：测试要点约束（场景提示词 + 自然语言）的查询与保存
 */
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { BatchSaveDynamicInstructDto } from "@dynamic-instruct/dto/batch-save-dynamic-instruct.dto";
import { SaveDynamicInstructDto } from "@dynamic-instruct/dto/save-dynamic-instruct.dto";
import {
  TestPointInstructEntity,
  TestPointInstructStatus,
} from "@dynamic-instruct/entity/test-point-instruct.entity";
import { TestPointPromptEntity } from "@dynamic-instruct/entity/test-point-prompt.entity";
import { PromptEntity } from "@scenario/entity/prompt.entity";
import { TestPointEntity } from "@struct-doc/entity/test-point.entity";
import { In, Repository } from "typeorm";
import {
  assertOwned,
  findOwnedProject,
  scopedWhere,
  scopedWhereWithSystem,
} from "../../../common/audit/user-scope";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { compareTestPointsByStatus } from "@dynamic-instruct/util/test-point-status-sort.util";
import { touchProjectUpdatedAt } from "../../../common/project/touch-project.util";

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
   * 按项目与结构化文档列出测试要点及其动态指令视图
   * @param projectId - 项目 ID
   * @param structDocId - 结构化文档 ID
   */
  async listByStructDoc(projectId: string, structDocId: string) {
    await findOwnedProject(this.projectRepo, projectId);
    const testPoints = await this.testPointRepo.find({
      where: scopedWhere({ projectId, structDocId }),
      order: { createdAt: "ASC" },
    });

    if (!testPoints.length) {
      return [];
    }

    const testPointIds = testPoints.map((item) => item.id);
    const [instructs, selections] = await Promise.all([
      this.instructRepo.find({
        where: { testPointId: In(testPointIds) },
      }),
      this.promptSelectionRepo.find({
        where: { testPointId: In(testPointIds) },
        relations: ["prompt"],
        order: { createdAt: "ASC" },
      }),
    ]);

    const instructMap = new Map(instructs.map((item) => [item.testPointId, item]));
    const selectionMap = new Map<string, TestPointPromptEntity[]>();
    for (const selection of selections) {
      const current = selectionMap.get(selection.testPointId) ?? [];
      current.push(selection);
      selectionMap.set(selection.testPointId, current);
    }

    return testPoints
      .map((testPoint) =>
        this.toViewModel(
          testPoint,
          instructMap.get(testPoint.id),
          selectionMap.get(testPoint.id) ?? [],
        ),
      )
      .sort(compareTestPointsByStatus);
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
        generateError: status === "生成失败" ? existingInstruct?.generateError ?? null : null,
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

    return this.toViewModel(testPoint, instruct ?? undefined, selections);
  }

  private toViewModel(
    testPoint: TestPointEntity,
    instruct?: TestPointInstructEntity,
    selections: TestPointPromptEntity[] = [],
  ) {
    return {
      ...testPoint,
      status: instruct?.status ?? ("待编辑" as TestPointInstructStatus),
      naturalText: instruct?.naturalText ?? "",
      generateError: instruct?.generateError ?? "",
      isFull: instruct?.isFull ?? true,
      isAppend: instruct?.isAppend ?? false,
      promptIds: selections.map((item) => item.prompt?.id).filter(Boolean),
      prompts: selections.map((item) => item.prompt).filter(Boolean),
    };
  }
}
