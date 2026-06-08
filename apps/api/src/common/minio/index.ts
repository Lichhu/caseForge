/**
 * @file MinIO 对象存储 Nest 模块
 */
import { Module } from "@nestjs/common";
import { createConfigProvider } from "@config/config-provider.util";
import { MINIO_CONFIG, createMinioConfig } from "./minio.config";
import { MinioStorageService } from "./service/minio.service";

@Module({
  providers: [
    createConfigProvider(MINIO_CONFIG, createMinioConfig),
    MinioStorageService,
  ],
  exports: [MINIO_CONFIG, MinioStorageService],
})
/** MinIO 存储功能模块 */
export class MinioStorageModule {}
