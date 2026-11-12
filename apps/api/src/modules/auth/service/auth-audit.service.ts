/**
 * @file 统一认证与代登录审计服务。
 * 1. record / recordStrict：写入原始事件，普通登录失败不影响认证结果，代登录失败会阻止操作；
 * 2. queryEvents / summarize：游标分页明细和日汇总；
 * 3. 异步导出：先建任务，后台按游标分批读取并流式生成 CSV。
 */
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, rm } from "node:fs/promises";
import { once } from "node:events";
import { join, resolve } from "node:path";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, type SelectQueryBuilder } from "typeorm";
import type { AppConfig } from "@config/app-config.types";
import { RequestContext } from "@common/audit/request-context";
import {
  AUTH_AUDIT_DEFAULT_PAGE_SIZE,
  AUTH_AUDIT_EVENT_TYPES,
  AUTH_AUDIT_EVENT_TYPE_LABELS,
  AUTH_AUDIT_MAX_PAGE_SIZE,
  type AuthAuditEvent,
  type AuthAuditEventFilters,
  type AuthAuditEventPage,
  type AuthAuditEventType,
  type AuthAuditExportJob,
  type AuthAuditExportStatus,
  type AuthAuditSummary,
  type AuthAuditSummaryPoint,
} from "@case-forge/shared";
import { AuthEventLogEntity } from "../entity/auth-event-log.entity";
import { AuthEventDailyStatEntity } from "../entity/auth-event-daily-stat.entity";
import { AuthAuditExportEntity } from "../entity/auth-audit-export.entity";
import {
  bufferToIp,
  ipToBuffer,
  normalizeIp,
} from "../util/ip-address.util";
import {
  decodeAuthAuditCursor,
  encodeAuthAuditCursor,
} from "../util/auth-audit-cursor.util";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPORT_PAGE_SIZE = 500;
const CSV_BOM = "\uFEFF";
const CSV_HEADERS = [
  "时间(UTC)",
  "事件",
  "账号",
  "原始操作人",
  "IP",
  "会话ID",
  "请求ID",
  "来源",
  "失败码",
  "原因",
  "User-Agent",
  "metadata",
];

export interface AuthAuditRecordInput {
  eventType: AuthAuditEventType;
  userName?: string | null;
  actorUserName?: string | null;
  clientIp?: string | null;
  sessionId?: string | null;
  requestId?: string | null;
  sourceApp?: string | null;
  userAgent?: string | null;
  failureCode?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date;
}

export interface AuthAuditQueryInput extends AuthAuditEventFilters {
  from: string | Date;
  to: string | Date;
  cursor?: string;
  limit?: number;
}

interface NormalizedAuditQuery {
  from: Date;
  to: Date;
  eventType?: AuthAuditEventType;
  userName?: string;
  ip?: string;
  requestId?: string;
  sessionId?: string;
  cursor?: string;
  limit: number;
}

@Injectable()
export class AuthAuditService {
  private readonly logger = new Logger(AuthAuditService.name);
  private readonly processingExports = new Set<string>();

