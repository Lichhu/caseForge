/**
 * @file 测管平台数据库模块
 */
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { createTestPlatformTypeOrmConfig } from "./test-platform.typeorm.config";
import { TEST_PLATFORM_CONNECTION } from "./test-platform.constants";
import { TestPlatformCaseEntity } from "./entity/test-platform-case.entity";
import { TestPlatformCaseStepEntity } from "./entity/test-platform-case-step.entity";
import { TestPlatformProjectEntity } from "./entity/test-platform-project.entity";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      name: TEST_PLATFORM_CONNECTION,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createTestPlatformTypeOrmConfig,
    }),
    TypeOrmModule.forFeature(
      [
        TestPlatformProjectEntity,
        TestPlatformCaseEntity,
        TestPlatformCaseStepEntity,
      ],
      TEST_PLATFORM_CONNECTION,
    ),
  ],
  exports: [TypeOrmModule],
})
export class TestPlatformModule {}

export { TEST_PLATFORM_CONNECTION } from "./test-platform.constants";
