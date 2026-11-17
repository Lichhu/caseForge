import { RequestContext } from "@common/audit/request-context";
import { ProjectManageService } from "./project-manage.service";

function createService() {
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
    {} as never,
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
    expect(condition![0]).toContain(
      "req.projectCode = project.requirementNo",
    );
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
