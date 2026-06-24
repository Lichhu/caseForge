/**
 * 幂等补齐查询热点索引（生产/测试库 synchronize=false 时由 SchemaPatchService 调用）。
 */
type Queryable = {
  query(sql: string, params?: unknown[]): Promise<unknown>;
};

async function queryRows<T>(
  runner: Queryable,
  sql: string,
  params?: unknown[],
) {
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

async function indexExists(
  runner: Queryable,
  tableName: string,
  indexName: string,
) {
  const rows = await queryRows<{ Key_name: string }>(
    runner,
    `SHOW INDEX FROM ${tableName} WHERE Key_name = ?`,
    [indexName],
  );
  return rows.length > 0;
}

async function ensureIndex(
  runner: Queryable,
  tableName: string,
  indexName: string,
  columns: string,
) {
  if (!(await tableExists(runner, tableName))) {
    return;
  }
  if (await indexExists(runner, tableName, indexName)) {
    return;
  }
  try {
    await runner.query(
      `CREATE INDEX ${indexName} ON ${tableName} (${columns})`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Duplicate key name")) {
      throw error;
    }
  }
}

async function dropIndexIfExists(
  runner: Queryable,
  tableName: string,
  indexName: string,
) {
  if (!(await tableExists(runner, tableName))) {
    return;
  }
  if (!(await indexExists(runner, tableName, indexName))) {
    return;
  }
  try {
    await runner.query(`ALTER TABLE ${tableName} DROP INDEX ${indexName}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("needed in a foreign key constraint")) {
      throw error;
    }
    // The index is used by a FK constraint. Drop the FK first, then the index,
    // then recreate the FK so it uses the replacement non-unique index.
    const fkRows = await queryRows<{ CONSTRAINT_NAME: string }>(
      runner,
      `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN
         (SELECT COLUMN_NAME FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?)
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [tableName, tableName, indexName],
    );
    for (const fk of fkRows) {
      await runner.query(
        `ALTER TABLE ${tableName} DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`,
      );
    }
    await runner.query(`ALTER TABLE ${tableName} DROP INDEX ${indexName}`);
    // Recreate each FK with CASCADE rules matching TypeORM entity definitions
    for (const fk of fkRows) {
      const colRows = await queryRows<{
        COLUMN_NAME: string;
        REFERENCED_TABLE_NAME: string;
        REFERENCED_COLUMN_NAME: string;
      }>(
        runner,
        `SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
           AND CONSTRAINT_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
        [tableName, fk.CONSTRAINT_NAME],
      );
      for (const col of colRows) {
        await runner.query(
          `ALTER TABLE ${tableName} ADD CONSTRAINT ${fk.CONSTRAINT_NAME}
           FOREIGN KEY (${col.COLUMN_NAME})
           REFERENCES ${col.REFERENCED_TABLE_NAME} (${col.REFERENCED_COLUMN_NAME})
           ON DELETE CASCADE ON UPDATE CASCADE`,
        );
      }
    }
  }
}

const INDEX_SPECS: Array<{ table: string; name: string; columns: string }> = [
  {
    table: "case_project",
    name: "idx_case_project_user_platform_updated",
    columns: "createdBy, platform, updatedAt",
  },
  {
    table: "case_project",
    name: "idx_case_project_platform_requirement",
    columns: "platform, requirementNo",
  },
  {
    table: "case_struct_doc",
    name: "idx_case_struct_doc_project",
    columns: "projectId",
  },
  {
    table: "case_struct_doc",
    name: "idx_case_struct_doc_structuring_status",
    columns: "structuringStatus",
  },
  {
    table: "case_test_point",
    name: "idx_case_test_point_project_struct_created",
    columns: "projectId, structDocId, createdAt",
  },
  {
    table: "case_test_point",
    name: "idx_case_test_point_project_struct_module",
    columns: "projectId, structDocId, featureModule",
  },
  {
    table: "case_test_point_instruct",
    name: "idx_case_test_point_instruct_status",
    columns: "status",
  },
  {
    table: "case_generate_job",
    name: "idx_case_generate_job_project_status_queued",
    columns: "projectId, status, queuedAt",
  },
  {
    table: "case_generate_job",
    name: "idx_case_generate_job_test_point_status",
    columns: "testPointId, status",
  },
  {
    table: "case_generate_job",
    name: "idx_case_generate_job_status_finished",
    columns: "status, finishedAt",
  },
  {
    table: "struct_requirement_job",
    name: "idx_struct_requirement_job_project_status_queued",
    columns: "projectId, status, queuedAt",
  },
  {
    table: "api_case_generate_job",
    name: "idx_api_case_generate_job_project_status_queued",
    columns: "projectId, status, queuedAt",
  },
  {
    table: "api_case_generate_job",
    name: "idx_api_case_generate_job_transaction_status",
    columns: "transactionId, status",
  },
  {
    table: "api_case_generate_job",
    name: "idx_api_case_generate_job_status_finished",
    columns: "status, finishedAt",
  },
  {
    table: "api_endpoint",
    name: "idx_api_endpoint_project_transaction",
    columns: "projectId, transactionId",
  },
  {
    table: "api_test_case",
    name: "idx_api_test_case_project_endpoint",
    columns: "projectId, endpointId",
  },
  {
    table: "api_test_run",
    name: "idx_api_test_run_project_created",
    columns: "projectId, createdAt",
  },
  {
    table: "api_test_run_item",
    name: "idx_api_test_run_item_run_created",
    columns: "runId, createdAt",
  },
  {
    table: "api_test_environment",
    name: "idx_api_test_env_project_default",
    columns: "projectId, isDefault",
  },
  {
    table: "api_test_environment_service",
    name: "idx_api_test_env_service_project_env",
    columns: "projectId, environmentId",
  },
  {
    table: "api_test_execution_set",
    name: "idx_api_test_exec_set_project_tx_updated",
    columns: "projectId, transactionId, updatedAt",
  },
  {
    table: "api_test_execution_set_case",
    name: "idx_api_test_exec_set_case_sort",
    columns: "executionSetId, sortOrder",
  },
  {
    table: "scenario_library",
    name: "idx_scenario_library_user_updated",
    columns: "createdBy, updatedAt",
  },
];

const REDUNDANT_INDEXES: Array<{ table: string; name: string }> = [
  { table: "case_struct_doc", name: "uk_case_struct_doc_project" },
  { table: "case_project", name: "idx_case_project_updated_at" },
  { table: "case_project", name: "idx_case_project_requirement_no" },
  {
    table: "struct_requirement_job",
    name: "idx_struct_requirement_job_project",
  },
  { table: "api_transaction", name: "idx_api_transaction_project" },
  { table: "api_test_run", name: "idx_api_test_run_project" },
  { table: "api_test_environment", name: "idx_api_test_env_project" },
  { table: "api_test_execution_set", name: "idx_api_test_exec_set_project" },
  {
    table: "api_test_execution_set",
    name: "idx_api_test_exec_set_transaction",
  },
];

export async function ensureDatabaseIndexes(runner: Queryable) {
  for (const spec of INDEX_SPECS) {
    await ensureIndex(runner, spec.table, spec.name, spec.columns);
  }

  for (const { table, name } of REDUNDANT_INDEXES) {
    await dropIndexIfExists(runner, table, name);
  }

  await dropUnnamedTestPointPromptIndex(runner);
}

async function dropUnnamedTestPointPromptIndex(runner: Queryable) {
  if (!(await tableExists(runner, "case_test_point_prompt"))) {
    return;
  }
  const rows = await queryRows<{
    Key_name: string;
    Column_name: string;
    Seq_in_index: number;
  }>(runner, "SHOW INDEX FROM case_test_point_prompt");
  for (const row of rows) {
    if (
      row.Key_name === "uk_case_test_point_prompt" ||
      row.Key_name === "idx_test_point_prompt_prompt"
    ) {
      continue;
    }
    if (row.Column_name === "testPointId" && row.Seq_in_index === 1) {
      const cols = rows
        .filter((item) => item.Key_name === row.Key_name)
        .sort((a, b) => a.Seq_in_index - b.Seq_in_index)
        .map((item) => item.Column_name);
      if (cols.length === 1 && cols[0] === "testPointId") {
        await dropIndexIfExists(runner, "case_test_point_prompt", row.Key_name);
      }
    }
  }
}
