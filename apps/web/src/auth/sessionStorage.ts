import type { AuthSession } from "@case-forge/shared";

const AUTH_SESSION_KEY = "caseforge_auth_session";
const LEGACY_USER_NAME_KEY = "caseforge_user_name";

/** 清理旧版通过 URL 用户名登录留下的本地数据。 */
export function clearLegacyUserStorage() {
  localStorage.removeItem(LEGACY_USER_NAME_KEY);
}

/** 读取未过期的本地用户缓存。无效或过期缓存会被立即清除。 */
export function readAuthSessionCache(): AuthSession | null {
  const raw = localStorage.getItem(AUTH_SESSION_KEY);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<AuthSession>;
    const userName =
      typeof value.user?.userName === "string"
        ? value.user.userName.trim()
        : "";
    const expiresAt =
      typeof value.expiresAt === "string" ? Date.parse(value.expiresAt) : NaN;
    if (!userName || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      clearAuthSessionCache();
      return null;
    }
    return {
      user: { userName },
      expiresAt: new Date(expiresAt).toISOString(),
    };
  } catch {
    clearAuthSessionCache();
    return null;
  }
}

export function writeAuthSessionCache(session: AuthSession) {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export function clearAuthSessionCache() {
  localStorage.removeItem(AUTH_SESSION_KEY);
}
