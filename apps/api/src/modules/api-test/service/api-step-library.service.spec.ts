import { ForbiddenException } from "@nestjs/common";
import { ApiStepLibraryService } from "./api-step-library.service";

function buildService() {
  const row = {
    id: "step-1",
    name: "公共步骤",
    createdBy: "alice",
    step: {
      id: "step-content-1",
      name: "公共步骤",
      request: { method: "POST", path: "/", transport: "http" },
      expected: {},
      exports: [],
    },
  };
  const repo = {
    find: jest.fn().mockResolvedValue([row]),
    findOne: jest.fn().mockResolvedValue(row),
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const access = {
    isDispatcher: jest.fn().mockResolvedValue(false),
    canManage: jest.fn((createdBy: string, isDispatcher: boolean) =>
      Boolean(isDispatcher || createdBy === "alice"),
    ),
    assertCanManage: jest.fn(async (createdBy: string) => {
      if (createdBy !== "alice") throw new ForbiddenException("无权限");
    }),
  };
  return {
    service: new ApiStepLibraryService(repo as never, access as never),
    repo,
    access,
  };
}

describe("ApiStepLibraryService global library", () => {
  it("lists all shared steps and exposes management permission", async () => {
    const { service, repo } = buildService();

    const rows = await service.list();

    expect(repo.find).toHaveBeenCalledWith({
      order: { updatedAt: "DESC" },
    });
    expect(rows[0]).toMatchObject({ id: "step-1", canManage: true });
  });

  it("checks ownership before updating a shared step", async () => {
    const { service, access } = buildService();
    access.assertCanManage.mockRejectedValueOnce(
      new ForbiddenException("无权限"),
    );

    await expect(
      service.save(
        {
          name: "公共步骤",
          step: {
            id: "step-content-1",
            name: "公共步骤",
            request: { method: "POST", path: "/", transport: "http" },
            expected: {},
            exports: [],
          },
        },
        "step-1",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
