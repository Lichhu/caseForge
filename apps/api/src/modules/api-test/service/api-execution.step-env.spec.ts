import { BadRequestException } from "@nestjs/common";
import {
  environmentFromStep,
  requestBodySnapshotFields,
} from "@api-test/service/api-execution.service";
import { parseServerAddress } from "@case-forge/shared";
import type { ApiHttpCaseStep } from "@case-forge/shared";

/**
 * Socket 调试地址解析回归测试。
 *
 * 修复前 environmentFromStep 仅接受严格 host:port，
 * 而环境服务的 serverAddress 以 socket2://host:port 存储并自动回填，
 * 导致调试 Socket 案例时报「TCP 地址格式应为 host:port」。
 */

function makeTcpStep(address: string): ApiHttpCaseStep {
  return {
    id: "step-1",
    name: "调试",
    target: { name: "环境", address },
    request: { method: "", path: "", transport: "tcp" },
    expected: {},
    exports: [],
  } as unknown as ApiHttpCaseStep;
}

describe("environmentFromStep TCP 地址解析", () => {
  it("支持纯 host:port", () => {
    const env = environmentFromStep(makeTcpStep("32.114.71.6:60030"));
    expect(env.services?.[0]).toMatchObject({
      transport: "tcp",
      host: "32.114.71.6",
      port: 60030,
    });
  });

  it("支持 socket2://host:port（环境服务回填格式）", () => {
    const env = environmentFromStep(makeTcpStep("socket2://32.114.71.6:60030"));
    expect(env.services?.[0]).toMatchObject({
      transport: "tcp",
      host: "32.114.71.6",
      port: 60030,
    });
  });

  it("支持 socket:// 与 tcp:// 前缀", () => {
    for (const prefix of ["socket://", "tcp://"]) {
      const env = environmentFromStep(
        makeTcpStep(`${prefix}33.114.5.56:60000`),
      );
      expect(env.services?.[0]).toMatchObject({
        host: "33.114.5.56",
        port: 60000,
      });
    }
  });

  it("地址缺少端口时抛出友好错误", () => {
    expect(() => environmentFromStep(makeTcpStep("32.114.71.6"))).toThrow(
      BadRequestException,
    );
  });

  it("保留步骤绑定的执行环境和服务 ID", () => {
    const step = makeTcpStep("socket2://32.114.71.6:60030");
    step.target = {
      ...step.target!,
      environmentId: "env-1",
      environmentServiceId: "svc-1",
    };

    const env = environmentFromStep(step);

    expect(env).toMatchObject({
      id: "env-1",
      environmentServiceId: "svc-1",
    });
  });
});

describe("environmentFromStep HTTP 环境映射", () => {
  it("执行记录使用真实环境 ID，而不是步骤 ID", () => {
    const env = environmentFromStep({
      id: "step-1",
      name: "正向流程",
      target: {
        name: "测试环境",
        address: "http://example.test",
        environmentId: "env-1",
        environmentServiceId: "svc-1",
      },
      request: { method: "POST", path: "/query" },
      expected: {},
      exports: [],
    });

    expect(env).toMatchObject({
      id: "env-1",
      baseUrl: "http://example.test",
      environmentServiceId: "svc-1",
    });
  });

  it("未绑定环境的旧步骤仍以步骤 ID 兜底", () => {
    const env = environmentFromStep({
      id: "step-legacy",
      name: "旧步骤",
      target: { name: "旧地址", address: "http://example.test" },
      request: { method: "POST", path: "/query" },
      expected: {},
      exports: [],
    });

    expect(env.id).toBe("step-legacy");
    expect(env.environmentServiceId).toBeUndefined();
  });
});

describe("parseServerAddress", () => {
  it("tcp://host:port 解析为 tcp 并归一化为 socket2://", () => {
    expect(parseServerAddress("tcp://33.114.5.56:60000")).toEqual({
      transport: "tcp",
      host: "33.114.5.56",
      port: 60000,
      serverAddress: "socket2://33.114.5.56:60000",
    });
  });

  it("socket2:// 无端口时 port 为 undefined", () => {
    const parsed = parseServerAddress("socket2://33.114.5.56");
    expect(parsed.transport).toBe("tcp");
    expect(parsed.host).toBe("33.114.5.56");
    expect(parsed.port).toBeUndefined();
  });

  it("裸 host:port 保持原有行为", () => {
    expect(parseServerAddress("32.114.71.6:60030")).toEqual({
      transport: "tcp",
      host: "32.114.71.6",
      port: 60030,
      serverAddress: "socket2://32.114.71.6:60030",
    });
  });
});

describe("requestBodySnapshotFields", () => {
  it("preserves the editor source body order for execution history", () => {
    const bodyText = '{\n  "second": 2,\n  "first": 1\n}';

    expect(
      requestBodySnapshotFields({
        body: { first: 1, second: 2 },
        bodyText,
      }),
    ).toEqual({
      body: { first: 1, second: 2 },
      bodyText,
    });
  });

  it("keeps legacy snapshots compatible when source text is absent", () => {
    expect(requestBodySnapshotFields({ body: { first: 1 } })).toEqual({
      body: { first: 1 },
    });
  });
});
