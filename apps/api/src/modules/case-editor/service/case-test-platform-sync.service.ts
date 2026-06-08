/**
 * 将智能生成案例平台的案例树同步至测管平台（b_project / b_case_test / b_case_operating_step）。
 */
import {
  flattenCaseTreeToExcel,
  extractCasePolarity,
  type CasePriority,
  type CaseTreeNode,
} from "@case-forge/shared";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { RequestContext } from "../../../common/audit/request-context";
import { TEST_PLATFORM_CONNECTION } from "../../../common/test-platform";
import { TestPlatformCaseEntity } from "../../../common/test-platform/entity/test-platform-case.entity";
import { TestPlatformCaseStepEntity } from "../../../common/test-platform/entity/test-platform-case-step.entity";
import { TestPlatformProjectEntity } from "../../../common/test-platform/entity/test-platform-project.entity";
import {
  findOwnedProject,
  scopedWhere,
} from "../../../common/audit/user-scope";
import { CaseEditorEntity } from "@case-editor/entity/case-editor.entity";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { DataSource, Repository } from "typeorm";
import { buildOperatingSteps } from "../util/case-operating-steps.util";
import {
  isValidProjectRequirementCode,
  resolveProjectRequirementCode,
} from "../util/requirement-code.util";

export interface SyncToTestPlatformResult {
  projectCode: string;
  testPlatformProjectId: string;
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
}

@Injectable()
export class CaseTestPlatformSyncService {
  constructor(
    @InjectRepository(CaseEditorEntity)
    private readonly caseEditorRepo: Repository<CaseEditorEntity>,
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
    @InjectRepository(TestPlatformProjectEntity, TEST_PLATFORM_CONNECTION)
    private readonly testProjectRepo: Repository<TestPlatformProjectEntity>,
    @InjectRepository(TestPlatformCaseEntity, TEST_PLATFORM_CONNECTION)
    private readonly testCaseRepo: Repository<TestPlatformCaseEntity>,
    @InjectRepository(TestPlatformCaseStepEntity, TEST_PLATFORM_CONNECTION)
    private readonly testStepRepo: Repository<TestPlatformCaseStepEntity>,
    @InjectDataSource(TEST_PLATFORM_CONNECTION)
    private readonly testDataSource: DataSource,
  ) {}

  async syncRunToTestPlatform(
    projectId: string,
    runId: string,
    tree: CaseTreeNode,
    caseNodeIds: string[],
  ): Promise<SyncToTestPlatformResult> {
    const project = await findOwnedProject(this.projectRepo, projectId);
    const projectCode = resolveProjectRequirementCode(project);
    if (!projectCode || !isValidProjectRequirementCode(projectCode)) {
      throw new BadRequestException(
        "项目缺少测管需求编号（格式 XQXXXX-XXXX-XX）。请在项目标题或需求编号中填写，或完善项目名称后重试。",
      );
    }

    const editor = await this.caseEditorRepo.findOne({
      where: scopedWhere({ projectId, id: runId }),
    });
    if (!editor) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    const testProject = await this.testProjectRepo.findOne({
      where: { projectCode, dataStatus: 0 },
    });
    if (!testProject) {
      throw new NotFoundException(
        `测管平台未找到需求编号为 ${projectCode} 的项目，请先在测管平台创建对应需求。`,
      );
    }

    const { rows } = flattenCaseTreeToExcel(tree);
    if (!rows.length) {
      throw new BadRequestException("当前案例树中没有可同步的案例节点");
    }

    const uniqueIds = [...new Set(caseNodeIds.map((id) => id.trim()).filter(Boolean))];
    if (!uniqueIds.length) {
      throw new BadRequestException("请至少选择一条案例进行同步");
    }

    const availableIds = new Set(rows.map((row) => row.caseNodeId));
    const missingIds = uniqueIds.filter((id) => !availableIds.has(id));
    if (missingIds.length) {
      throw new BadRequestException(
        `所选案例不存在或已删除：${missingIds.slice(0, 3).join("、")}${missingIds.length > 3 ? " 等" : ""}`,
      );
    }

    const selectedIdSet = new Set(uniqueIds);
    const selectedRows = rows.filter((row) => selectedIdSet.has(row.caseNodeId));
    if (!selectedRows.length) {
      throw new BadRequestException("请至少选择一条案例进行同步");
    }

    const operator = RequestContext.getUserName();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    await this.testDataSource.transaction(async (manager) => {
      const caseRepo = manager.getRepository(TestPlatformCaseEntity);
      const stepRepo = manager.getRepository(TestPlatformCaseStepEntity);

      for (const row of selectedRows) {
        const caseCode = row.caseNodeId;
        const payload = this.buildCasePayload({
          row,
          projectCode,
          testProjectId: testProject.id,
          operator,
        });

        let existing = await caseRepo.findOne({
          where: { projectId: testProject.id, caseCode, dataStatus: 1 },
        });

        if (!existing) {
          const created = caseRepo.create(payload);
          const saved = await caseRepo.save(created);
          saved.caseSerialCode = `${payload.caseSerial}${saved.id}`;
          await caseRepo.save(saved);
          await this.replaceOperatingSteps(
            stepRepo,
            saved.id,
            row.caseStep,
            row.caseExpected,
            operator,
          );
          inserted += 1;
          continue;
        }

        if (!row.caseName?.trim() && !row.caseStep?.trim()) {
          skipped += 1;
          continue;
        }

        Object.assign(existing, payload, { updateBy: operator });
        await caseRepo.save(existing);
        await this.replaceOperatingSteps(
          stepRepo,
          existing.id,
          row.caseStep,
          row.caseExpected,
          operator,
        );
        updated += 1;
      }
    });

    return {
      projectCode,
      testPlatformProjectId: testProject.id,
      inserted,
      updated,
      skipped,
      total: selectedRows.length,
    };
  }

