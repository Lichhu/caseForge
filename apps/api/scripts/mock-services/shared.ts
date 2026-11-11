/**
 * 外部 Mock 服务公共逻辑：
 * - 读取 mock.config.json 与 fixture 文件
 * - 按请求报文匹配 fixture
 * - 统一处理编码（GBK / UTF-8）与长度前缀
 *
 * 仅用于本地调试，默认只监听 127.0.0.1。
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";
import iconv from "iconv-lite";

export interface FramingConfig {
  type: "length-prefix";
  width: number;
  encoding?: string;
}

export interface MockMatch {
  method?: string;
  path?: string;
  pathPrefix?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  bodyIncludes?: string;
  bodyRegex?: string;
}

export interface MockResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  delayMs?: number;
  encoding?: string;
  framing?: FramingConfig | null;
  close?: boolean;
}

export interface MockFixture {
  name: string;
  description?: string;
  match?: MockMatch;
  response: MockResponse;
}

export interface LoadedFixture {
  fixture: MockFixture;
  file: string;
}

export interface MatchInput {
  method?: string;
  path?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body: string;
}

export interface HttpMockOptions {
  host: string;
  port: number;
  fixtures: string;
  encoding?: string;
}

export interface TcpMockOptions {
  host: string;
  port: number;
  fixtures: string;
  encoding?: string;
  requestFraming?: FramingConfig | null;
  responseFraming?: FramingConfig | null;
  closeAfterResponse?: boolean;
  maxRequestBytes?: number;
}

export interface MockConfig {
  http?: HttpMockOptions;
  tcp?: TcpMockOptions;
}

export interface MatchResult {
  hit?: LoadedFixture;
  requestPreview: string;
}

const DEFAULT_MAX_REQUEST_BYTES = 10 * 1024 * 1024;

/** 解析 --key value / --key=value 形式的命令行参数 */
export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

/** 默认配置：优先 mock.config.json，其次示例配置 */
export function defaultConfigPath(): string {
  const local = join(__dirname, "mock.config.json");
  if (existsSync(local)) return local;
  return join(__dirname, "mock.config.example.json");
}

export function resolveConfigPath(
  args: Record<string, string | boolean>,
): string {
  const raw = args.config;
  return typeof raw === "string"
    ? resolve(process.cwd(), raw)
    : defaultConfigPath();
}

/** 读取配置，并把 fixtures 相对路径解析为绝对路径 */
export function loadConfig(configPath: string): MockConfig {
  if (!existsSync(configPath)) {
    throw new Error(
      `找不到配置文件：${configPath}\n` +
        "请复制 mock.config.example.json 为 mock.config.json 后再修改。",
    );
  }
  const configDir = resolve(configPath, "..");
  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as MockConfig;
  return {
    http: parsed.http
      ? {
          host: parsed.http.host || "127.0.0.1",
          port: Number(parsed.http.port) || 18080,
          encoding: parsed.http.encoding || "utf8",
          fixtures: resolveFixturePath(configDir, parsed.http.fixtures),
        }
      : undefined,
    tcp: parsed.tcp
      ? {
          host: parsed.tcp.host || "127.0.0.1",
          port: Number(parsed.tcp.port) || 16030,
          encoding: parsed.tcp.encoding || "GBK",
          requestFraming:
            parsed.tcp.requestFraming === undefined
              ? { type: "length-prefix", width: 4 }
              : parsed.tcp.requestFraming,
          responseFraming: parsed.tcp.responseFraming,
          closeAfterResponse: parsed.tcp.closeAfterResponse ?? false,
          maxRequestBytes:
            parsed.tcp.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES,
          fixtures: resolveFixturePath(configDir, parsed.tcp.fixtures),
        }
      : undefined,
  };
}

function resolveFixturePath(configDir: string, fixturePath: string): string {
  if (!fixturePath) {
    throw new Error("配置缺少 fixtures 路径");
  }
  return isAbsolute(fixturePath)
    ? fixturePath
    : resolve(configDir, fixturePath);
}

