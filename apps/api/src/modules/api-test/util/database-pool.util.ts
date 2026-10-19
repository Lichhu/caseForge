/**
 * @file 数据库连接池工厂：把各库型驱动统一成一个 query/end 接口
 *
 * query 统一返回 `[rows, fields, meta]`：
 * - 查询语句：rows 为结果行数组，meta.rowCount 为行数
 * - 改数据语句：rows 为空数组，meta.affectedRows 为影响行数（驱动不上报时为 undefined）

 * 数据函数和 SQL 步骤共用这里的适配，避免两处各写一套驱动分支。
 */
import { BadRequestException, Logger } from "@nestjs/common";
import { createPool } from "mysql2/promise";
import { createRequire } from "node:module";
import { decryptSecrets } from "./secret-crypto.util";
import type { ApiDatabaseConnectionEntity } from "@api-test/entity/api-database-connection.entity";

const nodeRequire = createRequire(__filename);

/** 影响行数 / 结果行数，驱动不上报时字段可能缺失 */
export interface DbQueryMeta {
  affectedRows?: number;
  rowCount?: number;
}

export type DbPool = {
  query: (sql: any, params?: any[]) => Promise<any>;
  end: () => Promise<void>;
  /**
   * 在事务里执行并强制回滚，用于改数据语句的试运行（不落库）。
   * 驱动不支持事务回滚时为 undefined，调用方需要给出明确报错。
   */
  runRolledBack?: (sql: string, params?: unknown[]) => Promise<any>;
};

