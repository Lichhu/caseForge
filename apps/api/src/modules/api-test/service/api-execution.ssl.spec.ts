import {
  ApiExecutionService,
  getInsecureDispatcher,
} from "@api-test/service/api-execution.service";

/**
 * HTTPS 忽略证书校验回归测试。
 *
 * 场景：调试/执行目标是 https 自签名证书时需要跳过 SSL 校验。
 * 开关挂在环境下的服务（api_test_environment_service.ignoreSslVerify）上：
 * - 环境路径执行/调试按解析出的服务取开关，传导到 fetch（undici dispatcher）；
 * - 按步骤地址（target）调试时继承所选环境服务的开关；
 * - 执行平台执行带步骤的案例时，按步骤绑定的环境服务继承开关；
 * - debug-run 显式传参可覆盖服务开关。
 */
function buildService(options: {
  serviceIgnoreSsl?: boolean;
  inheritIgnoreSsl?: boolean;
  caseWithStep?: boolean;
  bindStepService?: boolean;
  caseDebugBinding?: boolean;
  stepCount?: number;
  addressBindings?: Array<{
    environmentId: string;
    environmentName: string;
    serviceId: string;
    serviceName: string;
    address: string;
  }>;
}) {
  const steps = Array.from({ length: options.stepCount ?? 1 }, (_, index) => ({
    id: `step-${index + 1}`,
    name: `请求 ${index + 1}`,
    target: {
      name: "环境",
      address: "https://self-signed.example:8443",
      ...(options.bindStepService === false
        ? {}
        : { environmentId: "env-1", environmentServiceId: "svc-1" }),
    },
    request: { method: "GET", path: "/ping" },
    expected: {
      assertions: [
        {
          type: "status_code",
          operator: "eq",
          expression: "",
          expected: "200",
        },
      ],
    },
    exports: [],
  }));
  const stepCase = {
    id: "case-1",
    projectId: "project-1",
    title: "步骤案例",
    caseNo: "001",
    enabled: true,
    request: { method: "GET", path: "/ping" },
    expected: { assertions: [] },
    steps,
    metadata:
      options.caseDebugBinding === false
        ? {}
        : options.bindStepService === false
          ? {
              debugEnvironmentId: "env-1",
              debugEnvironmentServiceId: "svc-1",
            }
          : {},
  };
  const caseRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue(options.caseWithStep ? [stepCase] : []),
    save: jest.fn(async (rows: unknown) => rows),
  };
  const runRepo = {
    create: jest.fn((entity: Record<string, unknown>) => ({
      ...entity,
      id: "run-1",
    })),
    save: jest.fn(async (entity: Record<string, unknown>) => entity),
  };
  const runItemRepo = {
    create: jest.fn((entity: unknown) => entity),
    save: jest.fn(async (items: unknown) => items),
  };
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
    listServiceAddressBindings: jest.fn().mockResolvedValue(
      options.addressBindings ?? [
        {
          environmentId: "env-1",
          environmentName: "环境",
          serviceId: "svc-1",
          serviceName: "default",
          address: "https://self-signed.example:8443",
        },
      ],
    ),
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
    {} as never,
  );
  return { service, environmentService, caseRepo };
}

