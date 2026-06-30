/**
 * 独立脚本：迁移 case_struct_doc 表的项目索引。
 * 从唯一索引（uk_case_struct_doc_project）改为普通索引（idx_case_struct_doc_project），
 * 以支持一个项目下多条结构化需求文档（拆分文档）。
 *
 * 运行方式：
 *   pnpm --filter @case-forge/api ts-node scripts/migrate-struct-doc-project-index.ts
 *
 * 注意：
 *  - 请确保环境变量已加载（如 .local.env）。
 *  - 此脚本只调整索引，不修改表内数据；历史单文档数据会被保留。
 */
import { config } from "dotenv";
import { DataSource } from "typeorm";
import { migrateStructDocProjectIndex } from "../src/common/typeorm/database-indexes.util";

// 默认加载 apps/api/env/.local.env，可按需调整路径
config({ path: "env/.local.env" });

async function migrate() {
  const dataSource = new DataSource({
    type: "mysql",
    host: process.env.TYPEORM_HOST || "localhost",
    port: Number(process.env.TYPEORM_PORT || 3306),
    username: process.env.TYPEORM_USERNAME || "root",
    password: process.env.TYPEORM_PASSWORD || "",
    database: process.env.TYPEORM_DATABASE || "case_forge",
    charset: "utf8mb4",
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();
  try {
    await migrateStructDocProjectIndex(dataSource);
    console.log("迁移完成");
  } finally {
    await dataSource.destroy();
  }
}

migrate()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("迁移失败:", error);
    process.exit(1);
  });