  constructor(
    @InjectRepository(AuthEventLogEntity)
    private readonly eventRepo: Repository<AuthEventLogEntity>,
    @InjectRepository(AuthEventDailyStatEntity)
    private readonly dailyRepo: Repository<AuthEventDailyStatEntity>,
    @InjectRepository(AuthAuditExportEntity)
    private readonly exportRepo: Repository<AuthAuditExportEntity>,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  /** 写入审计事件；失败只记录结构化错误日志，不影响已完成认证结果。 */
  async record(input: AuthAuditRecordInput): Promise<void> {
    try {
      await this.insertEvent(input);
    } catch (error) {
      this.logWriteFailure(input, error);
    }
  }

  /** 写入审计事件；失败时抛错，用于必须与审计保持一致的代登录操作。 */
  async recordStrict(input: AuthAuditRecordInput): Promise<void> {
    try {
      await this.insertEvent(input);
    } catch (error) {
      this.logWriteFailure(input, error);
      throw new ServiceUnavailableException("审计写入失败，操作已取消");
    }
  }

  /** 按时间范围、账号、IP、请求 ID 等条件查询明细（游标分页）。 */
  async queryEvents(input: AuthAuditQueryInput): Promise<AuthAuditEventPage> {
    const query = this.normalizeQuery(input);
    return this.queryPage(query);
  }

  /** 查询日汇总；页面卡片和趋势图不扫描原始明细表。 */
  async summarize(input: {
    from: string | Date;
    to: string | Date;
  }): Promise<AuthAuditSummary> {
    const from = parseDate(input.from, "from");
    const to = parseDate(input.to, "to");
    if (to.getTime() <= from.getTime()) {
      throw new BadRequestException("结束时间必须晚于开始时间");
    }
    const maxDays = this.authConfig().auditMaxQueryDays;
    if (to.getTime() - from.getTime() > maxDays * DAY_MS) {
      throw new BadRequestException(`单次查询最多允许 ${maxDays} 天`);
    }

    const fromDate = formatDateOnly(from);
    const toDate = formatDateOnly(new Date(to.getTime() - 1));
    const rows = await this.dailyRepo
      .createQueryBuilder("stat")
      .where("stat.statDate >= :fromDate AND stat.statDate <= :toDate", {
        fromDate,
        toDate,
      })
      .orderBy("stat.statDate", "ASC")
      .addOrderBy("stat.eventType", "ASC")
      .getMany();

    const totals = emptyTotals();
    const items: AuthAuditSummaryPoint[] = [];
    for (const row of rows) {
      if (!isAuthAuditEventType(row.eventType)) continue;
      const count = row.eventCount;
      totals[row.eventType] += count;
      items.push({
        statDate: normalizeDateOnly(row.statDate),
        eventType: row.eventType,
        count,
      });
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totals,
      items,
    };
  }

  /** 创建异步导出任务，后台流式生成 CSV。 */
  async createExport(
    input: AuthAuditQueryInput & { requestedBy: string },
  ): Promise<AuthAuditExportJob> {
    const query = this.normalizeQuery(input);
    const job = this.exportRepo.create({
      id: randomUUID(),
      status: "pending",
      queryFrom: query.from,
      queryTo: query.to,
      filters: toFilterRecord(query),
      totalRows: 0,
      fileName: null,
      filePath: null,
      errorMessage: null,
      requestedBy: input.requestedBy,
      startedAt: null,
      finishedAt: null,
    });
    await this.exportRepo.save(job);
    setImmediate(() => {
      void this.processExport(job.id).catch((error) => {
        this.logger.error(
          `审计导出任务执行异常 id=${job.id}: ${errorMessage(error)}`,
        );
      });
    });
    return toSharedExportJob(job);
  }

  /**
   * 服务重启后恢复导出任务：中断的 running 任务标记失败，pending 任务重新排队。
   * 由维护任务在启动时调用。
   */
  async recoverExports(): Promise<void> {
    await this.exportRepo.update(
      { status: "running" },
      {
        status: "failed",
        errorMessage: "服务重启导致导出中断，请重新发起导出",
        finishedAt: new Date(),
      },
    );
    const pending = await this.exportRepo.find({
      where: { status: "pending" },
      order: { createdAt: "ASC" },
      take: 20,
    });
    for (const job of pending) {
      setImmediate(() => {
        void this.processExport(job.id).catch((error) => {
          this.logger.error(
            `审计导出任务恢复异常 id=${job.id}: ${errorMessage(error)}`,
          );
        });
      });
    }
    if (pending.length > 0) {
      this.logger.log(`已恢复 ${pending.length} 个待执行的审计导出任务`);
    }
  }

  async getExport(id: string): Promise<AuthAuditExportJob> {
    const job = await this.exportRepo.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException("导出任务不存在");
    }
    return toSharedExportJob(job);
  }

  /** 返回已完成的导出文件信息，供控制器以流方式下载。 */
  async openExportFile(id: string): Promise<{
    filePath: string;
    fileName: string;
  }> {
    const job = await this.exportRepo.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException("导出任务不存在");
    }
    if (job.status !== "completed" || !job.filePath || !job.fileName) {
      throw new BadRequestException("导出任务尚未完成");
    }

