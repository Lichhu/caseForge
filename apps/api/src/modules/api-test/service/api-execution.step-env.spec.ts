import { BadRequestException } from "@nestjs/common";
import { environmentFromStep } from "@api-test/service/api-execution.service";
import { parseServerAddress } from "@case-forge/shared";
import type { ApiCaseStep } from "@case-forge/shared";

/**
 * Socket 调试地址解析回归测试。
 *
 * 修复前 environmentFromStep 仅接受严格 host:port，
 * 而环境服务的 serverAddress 以 socket2://host:port 存储并自动回填，
 * 导致调试 Socket 案例时报「TCP 地址格式应为 host:port」。
 */

function makeTcpStep(address: string): ApiCaseStep {
  return {
    id: "step-1",
    name: "调试",
    target: { name: "环境", address },
    request: { method: "", path: "", transport: "tcp" },
    expected: {},
    exports: [],
  } as unknown as ApiCaseStep;
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
    const env = environmentFromStep(
      makeTcpStep("socket2://32.114.71.6:60030"),
    );
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
