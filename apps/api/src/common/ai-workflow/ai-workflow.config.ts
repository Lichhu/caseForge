/**
 * @file AI Chat 模块配置与注入令牌
 */
import { AppConfig } from "@config/app-config.types";

/** AI Chat 配置在 DI 容器中的注入令牌 */
export const AI_WORKFLOW_CONFIG = "AI_WORKFLOW_CONFIG";

/** AI Chat 模块运行时配置类型 */
export type AiWorkflowModuleConfig = AppConfig["aiWorkflow"];

/**
 * 从应用配置中提取 AI Chat 子配置
 * @param appConfig - 应用配置对象
 */
export function createAiWorkflowConfig(
  appConfig: AppConfig,
): AiWorkflowModuleConfig {
  return appConfig.aiWorkflow;
}
