/**
 * @file 案例生成任务队列（持久化，支持重启恢复与排队 ETA）
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export const CASE_GENERATE_JOB_STATUS = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export type CaseGenerateJobStatus = (typeof CASE_GENERATE_JOB_STATUS)[number];

@Entity("case_generate_job")
@Index("idx_case_generate_job_status_queued", ["status", "queuedAt"])
@Index("idx_case_generate_job_project_test_point", ["projectId", "testPointId"])
@Index("idx_case_generate_job_project_status_queued", [
  "projectId",
  "status",
  "queuedAt",
])
@Index("idx_case_generate_job_test_point_status", ["testPointId", "status"])
@Index("idx_case_generate_job_status_finished", ["status", "finishedAt"])
export class CaseGenerateJobEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  projectId: string;

  @Column()
  testPointId: string;

  @Column({
    type: "enum",
    enum: CASE_GENERATE_JOB_STATUS,
    default: "queued",
  })
  status: CaseGenerateJobStatus;

  @Column({ nullable: true })
  model?: string;

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
