import {
  clearLegacyUserStorage,
  readAuthSessionCache,
} from '@/auth/sessionStorage';

/** 清理旧版 URL 用户名缓存；当前身份统一由 JWT HttpOnly Cookie 提供。 */
export function initUserContext() {
  clearLegacyUserStorage();
  const params = new URLSearchParams(window.location.search);
  if (params.has('userName')) {
    params.delete('userName');
    const query = params.toString();
    const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', cleanUrl);
  }
}

export function getUserName() {
  return readAuthSessionCache()?.user.userName ?? '';
}
