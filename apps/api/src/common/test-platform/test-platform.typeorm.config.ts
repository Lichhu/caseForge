/**
 * @file 测管平台库 TypeORM 连接配置
 */
import { ConfigService } from "@nestjs/config";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { getAppConfig } from "@config/app-config.util";
import { TestPlatformCaseEntity } from "./entity/test-platform-case.entity";
import { TestPlatformCaseStepEntity } from "./entity/test-platform-case-step.entity";
import { TestPlatformProjectEntity } from "./entity/test-platform-project.entity";

export function createTestPlatformTypeOrmConfig(
  configService: ConfigService,
): TypeOrmModuleOptions {
  const { typeOrmTest } = getAppConfig(configService);
  return {
    type: "mysql",
    host: typeOrmTest.host,
    port: typeOrmTest.port,
    username: typeOrmTest.username,
    password: typeOrmTest.password,
    database: typeOrmTest.database,
    synchronize: false,
    logging: false,
    entities: [
      TestPlatformProjectEntity,
      TestPlatformCaseEntity,
      TestPlatformCaseStepEntity,
    ],
  };
}