function mockFetchOk() {
  return jest.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

function lastFetchInit(fetchSpy: jest.SpyInstance) {
  return fetchSpy.mock.calls[0]?.[1];
}

function lastDispatcher(fetchSpy: jest.SpyInstance) {
  return (lastFetchInit(fetchSpy) as RequestInit & { dispatcher?: unknown })
    ?.dispatcher;
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
      expect(lastDispatcher(fetchSpy)).toBe(getInsecureDispatcher());
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
      expect(lastDispatcher(fetchSpy)).toBeUndefined();
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
      expect(lastDispatcher(fetchSpy)).toBe(getInsecureDispatcher());
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
      expect(lastDispatcher(fetchSpy)).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("执行平台 HTTPS 忽略证书校验（步骤级服务开关）", () => {
  it("步骤绑定的服务开启 ignoreSslVerify 时，执行平台请求跳过证书校验", async () => {
    const { service, environmentService } = buildService({
      inheritIgnoreSsl: true,
      caseWithStep: true,
    });
    jest
      .spyOn(service, "getRunDetail")
      .mockResolvedValue({ id: "run-1" } as never);
    const fetchSpy = mockFetchOk();
    try {
      await service.runCases({
        projectId: "project-1",
        caseIds: ["case-1"],
        concurrency: 1,
      });
      expect(environmentService.getServiceIgnoreSslVerify).toHaveBeenCalledWith(
        "project-1",
        "env-1",
        "svc-1",
      );
      expect(lastDispatcher(fetchSpy)).toBe(getInsecureDispatcher());
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("旧案例步骤未绑定服务时，回退使用案例调试环境服务的开关", async () => {
    const { service, environmentService } = buildService({
      inheritIgnoreSsl: true,
      caseWithStep: true,
      bindStepService: false,
      addressBindings: [],
    });
    jest
      .spyOn(service, "getRunDetail")
      .mockResolvedValue({ id: "run-1" } as never);
    const fetchSpy = mockFetchOk();
    try {
      await service.runCases({
        projectId: "project-1",
        caseIds: ["case-1"],
        concurrency: 1,
      });
      expect(environmentService.getServiceIgnoreSslVerify).toHaveBeenCalledWith(
        "project-1",
        "env-1",
        "svc-1",
      );
      expect(lastDispatcher(fetchSpy)).toBe(getInsecureDispatcher());
    } finally {
      fetchSpy.mockRestore();
    }
  });
  it("同一执行内多个步骤复用 SSL 开关查询", async () => {
    const { service, environmentService } = buildService({
      inheritIgnoreSsl: true,
      caseWithStep: true,
      stepCount: 3,
    });
    jest
      .spyOn(service, "getRunDetail")
      .mockResolvedValue({ id: "run-1" } as never);
    const fetchSpy = mockFetchOk();
    try {
      await service.runCases({
        projectId: "project-1",
        caseIds: ["case-1"],
        concurrency: 1,
      });
      expect(
        environmentService.getServiceIgnoreSslVerify,
      ).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("旧步骤未绑定 id 且案例无调试环境时，按地址反查并回填绑定", async () => {
    const { service, environmentService, caseRepo } = buildService({
      inheritIgnoreSsl: true,
      caseWithStep: true,
      bindStepService: false,
      caseDebugBinding: false,
    });
    jest
      .spyOn(service, "getRunDetail")
      .mockResolvedValue({ id: "run-1" } as never);
    const fetchSpy = mockFetchOk();
    try {
      await service.runCases({
        projectId: "project-1",
        caseIds: ["case-1"],
        concurrency: 1,
      });
      expect(
        environmentService.listServiceAddressBindings,
      ).toHaveBeenCalledWith("project-1");
      expect(caseRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            steps: expect.arrayContaining([
              expect.objectContaining({
                target: expect.objectContaining({
                  environmentId: "env-1",
                  environmentServiceId: "svc-1",
                }),
              }),
            ]),
          }),
        ]),
      );
      expect(environmentService.getServiceIgnoreSslVerify).toHaveBeenCalledWith(
        "project-1",
        "env-1",
        "svc-1",
      );
      expect(lastDispatcher(fetchSpy)).toBe(getInsecureDispatcher());
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("地址匹配到多个服务且无法区分时不回填，避免持久化错误绑定", async () => {
    const { service, environmentService, caseRepo } = buildService({
      inheritIgnoreSsl: true,
      caseWithStep: true,
      bindStepService: false,
      caseDebugBinding: false,
      addressBindings: [
        {
          environmentId: "env-1",
          environmentName: "环境 A",
          serviceId: "svc-1",
          serviceName: "default",
          address: "https://self-signed.example:8443",
        },
        {
          environmentId: "env-2",
          environmentName: "环境 B",
          serviceId: "svc-2",
          serviceName: "default",
          address: "https://self-signed.example:8443",
        },
      ],
    });
    jest
      .spyOn(service, "getRunDetail")
      .mockResolvedValue({ id: "run-1" } as never);
    const fetchSpy = mockFetchOk();
    try {
      await service.runCases({
        projectId: "project-1",
        caseIds: ["case-1"],
        concurrency: 1,
      });
      expect(caseRepo.save).not.toHaveBeenCalled();
      expect(
        environmentService.getServiceIgnoreSslVerify,
      ).not.toHaveBeenCalled();
      expect(lastDispatcher(fetchSpy)).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
