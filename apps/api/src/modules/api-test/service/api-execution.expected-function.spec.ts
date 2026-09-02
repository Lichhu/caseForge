import { ApiExecutionService } from "@api-test/service/api-execution.service";

/**
 * 断言期望值数据函数回归测试。
 *
 * 场景：断言期望值填写数据函数调用（如 ${DB_BALANCE($.acctNo)} 取数据库值
 * 作比较基准）。修复前期望值原样参与比较，函数调用永远不等于响应实际值；
 * 修复后执行/调试前先替换共享变量、再解析函数调用，最后才与响应比较，
 * 且函数参数中的 $. 路径相对本步骤实际发出的请求报文解析。
 */
function buildService() {
  const caseRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const runRepo = {};
  const runItemRepo = { create: jest.fn((entity: unknown) => entity) };
  const environmentService = {
    getRuntimeEnvironment: jest.fn(),
    getServiceIgnoreSslVerify: jest.fn().mockResolvedValue(false),
  };
  // 模拟真实解析：${DB_BALANCE(...)} 返回数据库值 42.00
  const resolveDeep = jest.fn(
    async (
      _projectId: string,
      value: unknown,
      _context?: unknown,
      _root?: unknown,
    ) => {
      const walk = async (item: unknown): Promise<unknown> => {
        if (typeof item === "string")
          return item.replace(/\$\{DB_BALANCE\(([^)]*)\)\}/g, () => "42.00");
        if (Array.isArray(item)) return Promise.all(item.map(walk));
        if (item && typeof item === "object")
          return Object.fromEntries(
            await Promise.all(
              Object.entries(item).map(async ([key, child]) => [
                key,
                await walk(child),
              ]),
            ),
          );
        return item;
      };
      return walk(value);
    },
  );
  const service = new ApiExecutionService(
    caseRepo as never,
    runRepo as never,
    runItemRepo as never,
    environmentService as never,
    {} as never,
    { resolveDeep } as never,
  );
  return { service, resolveDeep };
}

function mockFetch(body: unknown, status = 200) {
  const spy = jest.spyOn(globalThis, "fetch");
  spy.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  return spy;
}

describe("断言期望值数据函数解析", () => {
  it("调试时先解析期望值中的函数调用再与响应比较", async () => {
    const { service, resolveDeep } = buildService();
    const fetchSpy = mockFetch({ balance: "42.00" });
    try {
      const result = await service.debugRun({
        projectId: "project-1",
        request: {
          method: "POST",
          path: "/biz",
          body: JSON.stringify({ acctNo: "6200001" }),
        } as never,
        expected: {
          assertions: [
            {
              type: "jsonpath",
              operator: "eq",
              expression: "$.balance",
              expected: "${DB_BALANCE($.acctNo)}",
            },
          ],
        } as never,
        target: { name: "调试", address: "http://biz.example:8080" },
      });
      expect(result.assertions).toHaveLength(1);
      expect(result.assertions[0].passed).toBe(true);
      expect(result.assertions[0].expected).toBe("42.00");
      // 期望值解析调用携带已解析请求作为 $. 参数取值根
      const expectedCall = resolveDeep.mock.calls.find(([, value]) =>
        JSON.stringify(value).includes("${DB_BALANCE"),
      );
      expect(expectedCall).toBeDefined();
      expect(expectedCall?.[3]).toEqual({
        method: "POST",
        path: "/biz",
        body: JSON.stringify({ acctNo: "6200001" }),
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("期望值支持字面量与函数调用混写", async () => {
    const { service } = buildService();
    const fetchSpy = mockFetch({ balance: "42.00" });
    try {
      const result = await service.debugRun({
        projectId: "project-1",
        request: { method: "POST", path: "/biz", body: "{}" } as never,
        expected: {
          assertions: [
            {
              type: "jsonpath",
              operator: "eq",
              expression: "$.balance",
              expected: "余额=${DB_BALANCE()}",
            },
          ],
        } as never,
        target: { name: "调试", address: "http://biz.example:8080" },
      });
      expect(result.assertions[0].passed).toBe(false);
      expect(result.assertions[0].expected).toBe("余额=42.00");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("期望值不含函数调用时不触发额外解析", async () => {
    const { service, resolveDeep } = buildService();
    const fetchSpy = mockFetch({ balance: "42.00" });
    try {
      const result = await service.debugRun({
        projectId: "project-1",
        request: { method: "POST", path: "/biz", body: "{}" } as never,
        expected: {
          assertions: [
            {
              type: "jsonpath",
              operator: "eq",
              expression: "$.balance",
              expected: "42.00",
            },
          ],
        } as never,
        target: { name: "调试", address: "http://biz.example:8080" },
      });
      expect(result.assertions[0].passed).toBe(true);
      expect(resolveDeep).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
