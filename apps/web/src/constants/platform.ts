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

export function getPlatformById(id: PlatformId): PlatformMeta {
  return PLATFORMS.find((item) => item.id === id) ?? PLATFORMS[0];
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
  return resolvePlatformFromPath(route.path) ?? PLATFORMS[0];
}
