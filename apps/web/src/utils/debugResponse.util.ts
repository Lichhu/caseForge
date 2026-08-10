import type { DebugRunResult } from "@/api/apiTestClient";

/** 调试结果是否可用于 AI 断言生成，返回问题描述或 null。 */
export function getDebugResponseIssue(result: DebugRunResult | null): string | null {
  if (!result) {
    return "请先调试执行并获取响应结果";
  }
  if (result.error) {
    return "当前调试请求失败，请重新调试后再生成断言";
  }
  if (result.statusCode === 0) {
    return "未获取到有效响应，请先调试执行";
  }
  return null;
}

/** 响应体可能是带长度前缀的字符串 / JSON / XML，统一解析为可遍历结构。 */
export function parseDebugResponseBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  const normalized = body.trim().replace(/^\d{4,8}\s*(?=[<{\[])/, "");
  try {
    return JSON.parse(normalized);
  } catch {
    return normalized;
  }
}

/** 递归收集响应体中可提取的字段路径（JSONPath / XPath 叶子节点）。 */
export function responsePaths(value: unknown, path = "$", out: string[] = []): string[] {
  if (typeof value === "string") {
    const xml = value.trim().replace(/^\d{4,8}\s*(?=[<{\[])/, "");
    try {
      const json = JSON.parse(xml);
      if (json && typeof json === "object") return responsePaths(json, path, out);
    } catch { /* not JSON */ }
    if (!xml.startsWith("<")) {
      if (path !== "$") out.push(path);
      return out;
    }
    const root = new DOMParser().parseFromString(xml, "application/xml").documentElement;
    if (root && !root.closest("parsererror") && !root.querySelector("parsererror")) {
      const walk = (element: Element, parent = "") => {
        const next = `${parent}/${element.tagName}`;
        const children = [...element.children];
        if (!children.length) out.push(`${next}/text()`);
        for (const child of children) walk(child, next);
      };
      walk(root);
      return out;
    }
  }
  if (value === null || typeof value !== "object") {
    out.push(path);
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    responsePaths(child, Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`, out);
  }
  return out;
}
