/**
 * @file 需求结构化任务队列（持久化，支持重启恢复）
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export const STRUCT_REQUIREMENT_JOB_STATUS = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export type StructRequirementJobStatus =
  (typeof STRUCT_REQUIREMENT_JOB_STATUS)[number];

@Entity("struct_requirement_job")
@Index("idx_struct_requirement_job_status_queued", ["status", "queuedAt"])
@Index("idx_struct_requirement_job_project", ["projectId"])
export class StructRequirementJobEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  projectId: string;

  @Column()
  structDocId: string;

  @Column({
    type: "enum",
    enum: STRUCT_REQUIREMENT_JOB_STATUS,
    default: "queued",
  })
  status: StructRequirementJobStatus;

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
