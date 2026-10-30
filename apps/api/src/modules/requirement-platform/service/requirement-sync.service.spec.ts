import { RequirementSyncService } from "./requirement-sync.service";

describe("RequirementSyncService versionName", () => {
  it("copies b_project.version_name for new and existing requirements", async () => {
    const requirementRepo = {
      find: jest.fn().mockResolvedValue([{ projectCode: "REQ-OLD" }]),
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const projectRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    const sourceProjectRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: "1",
          projectCode: "REQ-OLD",
          projectName: "已有需求",
          versionName: "V1.2",
          demandStatus: "SIT测试",
        },
        {
          id: "2",
          projectCode: "REQ-NEW",
          projectName: "新增需求",
          versionName: "V2.0",
          demandStatus: "SIT测试",
        },
      ]),
    };
    const smpClient = {
      selectServiceInfoList: jest
        .fn()
        .mockResolvedValue({ bizResCode: "000000", data: [{}] }),
    };
    const service = new RequirementSyncService(
      requirementRepo as never,
      projectRepo as never,
      sourceProjectRepo as never,
      smpClient as never,
      { get: jest.fn() } as never,
    );

    const result = await service.sync("manual");

    expect(result.added).toBe(1);
    expect(requirementRepo.update).toHaveBeenCalledWith(
      { projectCode: "REQ-OLD" },
      {
        versionName: "V1.2",
        sourceUpdatedAt: expect.any(Date),
      },
    );
    expect(requirementRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectCode: "REQ-NEW",
        versionName: "V2.0",
      }),
    );
    expect(smpClient.selectServiceInfoList).toHaveBeenCalledTimes(1);
  });
});
