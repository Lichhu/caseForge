/**
 * @file 本地 JSON 文件读写工具
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * 读取 JSON 文件，失败或不存在时返回 fallback
 * @param filePath - 文件路径
 * @param fallback - 解析失败时的默认值
 */
export async function readJsonFile<T>(
  filePath: string,
  fallback: T,
): Promise<T> {
  try {
    const text = await readFile(filePath, "utf8");
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/**
 * 将对象序列化为 JSON 并写入文件（自动创建父目录）
 * @param filePath - 目标文件路径
 * @param value - 待写入的数据
 */
export async function writeJsonFile(filePath: string, value: unknown) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
