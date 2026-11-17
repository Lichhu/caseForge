/**
 * 修复「需求已认领但状态仍为待分发/待受理」的历史脏数据（直连 MySQL，无需启动 Nest）。
 *
 * 这类数据会让接口测试项目在左侧「测试中 / 已完成 / 已打回」页签里都查不到。
 * 默认只预览，确认后加 --apply 才会写库。
 *
 * 用法：
 *   pnpm --filter @case-forge/api repair:requirements
 *   pnpm --filter @case-forge/api repair:requirements -- --apply
 *
 * 读取 apps/api/env/.local.env（NODE_ENV=local）。
 */
import { loadApiEnv } from "./load-env";
import mysql from "mysql2/promise";

loadApiEnv();

type DirtyRow = {
  id: string;
  projectCode: string;
  projectName: string;
  status: string;
  claimedBy: string | null;
  claimedProjectId: string;
  completedAt: Date | null;
};

const MATCH_SQL = `
  FROM api_requirement r
  INNER JOIN case_project p ON p.id = r.claimedProjectId AND p.deleted_at IS NULL
  WHERE r.deleted_at IS NULL
    AND r.status IN ('pending_dispatch', 'pending_claim')
`;

async function main() {
  const apply = process.argv.includes("--apply");
  const connection = await mysql.createConnection({
    host: process.env.TYPEORM_HOST ?? "localhost",
    port: Number(process.env.TYPEORM_PORT ?? 3306),
    user: process.env.TYPEORM_USERNAME ?? "root",
    password: process.env.TYPEORM_PASSWORD ?? "",
    database: process.env.TYPEORM_DATABASE ?? "case_forge",
  });

  try {
    const [rawRows] = await connection.query(
      `SELECT r.id, r.projectCode, r.projectName, r.status, r.claimedBy,
              r.claimedProjectId, r.completedAt
       ${MATCH_SQL}
       ORDER BY r.projectCode`,
    );
    const rows = rawRows as DirtyRow[];

    if (!rows.length) {
      console.log("没有需要修复的需求数据。");
      return;
    }

    console.log(`发现 ${rows.length} 条「已认领但状态为待分发/待受理」的需求：`);
    for (const row of rows.slice(0, 20)) {
      console.log(
        `  ${row.projectCode}  ${row.status}  认领人=${row.claimedBy ?? "-"}${row.completedAt ? "  (曾标记完成)" : ""}`,
      );
    }
    if (rows.length > 20) {
      console.log(`  ... 其余 ${rows.length - 20} 条省略`);
    }

    if (!apply) {
      console.log(
        "\n当前为预览模式，未修改任何数据；确认后执行：pnpm --filter @case-forge/api repair:requirements -- --apply",
      );
      return;
    }

    const [rawResult] = await connection.query(
      `UPDATE api_requirement r
       INNER JOIN case_project p ON p.id = r.claimedProjectId AND p.deleted_at IS NULL
       SET r.status = CASE WHEN r.completedAt IS NULL THEN 'testing' ELSE 'completed' END
       WHERE r.deleted_at IS NULL
         AND r.status IN ('pending_dispatch', 'pending_claim')`,
    );
    const result = rawResult as mysql.ResultSetHeader;
    console.log(
      `\n已修复 ${result.affectedRows} 条需求：有完成时间的恢复为 completed，其余恢复为 testing。`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("修复失败:", error);
  process.exit(1);
});
