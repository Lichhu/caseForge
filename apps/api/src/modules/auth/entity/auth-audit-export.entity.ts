/**
 * @file 登录审计异步导出任务（auth_audit_export）。
 * 只保存任务元数据和导出文件路径，不保存审计明细副本。
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";
import {
  AUTH_AUDIT_EXPORT_STATUSES,
  type AuthAuditExportStatus,
} from "@case-forge/shared";

@Entity("auth_audit_export")
@Index("idx_auth_audit_export_status_created", ["status", "createdAt"])
export class AuthAuditExportEntity {
  @PrimaryColumn({
    name: "id",
    type: "char",
    length: 36,
    charset: "ascii",
    collation: "ascii_bin",
  })
  id: string;

  @Column({
    name: "status",
    type: "enum",
    enum: AUTH_AUDIT_EXPORT_STATUSES,
    default: "pending",
  })
  status: AuthAuditExportStatus;

  @Column({ name: "query_from", type: "datetime", precision: 3 })
  queryFrom: Date;

  @Column({ name: "query_to", type: "datetime", precision: 3 })
  queryTo: Date;

  /** 明细筛选条件快照。 */
  @Column({ name: "filters", type: "json", nullable: true })
  filters: Record<string, string> | null;

  @Column({ name: "total_rows", type: "int", unsigned: true, default: 0 })
  totalRows: number;

  @Column({ name: "file_name", type: "varchar", length: 255, nullable: true })
  fileName: string | null;

  @Column({ name: "file_path", type: "varchar", length: 500, nullable: true })
  filePath: string | null;

  @Column({
    name: "error_message",
    type: "varchar",
    length: 1000,
    nullable: true,
  })
  errorMessage: string | null;

  @Column({ name: "requested_by", type: "varchar", length: 255 })
  requestedBy: string;

  /**
   * TypeORM 对 CreateDateColumn 默认使用 CURRENT_TIMESTAMP(6)，
   * 与 DATETIME(3) 精度不匹配会导致 MySQL 报 "Invalid default value"，
   * 因此显式指定同精度默认值。
   */
  @CreateDateColumn({
    name: "created_at",
    type: "datetime",
    precision: 3,
    default: () => "CURRENT_TIMESTAMP(3)",
  })
  createdAt: Date;

  @Column({
    name: "started_at",
    type: "datetime",
    precision: 3,
    nullable: true,
  })
  startedAt: Date | null;

  @Column({
    name: "finished_at",
    type: "datetime",
    precision: 3,
    nullable: true,
  })
  finishedAt: Date | null;
}
