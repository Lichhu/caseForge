/**
 * 写入「需求管理」演示数据（直连 MySQL，无需启动 Nest）。
 *
 * 用法：
 *   pnpm --filter @case-forge/api seed:requirements
 *   SEED_USER=system pnpm --filter @case-forge/api seed:requirements
 *
 * 环境变量：
 *   SEED_USER   默认 system（与前端默认用户一致），待认领数据会分发给该用户便于演示认领/拒绝
 *
 * 读取 apps/api/env/.local.env（NODE_ENV=local）。
 * 清理范围：projectCode 以 SEED_BATCH 开头（XQ2026-9301-xx）的 api_requirement 记录，
 * 同步服务「只增不删」，不会影响这些手工数据。
 */
import { randomUUID } from "node:crypto";
import { loadApiEnv } from "./load-env";
import mysql from "mysql2/promise";

loadApiEnv();

const SEED_USER = process.env.SEED_USER?.trim() || "system";
/** 演示数据批次前缀（重跑时按此前缀清理） */
const SEED_BATCH = "XQ2026-9301";

type SeedRow = {
  suffix: string;
  projectName: string;
  status: "pending_dispatch" | "pending_claim" | "claimed";
  dispatchedTo?: string;
  dispatchedToName?: string;
  dispatchedBy?: string;
  dispatchedDaysAgo?: number;
  claimedBy?: string;
  claimedByName?: string;
  claimedDaysAgo?: number;
  refuseReason?: string;
};

/** 状态分布：待分发 6 / 待认领 5（其中 3 条分发给 SEED_USER）/ 已认领 5 */
const SEED_ROWS: SeedRow[] = [
  // ---------------- 待分发 ----------------
  { suffix: "01", projectName: "对公账户开户审批流程改造", status: "pending_dispatch" },
  { suffix: "02", projectName: "手机银行转账限额动态调整", status: "pending_dispatch" },
  { suffix: "03", projectName: "反洗钱可疑交易预警规则升级", status: "pending_dispatch" },
  { suffix: "04", projectName: "银联卡快捷支付对账文件改版", status: "pending_dispatch" },
  { suffix: "05", projectName: "个人养老金账户开户渠道扩展", status: "pending_dispatch", refuseReason: "服务范围不明确，需重新评估后分发" },
  { suffix: "06", projectName: "征信查询授权流程线上化改造", status: "pending_dispatch" },
  // ---------------- 待认领（3 条分发给当前用户，可演示认领/拒绝） ----------------
  { suffix: "07", projectName: "柜面存款证明开立性能优化", status: "pending_claim", dispatchedTo: SEED_USER, dispatchedToName: SEED_USER, dispatchedBy: "system", dispatchedDaysAgo: 1 },
  { suffix: "08", projectName: "代发工资批量文件加密通道迁移", status: "pending_claim", dispatchedTo: SEED_USER, dispatchedToName: SEED_USER, dispatchedBy: "system", dispatchedDaysAgo: 2 },
  { suffix: "09", projectName: "渠道平台报文格式国标标准化", status: "pending_claim", dispatchedTo: SEED_USER, dispatchedToName: SEED_USER, dispatchedBy: "system", dispatchedDaysAgo: 3 },
  { suffix: "10", projectName: "信贷授信额度占用实时同步", status: "pending_claim", dispatchedTo: "56536", dispatchedToName: "张樱", dispatchedBy: "system", dispatchedDaysAgo: 2 },
  { suffix: "11", projectName: "票据贴现利率定价模型对接", status: "pending_claim", dispatchedTo: "56669", dispatchedToName: "唐诚", dispatchedBy: "system", dispatchedDaysAgo: 4 },
  // ---------------- 已认领 ----------------
  { suffix: "12", projectName: "线上理财销售适当性双录优化", status: "claimed", dispatchedTo: "58295", dispatchedToName: "查己政", dispatchedBy: "system", dispatchedDaysAgo: 12, claimedBy: "58295", claimedByName: "查己政", claimedDaysAgo: 11 },
  { suffix: "13", projectName: "现金管理平台银企直联接口扩展", status: "claimed", dispatchedTo: "56727", dispatchedToName: "褚燕", dispatchedBy: "system", dispatchedDaysAgo: 9, claimedBy: "56727", claimedByName: "褚燕", claimedDaysAgo: 8 },
  { suffix: "14", projectName: "结售汇业务额度校验强化", status: "claimed", dispatchedTo: "22008", dispatchedToName: "仇亚娟", dispatchedBy: "system", dispatchedDaysAgo: 7, claimedBy: "22008", claimedByName: "仇亚娟", claimedDaysAgo: 6 },
  { suffix: "15", projectName: "保管箱管理系统盘点模块优化", status: "claimed", dispatchedTo: "56393", dispatchedToName: "王克", dispatchedBy: "system", dispatchedDaysAgo: 5, claimedBy: "56393", claimedByName: "王克", claimedDaysAgo: 4 },
  { suffix: "16", projectName: "供应链金融应收账款质押登记", status: "claimed", dispatchedTo: "01048", dispatchedToName: "狄黎罡", dispatchedBy: "system", dispatchedDaysAgo: 3, claimedBy: "01048", claimedByName: "狄黎罡", claimedDaysAgo: 2 },
];

