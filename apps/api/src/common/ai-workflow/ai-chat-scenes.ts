/**
 * @file AI Chat 调用场景常量
 * 统计 token 用量时按 scene 分组，新增调用点时请在此登记，避免散落魔法字符串。
 */
export const AI_CHAT_SCENES = {
  /** 需求文档结构化 */
  STRUCT_REQUIREMENT: "struct-doc.struct-requirement",
  /** 结构化文档压缩为案例生成需求总结 */
  CASE_SUMMARY: "struct-doc.case-summary",
  /** 案例编辑器：AI 生成结构化 Markdown */
  CASE_MARKDOWN: "case-editor.struct-markdown",
  /** 案例编辑器：生成 JSON 案例 */
  CASE_JSON: "case-editor.json-cases",
  /** 接口测试：按场景生成案例计划 */
  API_CASE_PLAN: "api-test.case-plan",
  /** 接口测试：根据响应生成断言 */
  API_ASSERTION: "api-test.assertion",
  /** 接口测试：生成数据处理函数脚本 */
  API_DATA_FUNCTION_SCRIPT: "api-test.data-function-script",
  /** 接口测试：项目报告风险分类 */
  API_REPORT_RISK: "api-test.report-risk",
  /** 接口测试：判断场景是否适用并生成案例 */
  API_SCENARIO_CASES: "api-test.scenario-cases",
  /** 未标注场景（应尽量避免） */
  UNKNOWN: "unknown",
} as const;

export type AiChatScene = (typeof AI_CHAT_SCENES)[keyof typeof AI_CHAT_SCENES];
