/** API 根路径（不含 userName），如 /api/v1 */
export function getApiRoot() {
  return (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
}
