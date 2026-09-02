/**
 * 大报文测试载荷：读取内置的 1MB base64 文本资产
 *
 * 资产文件随 nest-cli assets 拷贝到 dist，兼容 src 直跑与编译产物两种运行方式。
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { extractApiDocSection } from "./api-doc.parser";

const LARGE_PAYLOAD_FILE = "large-payload-base64.txt";

/** 大报文案例在 metadata.scenarioKey 中的标记，便于重试时覆盖旧案例 */
export const LARGE_PAYLOAD_SCENARIO_KEY = "large_payload";

export const LARGE_PAYLOAD_SCENARIO_NAME = "大报文测试";

/** 空字段案例在 metadata.scenarioKey 中的标记，便于重试时覆盖旧案例 */
export const EMPTY_FIELD_SCENARIO_KEY = "empty_field";

export const EMPTY_FIELD_SCENARIO_NAME = "空字段测试";

/** 请求报文声明长度超过该值的字段自动纳入大报文/空字段测试 */
export const LONG_FIELD_LENGTH_THRESHOLD = 100000;

let cachedPayload: string | null = null;

/** apps/api 根目录（兼容 src 直跑与 dist 编译产物） */
function getApiRoot() {
  return resolve(__dirname, "../../../..");
}

function resolveLargePayloadPath() {
  const apiRoot = getApiRoot();
  const candidates = [
    join(__dirname, "../assets", LARGE_PAYLOAD_FILE),
    join(apiRoot, "src/modules/api-test/assets", LARGE_PAYLOAD_FILE),
    join(apiRoot, "dist/modules/api-test/assets", LARGE_PAYLOAD_FILE),
  ];
  const matched = candidates.find((path) => existsSync(path));
  if (!matched) {
    throw new Error(
      `未找到大报文测试载荷：${LARGE_PAYLOAD_FILE}（已尝试：${candidates.join(" | ")}）`,
    );
  }
  return matched;
}

/** 读取大报文 base64 内容（去首尾空白，进程内缓存） */
export function loadLargePayloadBase64(): string {
  if (cachedPayload) return cachedPayload;
  const payload = readFileSync(resolveLargePayloadPath(), "utf8").trim();
  if (!payload) {
    throw new Error(`大报文测试载荷为空：${LARGE_PAYLOAD_FILE}`);
  }
  cachedPayload = payload;
  return payload;
}

/** 解析长度单元格（支持区间/多值写法，取最大数值）；无数字时返回 null */
export function parseDeclaredLength(cell: string): number | null {
  const nums = (cell.match(/\d+/g) ?? []).map(Number);
  if (!nums.length) return null;
  return Math.max(...nums);
}

/**
 * 从结构化文档的请求报文表格中，提取声明长度大于阈值的字段路径
 * （节点路径/节点代码 拼接，与 overrides 路径格式一致），按文档顺序去重返回。
 */
export function extractLongRequestFieldPaths(
  structuredMarkdown: string,
  threshold: number = LONG_FIELD_LENGTH_THRESHOLD,
): string[] {
  const lines = extractApiDocSection(structuredMarkdown, "请求报文")
    .split("\n")
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split("|").map((cell) => cell.trim());
  const pathIndex = Math.max(
    0,
    header.findIndex((cell) => cell.includes("节点路径")),
  );
  const codeIndex = Math.max(
    1,
    header.findIndex((cell) => cell.includes("节点代码")),
  );
  const lengthIndex = header.findIndex((cell) => cell.includes("长度"));
  if (lengthIndex < 0) return [];
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split("|").map((cell) => cell.trim());
    const path = (cells[pathIndex] ?? "").replace(/\/$/, "");
    const code = cells[codeIndex] ?? "";
    if (!path || !code) continue;
    const length = parseDeclaredLength(cells[lengthIndex] ?? "");
    if (length === null || length <= threshold) continue;
    const value = `${path}/${code}`;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    paths.push(value);
  }
  return paths;
}
