/**
 * 全局库仍兼容历史 projectId 列：新数据统一使用固定伪项目 ID，
 * 权限与可见范围由业务权限控制，不再按具体项目隔离。
 */
export function globalLibraryProjectId() {
  return "__global_library__";
}
