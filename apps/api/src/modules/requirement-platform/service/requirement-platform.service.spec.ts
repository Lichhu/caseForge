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
      findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id === "r1") return row;
        return null;
      }),
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
});
