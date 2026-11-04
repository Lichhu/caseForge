import { RequestContext } from "@common/audit/request-context";
import { RequirementPlatformService } from "./requirement-platform.service";

describe("RequirementPlatformService", () => {
  it("exposes the synced requirement version", () => {
    const service = new RequirementPlatformService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    expect(
      (service as any).toPublic({
        id: "r1",
        projectCode: "XQ-1",
        projectName: "需求一",
        versionName: "V1.1",
        status: "pending_dispatch",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).toMatchObject({ versionName: "V1.1" });
  });

  it("allows editing a requirement without treating its claimed project as a duplicate", async () => {
    const row = {
      id: "r1",
      projectCode: "XQ2026-9301-08",
      projectName: "代发工资批量文件加密通道迁移",
      applicationName: "ABX云柜服务平台",
      claimedProjectId: "p1",
      claimedBy: "alice",
      status: "testing",
    };
    const projectQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: "p1" }),
    };
    const requirementRepo = {
      findOne: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) => {
          if (where.id === "r1") return row;
          return null;
        },
      ),
      save: jest.fn(async (value) => value),
    };
    const projectRepo = {
      createQueryBuilder: jest.fn(() => projectQuery),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RequirementPlatformService(
      requirementRepo as any,
      { exists: jest.fn().mockResolvedValue(true) } as any,
      { exists: jest.fn().mockResolvedValue(true) } as any,
      projectRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      RequestContext.run("alice", () =>
        service.update("r1", {
          projectCode: "XQ2026-9301-08",
          projectName: "代发工资批量文件加密通道迁移",
          applicationName: "ABX云柜服务平台",
        }),
      ),
    ).resolves.toMatchObject({
      id: "r1",
      applicationName: "ABX云柜服务平台",
    });
    expect(projectRepo.update).toHaveBeenCalledWith("p1", {
      title: "代发工资批量文件加密通道迁移",
      requirementNo: "XQ2026-9301-08",
    });
  });

  it("updates the requirement version when editing", async () => {
    const row = {
      id: "r1",
      projectCode: "XQ2026-9301-08",
      projectName: "代发工资批量文件加密通道迁移",
      applicationName: "ABX云柜服务平台",
      versionName: "项目类版本",
      status: "testing",
    };
    const requirementRepo = {
      findOne: jest.fn().mockResolvedValue(row),
      save: jest.fn(async (value) => value),
    };
    const service = new RequirementPlatformService(
      requirementRepo as any,
      { exists: jest.fn().mockResolvedValue(true) } as any,
      { exists: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      RequestContext.run("alice", () =>
        service.update("r1", {
          projectName: "更新后的需求名",
          versionName: "客户定制版本 V3",
        }),
      ),
    ).resolves.toMatchObject({
      projectName: "更新后的需求名",
      versionName: "客户定制版本 V3",
    });
    expect(row.versionName).toBe("客户定制版本 V3");
  });

  it("stores a custom version when creating a requirement manually", async () => {
    const requirementRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        id: "r-created",
        ...value,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    };
    const projectQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const service = new RequirementPlatformService(
      requirementRepo as any,
      { exists: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      { createQueryBuilder: jest.fn(() => projectQuery) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      RequestContext.run("alice", () =>
        service.create({
          projectCode: "XQ2026-0818-01",
          projectName: "手工需求",
          versionName: "客户定制版本 V3",
          applicationName: "客户服务平台",
        }),
      ),
    ).resolves.toMatchObject({ versionName: "客户定制版本 V3" });
    expect(requirementRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectCode: "XQ2026-0818-01",
        versionName: "客户定制版本 V3",
      }),
    );
  });

  it("rejects invalid requirement codes and dangerous display characters", async () => {
    const service = new RequirementPlatformService(
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      { exists: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      RequestContext.run("alice", () =>
        service.create({
          projectCode: "XQ-MANUAL-1",
          projectName: "手工需求",
          versionName: "项目类版本",
          applicationName: "客户服务平台",
        }),
      ),
    ).rejects.toThrow("需求编号格式必须为");

    await expect(
      RequestContext.run("alice", () =>
        service.create({
          projectCode: "XQ2026-0818-01",
          projectName: "<script>alert(1)</script>",
          versionName: "项目类版本",
          applicationName: "客户服务平台",
        }),
      ),
    ).rejects.toThrow("需求名仅支持中英文、数字、空格及常用标点");
  });

  it("does not allow removing the system dispatcher", async () => {
    const service = new RequirementPlatformService(
      {} as any,
      {
        exists: jest.fn().mockResolvedValue(true),
        findOne: jest.fn().mockResolvedValue({
          id: "dispatcher-system",
          userName: "system",
        }),
        count: jest.fn().mockResolvedValue(2),
        softDelete: jest.fn(),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      RequestContext.run("system", () =>
        service.removeDispatcher("dispatcher-system"),
      ),
    ).rejects.toThrow("system 分发人不可移除");
  });

  it("only allows the system dispatcher to remove another dispatcher", async () => {
    const dispatcherRepo = {
      exists: jest.fn().mockResolvedValue(true),
      findOne: jest.fn().mockResolvedValue({
        id: "dispatcher-alice",
        userName: "alice",
      }),
      count: jest.fn().mockResolvedValue(2),
      softDelete: jest.fn(),
    };
    const service = new RequirementPlatformService(
      {} as any,
      dispatcherRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      RequestContext.run("alice", () =>
        service.removeDispatcher("dispatcher-alice"),
      ),
    ).rejects.toThrow("仅 system 分发人可移除分发人");
    expect(dispatcherRepo.softDelete).not.toHaveBeenCalled();
  });

  it("does not list the system dispatcher in the requirement pool", async () => {
    const dispatcherRepo = {
      exists: jest.fn().mockResolvedValue(true),
      find: jest.fn().mockResolvedValue([
        {
          id: "dispatcher-system",
          userName: "system",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          id: "dispatcher-alice",
          userName: "alice",
          createdAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      ]),
    };
    const service = new RequirementPlatformService(
      {} as any,
      dispatcherRepo as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
      {
        find: jest.fn().mockResolvedValue([
          { userName: "system", nickName: "system" },
          { userName: "alice", nickName: "张三" },
        ]),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      RequestContext.run("alice", () => service.listPoolMembers()),
    ).resolves.toEqual([
      expect.objectContaining({
        userName: "alice",
        nickName: "张三",
        isDispatcher: true,
      }),
    ]);
  });

  it("allows a regular pool member to view the member list", async () => {
    const service = new RequirementPlatformService(
      {} as any,
      {
        exists: jest.fn().mockResolvedValue(false),
        find: jest.fn().mockResolvedValue([]),
      } as any,
      {
        exists: jest.fn().mockResolvedValue(true),
        find: jest.fn().mockResolvedValue([
          {
            id: "member-alice",
            userName: "alice",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ]),
      } as any,
      {} as any,
      {
        find: jest
          .fn()
          .mockResolvedValue([{ userName: "alice", nickName: "张三" }]),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      RequestContext.run("alice", () => service.listPoolMembers()),
    ).resolves.toEqual([
      expect.objectContaining({
        userName: "alice",
        nickName: "张三",
      }),
    ]);
  });

  it("restores a soft-deleted dispatcher instead of inserting a duplicate", async () => {
    const dispatcherRepo = {
      exists: jest.fn().mockResolvedValue(true),
      findOne: jest.fn().mockResolvedValue({
        id: "dispatcher-wb10517",
        userName: "wb10517",
        deletedAt: new Date("2026-10-01T00:00:00.000Z"),
      }),
      restore: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      findOneByOrFail: jest.fn().mockResolvedValue({
        id: "dispatcher-wb10517",
        userName: "wb10517",
        remark: "恢复后的分发人",
      }),
      create: jest.fn(),
      save: jest.fn(),
    };
    const service = new RequirementPlatformService(
      {} as any,
      dispatcherRepo as any,
      {} as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue({ userName: "wb10517" }) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      RequestContext.run("alice", () =>
        service.addDispatcher({
          userName: "wb10517",
          remark: "恢复后的分发人",
        }),
      ),
    ).resolves.toMatchObject({
      id: "dispatcher-wb10517",
      userName: "wb10517",
    });
    expect(dispatcherRepo.restore).toHaveBeenCalledWith("dispatcher-wb10517");
    expect(dispatcherRepo.create).not.toHaveBeenCalled();
    expect(dispatcherRepo.save).not.toHaveBeenCalled();
  });
});
