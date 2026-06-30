import { ApiEnvironmentService } from "@api-test/service/api-environment.service";
import { RequestContext } from "@common/audit/request-context";

/**
 * ApiEnvironmentService 多租户隔离回归测试。
 *
 * 这些用例用 `it.failing` 标记：它们断言「正确」行为（按 projectId / createdBy 作用域），
 * 在当前存在 P0 越权/数据损坏 bug 的实现下会失败，因此 `it.failing` 让套件保持绿色，
 * 同时把 bug 固化为可执行文档。一旦修复，`it.failing` 会转红，提示把它改回普通 `it`。
 *
 * 对应审计：P0-1 clearDefault 全表更新；P0-2 listEnvironments 跨租户泄露；
 * P0-3 deleteEnvironment 无归属校验；P0-4 requireEnv 越权。
 */
function createRepoMock() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (e: unknown) => e),
    create: jest.fn((e: unknown) => e),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(0),
  };
}

function buildService() {
  const envRepo = createRepoMock();
  const serviceRepo = createRepoMock();
  const service = new ApiEnvironmentService(
    envRepo as never,
    serviceRepo as never,
  );
  return { service, envRepo, serviceRepo };
}

describe("ApiEnvironmentService 多租户隔离（回归）", () => {
  it.failing(
    "P0-2: listEnvironments 必须按 projectId 过滤（当前未过滤 -> 跨租户泄露）",
    async () => {
      const { service, envRepo } = buildService();
      await service.listEnvironments("project-1");
      const whereArg = envRepo.find.mock.calls[0]?.[0]?.where;
      expect(whereArg).toMatchObject({ projectId: "project-1" });
    },
  );

  it.failing(
    "P0-3: deleteEnvironment 必须先校验归属（当前直接按 id 删除）",
    async () => {
      const { service, envRepo } = buildService();
      await service.deleteEnvironment("project-1", "env-1");
      // 删除前应先查归属（requireEnv），且删除条件应带 projectId
      expect(envRepo.findOne).toHaveBeenCalled();
      const deleteArg = envRepo.delete.mock.calls[0]?.[0];
      expect(deleteArg).toMatchObject({ projectId: "project-1" });
    },
  );

  it.failing(
    "P0-4: requireEnv 必须按 projectId 限定（经 updateEnvironment 触发）",
    async () => {
      const { service, envRepo } = buildService();
      envRepo.findOne.mockResolvedValue({
        id: "env-1",
        projectId: "project-1",
        baseUrl: "http://x",
        headers: {},
        variables: {},
        isDefault: false,
        enabled: true,
      });
      await service.updateEnvironment("project-1", "env-1", {
        name: "n",
      } as never);
      const whereArg = envRepo.findOne.mock.calls[0]?.[0]?.where;
      expect(whereArg).toMatchObject({ projectId: "project-1" });
    },
  );

  it.failing(
    "P0-1: 设为默认时 clearDefault 不能全表更新（where 必须带 projectId）",
    async () => {
      const { service, envRepo } = buildService();
      envRepo.findOne.mockResolvedValue({
        id: "env-1",
        projectId: "project-1",
        baseUrl: "http://x",
        headers: {},
        variables: {},
        isDefault: false,
        enabled: true,
      });
      await service.updateEnvironment("project-1", "env-1", {
        name: "n",
        isDefault: true,
      } as never);
      const clearCall = envRepo.update.mock.calls.find(
        (c: unknown[]) =>
          (c[1] as { isDefault?: boolean })?.isDefault === false,
      );
      expect(clearCall).toBeDefined();
      // 当前实现传入空 where {} -> 会清空整张表所有租户的 isDefault
      expect(clearCall?.[0]).not.toEqual({});
      expect(clearCall?.[0]).toMatchObject({ projectId: "project-1" });
    },
  );

  it("happy path: createEnvironment 返回时对 token 掩码、不回传明文", async () => {
    const { service } = buildService();
    const result = await RequestContext.run("alice", () =>
      service.createEnvironment("project-1", {
        name: "dev",
        token: "super-secret-token",
      } as never),
    );
    expect(result.hasToken).toBe(true);
    expect(result.tokenMasked).not.toContain("super-secret-token");
    expect(JSON.stringify(result)).not.toContain("super-secret-token");
  });
});
