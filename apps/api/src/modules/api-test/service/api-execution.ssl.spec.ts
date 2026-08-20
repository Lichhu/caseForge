import { ApiExecutionService } from "@api-test/service/api-execution.service";

/**
 * HTTPS 忽略证书校验回归测试。
 *
 * 场景：调试/执行目标是 https 自签名证书时需要跳过 SSL 校验。
 * 开关挂在环境下的服务（api_test_environment_service.ignoreSslVerify）上：
 * - 环境路径执行/调试按解析出的服务取开关，传导到 fetch（undici dispatcher）；
 * - 按步骤地址（target）调试时继承所选环境服务的开关；
 * - debug-run 显式传参可覆盖服务开关。
 */
function buildService(options: {
  serviceIgnoreSsl?: boolean;
  inheritIgnoreSsl?: boolean;
}) {
  const caseRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const runRepo = {};
  const runItemRepo = { create: jest.fn((entity: unknown) => entity) };
  const runtimeEnv = {
    id: "env-1",
    baseUrl: "https://self-signed.example:8443",
    headers: {},
    variables: {},
    secrets: {},
    services: [
      {
        id: "svc-1",
        name: "default",
        transport: "http",
        baseUrl: "https://self-signed.example:8443",
        ignoreSslVerify: options.serviceIgnoreSsl ?? false,
      },
    ],
  };
  const environmentService = {
    getRuntimeEnvironment: jest.fn().mockResolvedValue(runtimeEnv),
    getServiceIgnoreSslVerify: jest
      .fn()
      .mockResolvedValue(options.inheritIgnoreSsl ?? false),
  };
  const executionSetService = {};
  const dataFunctionService = {
    resolveDeep: jest.fn(async (_projectId: string, value: unknown) => value),
  };
  const service = new ApiExecutionService(
    caseRepo as never,
    runRepo as never,
    runItemRepo as never,
    environmentService as never,
    executionSetService as never,
    dataFunctionService as never,
  );
  return { service, environmentService };
}

function mockFetchOk() {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
}

function lastFetchInit(fetchSpy: jest.SpyInstance) {
  return fetchSpy.mock.calls[0]?.[1];
}

describe("debugRun HTTPS 忽略证书校验（服务级开关）", () => {
  it("所选服务开启 ignoreSslVerify 时，fetch 携带 dispatcher 跳过证书校验", async () => {
    const { service } = buildService({ serviceIgnoreSsl: true });
    const fetchSpy = mockFetchOk();
    try {
      const result = await service.debugRun({
        projectId: "project-1",
        request: { method: "GET", path: "/ping" } as never,
        environmentId: "env-1",
      });
      expect(result.statusCode).toBe(200);
      expect(lastFetchInit(fetchSpy)).toEqual(
        expect.objectContaining({ dispatcher: expect.anything() }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("服务未开启开关时，fetch 不携带 dispatcher（保持正常证书校验）", async () => {
    const { service } = buildService({ serviceIgnoreSsl: false });
    const fetchSpy = mockFetchOk();
    try {
      await service.debugRun({
        projectId: "project-1",
        request: { method: "GET", path: "/ping" } as never,
        environmentId: "env-1",
      });
      expect(lastFetchInit(fetchSpy)).not.toEqual(
        expect.objectContaining({ dispatcher: expect.anything() }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("按步骤地址调试时继承所选环境服务的开关", async () => {
    const { service, environmentService } = buildService({
      inheritIgnoreSsl: true,
    });
    const fetchSpy = mockFetchOk();
    try {
      await service.debugRun({
        projectId: "project-1",
        request: { method: "GET", path: "/ping" } as never,
        target: { name: "环境", address: "https://self-signed.example:8443" },
        environmentId: "env-1",
        environmentServiceId: "svc-1",
      });
      expect(environmentService.getServiceIgnoreSslVerify).toHaveBeenCalledWith(
        "project-1",
        "env-1",
        "svc-1",
      );
      expect(lastFetchInit(fetchSpy)).toEqual(
        expect.objectContaining({ dispatcher: expect.anything() }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("显式传入 ignoreSslVerify=false 可覆盖服务开关", async () => {
    const { service } = buildService({ serviceIgnoreSsl: true });
    const fetchSpy = mockFetchOk();
    try {
      await service.debugRun({
        projectId: "project-1",
        request: { method: "GET", path: "/ping" } as never,
        environmentId: "env-1",
        ignoreSslVerify: false,
      });
      expect(lastFetchInit(fetchSpy)).not.toEqual(
        expect.objectContaining({ dispatcher: expect.anything() }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