    const exportRoot = this.exportRoot();
    const filePath = resolve(job.filePath);
    if (!isPathInside(filePath, exportRoot)) {
      throw new NotFoundException("导出文件不存在");
    }
    try {
      await access(filePath);
    } catch {
      throw new NotFoundException("导出文件不存在或已被清理");
    }
    return { filePath, fileName: job.fileName };
  }

  /** 后台执行导出：按 (occurred_at, id) 游标分批读取并写入 CSV。 */
  async processExport(id: string): Promise<void> {
    if (this.processingExports.has(id)) return;
    const existing = await this.exportRepo.findOne({ where: { id } });
    if (!existing || existing.status !== "pending") {
      return;
    }

    this.processingExports.add(id);
    const exportRoot = this.exportRoot();
    const filePath = join(exportRoot, `${existing.id}.csv`);
    const startedAt = new Date();
    // 条件更新抢占任务，避免多实例同时处理同一个 pending 导出。
    const claim = await this.exportRepo.update(
      { id, status: "pending" },
      { status: "running", startedAt, errorMessage: null },
    );
    if (!claim.affected) {
      this.processingExports.delete(id);
      return;
    }

    let stream: ReturnType<typeof createWriteStream> | undefined;
    const streamErrors: Error[] = [];
    let totalRows = 0;
    try {
      await mkdir(exportRoot, { recursive: true });
      stream = createWriteStream(filePath, { encoding: "utf8" });
      stream.on("error", (error) => streamErrors.push(error));
      await writeChunk(stream, `${CSV_BOM}${CSV_HEADERS.join(",")}\n`);
      throwIfStreamFailed(streamErrors);

      let cursor: string | undefined;
      for (;;) {
        const page = await this.queryPage({
          from: existing.queryFrom,
          to: existing.queryTo,
          ...parseFilterRecord(existing.filters),
          cursor,
          limit: EXPORT_PAGE_SIZE,
        });
        for (const item of page.items) {
          totalRows += 1;
          if (totalRows > this.authConfig().auditMaxExportRows) {
            throw new Error(
              `导出数据超过 ${this.authConfig().auditMaxExportRows} 条，请缩小时间范围或增加筛选条件`,
            );
          }
          await writeChunk(stream, `${toCsvRow(item)}\n`);
        }
        throwIfStreamFailed(streamErrors);
        if (!page.hasMore || !page.nextCursor) break;
        cursor = page.nextCursor;
      }

      await finishStream(stream, streamErrors);
      const fileName = `auth-audit-${formatStamp(existing.queryFrom)}-${formatStamp(
        existing.queryTo,
      )}.csv`;
      await this.exportRepo.update(
        { id },
        {
          status: "completed",
          totalRows,
          fileName,
          filePath,
          finishedAt: new Date(),
          errorMessage: null,
        },
      );
      this.logger.log(`审计导出完成 id=${id} rows=${totalRows}`);
    } catch (error) {
      stream?.destroy();
      await rm(filePath, { force: true }).catch(() => undefined);
      await this.exportRepo.update(
        { id },
        {
          status: "failed",
          totalRows,
          errorMessage: errorMessage(error).slice(0, 1000),
          finishedAt: new Date(),
        },
      );
      this.logger.error(`审计导出失败 id=${id}: ${errorMessage(error)}`);
    } finally {
      this.processingExports.delete(id);
    }
  }

  private async insertEvent(input: AuthAuditRecordInput): Promise<void> {
    const requestId =
      input.requestId ?? RequestContext.getRequestId() ?? randomUUID();
    await this.eventRepo.insert({
      id: randomUUID(),
      occurredAt: input.occurredAt ?? new Date(),
      eventType: input.eventType,
      userName: truncate(input.userName, 255),
      actorUserName: truncate(input.actorUserName, 255),
      clientIp: ipToBuffer(input.clientIp),
      sessionId: normalizeSessionId(input.sessionId),
      requestId: truncate(requestId, 128) ?? randomUUID(),
      sourceApp: truncate(input.sourceApp, 64),
      userAgent: truncate(input.userAgent, 512),
      failureCode: truncate(input.failureCode, 64),
      reason: truncate(input.reason, 200),
      metadata: (input.metadata ?? null) as never,
    });
  }

  private logWriteFailure(input: AuthAuditRecordInput, error: unknown) {
    this.logger.error(
      JSON.stringify({
        event: "auth.audit.write_failed",
        eventType: input.eventType,
        requestId: input.requestId ?? RequestContext.getRequestId() ?? null,
        userName: input.userName ?? null,
        error: errorMessage(error),
      }),
    );
  }

  private normalizeQuery(input: AuthAuditQueryInput): NormalizedAuditQuery {
    const from = parseDate(input.from, "from");
    const to = parseDate(input.to, "to");
    if (to.getTime() <= from.getTime()) {
      throw new BadRequestException("结束时间必须晚于开始时间");
    }

    const maxDays = this.authConfig().auditMaxQueryDays;
    if (to.getTime() - from.getTime() > maxDays * DAY_MS) {
      throw new BadRequestException(`单次查询最多允许 ${maxDays} 天`);
    }

    if (input.eventType && !isAuthAuditEventType(input.eventType)) {
      throw new BadRequestException("事件类型不合法");
    }

    const ip = input.ip?.trim();
    if (ip && !normalizeIp(ip)) {
      throw new BadRequestException("IP 地址格式不正确");
    }

    const limit =
      input.limit == null
        ? AUTH_AUDIT_DEFAULT_PAGE_SIZE
        : Math.min(
            Math.max(1, Math.floor(Number(input.limit)) || 1),
            AUTH_AUDIT_MAX_PAGE_SIZE,
          );

    return {
      from,
      to,
      ...(input.eventType ? { eventType: input.eventType } : {}),
      ...(input.userName?.trim() ? { userName: input.userName.trim() } : {}),
      ...(ip ? { ip } : {}),
      ...(input.requestId?.trim()
        ? { requestId: input.requestId.trim() }
        : {}),
      ...(input.sessionId?.trim()
        ? { sessionId: input.sessionId.trim() }
        : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
      limit,
    };
  }

  private async queryPage(
    query: NormalizedAuditQuery,
  ): Promise<AuthAuditEventPage> {
    const builder = this.eventRepo.createQueryBuilder("event");
    this.applyFilters(builder, query);

    if (query.cursor) {
      const cursor = decodeAuthAuditCursor(query.cursor);
      builder.andWhere(
        "(event.occurredAt < :cursorTime OR (event.occurredAt = :cursorTime AND event.id < :cursorId))",
        { cursorTime: cursor.occurredAt, cursorId: cursor.id },
      );
    }

    const rows = await builder
      .orderBy("event.occurredAt", "DESC")
      .addOrderBy("event.id", "DESC")
      .take(query.limit + 1)
      .getMany();

    const hasMore = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map(toSharedEvent),
      nextCursor:
        hasMore && last
          ? encodeAuthAuditCursor({ occurredAt: last.occurredAt, id: last.id })
          : null,
      hasMore,
    };
  }

  private applyFilters(
    builder: SelectQueryBuilder<AuthEventLogEntity>,
    query: NormalizedAuditQuery,
  ) {
    builder.where("event.occurredAt >= :from AND event.occurredAt < :to", {
      from: query.from,
      to: query.to,
    });
    if (query.eventType) {
      builder.andWhere("event.eventType = :eventType", {
        eventType: query.eventType,
      });
    }
    if (query.userName) {
      builder.andWhere("event.userName = :userName", {
        userName: query.userName,
      });
    }
    if (query.ip) {
      builder.andWhere("event.clientIp = :clientIp", {
        clientIp: ipToBuffer(query.ip),
      });
    }
    if (query.requestId) {
      builder.andWhere("event.requestId = :requestId", {
        requestId: query.requestId,
      });
    }
    if (query.sessionId) {
      builder.andWhere("event.sessionId = :sessionId", {
        sessionId: query.sessionId,
      });
    }
  }

  private authConfig(): AppConfig["auth"] {
    return this.config.get("auth", { infer: true })!;
  }

  private exportRoot(): string {
    return resolve(process.cwd(), this.authConfig().auditExportDir);
  }
}

