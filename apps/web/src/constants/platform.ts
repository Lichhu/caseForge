export type PlatformId = "case-forge" | "api-test";

export interface PlatformMeta {
  id: PlatformId;
  route: string;
  title: string;
  subtitle: string;
  logo: string;
}

export const PLATFORMS: PlatformMeta[] = [
  {
    id: "case-forge",
    route: "/case-forge",
    title: "智能生成案例平台",
    subtitle: "银行功能测试案例生成",
    logo: "CF",
  },
  {
    id: "api-test",
    route: "/api-test",
    title: "智能接口测试平台",
    subtitle: "接口文档、执行与报表",
    logo: "AT",
  },
];

type RouteLike = {
  path: string;
  name?: string | symbol | null | undefined;
};

/** 最近一次访问的业务平台，供登录审计等系统页面继承顶部导航。 */
const LAST_PLATFORM_STORAGE_KEY = "caseforge:last-platform";

export function getPlatformById(id: PlatformId): PlatformMeta {
  return PLATFORMS.find((item) => item.id === id) ?? PLATFORMS[0];
}

/** 记录用户当前所在的业务平台。 */
export function rememberPlatform(id: PlatformId) {
  try {
    window.localStorage.setItem(LAST_PLATFORM_STORAGE_KEY, id);
  } catch {
    // 隐私模式等场景下不可写，忽略即可。
  }
}

/** 读取最近访问的业务平台，默认智能生成案例平台。 */
export function getLastPlatform(): PlatformMeta {
  try {
    const value = window.localStorage.getItem(LAST_PLATFORM_STORAGE_KEY);
    if (value === "case-forge" || value === "api-test") {
      return getPlatformById(value);
    }
  } catch {
    // 忽略存储不可用。
  }
  return PLATFORMS[0];
}

export function resolvePlatformFromPath(
  pathname: string,
): PlatformMeta | undefined {
  return PLATFORMS.find(
    (item) => pathname === item.route || pathname.startsWith(`${item.route}/`),
  );
}

export function getPlatformByRoute(route: RouteLike | string): PlatformMeta {
  if (typeof route === "string") {
    return resolvePlatformFromPath(route) ?? PLATFORMS[0];
  }
  if (route.name === "case-forge" || route.name === "api-test") {
    return getPlatformById(route.name);
  }
  // 系统管理页不属于任何业务平台，沿用用户最近访问的平台。
  if (route.name === "auth-audit") {
    return getLastPlatform();
  }
  return resolvePlatformFromPath(route.path) ?? PLATFORMS[0];
}
