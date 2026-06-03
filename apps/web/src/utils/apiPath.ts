import { getUserName } from './userContext';

/** API 根路径（不含 userName），如 /api/v1 */
export function getApiRoot() {
  return (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
}

/** 带当前用户的 API 基址，如 /api/v1/system */
export function getUserApiBaseUrl() {
  return `${getApiRoot()}/${encodeURIComponent(getUserName())}`;
}
