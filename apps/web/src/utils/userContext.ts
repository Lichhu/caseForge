const STORAGE_KEY = 'caseforge_user_name';
const DEFAULT_USER = 'system';

/** 从入口 URL 读取 userName 并持久化，供 API 请求头使用 */
export function initUserContext() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('userName')?.trim();
  if (fromUrl) {
    const userName = decodeUserName(fromUrl);
    if (userName) {
      localStorage.setItem(STORAGE_KEY, userName);
    }
    params.delete('userName');
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
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
