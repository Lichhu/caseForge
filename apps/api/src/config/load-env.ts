/**
 * @file 加载 apps/api/env 下的环境变量（支持 // 与 # 注释行）
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** apps/api 根目录（兼容 ts-node 与 nest dist 运行） */
function getApiRoot() {
  return resolve(__dirname, "../..");
}

/** 按 NODE_ENV 解析候选 env 文件路径（优先级从高到低） */
export function resolveEnvFilePaths(nodeEnv = process.env.NODE_ENV ?? "development") {
  const envDir = resolve(getApiRoot(), "env");
  return [
    resolve(envDir, `.${nodeEnv}.env`),
    resolve(envDir, ".development.env"),
    resolve(getApiRoot(), ".env"),
  ].filter((filePath) => existsSync(filePath));
}

/** Nest ConfigModule 使用的相对路径列表 */
export function getNestEnvFilePaths() {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  return [`env/.${nodeEnv}.env`, "env/.development.env", ".env"];
}

/**
 * 将 env 文件写入 process.env（不覆盖已存在的变量）
 * 仅加载第一个存在的候选文件
 */
export function loadApiEnv(nodeEnv = process.env.NODE_ENV ?? "development") {
  const [filePath] = resolveEnvFilePaths(nodeEnv);
  if (!filePath) {
    return;
  }

  const text = readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