function daysAgo(days: number, hourOffset: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(9 + (hourOffset % 9), (hourOffset * 17) % 60, 0, 0);
  return date;
}

async function main() {
  const dbConfig = {
    host: process.env.TYPEORM_HOST ?? "localhost",
    port: Number(process.env.TYPEORM_PORT ?? 3306),
    user: process.env.TYPEORM_USERNAME ?? "root",
    password: process.env.TYPEORM_PASSWORD ?? "",
    database: process.env.TYPEORM_DATABASE ?? "case_forge",
  };

  console.log(
    `连接 MySQL: ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database} (NODE_ENV=${process.env.NODE_ENV ?? "development"})`,
  );

  const connection = await mysql.createConnection(dbConfig);

  try {
    const [cleared] = await connection.execute(
      "DELETE FROM api_requirement WHERE projectCode LIKE ?",
      [`${SEED_BATCH}-%`],
    );
    console.log(
      `清理历史演示数据: ${(cleared as mysql.ResultSetHeader).affectedRows} 条`,
    );

    for (let i = 0; i < SEED_ROWS.length; i += 1) {
      const row = SEED_ROWS[i];
      const createdAt = daysAgo(20 - i, i);
      const dispatchedAt =
        row.dispatchedDaysAgo !== undefined
          ? daysAgo(row.dispatchedDaysAgo, i)
          : null;
      const claimedAt =
        row.claimedDaysAgo !== undefined
          ? daysAgo(row.claimedDaysAgo, i)
          : null;
      await connection.execute(
        `INSERT INTO api_requirement
          (id, projectCode, projectName, status,
           dispatchedTo, dispatchedToName, dispatchedBy, dispatchedAt,
           claimedBy, claimedByName, claimedAt,
           refuseReason, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          `${SEED_BATCH}-${row.suffix}`,
          row.projectName,
          row.status,
          row.dispatchedTo ?? null,
          row.dispatchedToName ?? null,
          row.dispatchedBy ?? null,
          dispatchedAt,
          row.claimedBy ?? null,
          row.claimedByName ?? null,
          claimedAt,
          row.refuseReason ?? null,
          createdAt,
          createdAt,
        ],
      );
    }

    const [counts] = await connection.query(
      `SELECT status, COUNT(*) AS total FROM api_requirement GROUP BY status`,
    );
    console.log("\n需求管理演示数据写入完成：");
    console.log(`  批次前缀:   ${SEED_BATCH}（共 ${SEED_ROWS.length} 条）`);
    for (const item of counts as Array<{ status: string; total: number }>) {
      console.log(`  ${item.status}: ${item.total} 条`);
    }
    console.log(
      `\n前端：智能接口测试平台 → 需求管理；其中 3 条待认领分发给 ${SEED_USER}，可演示认领/拒绝。\n`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("seed 失败:", error);
  process.exit(1);
});