/** 连接不上报影响行数时返回 undefined，由调用方决定是否跳过行数校验 */
function toNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export async function createDatabasePool(
  row: ApiDatabaseConnectionEntity,
  logger?: Logger,
): Promise<DbPool> {
  const password = decryptSecrets(row.passwordEncrypted).password ?? "";
  if (
    [
      "MariaDB",
      "MySQL",
      "TiDB",
      "OceanBase-MySQL",
      "GoldenDB",
      "GaussDB-MySQL",
    ].includes(row.type)
  ) {
    const pool = createPool({
      host: row.host,
      port: row.port,
      ...(row.databaseName ? { database: row.databaseName } : {}),
      user: row.username,
      password,
      connectionLimit: 1,
      connectTimeout: 5000,
    });
    const dbPool = pool as unknown as DbPool;
    dbPool.runRolledBack = async (sql, params = []) => {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows, fields] = await conn.query(sql, params);
        return [
          Array.isArray(rows) ? rows : [],
          fields,
          {
            affectedRows: toNumber(
              (rows as { affectedRows?: unknown } | null)?.affectedRows,
            ),
          },
        ];
      } finally {
        await conn.rollback().catch(() => undefined);
        conn.release();
      }
    };
    return dbPool;
  }
  if (["PostgreSQL", "KingbaseES", "GaussDB"].includes(row.type)) {
    const { Pool } = nodeRequire("pg");
    const pool = new Pool({
      host: row.host,
      port: row.port,
      ...(row.databaseName ? { database: row.databaseName } : {}),
      user: row.username,
      password,
      max: 1,
      connectionTimeoutMillis: 5000,
    });
    pool.on("error", (error: Error) =>
      logger?.error(`PostgreSQL 连接池异常: ${error.message}`),
    );
    return {
      query: async (input: any, params: unknown[] = []) => {
        const sql = typeof input === "string" ? input : input.sql;
        let index = 0;
        const result = await pool.query(
          sql.replace(/\?/g, () => `$${++index}`),
          params,
        );
        return [
          result.rows,
          result.fields,
          {
            affectedRows: toNumber(result.rowCount),
            rowCount: result.rows.length,
          },
        ];
      },
      end: () => pool.end(),
      runRolledBack: async (sql: string, params: unknown[] = []) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          let index = 0;
          const result = await client.query(
            sql.replace(/\?/g, () => `$${++index}`),
            params,
          );
          return [
            result.rows,
            result.fields,
            {
              affectedRows: toNumber(result.rowCount),
              rowCount: result.rows.length,
            },
          ];
        } finally {
          await client.query("ROLLBACK").catch(() => undefined);
          client.release();
        }
      },
    } satisfies DbPool;
  }
  if (["Oracle", "OceanBase-Oracle"].includes(row.type)) {
    const oracledb = nodeRequire("oracledb");
    const conn = await oracledb.getConnection({
      user: row.username,
      password,
      connectString: `${row.host}:${row.port}/${row.databaseName}`,
    });
    return {
      query: async (input: any, params: unknown[] = []) => {
        const sql = typeof input === "string" ? input : input.sql;
        let index = 0;
        const result = await conn.execute(
          sql.replace(/\?/g, () => `:${++index}`),
          params,
          // autoCommit 必须打开：改数据语句否则会在连接关闭时回滚，接口侧看不到改动
          { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: true },
        );
        return [
          result.rows ?? [],
          result.metaData ?? [],
          {
            affectedRows: toNumber(result.rowsAffected),
            rowCount: (result.rows ?? []).length,
          },
        ];
      },
      end: () => conn.close(),
      // 试运行：autoCommit 关掉执行，再显式回滚，改动不落库
      runRolledBack: async (sql: string) => {
        try {
          const result = await conn.execute(sql, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            autoCommit: false,
          });
          return [
            result.rows ?? [],
            result.metaData ?? [],
            {
              affectedRows: toNumber(result.rowsAffected),
              rowCount: (result.rows ?? []).length,
            },
          ];
        } finally {
          await conn.rollback().catch(() => undefined);
        }
      },
    } satisfies DbPool;
  }
  if (row.type === "DM8") {
    const dmdb = nodeRequire("dmdb");
    const conn = await dmdb.getConnection(
      `dm://${encodeURIComponent(row.username)}:${encodeURIComponent(password)}@${row.host}:${row.port}`,
    );
    return {
      query: async (input: any, params: unknown[] = []) => {
        const sql = typeof input === "string" ? input : input.sql;
        // dmdb 原生支持 `?` 位置绑定；若把 `?` 改写成 `:1/:2` 这类数字名，
        // 达梦服务端不会将其识别为绑定参数，导致绑定数与占位符数不匹配而报错。
        const result = await conn.execute(
          sql,
          params.map((val) => ({ val })),
        );
        // 改数据语句需要显式提交，否则接口侧读不到改动
        if (typeof conn.commit === "function") await conn.commit();
        const rows = result.rows ?? [];
        return [
          rows,
          result.metaData ?? [],
          {
            affectedRows: toNumber(result.rowsAffected ?? result.affectedRows),
            rowCount: rows.length,
          },
        ];
      },
      end: () => conn.close(),
      // 驱动支持回滚时才提供试运行能力，否则调用方会明确报「暂不支持」
      ...(typeof conn.rollback === "function"
        ? {
            runRolledBack: async (sql: string, params: unknown[] = []) => {
              try {
                const result = await conn.execute(
                  sql,
                  params.map((val) => ({ val })),
                );
                const rows = result.rows ?? [];
                return [
                  rows,
                  result.metaData ?? [],
                  {
                    affectedRows: toNumber(
                      result.rowsAffected ?? result.affectedRows,
                    ),
                    rowCount: rows.length,
                  },
                ];
              } finally {
                await conn.rollback().catch(() => undefined);
              }
            },
          }
        : {}),
    } satisfies DbPool;
  }
  throw new BadRequestException(`${row.type} 驱动尚未配置`);
}

/** 连接测试用的最小 SQL：Oracle 需要 FROM DUAL */
export function databaseTestSql(type: string) {
  return ["Oracle", "OceanBase-Oracle"].includes(type)
    ? "SELECT 1 FROM DUAL"
    : "SELECT 1";
}
