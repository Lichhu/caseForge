/**
 * @file SQL 步骤执行器：校验、只读拦截、行数护栏、超时
 *
 * 和数据函数共用 database-pool.util 的驱动适配；数据函数保持只读，
 * SQL 步骤按 mode 决定是否允许 update。取值直接在 SQL 里写 `${共享变量}`
 * 或数据函数调用，由执行引擎在调用前替换，这里不做参数绑定。
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { scopedWhere } from "@common/audit/user-scope";
import {
  detectDbSqlKind,
  resolveDbStepMaxAffectedRows,
  resolveDbStepTimeoutMs,
  validateDbStepSql,
  type ApiDbStepMode,
} from "@case-forge/shared";
import { ApiDatabaseConnectionEntity } from "@api-test/entity/api-database-connection.entity";
import {
  createDatabasePool,
  type DbPool,
  type DbQueryMeta,
} from "@api-test/util/database-pool.util";

export interface SqlStepRunInput {
  connectionId: string;
  mode: ApiDbStepMode;
  /** 共享变量与数据函数已解析的 SQL */
  sql: string;
  maxAffectedRows?: number;
  timeoutMs?: number;
}

/** 进执行快照与报告的连接信息，绝不含密码 */
export interface SqlConnectionSummary {
  type: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  readonly: boolean;
}

export interface SqlStepRunResult {
  connectionId: string;
  connectionName: string;
  connection: SqlConnectionSummary;
  mode: ApiDbStepMode;
  /** 实际执行的 SQL */
  sql: string;
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  /** 驱动不上报影响行数时为 undefined，此时跳过行数护栏 */
  affectedRows?: number;
  durationMs: number;
}

/** 试运行最多返回的行数，够看字段和样例即可 */
const SQL_PREVIEW_MAX_ROWS = 50;

export interface SqlStepPreviewInput {
  connectionId: string;
  sql: string;
  /** 语句里的 `${变量}` 试运行时没有执行上下文，保持原样 */
  timeoutMs?: number;
}

export interface SqlStepPreviewResult {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  connectionName: string;
  /** 连接定位信息（不含密码） */
  connection: SqlConnectionSummary;
  /** 连接当前是否标记只读（改数据试运行时用来提醒真实执行会被拦） */
  connectionReadonly: boolean;
  /** 改数据试运行：语句影响的行数（不落库） */
  affectedRows?: number;
  /** 改数据试运行：语句已在事务里回滚，数据没变 */
  rolledBack?: boolean;
}

@Injectable()
export class SqlStepRunnerService {
  private readonly logger = new Logger(SqlStepRunnerService.name);

  constructor(
    @InjectRepository(ApiDatabaseConnectionEntity)
    private readonly connectionRepo: Repository<ApiDatabaseConnectionEntity>,
  ) {}

  async requireConnection(id: string) {
    if (!id) throw new BadRequestException("请先选择数据库连接");
    const row = await this.connectionRepo.findOne({
      where: scopedWhere({ id }),
    });
    if (!row) throw new NotFoundException("数据库连接不存在");
    return row;
  }

  /** 快照/报告里展示的连接信息，只取定位信息，不带密码 */
  private summarizeConnection(row: {
    type: string;
    host: string;
    port: number;
    databaseName?: string | null;
    username: string;
    readonly: boolean;
  }): SqlConnectionSummary {
    return {
      type: row.type,
      host: row.host,
      port: row.port,
      databaseName: row.databaseName ?? "",
      username: row.username,
      readonly: row.readonly,
    };
  }

