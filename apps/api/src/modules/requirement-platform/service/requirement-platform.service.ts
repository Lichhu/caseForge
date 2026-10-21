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
import { DataSource, EntityManager, In, Repository } from "typeorm";
import {
  RequirementSyncService,
  type RequirementSyncSummary,
} from "./requirement-sync.service";
import { RequirementNotifyService } from "./requirement-notify.service";
import { TestPlatformProjectEntity } from "@common/test-platform/entity/test-platform-project.entity";
import { CreateRequirementDto } from "../dto/create-requirement.dto";
import { UpdateRequirementDto } from "../dto/update-requirement.dto";
import { UpdateDispatcherDto } from "../dto/update-dispatcher.dto";
import { ApiRequirementMemberEntity } from "../entity/api-requirement-member.entity";

/** 需求平台对外返回结构 */
export interface PublicRequirement {
  id: string;
  projectCode: string;
  projectName: string;
  applicationName?: string | null;
  status: ApiRequirementStatus;
  dispatchedTo?: string | null;
  dispatchedToName?: string | null;
  dispatchedBy?: string | null;
  dispatchedAt?: Date | null;
  claimedBy?: string | null;
  claimedByName?: string | null;
  claimedAt?: Date | null;
  claimedProjectId?: string | null;
  completedAt?: Date | null;
  sourceUpdatedAt?: Date | null;
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
    @InjectRepository(ApiRequirementMemberEntity)
    private readonly memberRepo: Repository<ApiRequirementMemberEntity>,
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
    @InjectRepository(TestPlatformSysUserEntity, TEST_PLATFORM_CONNECTION)
    private readonly sysUserRepo: Repository<TestPlatformSysUserEntity>,
    @InjectRepository(TestPlatformProjectEntity, TEST_PLATFORM_CONNECTION)
    private readonly sourceProjectRepo: Repository<TestPlatformProjectEntity>,
    @InjectDataSource(TEST_PLATFORM_CONNECTION)
    private readonly testDb: DataSource,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly syncService: RequirementSyncService,
    private readonly notifyService: RequirementNotifyService,
  ) {}

  /**
   * 需求列表：人员池成员和分发人可见全量，其他用户不可见
   */
  async list(options: {
    page: number;
    size: number;
    status?: string;
    keyword?: string;
    owner?: string;
    application?: string;
  }): Promise<{
    rows: PublicRequirement[];
    count: number;
    isDispatcher: boolean;
    isMember: boolean;
    ownerOptions: Array<{ userName: string; nickName: string }>;
    syncing: boolean;
    page: number;
    size: number;
  }> {
    const userName = getScopedUserName();
    const isDispatcher = await this.isDispatcher(userName);
    const isMember = (await this.isPoolMember(userName)) && !isDispatcher;
    if (!isDispatcher && !isMember) {
      throw new ForbiddenException("仅人员池成员和分发人可查看需求数据");
    }
    const page = Math.max(1, Math.floor(options.page || 1));
    const size = Math.min(100, Math.max(1, Math.floor(options.size || 20)));
    const query = this.requirementRepo.createQueryBuilder("requirement");
    if (options.status && options.status !== "all") {
      query.andWhere("requirement.status = :status", {
        status: options.status,
      });
    }
    const keyword = options.keyword?.trim();
    if (keyword) {
      query.andWhere(
        "(requirement.projectCode LIKE :keyword OR requirement.projectName LIKE :keyword)",
        {
          keyword: `%${keyword}%`,
        },
      );
    }
    const owner = options.owner?.trim();
    if (owner) {
      if (options.status !== "pending_dispatch") {
        query.andWhere(
          "(requirement.createdBy = :owner OR requirement.dispatchedBy = :owner OR requirement.dispatchedTo = :owner OR requirement.claimedBy = :owner)",
          { owner },
        );
      }
    }
    const application = options.application?.trim();
    if (application) {
      // 手工创建的需求直接存了应用快照；同步入库的需求应用名来自源库 b_project
      const matchedProjects = await this.sourceProjectRepo.find({
        where: { applicationName: application, dataStatus: 0 },
        select: ["projectCode"],
      });
      const projectCodes = matchedProjects
        .map((project) => project.projectCode?.trim())
        .filter((code): code is string => Boolean(code));
      if (projectCodes.length) {
        query.andWhere(
          "(requirement.applicationName = :application OR requirement.projectCode IN (:...projectCodes))",
          { application, projectCodes },
        );
      } else {
        query.andWhere("requirement.applicationName = :application", {
          application,
        });
      }
    }
    query
      .orderBy("requirement.createdAt", "DESC")
      .skip((page - 1) * size)
      .take(size);
    const [rows, count] = await query.getManyAndCount();
    const sourceProjects = rows.length
      ? await this.sourceProjectRepo.find({
          where: {
            projectCode: In(rows.map((row) => row.projectCode)),
            dataStatus: 0,
          },
          select: ["projectCode", "applicationName"],
        })
      : [];
    const applicationNameByCode = new Map(
      sourceProjects.map((project) => [
        project.projectCode,
        project.applicationName?.trim() || null,
      ]),
    );
    const members = await this.memberRepo.find({ order: { createdAt: "ASC" } });
    const dispatchers = await this.dispatcherRepo.find({
      order: { createdAt: "ASC" },
    });
    const users = await this.sysUserRepo.find({
      where: { status: "0", delFlag: "0" },
    });
    const nameByUser = new Map(
      users.map((user) => [user.userName, user.nickName]),
    );
    const ownerUserNames = [
      ...new Set([
        ...members.map((member) => member.userName),
        ...dispatchers.map((dispatcher) => dispatcher.userName),
      ]),
    ];
    return {
      rows: rows.map((row) => ({
        ...this.toPublic(row),
        applicationName:
          row.applicationName?.trim() ||
          applicationNameByCode.get(row.projectCode) ||
          null,
      })),
      count,
      isDispatcher,
      isMember,
      ownerOptions: ownerUserNames.map((userName) => ({
        userName,
        nickName: nameByUser.get(userName) ?? userName,
      })),
      syncing: this.syncService.isSyncing(),
      page,
      size,
    };
  }

  async create(dto: CreateRequirementDto): Promise<PublicRequirement> {
    const userName = getScopedUserName();
    await this.assertRequirementViewer();
    const projectCode = dto.projectCode.trim();
    const projectName = dto.projectName.trim();
    const applicationName = dto.applicationName.trim();
    if (!projectCode || !projectName || !applicationName) {
      throw new BadRequestException("需求编号、需求名和所属应用必填");
    }
    await this.assertCodeAvailable(projectCode);
    const deletedRow = await this.requirementRepo.findOne({
      where: { projectCode },
      withDeleted: true,
    });
    let row: ApiRequirementEntity;
    if (deletedRow?.deletedAt) {
      row = await this.dataSource.transaction(async (manager) => {
        const requirementRepo = manager.getRepository(ApiRequirementEntity);
        await requirementRepo.restore(deletedRow.id);
        await requirementRepo.update(deletedRow.id, {
          projectName,
          applicationName,
          createdBy: userName,
          status: "pending_dispatch",
          dispatchedTo: null,
          dispatchedToName: null,
          dispatchedBy: null,
          dispatchedAt: null,
          claimedBy: null,
          claimedByName: null,
          claimedAt: null,
          claimedProjectId: null,
          completedAt: null,
          sourceUpdatedAt: null,
          refuseReason: null,
          overdueNotifiedAt: null,
        });
        return requirementRepo.findOneByOrFail({ id: deletedRow.id });
      });
    } else {
      row = await this.requirementRepo.save(
        this.requirementRepo.create({
          projectCode,
          projectName,
          applicationName,
          createdBy: userName,
          status: "pending_dispatch",
        }),
      );
    }
    return this.toPublic(row);
  }

  async listApplications(): Promise<string[]> {
    await this.assertRequirementViewer();
    const rows = await this.testDb.query<Array<{ systemName: string }>>(
      "SELECT system_name AS systemName FROM b_asset_common_system_tree WHERE parent_id = ? AND data_status = 0 ORDER BY system_name",
      [1],
    );
    return rows.map((row) => row.systemName.trim()).filter(Boolean);
  }

  async update(
    id: string,
    dto: UpdateRequirementDto,
  ): Promise<PublicRequirement> {
    const row = await this.findRequirement(id);
    await this.assertRequirementEditor(row);
    if (dto.projectCode !== undefined) {
      const code = dto.projectCode.trim();
      if (!code) throw new BadRequestException("需求编号必填");
      await this.assertCodeAvailable(code, id, row.claimedProjectId ?? undefined);
      row.projectCode = code;
    }
    if (dto.projectName !== undefined) {
      const name = dto.projectName.trim();
      if (!name) throw new BadRequestException("需求名必填");
      row.projectName = name;
    }
    if (dto.applicationName !== undefined) {
      const applicationName = dto.applicationName.trim();
      if (!applicationName) {
        throw new BadRequestException("归属应用必填");
      }
      row.applicationName = applicationName;
    }
    await this.requirementRepo.save(row);
    if (row.claimedProjectId) {
      await this.projectRepo.update(row.claimedProjectId, {
        title: row.projectName,
        requirementNo: row.projectCode,
      });
    }
    return this.toPublic(row);
  }

  async remove(id: string) {
    await this.assertDispatcher();
    const row = await this.findRequirement(id);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ApiRequirementEntity).softDelete(row.id);
      const projectRepo = manager.getRepository(CaseProjectEntity);
      const projectQuery = projectRepo
        .createQueryBuilder()
        .softDelete()
        .where("platform = :platform", { platform: "api-test" })
        .andWhere(
          row.claimedProjectId
            ? "(id = :projectId OR requirementNo = :projectCode)"
            : "requirementNo = :projectCode",
          { projectId: row.claimedProjectId, projectCode: row.projectCode },
        );
      await projectQuery.execute();
    });
    return { id, deleted: true };
  }

  async listDispatchers() {
    await this.assertDispatcher();
    return this.dispatcherRepo.find({ order: { createdAt: "ASC" } });
  }

  async addDispatcher(dto: UpdateDispatcherDto) {
    await this.assertDispatcher();
    const userName = dto.userName.trim();
    if (!userName) throw new BadRequestException("分发人账号必填");
    const user = await this.sysUserRepo.findOne({
      where: { userName, status: "0", delFlag: "0" },
    });
    if (!user) throw new BadRequestException("用户不存在或已停用");
    const existing = await this.dispatcherRepo.findOne({ where: { userName } });
    if (existing) return existing;
    const member = await this.memberRepo.findOne({
      where: { userName },
      withDeleted: true,
    });
    if (member?.deletedAt) await this.memberRepo.restore(member.id);
    return this.dispatcherRepo.save(
      this.dispatcherRepo.create({
        userName,
        remark: dto.remark?.trim() || null,
      }),
    );
  }

  async removeDispatcher(id: string) {
    await this.assertDispatcher();
    if ((await this.dispatcherRepo.count()) <= 1) {
      throw new BadRequestException("至少保留一名分发人");
    }
    await this.dispatcherRepo.softDelete(id);
    return { id, deleted: true };
  }

  async setStatus(id: string, status: "testing" | "completed") {
    const row = await this.findRequirement(id);
    await this.assertRequirementEditor(row);
    if (status === "completed" && row.status !== "testing") {
      throw new BadRequestException("仅测试中的需求可以标记为已完成");
    }
    if (
      status === "testing" &&
      row.status !== "returned" &&
      row.status !== "completed"
    ) {
      throw new BadRequestException("仅已打回的需求可以恢复为测试中");
    }
    row.status = status;
    row.completedAt = status === "completed" ? new Date() : null;
    if (status === "testing") row.sourceUpdatedAt = null;
    await this.requirementRepo.save(row);
    return this.toPublic(row);
  }

  async assertProjectOperational(projectId: string) {
    const requirement = await this.requirementRepo.findOne({
      where: { claimedProjectId: projectId },
    });
    if (!requirement) return;
    await this.assertRequirementEditor(requirement);
    if (requirement.status !== "testing") {
      throw new ForbiddenException("仅测试中的需求可以操作项目");
    }
  }

  async refreshReturnedRequirements() {
    const completed = await this.requirementRepo.find({
      where: { status: "completed" },
    });
    for (const row of completed) {
      if (!row.claimedProjectId) continue;
      const source = await this.sourceProjectRepo.findOne({
        where: { projectCode: row.projectCode, dataStatus: 0 },
      });
      if (!source) continue;
      row.sourceUpdatedAt = new Date();
      if (source.demandStatus?.trim().toLowerCase() === "sit移交") {
        row.status = "returned";
        row.completedAt = null;
        await this.requirementRepo.save(row);
      }
    }
  }

  private async assertRequirementViewer() {
    const user = getScopedUserName();
    if (!(await this.isDispatcher(user)) && !(await this.isPoolMember(user))) {
      throw new ForbiddenException("仅人员池成员和分发人可查看需求数据");
    }
  }

  private async assertRequirementEditor(row: ApiRequirementEntity) {
    const user = getScopedUserName();
    if ((await this.isDispatcher(user)) || row.claimedBy === user) return;
    throw new ForbiddenException("仅需求归属人或分发人可操作");
  }

  private async assertCodeAvailable(
    projectCode: string,
    excludeRequirementId?: string,
    excludeProjectId?: string,
  ) {
    const duplicate = await this.requirementRepo.findOne({
      where: { projectCode },
    });
    if (duplicate && duplicate.id !== excludeRequirementId)
      throw new BadRequestException(`需求编号 ${projectCode} 已存在`);
    const project = await this.projectRepo
      .createQueryBuilder("project")
      .where("project.platform = :platform", { platform: "api-test" })
      .andWhere("project.requirementNo = :projectCode", { projectCode })
      .andWhere("project.deleted_at IS NULL")
      .getOne();
    if (project && project.id !== excludeProjectId)
      throw new BadRequestException(`需求编号 ${projectCode} 已存在接口项目`);
  }

  private async isPoolMember(userName: string) {
    return (
      (await this.dispatcherRepo.exists({ where: { userName } })) ||
      this.memberRepo.exists({ where: { userName } })
    );
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
    const pool = await this.memberRepo.find({ select: ["userName"] });
    const dispatchers = await this.dispatcherRepo.find({
      select: ["userName"],
    });
    const accounts = [
      ...new Set([...pool, ...dispatchers].map((row) => row.userName)),
    ];
    const users = accounts.length
      ? await this.sysUserRepo.find({
          where: { status: "0", delFlag: "0" },
          order: { id: "ASC" },
        })
      : [];
    return users
      .filter((user) => accounts.includes(user.userName))
      .map((user) => ({
        userName: user.userName,
        nickName: user.nickName,
      }));
  }

  async addPoolMember(dto: UpdateDispatcherDto) {
    await this.assertDispatcher();
    const userName = dto.userName.trim();
    const user = await this.sysUserRepo.findOne({
      where: { userName, status: "0", delFlag: "0" },
    });
    if (!user) throw new BadRequestException("用户不存在或已停用");
    const existing = await this.memberRepo.findOne({ where: { userName } });
    if (existing) return existing;
    const deleted = await this.memberRepo.findOne({
      where: { userName },
      withDeleted: true,
    });
    if (deleted?.deletedAt) {
      await this.memberRepo.restore(deleted.id);
      return this.memberRepo.findOneByOrFail({ id: deleted.id });
    }
    return this.memberRepo.save(
      this.memberRepo.create({ userName, remark: dto.remark?.trim() || null }),
    );
  }

  async listPoolMembers() {
    await this.assertDispatcher();
    const members = await this.memberRepo.find({ order: { createdAt: "ASC" } });
    const dispatchers = await this.dispatcherRepo.find({
      order: { createdAt: "ASC" },
    });
    const rows = [
      ...members,
      ...dispatchers.map((row) => ({
        id: `dispatcher:${row.id}`,
        userName: row.userName,
        remark: row.remark,
        createdAt: row.createdAt,
        isDispatcher: true,
      })),
    ];
    const users = await this.sysUserRepo.find({
      where: { status: "0", delFlag: "0" },
    });
    const nameByUser = new Map(
      users.map((user) => [user.userName, user.nickName]),
    );
    return rows.map((row) => ({
      ...row,
      nickName: nameByUser.get(row.userName) ?? row.userName,
    }));
  }

  async searchPoolCandidates(keyword = "") {
    await this.assertDispatcher();
    const input = keyword.trim();
    const query = this.sysUserRepo
      .createQueryBuilder("user")
      .where("user.status = :status AND user.delFlag = :delFlag", {
        status: "0",
        delFlag: "0",
      });
    if (input) {
      query.andWhere(
        "(user.userName LIKE :keyword OR user.nickName LIKE :keyword)",
        { keyword: `%${input}%` },
      );
    }
    const users = await query.orderBy("user.nickName", "ASC").getMany();
    const pool = await this.memberRepo.find({ select: ["userName"] });
    const dispatchers = await this.dispatcherRepo.find({
      select: ["userName"],
    });
    const existing = new Set(
      [...pool, ...dispatchers].map((row) => row.userName),
    );
    return users
      .filter((user) => !existing.has(user.userName))
      .map((user) => ({
        userName: user.userName,
        nickName: user.nickName,
      }));
  }

  async removePoolMember(id: string) {
    await this.assertDispatcher();
    await this.memberRepo.softDelete(id);
    return { id, deleted: true };
  }

  /**
   * 分发：指定受理候选人，需求进入待受理
   */
  async dispatch(id: string, dispatchedTo: string): Promise<PublicRequirement> {
    await this.assertDispatcher();
    const requirement = await this.findRequirement(id);
    if (requirement.status !== "pending_dispatch") {
      throw new BadRequestException("当前需求状态不可分发");
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
   * 认领：人员池成员可直接认领待分发需求，或认领分发给自己的需求
   */
  async claim(id: string): Promise<PublicRequirement> {
    const userName = getScopedUserName();
    const requirement = await this.findRequirement(id);
    if (
      requirement.status !== "pending_claim" &&
      requirement.status !== "pending_dispatch"
    ) {
      throw new BadRequestException("需求当前状态不可认领");
    }
    if (!(await this.isPoolMember(userName))) {
      throw new ForbiddenException("仅人员池成员可以认领需求");
    }
    if (
      requirement.status === "pending_claim" &&
      requirement.dispatchedTo !== userName
    ) {
      throw new ForbiddenException("该需求未分发给你，无法认领");
    }

    const duplicated = await this.projectRepo
      .createQueryBuilder("project")
      .select("project.id")
      .where("project.platform = :platform", { platform: "api-test" })
      .andWhere("project.requirementNo = :projectCode", {
        projectCode: requirement.projectCode,
      })
      .andWhere("project.deleted_at IS NULL")
      .getOne();
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
      requirement.status = "testing";
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
      applicationName: row.applicationName,
      status: row.status,
      dispatchedTo: row.dispatchedTo,
      dispatchedToName: row.dispatchedToName,
      dispatchedBy: row.dispatchedBy,
      dispatchedAt: row.dispatchedAt,
      claimedBy: row.claimedBy,
      claimedByName: row.claimedByName,
      claimedAt: row.claimedAt,
      claimedProjectId: row.claimedProjectId,
      completedAt: row.completedAt,
      sourceUpdatedAt: row.sourceUpdatedAt,
      refuseReason: row.refuseReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
