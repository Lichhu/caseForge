import { RequestContext } from "@common/audit/request-context";
import { ProjectManageService } from "./project-manage.service";

function createService(canViewAllRequirements = false) {
  const andWhere = jest.fn().mockReturnThis();
  const query = {
    where: jest.fn().mockReturnThis(),
    andWhere,
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    clone: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  const projectRepo = {
    createQueryBuilder: jest.fn(() => query),
  };
  const service = new ProjectManageService(
    projectRepo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      canViewAllRequirements: jest
        .fn()
        .mockResolvedValue(canViewAllRequirements),
    } as never,
  );
  return { service, andWhere };
}

function findRequirementStatusCondition(andWhere: jest.Mock) {
  return andWhere.mock.calls.find(
    ([sql]) =>
      typeof sql === "string" &&
      sql.includes("FROM api_requirement req") &&
      sql.includes("requirementStatuses"),
  );
}

describe("ProjectManageService api-test project visibility", () => {
  it("lets dispatchers list all api-test projects without user scope", async () => {
    const { service, andWhere } = createService(true);

    await RequestContext.run("wb10517", () =>
      service.listProjects(1, 10, "", "api-test", undefined, "all"),
    );

    expect(
      andWhere.mock.calls.some(
        ([sql]) =>
          typeof sql === "string" && sql.includes("createdBy = :__scopedUser"),
      ),
    ).toBe(false);
  });

  it("keeps user scope for regular users", async () => {
    const { service, andWhere } = createService(false);

    await RequestContext.run("alice", () =>
      service.listProjects(1, 10, "", "api-test", undefined, "all"),
    );

    expect(andWhere).toHaveBeenCalledWith("project.createdBy = :__scopedUser", {
      __scopedUser: "alice",
    });
  });
});

describe("ProjectManageService requirement status times", () => {
  function buildListService(requirement: Record<string, unknown>) {
    const project = {
      id: "p1",
      title: "代发工资批量文件加密通道迁移",
      description: "",
      platform: "api-test",
      requirementNo: "XQ2026-9301-08",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-19T09:00:00.000Z"),
    };
    const countQuery = (rows: unknown[] = []) => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    });
    const listQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
      getManyAndCount: jest.fn().mockResolvedValue([[project], 1]),
    };
    return new ProjectManageService(
      { createQueryBuilder: jest.fn(() => listQuery) } as never,
      { createQueryBuilder: jest.fn(() => countQuery()) } as never,
      { createQueryBuilder: jest.fn(() => countQuery()) } as never,
      { createQueryBuilder: jest.fn(() => countQuery()) } as never,
      {
        createQueryBuilder: jest.fn(() => countQuery()),
        find: jest.fn().mockResolvedValue([requirement]),
      } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {
        canViewAllRequirements: jest.fn().mockResolvedValue(false),
      } as never,
    );
  }

  it("returns the requirement completedAt for completed list rows", async () => {
    const completedAt = new Date("2026-08-19T08:59:00.000Z");
    const service = buildListService({
      id: "r1",
      projectCode: "XQ2026-9301-08",
      projectName: "代发工资批量文件加密通道迁移",
      status: "completed",
      completedAt,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      claimedBy: "alice",
      createdBy: "alice",
    });

    const result = await RequestContext.run("alice", () =>
      service.listProjects(1, 10, "", "api-test", undefined, "completed"),
    );

    expect(result.rows[0]).toMatchObject({
      requirementId: "r1",
      requirementStatus: "completed",
      requirementCompletedAt: completedAt,
    });
  });

  it("returns the return time for returned list rows", async () => {
    const returnedAt = new Date("2026-08-20T10:30:00.000Z");
    const service = buildListService({
      id: "r1",
      projectCode: "XQ2026-9301-08",
      projectName: "代发工资批量文件加密通道迁移",
      status: "returned",
      completedAt: null,
      sourceUpdatedAt: returnedAt,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      claimedBy: "alice",
      createdBy: "alice",
    });

    const result = await RequestContext.run("alice", () =>
      service.listProjects(1, 10, "", "api-test", undefined, "returned"),
    );

    expect(result.rows[0]).toMatchObject({
      requirementId: "r1",
      requirementStatus: "returned",
      requirementReturnedAt: returnedAt,
    });
  });

  it("marks canEditRemark false for users other than the requirement owner", async () => {
    const service = buildListService({
      id: "r1",
      projectCode: "XQ2026-9301-08",
      projectName: "代发工资批量文件加密通道迁移",
      status: "testing",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      claimedBy: "alice",
      createdBy: "alice",
    });

    const result = await RequestContext.run("system", () =>
      service.listProjects(1, 10, "", "api-test", undefined, "testing"),
    );

    expect(result.rows[0]).toMatchObject({ canEditRemark: false });
  });
});

