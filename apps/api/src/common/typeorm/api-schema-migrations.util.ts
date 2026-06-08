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
        UNIQUE KEY uk_api_transaction_project_code (projectId, code),
        KEY idx_api_transaction_project (projectId)
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