/** 读取 fixture 文件或目录；目录下所有 .json 按文件名排序 */
export function loadFixtures(fixturePath: string): LoadedFixture[] {
  if (!existsSync(fixturePath)) {
    throw new Error(`找不到 fixture 路径：${fixturePath}`);
  }
  const files = statSync(fixturePath).isDirectory()
    ? collectJsonFiles(fixturePath)
    : [fixturePath];
  const loaded: LoadedFixture[] = [];
  for (const file of files) {
    loaded.push(...parseFixtureFile(file));
  }
  if (!loaded.length) {
    throw new Error(`fixture 目录为空：${fixturePath}`);
  }
  return loaded;
}

function collectJsonFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((entry) => !entry.name.startsWith("."));
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(fullPath));
      continue;
    }
    if (entry.isFile() && extname(entry.name).toLowerCase() === ".json") {
      files.push(fullPath);
    }
  }
  return files;
}

function parseFixtureFile(file: string): LoadedFixture[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `fixture 解析失败：${file}\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const rows = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.fixtures)
      ? parsed.fixtures
      : [parsed];
  return rows.map((row, index) => {
    if (!isRecord(row) || typeof row.name !== "string" || !row.name.trim()) {
      throw new Error(`fixture 缺少 name：${file}（第 ${index + 1} 条）`);
    }
    if (!isRecord(row.response)) {
      throw new Error(`fixture 缺少 response：${file}（${row.name}）`);
    }
    return { fixture: row as unknown as MockFixture, file };
  });
}

/** 按 fixture 顺序匹配，第一条命中的生效 */
export function matchFixture(
  fixtures: LoadedFixture[],
  input: MatchInput,
): MatchResult {
  const hit = fixtures.find(({ fixture }) => matches(fixture.match, input));
  return { hit, requestPreview: preview(input.body) };
}

function matches(match: MockMatch | undefined, input: MatchInput): boolean {
  if (!match) return true;
  if (
    match.method &&
    match.method.toUpperCase() !== (input.method ?? "").toUpperCase()
  ) {
    return false;
  }
  const path = input.path ?? "";
  if (match.path && match.path !== path) return false;
  if (match.pathPrefix && !path.startsWith(match.pathPrefix)) return false;

  for (const [key, expected] of Object.entries(match.query ?? {})) {
    if (String(input.query?.[key]) !== String(expected)) return false;
  }

  const inputHeaders = input.headers ?? {};
  for (const [key, expected] of Object.entries(match.headers ?? {})) {
    if (String(inputHeaders[key.toLowerCase()]) !== String(expected)) {
      return false;
    }
  }

  if (match.bodyIncludes && !input.body.includes(match.bodyIncludes)) {
    return false;
  }
  if (match.bodyRegex) {
    try {
      if (!new RegExp(match.bodyRegex, "i").test(input.body)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** 将 Node 的 header 值统一成小写 key + 字符串 */
export function normalizeHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    normalized[key.toLowerCase()] = Array.isArray(value)
      ? value.join(",")
      : value;
  }
  return normalized;
}

/** 编码文本；未知编码回退 UTF-8 */
export function encodeText(value: string, encoding = "utf8"): Buffer {
  const normalized = encoding.toLowerCase();
  if (normalized === "utf8" || normalized === "utf-8") {
    return Buffer.from(value, "utf8");
  }
  if (iconv.encodingExists(normalized)) {
    return iconv.encode(value, normalized);
  }
  return Buffer.from(value, "utf8");
}

/** 解码文本；未知编码回退 UTF-8 */
export function decodeText(buffer: Buffer, encoding = "utf8"): string {
  const normalized = encoding.toLowerCase();
  if (normalized === "utf8" || normalized === "utf-8") {
    return buffer.toString("utf8");
  }
  if (iconv.encodingExists(normalized)) {
    return iconv.decode(buffer, normalized);
  }
  return buffer.toString("utf8");
}

/** 把 fixture.response.body 序列化为 Buffer */
export function serializeBodyToBuffer(
  body: unknown,
  encoding = "utf8",
): Buffer {
  if (body === undefined || body === null) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return encodeText(body, encoding);
  return encodeText(JSON.stringify(body, null, 2), encoding);
}

/** 拼长度前缀：宽度不足补 0 */
export function framePayload(payload: Buffer, width: number): Buffer {
  const prefix = String(payload.length).padStart(width, "0");
  return Buffer.concat([Buffer.from(prefix, "latin1"), payload]);
}

export function requestPreview(body: string, max = 240): string {
  return preview(body, max);
}

function preview(body: string, max = 240): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}...` : oneLine;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
