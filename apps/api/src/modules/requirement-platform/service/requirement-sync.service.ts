/**
 * @file 需求平台同步服务：从测管平台库拉取 SIT 测试中的需求，
 * 经服管（SMP）serviceList 校验后增量写入本地需求表
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "@config/app-config.types";
import { TEST_PLATFORM_CONNECTION } from "@common/test-platform";
import { TestPlatformProjectEntity } from "@common/test-platform/entity/test-platform-project.entity";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { SmpClientService } from "@api-test/service/smp-client.service";
import { Repository } from "typeorm";
import { ApiRequirementEntity } from "../entity/api-requirement.entity";

/** 源库需求状态筛选值 */
const SOURCE_DEMAND_STATUS = "SIT测试";

/** 源库中需排除的项目 id */
const EXCLUDED_SOURCE_PROJECT_ID = "5669";

export interface RequirementSyncSummary {
  /** 新增入库条数 */
  added: number;
  /** 源库候选总数（SIT 测试中、非排除 id 且 code 非空） */
  candidates: number;
  /** SMP 校验失败或无数据被跳过的条数 */
  skipped: number;
}

@Injectable()
export class RequirementSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RequirementSyncService.name);
  private syncing = false;
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(ApiRequirementEntity)
    private readonly requirementRepo: Repository<ApiRequirementEntity>,
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
    @InjectRepository(TestPlatformProjectEntity, TEST_PLATFORM_CONNECTION)
    private readonly testProjectRepo: Repository<TestPlatformProjectEntity>,
    private readonly smpClient: SmpClientService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  /** 启动定时同步（间隔毫秒数可配，0 表示关闭） */
  onModuleInit() {
    const intervalMs =
      this.config.get("requirementPlatform", { infer: true })?.syncIntervalMs ??
      0;
    if (intervalMs > 0) {
      this.timer = setInterval(() => {
        this.sync("scheduled").catch((error) => {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(`需求定时同步失败: ${message}`);
        });
      }, intervalMs);
      this.logger.log(`需求定时同步已启用，间隔 ${intervalMs}ms`);
    }
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** 是否正在同步（前端轮询/按钮置灰用） */
  isSyncing(): boolean {
    return this.syncing;
  }

  /**
   * 同步需求：源库筛选 → 本地/项目去重 → 逐条 SMP 校验 → 增量入库（只增不删）
   * @param trigger - 触发方式（手动 / 定时），用于日志区分
   */
  async sync(trigger: "manual" | "scheduled"): Promise<RequirementSyncSummary> {
    if (this.syncing) {
      throw new BadRequestException("需求同步进行中，请稍后再试");
    }
    this.syncing = true;
    try {
      const sourceProjects = await this.testProjectRepo.find({
        where: { demandStatus: SOURCE_DEMAND_STATUS },
      });
      const candidates = sourceProjects.filter(
        (project) =>
          project.id !== EXCLUDED_SOURCE_PROJECT_ID &&
          Boolean(project.projectCode?.trim()),
      );

      const existingCodes = await this.collectExcludedCodes();

      let added = 0;
      let skipped = 0;
      for (const project of candidates) {
        const projectCode = project.projectCode!.trim();
        if (existingCodes.has(projectCode)) {
          continue;
        }
        if (!(await this.passSmpCheck(projectCode))) {
          skipped += 1;
          continue;
        }
        try {
          await this.requirementRepo.save(
            this.requirementRepo.create({
              projectCode,
              projectName: project.projectName?.trim() || projectCode,
              status: "pending_dispatch",
            }),
          );
          added += 1;
        } catch (error) {
          // 唯一索引冲突视为已存在（并发同步兜底），其余错误向上抛
          if (!this.isDuplicateKeyError(error)) {
            throw error;
          }
        }
      }

      this.logger.log(
        `需求同步完成（${trigger}）：候选 ${candidates.length}，新增 ${added}，SMP 跳过 ${skipped}`,
      );
      return { added, candidates: candidates.length, skipped };
    } finally {
      this.syncing = false;
    }
  }

  /** 收集排除集合：本地需求表已有 code + 接口测试项目已用需求编号 */
  private async collectExcludedCodes(): Promise<Set<string>> {
    const localRows = await this.requirementRepo.find({
      select: ["projectCode"],
    });
    const projectRows = await this.projectRepo.find({
      where: { platform: "api-test" },
      select: ["requirementNo"],
    });
    const codes = new Set<string>();
    for (const row of localRows) {
      codes.add(row.projectCode);
    }
    for (const row of projectRows) {
      const requirementNo = row.requirementNo?.trim();
      if (requirementNo) {
        codes.add(requirementNo);
      }
    }
    return codes;
  }

  /** SMP serviceList 有数据才算满足条件；单条失败仅跳过并记日志 */
  private async passSmpCheck(projectCode: string): Promise<boolean> {
    try {
      const response = await this.smpClient.selectServiceInfoList(projectCode);
      return response.bizResCode === "000000" && response.data.length > 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`SMP 校验失败，跳过需求 ${projectCode}: ${message}`);
      return false;
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    const code = (error as { code?: string } | null)?.code;
    const message = error instanceof Error ? error.message : String(error);
    return code === "ER_DUP_ENTRY" || message.includes("Duplicate entry");
  }
}
