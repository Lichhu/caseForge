import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DataSource } from "typeorm";
import { applyApiTestSchemaMigrations } from "./api-schema-migrations.util";
import { ensureDatabaseIndexes } from "./database-indexes.util";
import { ensureCaseEditorUtf8mb4TextColumns } from "./utf8mb4-schema.util";

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
    await this.ensureTestPointInstructGenerateErrorColumn();
    await this.ensureCaseGenerateJobTable();
    await this.ensureApiCaseGenerateJobTable();
    await this.ensureStructRequirementJobTable();
    await this.ensureSummaryStructDocColumn();
    await ensureCaseEditorUtf8mb4TextColumns(this.dataSource, this.logger);
    await applyApiTestSchemaMigrations(this.dataSource);
    await ensureDatabaseIndexes(this.dataSource);
    await this.repairCreatedByForApiTestEnvironments();
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

  private async ensureTestPointInstructGenerateErrorColumn() {
    const rows: Array<{ Field: string }> = await this.dataSource.query(
      "SHOW COLUMNS FROM case_test_point_instruct LIKE 'generateError'",
    );
    if (rows.length > 0) {
      return;
    }

    this.logger.warn(
      "检测到 case_test_point_instruct 缺少 generateError 列，正在自动执行 schema 补丁…",
    );
    await this.dataSource.query(`
      ALTER TABLE case_test_point_instruct
        ADD COLUMN generateError TEXT NULL COMMENT '最近一次案例生成失败原因'
        AFTER naturalText
    `);
    this.logger.log("case_test_point_instruct.generateError 列已补齐");
  }

  private async ensureCaseGenerateJobTable() {
    const rows: Array<{ Tables_in_db?: string }> = await this.dataSource.query(
      "SHOW TABLES LIKE 'case_generate_job'",
    );
    if (rows.length > 0) {
      return;
    }

    this.logger.warn(
      "检测到缺少 case_generate_job 表，正在自动执行 schema 补丁…",
    );
    await this.dataSource.query(`
      CREATE TABLE case_generate_job (
        id CHAR(36) NOT NULL PRIMARY KEY,
        projectId CHAR(36) NOT NULL,
        testPointId CHAR(36) NOT NULL,
        status ENUM('queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
        model VARCHAR(255) NULL,
        queuedAt DATETIME(3) NOT NULL,
        startedAt DATETIME(3) NULL,
        finishedAt DATETIME(3) NULL,
        errorMessage TEXT NULL,
        createdBy VARCHAR(255) NULL DEFAULT 'system',
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX idx_case_generate_job_status_queued (status, queuedAt),
        INDEX idx_case_generate_job_project_test_point (projectId, testPointId),
        INDEX idx_case_generate_job_project_status_queued (projectId, status, queuedAt),
        INDEX idx_case_generate_job_test_point_status (testPointId, status),
        INDEX idx_case_generate_job_status_finished (status, finishedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    this.logger.log("case_generate_job 表已创建");
  }

  private async ensureApiCaseGenerateJobTable() {
    const rows: Array<{ Tables_in_db?: string }> = await this.dataSource.query(
      "SHOW TABLES LIKE 'api_case_generate_job'",
    );
    if (rows.length > 0) {
      return;
    }

    this.logger.warn(
      "检测到缺少 api_case_generate_job 表，正在自动执行 schema 补丁…",
    );
    await this.dataSource.query(`
      CREATE TABLE api_case_generate_job (
        id CHAR(36) NOT NULL PRIMARY KEY,
        projectId CHAR(36) NOT NULL,
        transactionId CHAR(36) NOT NULL,
        endpointIds JSON NULL,
        promptIds JSON NULL,
        status ENUM('queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
        resultCount INT NULL,
        queuedAt DATETIME(3) NOT NULL,
        startedAt DATETIME(3) NULL,
        finishedAt DATETIME(3) NULL,
        errorMessage TEXT NULL,
        createdBy VARCHAR(255) NULL DEFAULT 'system',
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX idx_api_case_generate_job_status_queued (status, queuedAt),
        INDEX idx_api_case_generate_job_project_transaction (projectId, transactionId),
        INDEX idx_api_case_generate_job_project_status_queued (projectId, status, queuedAt),
        INDEX idx_api_case_generate_job_transaction_status (transactionId, status),
        INDEX idx_api_case_generate_job_status_finished (status, finishedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    this.logger.log("api_case_generate_job 表已创建");
  }

  private async ensureStructRequirementJobTable() {
    const rows: Array<{ Tables_in_db?: string }> = await this.dataSource.query(
      "SHOW TABLES LIKE 'struct_requirement_job'",
    );
    if (rows.length > 0) {
      return;
    }

    this.logger.warn(
      "检测到缺少 struct_requirement_job 表，正在自动执行 schema 补丁…",
    );
    await this.dataSource.query(`
      CREATE TABLE struct_requirement_job (
        id CHAR(36) NOT NULL PRIMARY KEY,
        projectId CHAR(36) NOT NULL,
        structDocId CHAR(36) NOT NULL,
        status ENUM('queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
        queuedAt DATETIME(3) NOT NULL,
        startedAt DATETIME(3) NULL,
        finishedAt DATETIME(3) NULL,
        errorMessage TEXT NULL,
        createdBy VARCHAR(255) NULL DEFAULT 'system',
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX idx_struct_requirement_job_status_queued (status, queuedAt),
        INDEX idx_struct_requirement_job_project_status_queued (projectId, status, queuedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    this.logger.log("struct_requirement_job 表已创建");
  }

  private async ensureSummaryStructDocColumn() {
    const rows: Array<{ Field: string }> = await this.dataSource.query(
      "SHOW COLUMNS FROM case_struct_doc LIKE 'summaryStructDoc'",
    );
    if (rows.length > 0) {
      return;
    }

    this.logger.warn(
      "检测到 case_struct_doc 缺少 summaryStructDoc 列，正在自动执行 schema 补丁…",
    );
    await this.dataSource.query(`
      ALTER TABLE case_struct_doc
        ADD COLUMN summaryStructDoc LONGTEXT NULL COMMENT '案例生成共用的需求总结'
        AFTER tempStructDoc
    `);
    this.logger.log("case_struct_doc.summaryStructDoc 列已补齐");
  }

  /**
   * 修复历史数据：createEnvironment 等方法曾误用 auditFieldsForUpdate()，
   * 导致 createdBy 回退为 'system' 而非实际用户。用 modifiedBy 修复 createdBy。
   */
  private async repairCreatedByForApiTestEnvironments() {
    const tables = [
      "api_test_environment",
      "api_transaction",
      "api_doc",
      "api_test_run",
    ];
    for (const table of tables) {
      try {
        const result: Array<{ count: number }> = await this.dataSource.query(
          `SELECT COUNT(*) AS count FROM ${table} WHERE createdBy = 'system' AND modifiedBy IS NOT NULL AND modifiedBy != '' AND modifiedBy != 'system'`,
        );
        const count = result[0]?.count ?? 0;
        if (count === 0) continue;
        this.logger.warn(
          `检测到 ${table} 有 ${count} 条记录 createdBy='system' 但 modifiedBy 为实际用户，正在修复…`,
        );
        await this.dataSource.query(
          `UPDATE ${table} SET createdBy = modifiedBy WHERE createdBy = 'system' AND modifiedBy IS NOT NULL AND modifiedBy != '' AND modifiedBy != 'system'`,
        );
        this.logger.log(`${table} 的 createdBy 已修复`);
      } catch {
        // 表不存在或无 createdBy/modifiedBy 列时跳过
      }
    }
  }

}
