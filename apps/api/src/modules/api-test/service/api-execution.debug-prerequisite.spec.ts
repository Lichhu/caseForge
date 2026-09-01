import { BadRequestException } from "@nestjs/common";
import { ApiExecutionService } from "@api-test/service/api-execution.service";
import type { ApiCaseStep } from "@case-forge/shared";

/**
 * 调试前置步骤回归测试。
 *
 * 场景：编辑步骤内调试某个步骤时，请求报文引用了前置步骤产出的共享变量
 * （如 ${accessToken}）。修复前调试只用环境变量替换，变量原样发出；
 * 修复后调试会先按序执行前置步骤、提取共享变量，再替换当前调试报文。
 */
function buildService() {
  const caseRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const runRepo = {};
  const runItemRepo = { create: jest.fn((entity: unknown) => entity) };
  const environmentService = {
    getRuntimeEnvironment: jest.fn(),
    getServiceIgnoreSslVerify: jest.fn().mockResolvedValue(false),
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
  return { service };
}

function buildPrerequisiteStep(overrides?: Partial<ApiCaseStep>): ApiCaseStep {
  return {
    id: "step-1",
    name: "获取令牌",
    target: { name: "前置", address: "http://prereq.example:8080" },
    request: { method: "POST", path: "/token", body: "{}" },
    expected: { assertions: [] },
    exports: [
      { name: "accessToken", source: "body", expression: "$.token", required: true },
    ],
    ...overrides,
  };
}

function mockFetchSequence(bodies: Array<{ status?: number; body: unknown }>) {
  const spy = jest.spyOn(globalThis, "fetch");
  for (const item of bodies) {
    spy.mockResolvedValueOnce(
      new Response(JSON.stringify(item.body), {
        status: item.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }
  return spy;
}

describe("debugRun 前置步骤变量提取", () => {
  it("先执行前置步骤提取变量，再替换当前调试报文", async () => {
    const { service } = buildService();
    const fetchSpy = mockFetchSequence([
      { body: { token: "tok-123" } },
      { body: { ok: true } },
    ]);
    try {
      const result = await service.debugRun({
        projectId: "project-1",
        request: {
          method: "POST",
          path: "/biz",
          body: JSON.stringify({ token: "${accessToken}" }),
        } as never,
        target: { name: "调试", address: "http://biz.example:8080" },
        prerequisiteSteps: [buildPrerequisiteStep()],
      });
      expect(result.statusCode).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const [prereqUrl] = fetchSpy.mock.calls[0];
      expect(prereqUrl).toBe("http://prereq.example:8080/token");
      const [, mainInit] = fetchSpy.mock.calls[1];
      const mainBody = Buffer.from(mainInit?.body as ArrayBuffer).toString("utf8");
      expect(mainBody).toContain("tok-123");
      expect(mainBody).not.toContain("${accessToken}");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("前置步骤请求失败时中断调试并提示步骤名", async () => {
    const { service } = buildService();
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("connect refused"));
    try {
      await expect(
        service.debugRun({
          projectId: "project-1",
          request: { method: "POST", path: "/biz", body: "${accessToken}" } as never,
          target: { name: "调试", address: "http://biz.example:8080" },
          prerequisiteSteps: [buildPrerequisiteStep()],
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.debugRun({
          projectId: "project-1",
          request: { method: "POST", path: "/biz", body: "${accessToken}" } as never,
          target: { name: "调试", address: "http://biz.example:8080" },
          prerequisiteSteps: [buildPrerequisiteStep()],
        }),
      ).rejects.toThrow("前置步骤「获取令牌」执行失败");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("必填共享变量提取失败时中断调试", async () => {
    const { service } = buildService();
    const fetchSpy = mockFetchSequence([{ body: { other: 1 } }]);
    try {
      await expect(
        service.debugRun({
          projectId: "project-1",
          request: { method: "POST", path: "/biz", body: "${accessToken}" } as never,
          target: { name: "调试", address: "http://biz.example:8080" },
          prerequisiteSteps: [buildPrerequisiteStep()],
        }),
      ).rejects.toThrow("共享变量「accessToken」提取失败");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("前置步骤未配置环境地址时给出明确提示", async () => {
    const { service } = buildService();
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    try {
      await expect(
        service.debugRun({
          projectId: "project-1",
          request: { method: "POST", path: "/biz", body: "${accessToken}" } as never,
          target: { name: "调试", address: "http://biz.example:8080" },
          prerequisiteSteps: [
            buildPrerequisiteStep({ target: { name: "", address: " " } }),
          ],
        }),
      ).rejects.toThrow("未配置环境地址");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
