/**
 * api_doc / api_transaction 相关 schema 变更。
 * 须在 TypeORM synchronize 之前执行：先建 idx_api_doc_project，再删 uk_api_doc_project（外键依赖）。
 */
type Queryable = {
  query(sql: string, params?: unknown[]): Promise<unknown>;
};

async function queryRows<T>(runner: Queryable, sql: string, params?: unknown[]) {
  const result = await runner.query(sql, params);
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as T[];
  }
  return result as T[];
}

async function tableExists(runner: Queryable, tableName: string) {
  const rows = await queryRows<Record<string, string>>(
    runner,
    "SHOW TABLES LIKE ?",
    [tableName],
  );
  return rows.length > 0;
}

async function indexExists(runner: Queryable, tableName: string, indexName: string) {
  const rows = await queryRows<{ Key_name: string }>(
    runner,
    `SHOW INDEX FROM ${tableName} WHERE Key_name = ?`,
    [indexName],
  );
  return rows.length > 0;
}

async function columnExists(runner: Queryable, tableName: string, columnName: string) {
  const rows = await queryRows<{ Field: string }>(
    runner,
    `SHOW COLUMNS FROM ${tableName} LIKE ?`,
    [columnName],
  );
  return rows.length > 0;
}

/** 与 case_project.id 对齐：varchar(36) utf8，否则 TypeORM 建外键会失败 */
async function alignUuidColumn(
  runner: Queryable,
  tableName: string,
  columnName: string,
  nullable: boolean,
) {
  await runner.query(`
    ALTER TABLE ${tableName}
      MODIFY ${columnName} VARCHAR(36) CHARACTER SET utf8 ${nullable ? "NULL" : "NOT NULL"}
  `);
}

export async function applyApiTestSchemaMigrations(runner: Queryable) {
  if (!(await tableExists(runner, "api_doc"))) {
    return;
  }

  await ensureApiDocTransactionColumn(runner);
  await ensureApiEndpointTransactionColumn(runner);
  await ensureApiTransactionTable(runner);
  await ensureApiTestCaseColumns(runner);
  await ensureExecutionPlatformTables(runner);
}

