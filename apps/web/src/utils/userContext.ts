const STORAGE_KEY = 'caseforge_user_name';

/** 从入口 URL 初始化当前浏览器用户，并清除地址栏中的 userName。 */
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
    const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', cleanUrl);
  }
}

export function getUserName() {
  return localStorage.getItem(STORAGE_KEY) || '';
}

function decodeUserName(raw: string) {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}
