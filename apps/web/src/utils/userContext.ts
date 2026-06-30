const STORAGE_KEY = 'caseforge_user_name';
const DEFAULT_USER = 'system';

/** 从入口 URL 读取 userName 并持久化，供 API 请求头使用（保留 URL 中的 userName 便于分享与平台切换） */
export function initUserContext() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('userName')?.trim();
  if (fromUrl) {
    const userName = decodeUserName(fromUrl);
    if (userName) {
      localStorage.setItem(STORAGE_KEY, userName);
    }
  }
}

export function syncUserNameFromQuery(query: Record<string, unknown>) {
  const raw = query.userName;
  const fromUrl =
    typeof raw === 'string'
      ? raw.trim()
      : Array.isArray(raw)
        ? String(raw[0] ?? '').trim()
        : '';
  if (!fromUrl) return;
  const userName = decodeUserName(fromUrl);
  if (userName) {
    localStorage.setItem(STORAGE_KEY, userName);
  }
}

export function getUserName() {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_USER;
}

function decodeUserName(raw: string) {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}
