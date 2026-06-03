/**
 * @file MinIO 对象存储模块配置与注入令牌
 */
import { AppConfig } from "@config/app-config.types";

/** MinIO 配置在 DI 容器中的注入令牌 */
export const MINIO_CONFIG = "MINIO_CONFIG";

/** MinIO 客户端模块运行时配置 */
export interface MinioModuleConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucketName: string;
  pathPrefix: string;
  publicBaseUrl: string;
}

/**
 * 从应用配置构建 MinIO 模块配置（含端点、凭证、桶名等）
 * @param appConfig - 应用配置对象
 */
export function createMinioConfig(appConfig: AppConfig): MinioModuleConfig {
  const { minio } = appConfig;
  return {
    endPoint: minio.host,
    port: minio.port,
    useSSL: false,
    accessKey: minio.accessKey,
    secretKey: minio.secretKey,
    bucketName: minio.bucketName,
    pathPrefix: minio.pathPrefix,
    publicBaseUrl: minio.publicBaseUrl,
  };
}
