import type { DataSource } from "typeorm";
import type { Logger } from "@nestjs/common";

type ColumnMeta = {
  Field: string;
  Type: string;
  Null: "YES" | "NO";
  Default: string | null;
  Collation: string | null;
};

/** 将单列字符集升级为 utf8mb4（保留原类型与 nullable，UUID 等 utf8 列勿调用） */
export async function ensureColumnUtf8mb4(
  dataSource: DataSource,
  logger: Logger,
  tableName: string,
  columnName: string,
) {
  const rows = (await dataSource.query(
    `SHOW FULL COLUMNS FROM \`${tableName}\` LIKE ?`,
    [columnName],
  )) as ColumnMeta[];
  const column = rows[0];
  if (!column) {
    return;
  }
  if (column.Collation?.startsWith("utf8mb4")) {
    return;
  }
  if (!column.Collation) {
    return;
  }

  const nullable = column.Null === "YES" ? "NULL" : "NOT NULL";
  const defaultClause = formatDefaultClause(column);

  logger.warn(
    `检测到 ${tableName}.${columnName} 为 ${column.Collation}，正在升级为 utf8mb4…`,
  );
  await dataSource.query(`
    ALTER TABLE \`${tableName}\`
      MODIFY \`${columnName}\` ${column.Type}
      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      ${nullable}${defaultClause}
  `);
  logger.log(`${tableName}.${columnName} 已升级为 utf8mb4`);
}

function formatDefaultClause(column: ColumnMeta) {
  if (column.Default === null) {
    return column.Null === "YES" ? " DEFAULT NULL" : "";
  }
  if (column.Default === "CURRENT_TIMESTAMP") {
    return " DEFAULT CURRENT_TIMESTAMP";
  }
  const numeric = Number(column.Default);
  if (String(numeric) === column.Default) {
    return ` DEFAULT ${column.Default}`;
  }
  return ` DEFAULT '${String(column.Default).replace(/'/g, "''")}'`;
}

/** 案例树相关文本列：支持 AI 返回的生僻字（4 字节 UTF-8） */
export async function ensureCaseEditorUtf8mb4TextColumns(
  dataSource: DataSource,
  logger: Logger,
) {
  const patches: Array<[string, string]> = [
    ["case_tree", "title"],
    ["case_editor", "title"],
    ["case_editor", "prompt"],
    ["case_node_metadata", "source"],
    ["case_node_metadata", "caseNature"],
    ["case_node_metadata", "priority"],
    ["case_node_metadata", "caseType"],
    ["case_generate_job", "errorMessage"],
    ["case_test_point_instruct", "generateError"],
    ["case_test_point_instruct", "naturalText"],
  ];

  for (const [tableName, columnName] of patches) {
    const tables = (await dataSource.query("SHOW TABLES LIKE ?", [
      tableName,
    ])) as Array<Record<string, string>>;
    if (!tables.length) {
      continue;
    }
    await ensureColumnUtf8mb4(dataSource, logger, tableName, columnName);
  }
}
