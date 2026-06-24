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
    const uniqueRows: Array<{ Key_name: string }> = await dataSource.query(
      `SHOW INDEX FROM case_struct_doc WHERE Key_name = 'uk_case_struct_doc_project'`,
    );
    if (uniqueRows.length > 0) {
      console.log("检测到 uk_case_struct_doc_project 唯一索引，准备删除…");
      await dataSource.query(
        `ALTER TABLE case_struct_doc DROP INDEX uk_case_struct_doc_project`,
      );
      console.log("已删除 uk_case_struct_doc_project");
    } else {
      console.log("uk_case_struct_doc_project 不存在，无需删除");
    }

    const nonUniqueRows: Array<{ Key_name: string }> = await dataSource.query(
      `SHOW INDEX FROM case_struct_doc WHERE Key_name = 'idx_case_struct_doc_project'`,
    );
    if (nonUniqueRows.length === 0) {
      console.log("检测到缺少 idx_case_struct_doc_project 普通索引，准备创建…");
      await dataSource.query(
        `CREATE INDEX idx_case_struct_doc_project ON case_struct_doc (projectId)`,
      );
      console.log("已创建 idx_case_struct_doc_project");
    } else {
      console.log("idx_case_struct_doc_project 已存在，无需创建");
    }
  } finally {
    await dataSource.destroy();
  }
}

migrate()
  .then(() => {
    console.log("迁移完成");
    process.exit(0);
  })
  .catch((error) => {
    console.error("迁移失败:", error);
    process.exit(1);
  });
