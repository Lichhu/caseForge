/**
 * @file MinIO 对象存储服务：上传、预签名 URL、对象路径生成
 */
import { Injectable, Logger, Inject } from "@nestjs/common";
import * as Minio from "minio";
import * as stream from "node:stream";
import { MINIO_CONFIG, MinioModuleConfig } from "@minio/minio.config";

/**
 * MinIO 存储服务：封装桶检查、文件上传与访问 URL 生成
 */
@Injectable()
export class MinioStorageService {
  private readonly logger = new Logger(MinioStorageService.name);
  private minioClient: Minio.Client;
  private bucketName: string;

  constructor(
    @Inject(MINIO_CONFIG) private readonly config: MinioModuleConfig,
  ) {
    this.bucketName = this.config.bucketName || "case-forge";
    this.minioClient = new Minio.Client({
      endPoint: this.config.endPoint,
      port: this.config.port,
      useSSL: this.config.useSSL,
      accessKey: this.config.accessKey,
      secretKey: this.config.secretKey,
    });
  }

  /**
   * 生成项目下对象存储路径（按日期 / 项目 ID / 随机后缀文件名）
   * @param projectId - 项目 ID
   * @param fileName - 原始文件名
   */
  buildProjectObjectPath(projectId: string, fileName: string) {
    const safeName = fileName.replace(/[^\w.\-()\u4e00-\u9fff]/g, "_");
    const randomSuffix = Math.random().toString(36).slice(2, 11);
    const extensionMatch = safeName.match(/(\.[^.]+)$/);
    const extension = extensionMatch?.[1] ?? "";
    const baseName = extension
      ? safeName.slice(0, -extension.length)
      : safeName;
    const objectFileName = extension
      ? `${baseName}-${randomSuffix}${extension}`
      : `${baseName}-${randomSuffix}`;
    return `${this.buildDatePathSegment()}/${projectId}/${objectFileName}`;
  }

  private buildDatePathSegment(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  /**
   * 为对象路径生成预签名 GET URL
   * @param objectPath - 桶内对象路径
   * @param expirySeconds - 链接有效期（秒），默认 7 天
   */
  async getAccessUrl(
    objectPath?: string | null,
    expirySeconds = 7 * 24 * 3600,
  ) {
    if (!objectPath) {
      return undefined;
    }
    try {
      return await this.minioClient.presignedGetObject(
        this.bucketName,
        objectPath,
        expirySeconds,
      );
    } catch (error) {
      this.logger.warn(
        `生成预签名 URL 失败: ${objectPath} - ${(error as Error).message}`,
      );
      return undefined;
    }
  }

  /**
   * 上传文件到 MinIO 指定对象路径
   * @param objectPath - 桶内对象路径
   * @param stream - 可读流、Buffer 或字符串内容
   */
  async uploadFile(
    objectPath: string,
    stream: stream.Readable | Buffer | string,
  ) {
    try {
      const isExistBucket = await this.checkBucketExists(this.bucketName);
      if (!isExistBucket) {
        this.logger.error("Bucket does not exist. Please create it first.");
        throw new Error(`MinIO bucket ${this.bucketName} 不存在`);
      }

      return await this.minioClient.putObject(
        this.bucketName,
        objectPath,
        stream,
      );
    } catch (error) {
      this.logger.error(`Upload failed for ${objectPath}`, error);
      throw error;
    }
  }

  /**
   * 检查存储桶是否存在
   * @param bucketName - 桶名称
   */
  async checkBucketExists(bucketName: string): Promise<boolean> {
    return this.minioClient.bucketExists(bucketName);
  }

  /** 删除 MinIO 对象 */
  async deleteObject(objectPath: string) {
    try {
      const isExistBucket = await this.checkBucketExists(this.bucketName);
      if (!isExistBucket) {
        throw new Error(`MinIO bucket ${this.bucketName} 不存在`);
      }
      await this.minioClient.removeObject(this.bucketName, objectPath);
    } catch (error) {
      this.logger.error(`Delete failed for ${objectPath}`, error);
      throw error;
    }
  }

  /** 读取对象内容为 Buffer */
  async getObjectBuffer(objectPath: string): Promise<Buffer> {
    const data = await this.minioClient.getObject(this.bucketName, objectPath);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      data.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      data.on("end", () => resolve());
      data.on("error", reject);
    });
    return Buffer.concat(chunks);
  }
}