describe("ProjectManageService api-test remark update", () => {
  function createProjectService(
    requirementPlatform: {
      assertProjectOperational: jest.Mock;
    },
    overrides: {
      project?: Record<string, unknown>;
      requirement?: Record<string, unknown> | null;
    } = {},
  ) {
    const project = {
      id: "p1",
      title: "代发工资需求",
      description: "",
      platform: "api-test",
      createdBy: "alice",
      ...overrides.project,
    };
    const projectRepo = {
      findOne: jest.fn().mockResolvedValue(project),
      save: jest.fn(async (value) => value),
    };
    const apiRequirementRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue(
          overrides.requirement === undefined
            ? { claimedBy: "alice" }
            : overrides.requirement,
        ),
    };
    const service = new ProjectManageService(
      projectRepo as never,
      {} as never,
      {} as never,
      {} as never,
      apiRequirementRepo as never,
      {} as never,
      {} as never,
      requirementPlatform as never,
    );
    return { service, project, projectRepo };
  }

  it("updates the remark without requiring the requirement to be testing", async () => {
    const requirementPlatform = { assertProjectOperational: jest.fn() };
    const { service, project } = createProjectService(requirementPlatform);

    await RequestContext.run("alice", () =>
      service.updateProject("p1", { description: "客户补充说明" }),
    );

    expect(requirementPlatform.assertProjectOperational).not.toHaveBeenCalled();
    expect(project.description).toBe("客户补充说明");
  });

  it("rejects remark edits from users other than the requirement owner", async () => {
    const requirementPlatform = { assertProjectOperational: jest.fn() };
    const { service, project } = createProjectService(requirementPlatform, {
      project: { createdBy: "system" },
      requirement: { claimedBy: "alice" },
    });

    await expect(
      RequestContext.run("system", () =>
        service.updateProject("p1", { description: "system 修改备注" }),
      ),
    ).rejects.toThrow("仅需求归属人可修改备注");
    expect(project.description).toBe("");
  });

  it("keeps the testing-state guard for title and requirement number edits", async () => {
    const requirementPlatform = { assertProjectOperational: jest.fn() };
    const { service } = createProjectService(requirementPlatform);

    await RequestContext.run("alice", () =>
      service.updateProject("p1", { title: "新的需求名" }),
    );

    expect(requirementPlatform.assertProjectOperational).toHaveBeenCalledWith(
      "p1",
    );
  });
});

describe("ProjectManageService requirement status filter", () => {
  it("only returns projects whose linked requirement matches the tab", async () => {
    const { service, andWhere } = createService();

    await RequestContext.run("alice", () =>
      service.listProjects(1, 10, "", "api-test", undefined, "completed"),
    );

    const condition = findRequirementStatusCondition(andWhere);
    expect(condition).toBeDefined();
    expect(condition![0]).not.toContain("NOT EXISTS");
    expect(condition![0]).toContain("req.claimedProjectId = project.id");
    expect(condition![0]).toContain("req.projectCode = project.requirementNo");
    expect(condition![1]).toEqual({ requirementStatuses: ["completed"] });
  });

  it("shows already-claimed legacy requirements in the testing tab", async () => {
    const { service, andWhere } = createService();

    await RequestContext.run("alice", () =>
      service.listProjects(1, 10, "", "api-test", undefined, "testing"),
    );

    const condition = findRequirementStatusCondition(andWhere);
    expect(condition![1]).toEqual({
      requirementStatuses: ["testing", "pending_dispatch", "pending_claim"],
    });
  });

  it("does not add a requirement condition for the all tab", async () => {
    const { service, andWhere } = createService();

    await RequestContext.run("alice", () =>
      service.listProjects(1, 10, "", "api-test", undefined, "all"),
    );

    expect(findRequirementStatusCondition(andWhere)).toBeUndefined();
  });
});
