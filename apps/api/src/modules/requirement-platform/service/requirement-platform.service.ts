/**
 * @file 需求平台业务服务：需求列表、分发、认领、拒绝与认领候选人查询
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import {
  ApiRequirementEntity,
  type ApiRequirementStatus,
} from "../entity/api-requirement.entity";
import { ApiRequirementDispatcherEntity } from "../entity/api-requirement-dispatcher.entity";
import { TEST_PLATFORM_CONNECTION } from "@common/test-platform";
import { TestPlatformSysUserEntity } from "@common/test-platform/entity/test-platform-sys-user.entity";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { getScopedUserName } from "@common/audit/user-scope";
import { DataSource, EntityManager, Repository } from "typeorm";
import {
  RequirementSyncService,
  type RequirementSyncSummary,
} from "./requirement-sync.service";
import { RequirementNotifyService } from "./requirement-notify.service";

/** 需求平台对外返回结构 */
export interface PublicRequirement {
  id: string;
  projectCode: string;
  projectName: string;
  status: ApiRequirementStatus;
  dispatchedTo?: string | null;
  dispatchedToName?: string | null;
  dispatchedBy?: string | null;
  dispatchedAt?: Date | null;
  claimedBy?: string | null;
  claimedByName?: string | null;
  claimedAt?: Date | null;
  claimedProjectId?: string | null;
  refuseReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class RequirementPlatformService {
  constructor(
    @InjectRepository(ApiRequirementEntity)
    private readonly requirementRepo: Repository<ApiRequirementEntity>,
    @InjectRepository(ApiRequirementDispatcherEntity)
    private readonly dispatcherRepo: Repository<ApiRequirementDispatcherEntity>,
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
    @InjectRepository(TestPlatformSysUserEntity, TEST_PLATFORM_CONNECTION)
    private readonly sysUserRepo: Repository<TestPlatformSysUserEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly syncService: RequirementSyncService,
    private readonly notifyService: RequirementNotifyService,
  ) {}

  /**
   * 需求列表：分发人可见全量；普通用户仅可见分发给自己待认领的 + 自己已认领的
   */
  async list(): Promise<{
    rows: PublicRequirement[];
    count: number;
    isDispatcher: boolean;
    syncing: boolean;
  }> {
    const userName = getScopedUserName();
    const isDispatcher = await this.isDispatcher(userName);
    const rows = isDispatcher
      ? await this.requirementRepo.find({ order: { createdAt: "ASC" } })
      : await this.requirementRepo.find({
          where: [
            { status: "pending_claim", dispatchedTo: userName },
            { status: "claimed", claimedBy: userName },
          ],
          order: { createdAt: "ASC" },
        });
    return {
      rows: rows.map((row) => this.toPublic(row)),
      count: rows.length,
      isDispatcher,
      syncing: this.syncService.isSyncing(),
    };
  }

  /** 手动同步（仅分发人）：源库筛选 + 服管校验 + 增量入库 */
  async sync(): Promise<RequirementSyncSummary> {
    await this.assertDispatcher();
    return this.syncService.sync("manual");
  }

  /** 认领候选人：源库正常状态的在职用户 */
  async listClaimCandidates(): Promise<
    Array<{ userName: string; nickName: string }>
  > {
    await this.assertDispatcher();
    const users = await this.sysUserRepo.find({
      where: { status: "0", delFlag: "0" },
      order: { id: "ASC" },
    });
    return users.map((user) => ({
      userName: user.userName,
      nickName: user.nickName,
    }));
  }

  /**
   * 分发：指定认领候选人，需求进入待认领；已认领的需求不可再分发
   */
  async dispatch(id: string, dispatchedTo: string): Promise<PublicRequirement> {
    await this.assertDispatcher();
    const requirement = await this.findRequirement(id);
    if (requirement.status === "claimed") {
      throw new BadRequestException("需求已认领，无法再次分发");
    }
    const candidate = await this.sysUserRepo.findOne({
      where: { userName: dispatchedTo, status: "0", delFlag: "0" },
    });
    if (!candidate) {
      throw new BadRequestException("认领候选人不存在或已停用");
    }

    requirement.status = "pending_claim";
    requirement.dispatchedTo = candidate.userName;
    requirement.dispatchedToName = candidate.nickName;
    requirement.dispatchedBy = getScopedUserName();
    requirement.dispatchedAt = new Date();
    requirement.refuseReason = null;
    requirement.overdueNotifiedAt = null;
    await this.requirementRepo.save(requirement);
    this.notifyService.notifyDispatched(requirement);
    return this.toPublic(requirement);
  }

  /**
   * 认领：仅被分发人可认领；事务内自动创建接口测试项目并回写认领信息
   */
  async claim(id: string): Promise<PublicRequirement> {
    const userName = getScopedUserName();
    const requirement = await this.findRequirement(id);
    if (requirement.status !== "pending_claim") {
      throw new BadRequestException("需求当前状态不可认领");
    }
    if (requirement.dispatchedTo !== userName) {
      throw new ForbiddenException("该需求未分发给你，无法认领");
    }

    const duplicated = await this.projectRepo.findOne({
      where: { platform: "api-test", requirementNo: requirement.projectCode },
      select: ["id"],
    });
    if (duplicated) {
      throw new BadRequestException(
        `需求编号 ${requirement.projectCode} 已存在接口测试项目，无法认领`,
      );
    }

    const sysUser = await this.sysUserRepo.findOne({
      where: { userName },
      select: ["nickName"],
    });

    await this.dataSource.transaction(async (manager) => {
      const project = await this.createClaimProject(manager, requirement);
      const requirementRepo = manager.getRepository(ApiRequirementEntity);
      requirement.status = "claimed";
      requirement.claimedBy = userName;
      requirement.claimedByName = sysUser?.nickName ?? userName;
      requirement.claimedAt = new Date();
      requirement.claimedProjectId = project.id;
      requirement.refuseReason = null;
      await requirementRepo.save(requirement);
    });
    this.notifyService.notifyClaimed(requirement);
    return this.toPublic(requirement);
  }

  /**
   * 拒绝认领：仅被分发人可操作，需求回到待分发并清空指派信息
   */
  async refuse(id: string, reason?: string): Promise<PublicRequirement> {
    const userName = getScopedUserName();
    const requirement = await this.findRequirement(id);
    if (requirement.status !== "pending_claim") {
      throw new BadRequestException("需求当前状态不可拒绝认领");
    }
    if (requirement.dispatchedTo !== userName) {
      throw new ForbiddenException("该需求未分发给你，无法拒绝");
    }

    // 拒绝后需通知分发人/改派人，而 update 会清空 dispatchedBy，先捕获
    const dispatcher = requirement.dispatchedBy ?? null;
    const refuser = await this.sysUserRepo.findOne({
      where: { userName },
      select: ["nickName"],
    });

    await this.requirementRepo.update(id, {
      status: "pending_dispatch",
      dispatchedTo: null,
      dispatchedToName: null,
      dispatchedBy: null,
      dispatchedAt: null,
      refuseReason: reason?.trim() || null,
      overdueNotifiedAt: null,
    });
    if (dispatcher) {
      this.notifyService.notifyRefused(
        requirement,
        dispatcher,
        refuser?.nickName ?? userName,
        reason,
      );
    }
    return this.toPublic({
      ...requirement,
      status: "pending_dispatch",
      dispatchedTo: undefined,
      dispatchedToName: undefined,
      dispatchedBy: undefined,
      dispatchedAt: undefined,
      refuseReason: reason?.trim() || undefined,
    });
  }

  /** 认领时自动创建接口测试项目：需求编号 = project_code，标题 = project_name */
  private async createClaimProject(
    manager: EntityManager,
    requirement: ApiRequirementEntity,
  ): Promise<CaseProjectEntity> {
    const userName = getScopedUserName();
    const projectRepo = manager.getRepository(CaseProjectEntity);
    return projectRepo.save(
      projectRepo.create({
        title: requirement.projectName,
        description: "",
        requirementNo: requirement.projectCode,
        platform: "api-test",
        createdBy: userName,
        modifiedBy: userName,
      }),
    );
  }

  private async findRequirement(id: string): Promise<ApiRequirementEntity> {
    const requirement = await this.requirementRepo.findOne({ where: { id } });
    if (!requirement) {
      throw new NotFoundException("需求不存在");
    }
    return requirement;
  }

  private async isDispatcher(userName: string): Promise<boolean> {
    return this.dispatcherRepo.exists({ where: { userName } });
  }

  private async assertDispatcher(): Promise<void> {
    if (!(await this.isDispatcher(getScopedUserName()))) {
      throw new ForbiddenException("仅分发人可执行该操作");
    }
  }

  private toPublic(row: ApiRequirementEntity): PublicRequirement {
    return {
      id: row.id,
      projectCode: row.projectCode,
      projectName: row.projectName,
      status: row.status,
      dispatchedTo: row.dispatchedTo,
      dispatchedToName: row.dispatchedToName,
      dispatchedBy: row.dispatchedBy,
      dispatchedAt: row.dispatchedAt,
      claimedBy: row.claimedBy,
      claimedByName: row.claimedByName,
      claimedAt: row.claimedAt,
      claimedProjectId: row.claimedProjectId,
      refuseReason: row.refuseReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
