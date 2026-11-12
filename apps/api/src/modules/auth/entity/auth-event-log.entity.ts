/**
 * @file 认证审计原始事件表（auth_event_log）。
 * 只追加，不更新、不物理删除单条记录；历史数据按月分区。
 */
import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("auth_event_log")
@Index("idx_auth_event_user_time", ["userName", "occurredAt", "id"])
@Index("idx_auth_event_ip_time", ["clientIp", "occurredAt", "id"])
@Index("idx_auth_event_type_time", ["eventType", "occurredAt", "id"])
@Index("idx_auth_event_request", ["requestId", "occurredAt"])
@Index("idx_auth_event_session", ["sessionId", "occurredAt", "id"])
export class AuthEventLogEntity {
  /** 事件发生时间，统一按 UTC 写入。 */
  @PrimaryColumn({ name: "occurred_at", type: "datetime", precision: 3 })
  occurredAt: Date;

  @PrimaryColumn({
    name: "id",
    type: "char",
    length: 36,
    charset: "ascii",
    collation: "ascii_bin",
  })
  id: string;

  @Column({
    name: "event_type",
    type: "varchar",
    length: 32,
    charset: "ascii",
  })
  eventType: string;

  /** 登录或操作的目标账号。 */
  @Column({ name: "user_name", type: "varchar", length: 255, nullable: true })
  userName: string | null;

  /** 原始操作人，代登录时为 system。 */
  @Column({
    name: "actor_user_name",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  actorUserName: string | null;

  /** IPv4 / IPv6 规范化二进制地址。 */
  @Column({ name: "client_ip", type: "varbinary", length: 16, nullable: true })
  clientIp: Buffer | null;

  /** 与 JWT jti 对应的会话 ID。 */
  @Column({
    name: "session_id",
    type: "char",
    length: 36,
    charset: "ascii",
    collation: "ascii_bin",
    nullable: true,
  })
  sessionId: string | null;

  /** 全局请求 ID，用于关联 HTTP 访问日志（兼容上游非 UUID 的 trace id）。 */
  @Column({
    name: "request_id",
    type: "varchar",
    length: 128,
    charset: "ascii",
    collation: "ascii_bin",
  })
  requestId: string;

  /** SSO、local-jwt、impersonation 等来源。 */
  @Column({
    name: "source_app",
    type: "varchar",
    length: 64,
    charset: "ascii",
    nullable: true,
  })
  sourceApp: string | null;

  @Column({ name: "user_agent", type: "varchar", length: 512, nullable: true })
  userAgent: string | null;

  /** 稳定的失败码，成功事件为空。 */
  @Column({
    name: "failure_code",
    type: "varchar",
    length: 64,
    charset: "ascii",
    nullable: true,
  })
  failureCode: string | null;

  /** 代登录原因或失败说明摘要。 */
  @Column({ name: "reason", type: "varchar", length: 200, nullable: true })
  reason: string | null;

  /** 扩展字段，不参与索引。 */
  @Column({ name: "metadata", type: "json", nullable: true })
  metadata: Record<string, unknown> | null;
}
