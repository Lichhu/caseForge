import { ApiEnvironmentService } from "@api-test/service/api-environment.service";
import { RequestContext } from "@common/audit/request-context";

function createRepoMock() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (entity: unknown) => entity),
    create: jest.fn((entity: unknown) => entity),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(0),
  };
}

function buildService() {
  const envRepo = createRepoMock();
  const serviceRepo = createRepoMock();
  const access = {
    isDispatcher: jest.fn().mockResolvedValue(false),
    canManage: jest.fn(
      (createdBy: string | null | undefined, isDispatcher: boolean) =>
        isDispatcher || createdBy === "alice",
    ),
    assertCanManage: jest.fn(async (createdBy: string | null | undefined) => {
      if (createdBy !== "alice") throw new Error("无权限");
    }),
  };
  const service = new ApiEnvironmentService(
    envRepo as never,
    serviceRepo as never,
    access as never,
  );
  return { service, envRepo, serviceRepo, access };
}

describe("ApiEnvironmentService 全局库", () => {
  it("lists all shared environments", async () => {
    const { service, envRepo } = buildService();
    await RequestContext.run("alice", () => service.listEnvironments("p1"));
    expect(envRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { isDefault: "DESC", updatedAt: "DESC" },
      }),
    );
  });

  it("checks ownership before deleting an environment", async () => {
    const { service, envRepo } = buildService();
    envRepo.findOne.mockResolvedValue({
      id: "env-1",
      createdBy: "alice",
      enabled: true,
    });
    await RequestContext.run("alice", () =>
      service.deleteEnvironment("p1", "env-1"),
    );
    expect(envRepo.findOne).toHaveBeenCalledWith({
      where: { id: "env-1", enabled: true },
    });
    expect(envRepo.softDelete).toHaveBeenCalledWith({ id: "env-1" });
  });

  it("clears the shared default environment", async () => {
    const { service, envRepo } = buildService();
    envRepo.findOne.mockResolvedValue({
      id: "env-1",
      createdBy: "alice",
      baseUrl: "http://x",
      headers: {},
      variables: {},
      isDefault: false,
      enabled: true,
    });
    await RequestContext.run("alice", () =>
      service.updateEnvironment("p1", "env-1", {
        name: "n",
        isDefault: true,
      } as never),
    );
    const clearCall = envRepo.update.mock.calls.find(
      (call: unknown[]) =>
        (call[1] as { isDefault?: boolean })?.isDefault === false,
    );
    expect(clearCall?.[0]).toEqual({ isDefault: true });
  });

  it("looks up environment service SSL settings in the shared library", async () => {
    const { service, serviceRepo } = buildService();
    await RequestContext.run("alice", () =>
      service.getServiceIgnoreSslVerify("p1", "env-1", "svc-1"),
    );
    expect(serviceRepo.findOne).toHaveBeenCalledWith({
      where: {
        environmentId: "env-1",
        id: "svc-1",
        enabled: true,
      },
    });
  });

  it("builds address bindings from shared environments", async () => {
    const { service, envRepo, serviceRepo } = buildService();
    envRepo.find.mockResolvedValue([{ id: "env-1", name: "dev" }]);
    serviceRepo.find.mockResolvedValue([
      {
        id: "svc-1",
        environmentId: "env-1",
        name: "api",
        serverAddress: "https://example.com/",
      },
    ]);
    const rows = await RequestContext.run("alice", () =>
      service.listServiceAddressBindings("p1"),
    );
    expect(envRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { isDefault: "DESC", createdAt: "ASC" },
      }),
    );
    expect(serviceRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { sortOrder: "ASC", createdAt: "ASC" },
      }),
    );
    expect(rows[0]).toMatchObject({
      environmentId: "env-1",
      environmentName: "dev",
      serviceId: "svc-1",
      serviceName: "api",
      address: "https://example.com",
    });
  });

  it("masks tokens when creating an environment", async () => {
    const { service } = buildService();
    const result = await RequestContext.run("alice", () =>
      service.createEnvironment("p1", {
        name: "dev",
        token: "super-secret-token",
      } as never),
    );
    expect(result.hasToken).toBe(true);
    expect(result.tokenMasked).not.toContain("super-secret-token");
    expect(JSON.stringify(result)).not.toContain("super-secret-token");
  });

  it("saves environment service ignoreSslVerify when creating and updating", async () => {
    const { service, envRepo, serviceRepo } = buildService();
    envRepo.findOne.mockResolvedValue({
      id: "env-1",
      createdBy: "alice",
      baseUrl: "http://x",
      headers: {},
      variables: {},
      isDefault: false,
      enabled: true,
    });
    serviceRepo.count.mockResolvedValue(0);
    const created = await RequestContext.run("alice", () =>
      service.createEnvironmentService("p1", "env-1", {
        name: "svc",
        ignoreSslVerify: true,
      } as never),
    );
    expect(created.ignoreSslVerify).toBe(true);

    serviceRepo.findOne.mockResolvedValue({
      id: "svc-1",
      createdBy: "alice",
      environmentId: "env-1",
      name: "svc",
      sortOrder: 0,
      ignoreSslVerify: false,
      enabled: true,
    });
    const updated = await RequestContext.run("alice", () =>
      service.updateEnvironmentService("p1", "env-1", "svc-1", {
        name: "svc",
        ignoreSslVerify: true,
      } as never),
    );
    expect(updated.ignoreSslVerify).toBe(true);
  });
});