function parseFilterRecord(
  filters: Record<string, string> | null,
): AuthAuditEventFilters {
  if (!filters) return {};
  return {
    ...(filters.eventType &&
    isAuthAuditEventType(filters.eventType as AuthAuditEventType)
      ? { eventType: filters.eventType as AuthAuditEventType }
      : {}),
    ...(filters.userName ? { userName: filters.userName } : {}),
    ...(filters.ip ? { ip: filters.ip } : {}),
    ...(filters.requestId ? { requestId: filters.requestId } : {}),
    ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
  };
}

function toFilterRecord(query: NormalizedAuditQuery): Record<string, string> {
  return {
    ...(query.eventType ? { eventType: query.eventType } : {}),
    ...(query.userName ? { userName: query.userName } : {}),
    ...(query.ip ? { ip: query.ip } : {}),
    ...(query.requestId ? { requestId: query.requestId } : {}),
    ...(query.sessionId ? { sessionId: query.sessionId } : {}),
  };
}

function toSharedEvent(entity: AuthEventLogEntity): AuthAuditEvent {
  return {
    id: entity.id,
    occurredAt: entity.occurredAt.toISOString(),
    eventType: entity.eventType as AuthAuditEventType,
    userName: entity.userName ?? null,
    actorUserName: entity.actorUserName ?? null,
    clientIp: bufferToIp(entity.clientIp),
    sessionId: entity.sessionId ?? null,
    requestId: entity.requestId,
    sourceApp: entity.sourceApp ?? null,
    userAgent: entity.userAgent ?? null,
    failureCode: entity.failureCode ?? null,
    reason: entity.reason ?? null,
    metadata: entity.metadata ?? null,
  };
}

