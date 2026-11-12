/**
 * @file 登录审计后台维护任务。
 * 1. 每 5 分钟增量聚合当天/昨天数据到 auth_event_daily_stat（幂等 upsert）；
 * 2. 定期预建未来月份分区，避免数据量增长后做大表重组；
 * 3. 按保留期把旧分区归档到 auth_event_log_archive，超过归档期直接删除分区。
 */
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DataSource } from "typeorm";
import type { AppConfig } from "@config/app-config.types";
import { AuthAuditService } from "./auth-audit.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_PARTITION_PATTERN = /^p\d{6}$/;
/** 后台维护任务慢执行告警阈值。 */
const SLOW_TASK_MS = 2_000;
/** 日汇总补齐的最大回看天数，与交互查询上限保持一致。 */
const SUMMARY_BACKFILL_DAYS = 31;

interface PartitionRow {
  PARTITION_NAME: string | null;
  PARTITION_DESCRIPTION: string | null;
}

@Injectable()
export class AuthAuditMaintenanceService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AuthAuditMaintenanceService.name);
  private summaryTimer?: NodeJS.Timeout;
  private partitionTimer?: NodeJS.Timeout;
  private aggregating = false;
  private maintaining = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService<AppConfig>,
    private readonly auditService: AuthAuditService,
  ) {}

  /** 等所有模块（含 SchemaPatchService）初始化完成后再启动后台任务。 */
  onApplicationBootstrap() {
    this.background(this.auditService.recoverExports(), "恢复审计导出任务失败");
    this.background(this.aggregateRecentDays(), "启动审计日汇总失败");
    this.background(this.maintainPartitions(), "启动审计分区维护失败");

    const summaryIntervalMs = this.authConfig().auditSummaryIntervalMs;
    if (summaryIntervalMs > 0) {
      this.summaryTimer = setInterval(() => {
        this.background(this.aggregateRecentDays(), "审计日汇总任务异常");
      }, summaryIntervalMs);
      this.logger.log(`登录审计日汇总已启用，间隔 ${summaryIntervalMs}ms`);
    }

    const partitionIntervalMs = this.authConfig().auditPartitionIntervalMs;
    if (partitionIntervalMs > 0) {
      this.partitionTimer = setInterval(() => {
        this.background(this.maintainPartitions(), "审计分区维护任务异常");
      }, partitionIntervalMs);
      this.logger.log(
        `登录审计分区维护已启用，间隔 ${partitionIntervalMs}ms`,
      );
    }
  }

  onModuleDestroy() {
    if (this.summaryTimer) {
      clearInterval(this.summaryTimer);
      this.summaryTimer = undefined;
    }
    if (this.partitionTimer) {
      clearInterval(this.partitionTimer);
      this.partitionTimer = undefined;
    }
  }

  /** 聚合今天和昨天的数据；使用 INSERT ... ON DUPLICATE KEY UPDATE 保证幂等。 */
  async aggregateRecentDays(): Promise<void> {
    if (this.aggregating) return;
    this.aggregating = true;
    const startedAt = Date.now();
    try {
      const today = startOfUtcDay(new Date());
      // 从已有汇总的最后一天开始补齐，避免服务停机造成日汇总缺口。
      const lastStatDate = await this.lastStatDate();
      const earliest = new Date(
        today.getTime() - (SUMMARY_BACKFILL_DAYS - 1) * DAY_MS,
      );
      const firstDay =
        lastStatDate && lastStatDate.getTime() > earliest.getTime()
          ? startOfUtcDay(lastStatDate)
          : earliest;
      for (
        let day = firstDay;
        day.getTime() <= today.getTime();
        day = new Date(day.getTime() + DAY_MS)
      ) {
        await this.aggregateDay(day);
      }
      const durationMs = Date.now() - startedAt;
      if (durationMs > SLOW_TASK_MS) {
        this.logger.warn(`审计日汇总耗时较长: ${durationMs}ms`);
      }
    } finally {
      this.aggregating = false;
    }
  }

  /** 读取日汇总表最后一天，用于停机后补齐缺口。 */
  private async lastStatDate(): Promise<Date | null> {
    try {
      const rows: Array<{ lastDate: string | Date | null }> =
        await this.dataSource.query(
          "SELECT MAX(stat_date) AS lastDate FROM auth_event_daily_stat",
        );
      const value = rows[0]?.lastDate;
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(String(value));
      return Number.isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  async aggregateDay(day: Date): Promise<void> {
    const start = startOfUtcDay(day);
    const end = new Date(start.getTime() + DAY_MS);
    await this.dataSource.query(
      `
      INSERT INTO auth_event_daily_stat
        (stat_date, event_type, event_count, updated_at)
      SELECT DATE(occurred_at), event_type, COUNT(*), CURRENT_TIMESTAMP(3)
      FROM auth_event_log
      WHERE occurred_at >= ? AND occurred_at < ?
      GROUP BY DATE(occurred_at), event_type
      ON DUPLICATE KEY UPDATE
        event_count = VALUES(event_count),
        updated_at = CURRENT_TIMESTAMP(3)
      `,
      [start, end],
    );
  }

  /** 预建未来分区并按保留期归档/删除旧分区。 */
  async maintainPartitions(): Promise<void> {
    if (this.maintaining) return;
    this.maintaining = true;
    const startedAt = Date.now();
    try {
      await this.ensureFuturePartitions();
      await this.archiveOldPartitions();
      await this.cleanupExpiredExports();
      const durationMs = Date.now() - startedAt;
      if (durationMs > SLOW_TASK_MS) {
        this.logger.warn(`审计分区维护耗时较长: ${durationMs}ms`);
      }
    } catch (error) {
      this.logger.error(`审计分区维护失败: ${errorMessage(error)}`);
    } finally {
      this.maintaining = false;
    }
  }

  /**
   * 清理过期导出文件并监控目录占用。
   * 删除文件失败只告警，不影响分区维护。
   */
  async cleanupExpiredExports(): Promise<void> {
    const exportRoot = resolve(process.cwd(), this.authConfig().auditExportDir);
    let entries: string[];
    try {
      entries = await readdir(exportRoot);
    } catch {
      return;
    }

    const retentionMs =
      Math.max(1, this.authConfig().auditExportRetentionDays) * DAY_MS;
    const expiredBefore = Date.now() - retentionMs;
    let totalBytes = 0;
    for (const entry of entries) {
      const filePath = join(exportRoot, entry);
      try {
        const info = await stat(filePath);
        if (!info.isFile()) continue;
        if (info.mtimeMs < expiredBefore) {
          await rm(filePath, { force: true });
          continue;
        }
        totalBytes += info.size;
      } catch (error) {
        this.logger.warn(
          `检查审计导出文件失败 ${entry}: ${errorMessage(error)}`,
        );
      }
    }

    const warnBytes = this.authConfig().auditExportWarnBytes;
    if (warnBytes > 0 && totalBytes > warnBytes) {
      this.logger.warn(
        `审计导出目录占用 ${Math.round(totalBytes / 1024 / 1024)}MB，超过阈值 ${Math.round(
          warnBytes / 1024 / 1024,
        )}MB`,
      );
    }
  }

  /** 确保当前月到未来 N 个月都有独立分区。 */
  async ensureFuturePartitions(): Promise<void> {
    if (!(await this.tableExists("auth_event_log"))) return;
    const partitions = await this.partitionRows();
    if (!partitions.some((row) => row.PARTITION_NAME)) {
      await this.enablePartitioning();
      return;
    }

    const existing = new Set(
      partitions
        .map((row) => row.PARTITION_NAME)
        .filter((name): name is string => Boolean(name)),
    );
    if (!existing.has("p_future")) {
      return;
    }

    const boundaries = partitions
      .filter((row) => row.PARTITION_NAME !== "p_future")
      .map((row) => parsePartitionBoundary(row.PARTITION_DESCRIPTION))
      .filter((date): date is Date => Boolean(date));
    let latestBoundary = boundaries.length
      ? new Date(Math.max(...boundaries.map((date) => date.getTime())))
      : startOfUtcMonth(new Date());

    const monthsAhead = Math.max(
      1,
      this.authConfig().auditPartitionAheadMonths,
    );
    const currentMonth = startOfUtcMonth(new Date());
    for (let offset = 0; offset <= monthsAhead; offset += 1) {
      const monthStart = addUtcMonths(currentMonth, offset);
      const partitionName = monthPartitionName(monthStart);
      const boundary = addUtcMonths(monthStart, 1);
      if (existing.has(partitionName)) continue;
      if (boundary.getTime() <= latestBoundary.getTime()) continue;

      await this.dataSource.query(
        `ALTER TABLE auth_event_log REORGANIZE PARTITION p_future INTO (
          PARTITION ${partitionName} VALUES LESS THAN ('${formatSqlDateTime(boundary)}'),
          PARTITION p_future VALUES LESS THAN (MAXVALUE)
        )`,
      );
      existing.add(partitionName);
      latestBoundary = boundary;
      this.logger.log(`登录审计新分区已创建: ${partitionName}`);
    }
  }

  /** 按在线/归档保留期处理旧分区，不使用大批量 DELETE。 */
  async archiveOldPartitions(): Promise<void> {
    if (!(await this.tableExists("auth_event_log"))) return;
    const partitions = (await this.partitionRows())
      .filter(
        (row) =>
          row.PARTITION_NAME &&
          MONTH_PARTITION_PATTERN.test(row.PARTITION_NAME) &&
          row.PARTITION_DESCRIPTION,
      )
      .map((row) => ({
        name: row.PARTITION_NAME as string,
        boundary: parsePartitionBoundary(row.PARTITION_DESCRIPTION),
      }))
      .filter(
        (row): row is { name: string; boundary: Date } =>
          row.boundary !== null,
      )
      .sort((left, right) => left.boundary.getTime() - right.boundary.getTime());

    const onlineCutoff =
      Date.now() - this.authConfig().auditRetentionDays * DAY_MS;
    const archiveCutoff =
      Date.now() - this.authConfig().auditArchiveRetentionDays * DAY_MS;

    for (const partition of partitions) {
      if (partition.boundary.getTime() > onlineCutoff) continue;
      if (partition.boundary.getTime() <= archiveCutoff) {
        await this.dropPartition(partition.name);
        continue;
      }
      await this.archivePartition(partition.name);
    }
  }

  private async enablePartitioning(): Promise<void> {
    const monthsAhead = Math.max(
      1,
      this.authConfig().auditPartitionAheadMonths,
    );
    const currentMonth = startOfUtcMonth(new Date());
    const definitions: string[] = [];
    for (let offset = 0; offset <= monthsAhead; offset += 1) {
      const monthStart = addUtcMonths(currentMonth, offset);
      definitions.push(
        `PARTITION ${monthPartitionName(monthStart)} VALUES LESS THAN ('${formatSqlDateTime(
          addUtcMonths(monthStart, 1),
        )}')`,
      );
    }
    definitions.push("PARTITION p_future VALUES LESS THAN (MAXVALUE)");

    await this.dataSource.query(
      `ALTER TABLE auth_event_log PARTITION BY RANGE COLUMNS (occurred_at) (${definitions.join(
        ", ",
      )})`,
    );
    this.logger.log("auth_event_log 已启用按月分区");
  }

  private async archivePartition(partitionName: string): Promise<void> {
    if (!(await this.tableExists("auth_event_log_archive"))) {
      this.logger.warn(
        `归档表 auth_event_log_archive 不存在，暂不归档 ${partitionName}`,
      );
      return;
    }
    try {
      await this.dataSource.query(
        `INSERT IGNORE INTO auth_event_log_archive SELECT * FROM auth_event_log PARTITION (${partitionName})`,
      );
      await this.dropPartition(partitionName);
      this.logger.log(`登录审计分区已归档: ${partitionName}`);
    } catch (error) {
      this.logger.error(
        `登录审计分区归档失败 ${partitionName}: ${errorMessage(error)}`,
      );
    }
  }

  private async dropPartition(partitionName: string): Promise<void> {
    if (!MONTH_PARTITION_PATTERN.test(partitionName)) return;
    await this.dataSource.query(
      `ALTER TABLE auth_event_log DROP PARTITION ${partitionName}`,
    );
    this.logger.log(`登录审计旧分区已删除: ${partitionName}`);
  }

  private async partitionRows(): Promise<PartitionRow[]> {
    return this.dataSource.query(
      `SELECT PARTITION_NAME, PARTITION_DESCRIPTION
       FROM information_schema.PARTITIONS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_event_log'
       ORDER BY PARTITION_ORDINAL_POSITION`,
    );
  }

  private async tableExists(tableName: string): Promise<boolean> {
    const rows: Array<Record<string, string>> = await this.dataSource.query(
      "SHOW TABLES LIKE ?",
      [tableName],
    );
    return rows.length > 0;
  }

  private authConfig(): AppConfig["auth"] {
    return this.config.get("auth", { infer: true })!;
  }

  private background(promise: Promise<unknown>, label: string) {
    promise.catch((error) => {
      this.logger.error(`${label}: ${errorMessage(error)}`);
    });
  }
}

/** 计算月份分区名，例如 2026-11 -> p202611。 */
export function monthPartitionName(monthStart: Date): string {
  return `p${monthStart.getUTCFullYear()}${String(
    monthStart.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

function parsePartitionBoundary(value: string | null): Date | null {
  if (!value) return null;
  const text = value.replace(/^'|'$/g, "");
  const date = new Date(`${text.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function startOfUtcMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function addUtcMonths(value: Date, months: number): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1),
  );
}

function formatSqlDateTime(value: Date): string {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
