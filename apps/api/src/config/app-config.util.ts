/**
 * @file 从 Nest ConfigService 组装强类型应用配置
 */
import { ConfigService } from "@nestjs/config";
import { AppConfig } from "./app-config.types";

/**
 * 读取并归一化应用配置（含数据库、MinIO、AI Chat 等）
 * @param configService - Nest 配置服务
 */
export function getAppConfig(configService: ConfigService): AppConfig {
  return {
    nodeEnv: configService.get<string>("nodeEnv", "development"),
    port: configService.get<number>("port", 34550),
    typeOrm: configService.get<AppConfig["typeOrm"]>("typeOrm")!,
    typeOrmTest: configService.get<AppConfig["typeOrmTest"]>("typeOrmTest")!,
    minio: configService.get<AppConfig["minio"]>("minio")!,
    aiWorkflow: configService.get<AppConfig["aiWorkflow"]>("aiWorkflow")!,
  };
}