  async run(input: SqlStepRunInput): Promise<SqlStepRunResult> {
    const issue = validateDbStepSql(input.sql, input.mode);
    if (issue) throw new BadRequestException(issue);
    const connection = await this.requireConnection(input.connectionId);
    const kind = detectDbSqlKind(input.sql);
    if (kind === "execute" && connection.readonly)
      throw new BadRequestException(
        `连接「${connection.name}」标记为只读，不允许执行改数据 SQL；需要改数据请先在数据库连接里取消只读`,
      );
    const sql = input.sql;
    const timeoutMs = resolveDbStepTimeoutMs(input.timeoutMs);
    const started = Date.now();
    const pool = await createDatabasePool(connection, this.logger);
    try {
      const result = await this.queryWithTimeout(
        pool,
        sql,
        [],
        timeoutMs,
        connection.name,
      );
      const rows = Array.isArray(result?.[0])
        ? (result[0] as Array<Record<string, unknown>>)
        : [];
      const meta = (result?.[2] ?? {}) as DbQueryMeta;
      const affectedRows = meta.affectedRows;
      if (kind === "execute")
        this.assertAffectedRows(
          affectedRows,
          resolveDbStepMaxAffectedRows(input.maxAffectedRows),
        );
      return {
        connectionId: connection.id,
        connectionName: connection.name,
        connection: this.summarizeConnection(connection),
        mode: input.mode,
        sql,
        rows,
        rowCount: rows.length,
        affectedRows,
        durationMs: Date.now() - started,
      };
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  /**
   * 试运行：
   * - 查询语句：直接执行，返回列名与前若干行，用来确认字段名再配变量提取；
   * - 改数据语句：放进事务里执行后强制回滚，报告影响行数，数据不落库。
   * 只读一次性执行，不参与案例排队（人手动触发）。
   */
  async preview(input: SqlStepPreviewInput): Promise<SqlStepPreviewResult> {
    const kind = detectDbSqlKind(input.sql);
    const issue = validateDbStepSql(
      input.sql,
      kind === "execute" ? "execute" : "query",
    );
    if (issue) throw new BadRequestException(issue);
    const connection = await this.requireConnection(input.connectionId);
    const timeoutMs = resolveDbStepTimeoutMs(input.timeoutMs);
    const started = Date.now();
    const pool = await createDatabasePool(connection, this.logger);
    try {
      if (kind === "execute") {
        if (!pool.runRolledBack)
          throw new BadRequestException(
            `${connection.type} 暂不支持改数据试运行：当前驱动无法回滚事务，请保存后执行整个案例验证`,
          );
        const result = await this.withTimeout(
          pool.runRolledBack(input.sql, []),
          timeoutMs,
          connection.name,
        );
        const meta = (result?.[2] ?? {}) as DbQueryMeta;
        return {
          columns: [],
          rows: [],
          rowCount: 0,
          truncated: false,
          durationMs: Date.now() - started,
          connectionName: connection.name,
          connection: this.summarizeConnection(connection),
          connectionReadonly: connection.readonly,
          affectedRows: meta.affectedRows,
          rolledBack: true,
        };
      }
      const result = await this.queryWithTimeout(
        pool,
        input.sql,
        [],
        timeoutMs,
        connection.name,
      );
      const rows = Array.isArray(result?.[0])
        ? (result[0] as Array<Record<string, unknown>>)
        : [];
      // 结果为空时拿驱动返回的字段元数据，保证「空表也该看到有哪些列」
      const fields = Array.isArray(result?.[1])
        ? (result[1] as Array<{ name?: unknown }>)
        : [];
      const columns = rows.length
        ? Object.keys(rows[0])
        : fields.map((field) => String(field?.name ?? "")).filter(Boolean);
      return {
        columns,
        rows: rows.slice(0, SQL_PREVIEW_MAX_ROWS),
        rowCount: rows.length,
        truncated: rows.length > SQL_PREVIEW_MAX_ROWS,
        durationMs: Date.now() - started,
        connectionName: connection.name,
        connection: this.summarizeConnection(connection),
        connectionReadonly: connection.readonly,
      };
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  /**
   * 影响行数护栏。驱动不上报行数时跳过校验，避免误判。
   * 注意：这里是执行后校验，能发现问题但无法阻止已发生的改动。
   */
  private assertAffectedRows(affectedRows: number | undefined, max: number) {
    if (affectedRows === undefined) return;
    if (affectedRows === 0)
      throw new BadRequestException(
        "update 影响 0 行：请检查 where 条件是否写错，或数据本来就是目标状态",
      );
    if (affectedRows > max)
      throw new BadRequestException(
        `update 影响 ${affectedRows} 行，超过上限 ${max} 行，请收紧 where 条件`,
      );
  }

  private async queryWithTimeout(
    pool: DbPool,
    sql: string,
    params: unknown[],
    timeoutMs: number,
    connectionName: string,
  ): Promise<any> {
    return this.withTimeout(
      pool.query({ sql, timeout: timeoutMs }, params),
      timeoutMs,
      connectionName,
    );
  }

  /** 统一超时与错误包装：超时、驱动报错都收敛成可读的 400 */
  private async withTimeout<T>(
    task: Promise<T>,
    timeoutMs: number,
    connectionName: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race<T>([
        task,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new BadRequestException(
                  `SQL 执行超时（${timeoutMs}ms）：连接「${connectionName}」上的语句未在超时时间内返回`,
                ),
              ),
            timeoutMs,
          );
        }),
      ]);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `SQL 执行失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
