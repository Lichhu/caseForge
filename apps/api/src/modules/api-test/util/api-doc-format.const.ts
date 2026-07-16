export const API_DOC_SHEET_NAMES = [
  "基础信息",
  "服务信息",
  "请求报文",
  "示例报文",
] as const;

/** 历史 Excel 工作表名，仅用于解析旧文档边界 */
export const API_DOC_LEGACY_SHEET_NAMES = ["技术信息", "响应报文"] as const;

export const API_DOC_SECTION_BOUNDARY_NAMES = [
  ...API_DOC_SHEET_NAMES,
  ...API_DOC_LEGACY_SHEET_NAMES,
] as const;

export const API_DOC_SECTION_SEPARATOR = "----";
