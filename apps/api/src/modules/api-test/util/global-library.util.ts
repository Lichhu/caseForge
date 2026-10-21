import { RequestContext } from "@common/audit/request-context";

/**
 * 全局库仍兼容历史 projectId 列：新数据使用当前用户的伪项目 ID，
 * 查询统一按 createdBy 隔离，因此库本身不再依赖具体项目。
 */
export function globalLibraryProjectId() {
  return `global:${RequestContext.getUserName()}`;
}