function toSharedExportJob(job: AuthAuditExportEntity): AuthAuditExportJob {
  return {
    id: job.id,
    status: job.status as AuthAuditExportStatus,
    from: job.queryFrom.toISOString(),
    to: job.queryTo.toISOString(),
    filters: parseFilterRecord(job.filters),
    totalRows: job.totalRows,
    fileName: job.fileName ?? null,
    errorMessage: job.errorMessage ?? null,
    requestedBy: job.requestedBy,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

function toCsvRow(event: AuthAuditEvent): string {
  return [
    event.occurredAt,
    AUTH_AUDIT_EVENT_TYPE_LABELS[event.eventType],
    event.userName,
    event.actorUserName,
    event.clientIp,
    event.sessionId,
    event.requestId,
    event.sourceApp,
    event.failureCode,
    event.reason,
    event.userAgent,
    event.metadata ? JSON.stringify(event.metadata) : "",
  ]
    .map(toCsvCell)
    .join(",");
}

/** CSV 公式注入防护 + 标准转义。 */
export function toCsvCell(value: unknown): string {
  if (value == null) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function writeChunk(
  stream: ReturnType<typeof createWriteStream>,
  chunk: string,
) {
  if (!stream.write(chunk)) {
    await once(stream, "drain");
  }
}

async function finishStream(
  stream: ReturnType<typeof createWriteStream>,
  streamErrors: Error[],
) {
  await new Promise<void>((resolve, reject) => {
    stream.end(() => resolve());
    stream.once("error", reject);
  });
  throwIfStreamFailed(streamErrors);
}

function throwIfStreamFailed(streamErrors: Error[]) {
  const error = streamErrors[0];
  if (error) {
    throw error;
  }
}

function parseDate(value: string | Date, field: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} 不是有效时间`);
  }
  return date;
}

function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDateOnly(value: string | Date): string {
  if (value instanceof Date) {
    return formatDateOnly(value);
  }
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text)
    ? text.slice(0, 10)
    : formatDateOnly(new Date(text));
}

function formatStamp(date: Date): string {
  return formatDateOnly(date).replace(/-/g, "");
}

function truncate(value: string | null | undefined, max: number) {
  const text = value?.trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

function normalizeSessionId(value: string | null | undefined) {
  const text = value?.trim();
  if (!text || text.length > 36) return null;
  return text;
}

function emptyTotals(): Record<AuthAuditEventType, number> {
  return {
    login_success: 0,
    login_failure: 0,
    logout: 0,
    impersonation_start: 0,
    impersonation_exit: 0,
  };
}

function isAuthAuditEventType(value: string): value is AuthAuditEventType {
  return (AUTH_AUDIT_EVENT_TYPES as readonly string[]).includes(value);
}

function isPathInside(filePath: string, root: string) {
  return filePath === root || filePath.startsWith(`${root}/`);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
