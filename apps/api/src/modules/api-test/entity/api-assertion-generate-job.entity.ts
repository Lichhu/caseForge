/**
 * @file AI 断言生成任务队列（持久化，支持重启恢复）
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export const API_ASSERTION_GENERATE_JOB_STATUS = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export type ApiAssertionGenerateJobStatus =
  (typeof API_ASSERTION_GENERATE_JOB_STATUS)[number];

@Entity("api_assertion_generate_job")
@Index("idx_api_assertion_gen_job_status_queued", ["status", "queuedAt"])
@Index("idx_api_assertion_gen_job_case", [
  "projectId",
  "transactionId",
  "caseId",
])
export class ApiAssertionGenerateJobEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  projectId: string;

  @Column()
  transactionId: string;

  @Column({ type: "varchar", nullable: true })
  caseId?: string | null;

  @Column({ type: "varchar", length: 50 })
  transport: string;

  @Column({ type: "varchar", length: 20 })
  messageFormat: string;

  @Column({ type: "varchar", length: 20 })
  polarity: string;

  @Column({ type: "int" })
  statusCode: number;

  @Column({ type: "json" })
  headers: Record<string, string>;

  @Column({ type: "longtext" })
  body: string;

  @Column({
    type: "enum",
    enum: API_ASSERTION_GENERATE_JOB_STATUS,
    default: "queued",
  })
  status: ApiAssertionGenerateJobStatus;

  @Column({ type: "json", nullable: true })
  resultAssertions?: unknown | null;

  @Column({ type: "datetime", precision: 3 })
  queuedAt: Date;

  @Column({ type: "datetime", precision: 3, nullable: true })
  startedAt?: Date | null;

  @Column({ type: "datetime", precision: 3, nullable: true })
  finishedAt?: Date | null;

  @Column({ type: "text", nullable: true })
  errorMessage?: string | null;

  @Column({ nullable: true, default: "system" })
  createdBy?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
