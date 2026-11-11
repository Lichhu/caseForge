/**
 * 只启动 Socket / TCP Mock：
 *   pnpm --filter @case-forge/api mock:tcp
 *   pnpm --filter @case-forge/api mock:tcp -- --config ./scripts/mock-services/mock.config.json
 */
import { resolve } from "node:path";
import {
  type TcpMockOptions,
  loadConfig,
  parseArgs,
  resolveConfigPath,
} from "./shared";
import { startTcpMockServer } from "./tcp-server";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig(resolveConfigPath(args));
  const options: TcpMockOptions = config.tcp ?? {
    host: "127.0.0.1",
    port: 16030,
    encoding: "GBK",
    requestFraming: { type: "length-prefix", width: 4 },
    closeAfterResponse: false,
    fixtures: resolve(__dirname, "fixtures/socket"),
  };
  if (typeof args.host === "string") options.host = args.host;
  if (typeof args.port === "string") options.port = Number(args.port);
  if (typeof args.fixtures === "string") {
    options.fixtures = resolve(process.cwd(), args.fixtures);
  }
  await startTcpMockServer(options);
  console.log("[mock:tcp] 按 Ctrl+C 停止");
}

main().catch((error) => {
  console.error("[mock:tcp] 启动失败：", error);
  process.exit(1);
});
