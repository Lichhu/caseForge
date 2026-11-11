/**
 * 同时启动 HTTP 与 Socket Mock：
 *   pnpm --filter @case-forge/api mock:services
 *
 * 默认读取同目录 mock.config.json，不存在时读取 mock.config.example.json。
 * 修改 fixture 文件后无需重启；修改配置或端口需要重启。
 */
import { loadConfig, parseArgs, resolveConfigPath } from "./shared";
import { startHttpMockServer, type RunningHttpMock } from "./http-server";
import { startTcpMockServer, type RunningTcpMock } from "./tcp-server";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = resolveConfigPath(args);
  console.log(`[mock] 配置文件：${configPath}`);
  const config = loadConfig(configPath);
  if (!config.http && !config.tcp) {
    throw new Error("配置里至少需要 http 或 tcp 其中一段");
  }

  const running: Array<RunningHttpMock | RunningTcpMock> = [];
  const shutdown = async (signal: string) => {
    console.log(`\n[mock] 收到 ${signal}，正在停止...`);
    await Promise.allSettled(running.map((item) => item.close()));
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    if (config.http) {
      running.push(await startHttpMockServer(config.http));
    }
    if (config.tcp) {
      running.push(await startTcpMockServer(config.tcp));
    }
  } catch (error) {
    await Promise.allSettled(running.map((item) => item.close()));
    throw error;
  }

  console.log("\n[mock] 已就绪，把 CaseForge 环境服务地址指向下面地址：");
  if (config.http) {
    console.log(
      `        HTTP   http://${config.http.host}:${config.http.port}`,
    );
  }
  if (config.tcp) {
    console.log(
      `        Socket ${config.tcp.host}:${config.tcp.port}（编码 ${config.tcp.encoding ?? "GBK"}）`,
    );
  }
  console.log(
    `        配置文件：${configPath}\n` +
      "        fixture 修改后即时生效；按 Ctrl+C 停止。\n",
  );
}

main().catch((error) => {
  console.error("[mock] 启动失败：", error);
  process.exit(1);
});
