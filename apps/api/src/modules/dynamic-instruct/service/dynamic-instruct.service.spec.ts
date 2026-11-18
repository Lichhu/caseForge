import { RequestContext } from "@common/audit/request-context";
import { DynamicInstructService } from "./dynamic-instruct.service";

describe("DynamicInstructService", () => {
  it("restores a soft-deleted prompt selection instead of inserting it again", async () => {
    const testPoint = {
      id: "tp1",
      projectId: "p1",
      structDocId: "sd1",
      system: "系统",
      systemDesc: "",
      featureModule: "模块",
      featureDesc: "",
      testPoint: "要点",
      testPointDesc: "",
      createdBy: "alice",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const softDeletedSelection = {
      id: "sel1",
      testPointId: "tp1",
      promptId: "pr1",
      deletedAt: new Date(),
    };
    const projectRepo = { update: jest.fn().mockResolvedValue(undefined) };
    const testPointRepo = {
      findOne: jest.fn().mockResolvedValue(testPoint),
    };
    const instructRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const promptSelectionRepo = {
      find: jest.fn(async (options: { withDeleted?: boolean }) =>
        options.withDeleted ? [softDeletedSelection] : [],
      ),
      softDelete: jest.fn(),
      restore: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const promptRepo = {
      find: jest.fn().mockResolvedValue([{ id: "pr1" }]),
    };
    const service = new DynamicInstructService(
      projectRepo as any,
      testPointRepo as any,
      instructRepo as any,
      promptSelectionRepo as any,
      promptRepo as any,
    );

    await RequestContext.run("alice", () =>
      service.saveByTestPoint("tp1", {
        promptIds: ["pr1"],
        naturalText: "保留原有提示词",
      }),
    );

    expect(promptSelectionRepo.restore).toHaveBeenCalledWith(
      expect.objectContaining({ testPointId: "tp1" }),
    );
    expect(promptSelectionRepo.softDelete).not.toHaveBeenCalled();
    expect(promptSelectionRepo.save).not.toHaveBeenCalled();
  });
});
