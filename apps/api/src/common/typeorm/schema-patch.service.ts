import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DataSource } from "typeorm";
import { applyApiTestSchemaMigrations } from "./api-schema-migrations.util";

/**
 * 本地/生产库未开 synchronize 时，补齐关键 schema 变更，避免 500。
 */
@Injectable()
export class SchemaPatchService implements OnModuleInit {
  private readonly logger = new Logger(SchemaPatchService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.ensureProjectPlatformColumn();
    await this.ensureCaseNodeMetadataCaseNatureColumn();
    await applyApiTestSchemaMigrations(this.dataSource);
  }

  private async ensureProjectPlatformColumn() {
    const rows: Array<{ Field: string }> = await this.dataSource.query(
      "SHOW COLUMNS FROM case_project LIKE 'platform'",
    );
    if (rows.length > 0) {
      return;
    }

    this.logger.warn(
      "检测到 case_project 缺少 platform 列，正在自动执行 schema 补丁…",
    );
    await this.dataSource.query(`
      ALTER TABLE case_project
        ADD COLUMN platform ENUM('case-forge', 'api-test') NOT NULL DEFAULT 'case-forge'
        COMMENT '所属产品线'
        AFTER description
    `);
    await this.dataSource.query(`
      UPDATE case_project SET platform = 'case-forge'
      WHERE platform IS NULL OR platform = ''
    `);

    try {
      await this.dataSource.query(`
        CREATE INDEX idx_case_project_platform_updated
        ON case_project (platform, updatedAt)
      `);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Duplicate key name")) {
        throw error;
      }
    }

    this.logger.log("case_project.platform 列已补齐");
  }

  private async ensureCaseNodeMetadataCaseNatureColumn() {
    const rows: Array<{ Field: string }> = await this.dataSource.query(
      "SHOW COLUMNS FROM case_node_metadata LIKE 'caseNature'",
    );
    if (rows.length > 0) {
      return;
    }

    this.logger.warn(
      "检测到 case_node_metadata 缺少 caseNature 列，正在自动执行 schema 补丁…",
    );
    await this.dataSource.query(`
      ALTER TABLE case_node_metadata
        ADD COLUMN caseNature VARCHAR(16) NULL COMMENT '案例性质：正/反'
        AFTER caseTreeId
    `);
    await this.dataSource.query(`
      UPDATE case_node_metadata
      SET priority = CASE
        WHEN priority = 'P0' THEN '高'
        WHEN priority = 'P1' THEN '中'
        WHEN priority IN ('P2', 'P3') THEN '低'
        WHEN priority IS NULL OR priority = '' THEN '高'
        ELSE priority
      END
    `);
    this.logger.log("case_node_metadata.caseNature 列已补齐");
  }

}
