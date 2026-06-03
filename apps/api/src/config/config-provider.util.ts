/**
 * @file 基于 AppConfig 子集创建 Nest 自定义配置 Provider 的工具
 */
import { ConfigService } from "@nestjs/config";
import { AppConfig } from "./app-config.types";
import { getAppConfig } from "./app-config.util";

/**
 * 创建注入指定配置切片的 Provider（如 MINIO_CONFIG、AI_WORKFLOW_CONFIG）
 * @param token - DI 注入令牌
 * @param select - 从 AppConfig 选取子配置的函数
 */
export function createConfigProvider<T>(
  token: string | symbol,
  select: (config: AppConfig) => T,
) {
  return {
    provide: token,
    useFactory: (configService: ConfigService) =>
      select(getAppConfig(configService)),
    inject: [ConfigService],
  };
}