  private buildCasePayload(input: {
    row: ReturnType<typeof flattenCaseTreeToExcel>["rows"][number];
    projectCode: string;
    testProjectId: string;
    operator: string;
  }): Partial<TestPlatformCaseEntity> {
    const polarity = extractCasePolarity(input.row.caseName) || "正向";
    const caseNature = /反|负/.test(polarity) ? 2 : 1;
    const caseSerial = `CF-${input.projectCode}-`;

    return {
      isAi: 1,
      caseSerial,
      systemName: truncate(input.row.system, 64),
      modelName: truncate(input.row.module, 64),
      currentSystemName: truncate(input.row.requirement, 64),
      functionPointName: truncate(input.row.requirement, 500),
      caseName: truncate(input.row.caseTitle || input.row.caseName, 2000),
      caseNature,
      testType: 1,
      caseType: 1,
      caseExecuteType: 1,
      testPurpose: truncate(input.row.requirement, 2000),
      detailedDescription: truncate(input.row.caseStep, 2000),
      priority: mapPriority(input.row.caseName),
      caseStatus: 1,
      expectedResult: truncate(input.row.caseExpected, 2000),
      precondition: truncate(input.row.caseCondition, 200),
      createBy: input.operator,
      updateBy: input.operator,
      dataStatus: 1,
      projectId: input.testProjectId,
      caseCode: input.row.caseNodeId,
      reportType: 1,
      storageStatus: 1,
      requireCodes: input.projectCode,
      label: "CaseForge",
    };
  }

  private async replaceOperatingSteps(
    stepRepo: Repository<TestPlatformCaseStepEntity>,
    caseId: string,
    caseStep: string,
    caseExpected: string,
    operator: string,
  ) {
    await stepRepo.update(
      { caseId, dataStatus: 1 },
      { dataStatus: 0, updateBy: operator },
    );

    const steps = buildOperatingSteps(caseStep, caseExpected);
    if (!steps.length) {
      return;
    }

    for (const [index, item] of steps.entries()) {
      await stepRepo.save(
        stepRepo.create({
          caseId,
          operatingStepSummarize: truncate(item.step, 1024),
          serialNumber: index + 1,
          expectedResult: truncate(item.expected, 1024),
          createBy: operator,
          updateBy: operator,
          dataStatus: 1,
        }),
      );
    }
  }
}

function truncate(value: string, max: number) {
  const text = (value ?? "").trim();
  if (!text) {
    return undefined;
  }
  return text.length > max ? text.slice(0, max) : text;
}

function mapPriority(caseName: string): number {
  const match = caseName.match(/\bP([0-3])\b/i);
  if (!match) {
    return 2;
  }
  const map: Record<CasePriority, number> = { P0: 1, P1: 2, P2: 3, P3: 3 };
  const key = `P${match[1]}` as CasePriority;
  return map[key] ?? 2;
}
