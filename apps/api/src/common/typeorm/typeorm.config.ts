/**
 * @file TypeORM 连接配置工厂
 */
import { ConfigService } from "@nestjs/config";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { join } from "node:path";
import { getAppConfig } from "@config/app-config.util";
import { AppConfig } from "@config/app-config.types";
import { AuditSubscriber } from "../audit/audit.subscriber";

/**
 * 根据应用配置创建 TypeORM 模块选项
 * @param appConfig - 应用配置对象
 */
export function createTypeOrmConfig(
  appConfig: AppConfig,
): TypeOrmModuleOptions {
  return {
    type: "mysql",
    host: appConfig.typeOrm.host,
    port: appConfig.typeOrm.port,
    username: appConfig.typeOrm.username,
    password: appConfig.typeOrm.password,
    database: appConfig.typeOrm.database,
    synchronize:
      appConfig.nodeEnv === "development" || appConfig.nodeEnv === "local",
    entities: [join(__dirname, "../../**/entity/*.js")],
    subscribers: [AuditSubscriber],
    logging: false, //appConfig.nodeEnv === "development" || appConfig.nodeEnv === "local",
  };
}

/**
 * Nest 异步工厂：从 ConfigService 解析并创建 TypeORM 选项
 * @param configService - Nest 配置服务
 */
export function createTypeOrmOptions(
  configService: ConfigService,
): TypeOrmModuleOptions {
  return createTypeOrmConfig(getAppConfig(configService));
}
