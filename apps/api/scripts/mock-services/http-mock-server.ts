/**
 * 只启动 HTTP Mock：
 *   pnpm --filter @case-forge/api mock:http
 *   pnpm --filter @case-forge/api mock:http -- --config ./scripts/mock-services/mock.config.json
 */
import { resolve } from "node:path";
import {
  type HttpMockOptions,
  loadConfig,
  parseArgs,
  resolveConfigPath,
} from "./shared";
import { startHttpMockServer } from "./http-server";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig(resolveConfigPath(args));
  const options: HttpMockOptions = config.http ?? {
    host: "127.0.0.1",
    port: 18080,
    encoding: "utf8",
    fixtures: resolve(__dirname, "fixtures/http"),
  };
  if (typeof args.host === "string") options.host = args.host;
  if (typeof args.port === "string") options.port = Number(args.port);
  if (typeof args.fixtures === "string") {
    options.fixtures = resolve(process.cwd(), args.fixtures);
  }
  await startHttpMockServer(options);
  console.log("[mock:http] 按 Ctrl+C 停止");
}

main().catch((error) => {
  console.error("[mock:http] 启动失败：", error);
  process.exit(1);
});
