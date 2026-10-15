import mysql from "mysql2/promise";
import { applyApiTestSchemaMigrations } from "./api-schema-migrations.util";
import { migrateStructDocProjectIndex } from "./database-indexes.util";

/**
 * 在 TypeORM synchronize 之前执行，避免删除唯一索引时因外键依赖导致启动失败。
 */
export async function runPreSyncSchemaPatch() {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  if (nodeEnv !== "local" && nodeEnv !== "development") {
    return;
  }

  const connection = await mysql.createConnection({
    host: process.env.TYPEORM_HOST ?? "localhost",
    port: Number(process.env.TYPEORM_PORT ?? 3306),
    user: process.env.TYPEORM_USERNAME ?? "root",
    password: process.env.TYPEORM_PASSWORD ?? "",
    database: process.env.TYPEORM_DATABASE ?? "case_forge",
  });

  const queryable = {
    query: async (sql: string, params?: unknown[]) => {
      const [rows] = await connection.query(sql, params);
      return rows;
    },
  };

  try {
    await applyApiTestSchemaMigrations(queryable);
    await migrateApiRequirementStatus(queryable);
    await migrateStructDocProjectIndex(queryable);
  } finally {
    await connection.end();
  }
}

async function migrateApiRequirementStatus(queryable: {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}) {
  const tables = (await queryable.query("SHOW TABLES LIKE 'api_requirement'")) as Array<Record<string, unknown>>;
  if (!tables.length) return;
  const columns = (await queryable.query("SHOW COLUMNS FROM api_requirement LIKE 'status'")) as Array<{ Type?: string }>;
  const allColumns = (await queryable.query("SHOW COLUMNS FROM api_requirement")) as Array<{ Field?: string }>;
  if (!allColumns.some((column) => column.Field === "createdBy")) {
    await queryable.query("ALTER TABLE api_requirement ADD COLUMN createdBy VARCHAR(255) NULL DEFAULT 'system' AFTER projectName");
  }
  const type = columns[0]?.Type ?? "";
  if (!type.startsWith("enum(")) return;

  // Widen first so legacy values can be normalized without MySQL strict-mode truncation.
  await queryable.query("ALTER TABLE api_requirement MODIFY status VARCHAR(32) NOT NULL DEFAULT 'pending_dispatch'");
  await queryable.query(`
    UPDATE api_requirement
    SET status = CASE
      WHEN status = 'claimed' THEN 'testing'
      WHEN status IN ('pending_dispatch','pending_claim','testing','completed','returned') THEN status
      ELSE 'pending_dispatch'
    END
  `);
  await queryable.query(
    "ALTER TABLE api_requirement MODIFY status ENUM('pending_dispatch','pending_claim','testing','completed','returned') NOT NULL DEFAULT 'pending_dispatch'",
  );
}

if (require.main === module) {
  const { loadApiEnv } = require("../../config/load-env");
  loadApiEnv();
  runPreSyncSchemaPatch()
    .then(() => {
      console.log("pre-sync schema patch completed");
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
