import { API_ROUTE_MODULES } from "./api-route-modules";

/**
 * 若 URL 为 /api/v1/:userName/:module/...，剥离 userName 并重写 req.url，供 Nest 路由匹配。
 * @returns 解析到的 userName；非 userName 前缀路径时返回 undefined
 */
export function extractAndRewriteUserNamePath(req: { url?: string }): string | undefined {
  const [pathname, query = ""] = splitUrl(req.url ?? "");
  const match = pathname.match(/^(\/api)?(\/v\d+)\/([^/]+)(\/.*)?$/);
  if (!match) {
    return undefined;
  }

  const apiPrefix = `${match[1] ?? ""}${match[2]}`;
  const segment = safeDecode(match[3]);
  const rest = match[4] || "";

  if (API_ROUTE_MODULES.has(segment)) {
    return undefined;
  }

  const moduleSegment = rest.split("/").filter(Boolean)[0];
  if (!moduleSegment || !API_ROUTE_MODULES.has(moduleSegment)) {
    return undefined;
  }

  req.url = `${apiPrefix}${rest}${query}`;
  return segment;
}

function splitUrl(url: string): [string, string] {
  const index = url.indexOf("?");
  if (index === -1) {
    return [url, ""];
  }
  return [url.slice(0, index), url.slice(index)];
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}
