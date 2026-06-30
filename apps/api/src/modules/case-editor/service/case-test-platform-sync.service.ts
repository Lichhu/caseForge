/**
 * 将智能生成案例平台的案例树同步至测管平台（b_project / b_case_test / b_case_operating_step）。
 */
import { flattenCaseTreeToExcel, normalizeCasePriority } from "@case-forge/shared";
import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { TEST_PLATFORM_CONNECTION } from "@common/test-platform";
import { TestPlatformCaseEntity } from "@common/test-platform/entity/test-platform-case.entity";
import { TestPlatformProjectEntity } from "@common/test-platform/entity/test-platform-project.entity";
import { CaseEditorEntity } from "@case-editor/entity/case-editor.entity";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { DataSource, Repository } from "typeorm";

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
    @InjectDataSource(TEST_PLATFORM_CONNECTION)
    private readonly testDataSource: DataSource,
  ) {}

  private buildCasePayload(input: {
    row: ReturnType<typeof flattenCaseTreeToExcel>["rows"][number];
    projectCode: string;
    testProjectId: string;
    operator: string;
  }): Partial<TestPlatformCaseEntity> {
    const caseNature = /反|负/.test(input.row.caseNature) ? 2 : 1;
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
      priority: mapPriority(input.row.priority),
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
}

function truncate(value: string, max: number) {
  const text = (value ?? "").trim();
  if (!text) {
    return undefined;
  }
  return text.length > max ? text.slice(0, max) : text;
}

function mapPriority(priority?: string): number {
  const normalized = normalizeCasePriority(priority);
  const levelMap = { 高: 1, 中: 2, 低: 3 } as const;
  return levelMap[normalized];
}