async function ensureApiTransactionTable(runner: Queryable) {
  if (!(await tableExists(runner, "api_transaction"))) {
    await runner.query(`
      CREATE TABLE api_transaction (
        id VARCHAR(36) CHARACTER SET utf8 NOT NULL PRIMARY KEY,
        projectId VARCHAR(36) CHARACTER SET utf8 NOT NULL,
        code VARCHAR(128) NOT NULL,
        name VARCHAR(256) NOT NULL,
        description TEXT NULL,
        sortOrder INT NOT NULL DEFAULT 0,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE KEY uk_api_transaction_project_code (projectId, code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    return;
  }

  await alignUuidColumn(runner, "api_transaction", "id", false);
  await alignUuidColumn(runner, "api_transaction", "projectId", false);

  if (!(await columnExists(runner, "api_transaction", "createdBy"))) {
    await runner.query(`
      ALTER TABLE api_transaction
        ADD COLUMN createdBy VARCHAR(255) NULL DEFAULT 'system' AFTER sortOrder,
        ADD COLUMN modifiedBy VARCHAR(255) NULL DEFAULT 'system' AFTER createdBy
    `);
  }
}

async function ensureApiDocTransactionColumn(runner: Queryable) {
  if (!(await columnExists(runner, "api_doc", "transactionId"))) {
    await runner.query(`
      ALTER TABLE api_doc
        ADD COLUMN transactionId VARCHAR(36) CHARACTER SET utf8 NULL COMMENT '所属交易码'
        AFTER projectId
    `);
  } else {
    await alignUuidColumn(runner, "api_doc", "transactionId", true);
  }

  if (!(await indexExists(runner, "api_doc", "idx_api_doc_project"))) {
    try {
      await runner.query(`
        CREATE INDEX idx_api_doc_project ON api_doc (projectId)
      `);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Duplicate key name")) {
        throw error;
      }
    }
  }

  if (await indexExists(runner, "api_doc", "uk_api_doc_project")) {
    await runner.query(`ALTER TABLE api_doc DROP INDEX uk_api_doc_project`);
  }

  if (!(await indexExists(runner, "api_doc", "uk_api_doc_transaction"))) {
    try {
      await runner.query(`
        CREATE UNIQUE INDEX uk_api_doc_transaction ON api_doc (transactionId)
      `);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Duplicate")) {
        throw error;
      }
    }
  }
}

async function ensureApiEndpointTransactionColumn(runner: Queryable) {
  if (!(await tableExists(runner, "api_endpoint"))) {
    return;
  }
  if (!(await columnExists(runner, "api_endpoint", "transactionId"))) {
    await runner.query(`
      ALTER TABLE api_endpoint
        ADD COLUMN transactionId VARCHAR(36) CHARACTER SET utf8 NULL COMMENT '所属交易码'
        AFTER projectId
    `);
    try {
      await runner.query(`
        CREATE INDEX idx_api_endpoint_transaction ON api_endpoint (transactionId)
      `);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Duplicate key name")) {
        throw error;
      }
    }
    return;
  }

  await alignUuidColumn(runner, "api_endpoint", "transactionId", true);
}

async function ensureApiTestCaseColumns(runner: Queryable) {
  if (!(await tableExists(runner, "api_test_case"))) {
    return;
  }
  if (!(await columnExists(runner, "api_test_case", "caseNo"))) {
    await runner.query(`
      ALTER TABLE api_test_case
        ADD COLUMN caseNo VARCHAR(64) NULL AFTER title,
        ADD COLUMN remark TEXT NULL AFTER description,
        ADD COLUMN transactionCode VARCHAR(128) NULL AFTER remark,
        ADD COLUMN owner VARCHAR(255) NULL AFTER transactionCode
    `);
  }
}

async function ensureExecutionPlatformTables(runner: Queryable) {
  if (!(await tableExists(runner, "api_test_environment_service"))) {
    await runner.query(`
      CREATE TABLE api_test_environment_service (
        id VARCHAR(36) CHARACTER SET utf8 NOT NULL PRIMARY KEY,
        projectId VARCHAR(36) CHARACTER SET utf8 NOT NULL,
        environmentId VARCHAR(36) CHARACTER SET utf8 NOT NULL,
        name VARCHAR(128) NOT NULL,
        baseUrl VARCHAR(512) NULL,
        pathPrefix VARCHAR(256) NULL,
        headers JSON NULL,
        variables JSON NULL,
        sortOrder INT NOT NULL DEFAULT 0,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        createdBy VARCHAR(255) NULL DEFAULT 'system',
        modifiedBy VARCHAR(255) NULL DEFAULT 'system',
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        KEY idx_api_test_env_service_env (environmentId),
        KEY idx_api_test_env_service_project_env (projectId, environmentId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  if (!(await tableExists(runner, "api_test_execution_set"))) {
    await runner.query(`
      CREATE TABLE api_test_execution_set (
        id VARCHAR(36) CHARACTER SET utf8 NOT NULL PRIMARY KEY,
        projectId VARCHAR(36) CHARACTER SET utf8 NOT NULL,
        transactionId VARCHAR(36) CHARACTER SET utf8 NOT NULL,
        name VARCHAR(256) NOT NULL,
        description TEXT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        lastRunId VARCHAR(36) NULL,
        lastRunStatus VARCHAR(32) NULL,
        lastRunAt DATETIME NULL,
        lastPassedCount INT NOT NULL DEFAULT 0,
        lastTotalCount INT NOT NULL DEFAULT 0,
        createdBy VARCHAR(255) NULL DEFAULT 'system',
        modifiedBy VARCHAR(255) NULL DEFAULT 'system',
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        KEY idx_api_test_exec_set_project_tx_updated (projectId, transactionId, updatedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  for (const table of ["api_test_environment_service", "api_test_execution_set"]) {
    if (!(await tableExists(runner, table))) continue;
    if (!(await columnExists(runner, table, "createdBy"))) {
      await runner.query(`
        ALTER TABLE ${table}
          ADD COLUMN createdBy VARCHAR(255) NULL DEFAULT 'system',
          ADD COLUMN modifiedBy VARCHAR(255) NULL DEFAULT 'system'
      `);
    }
  }

  if (!(await tableExists(runner, "api_test_execution_set_case"))) {
    await runner.query(`
      CREATE TABLE api_test_execution_set_case (
        id VARCHAR(36) CHARACTER SET utf8 NOT NULL PRIMARY KEY,
        executionSetId VARCHAR(36) CHARACTER SET utf8 NOT NULL,
        caseId VARCHAR(36) CHARACTER SET utf8 NOT NULL,
        sortOrder INT NOT NULL DEFAULT 0,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        UNIQUE KEY uk_api_test_exec_set_case (executionSetId, caseId),
        KEY idx_api_test_exec_set_case_sort (executionSetId, sortOrder)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  if (await tableExists(runner, "api_test_run")) {
    if (!(await columnExists(runner, "api_test_run", "executionSetId"))) {
      await runner.query(`
        ALTER TABLE api_test_run
          ADD COLUMN environmentServiceId VARCHAR(36) NULL AFTER environmentId,
          ADD COLUMN executionSetId VARCHAR(36) NULL AFTER environmentServiceId,
          ADD COLUMN transactionId VARCHAR(36) NULL AFTER executionSetId
      `);
    }
  }

  if (await tableExists(runner, "api_test_environment")) {
    if (!(await columnExists(runner, "api_test_environment", "scope"))) {
      await runner.query(`
        ALTER TABLE api_test_environment
          ADD COLUMN scope VARCHAR(16) NOT NULL DEFAULT 'system' AFTER name
      `);
    }
    await runner.query(`
      ALTER TABLE api_test_environment
        MODIFY COLUMN baseUrl VARCHAR(512) NOT NULL DEFAULT ''
    `);
  }

  if (await tableExists(runner, "api_test_environment_service")) {
    if (!(await columnExists(runner, "api_test_environment_service", "serverAddress"))) {
      await runner.query(`
        ALTER TABLE api_test_environment_service
          ADD COLUMN serverAddress VARCHAR(1024) NULL AFTER name,
          ADD COLUMN jdbcUrl VARCHAR(1024) NULL AFTER serverAddress,
          ADD COLUMN remoteConnection VARCHAR(512) NULL AFTER jdbcUrl,
          ADD COLUMN objectStorage VARCHAR(512) NULL AFTER remoteConnection,
          ADD COLUMN remark TEXT NULL AFTER objectStorage
      `);
    }
  }
}
