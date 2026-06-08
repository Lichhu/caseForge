import mysql from "mysql2/promise";
import { applyApiTestSchemaMigrations } from "./api-schema-migrations.util";

/**
 * 在 TypeORM synchronize 之前执行，避免删除 uk_api_doc_project 时触发外键错误。
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

  try {
    await applyApiTestSchemaMigrations({
      query: async (sql, params) => {
        const [rows] = await connection.query(sql, params);
        return rows;
      },
    });
  } finally {
    await connection.end();
  }
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
