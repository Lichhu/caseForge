/**
 * 一次性补齐 case_project.platform 等 schema（无需重启 Nest）
 */
import "../src/register-paths";
import { loadApiEnv } from "../src/config/load-env";
import mysql from "mysql2/promise";

loadApiEnv();

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.TYPEORM_HOST ?? "localhost",
    port: Number(process.env.TYPEORM_PORT ?? 3306),
    user: process.env.TYPEORM_USERNAME ?? "root",
    password: process.env.TYPEORM_PASSWORD ?? "",
    database: process.env.TYPEORM_DATABASE ?? "case_forge",
  });

  const [columns] = await connection.query(
    "SHOW COLUMNS FROM case_project LIKE 'platform'",
  );
  if (Array.isArray(columns) && columns.length > 0) {
    console.log("case_project.platform 已存在，跳过");
    await connection.end();
    return;
  }

  await connection.query(`
    ALTER TABLE case_project
      ADD COLUMN platform ENUM('case-forge', 'api-test') NOT NULL DEFAULT 'case-forge'
      COMMENT '所属产品线'
      AFTER description
  `);
  await connection.query(`
    UPDATE case_project SET platform = 'case-forge'
  `);
  try {
    await connection.query(`
      CREATE INDEX idx_case_project_platform_updated ON case_project (platform, updatedAt)
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Duplicate key name")) {
      throw error;
    }
  }

  console.log("已添加 case_project.platform");
  await connection.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
