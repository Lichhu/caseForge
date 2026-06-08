/**
 * @file TypeORM 全局数据库模块
 */
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SchemaPatchService } from "./schema-patch.service";
import { createTypeOrmOptions } from "./typeorm.config";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createTypeOrmOptions,
    }),
  ],
  providers: [SchemaPatchService],
})
/** 注册 TypeORM 根连接的 Nest 模块 */
export class TypeormModule {}
