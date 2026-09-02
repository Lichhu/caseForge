/**
 * @file 接口案例生成任务队列（持久化，支持重启恢复与排队 ETA）
 */
import { SoftDeletableEntity } from "@common/entity/soft-deletable.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { ApiCaseStep, ApiDocGenerationProfile } from "@case-forge/shared";

export const API_CASE_GENERATE_JOB_STATUS = [
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
  "cancelled",
] as const;

export type ApiCaseGenerateJobStatus =
  (typeof API_CASE_GENERATE_JOB_STATUS)[number];

@Entity("api_case_generate_job")
@Index("idx_api_case_generate_job_status_queued", ["status", "queuedAt"])
@Index("idx_api_case_generate_job_project_transaction", [
  "projectId",
  "transactionId",
])
@Index("idx_api_case_generate_job_project_status_queued", [
  "projectId",
  "status",
  "queuedAt",
])
@Index("idx_api_case_generate_job_transaction_status", [
  "transactionId",
  "status",
])
@Index("idx_api_case_generate_job_status_finished", ["status", "finishedAt"])
export class ApiCaseGenerateJobEntity extends SoftDeletableEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  projectId: string;

  @Column()
  transactionId: string;

  @Column({ type: "json", nullable: true })
  endpointIds?: string[] | null;

  @Column({ type: "json", nullable: true })
  promptIds?: string[] | null;

  @Column({
    type: "enum",
    enum: API_CASE_GENERATE_JOB_STATUS,
    default: "queued",
  })
  status: ApiCaseGenerateJobStatus;

  @Column({ type: "int", nullable: true })
  resultCount?: number | null;

  @Column({ type: "int", nullable: true })
  version?: number | null;

  @Column({ type: "varchar", length: 32, nullable: true })
  versionCode?: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  ruleVersion?: string | null;

  @Column({ type: "json", nullable: true })
  snapshot?: {
    profile: ApiDocGenerationProfile;
    structuredMarkdown: string;
    beforeSteps?: ApiCaseStep[];
    afterSteps?: ApiCaseStep[];
    /** 大报文测试字段路径；存在时生成完成后附加 1 条大报文案例 */
    largePayloadFieldPath?: string;
  } | null;

  @Column({ type: "int", default: 0 })
  scenarioCount: number;

  @Column({ type: "int", default: 0 })
  completedScenarioCount: number;

  @Column({ type: "int", default: 0 })
  notApplicableScenarioCount: number;

  @Column({ type: "int", default: 0 })
  failedScenarioCount: number;

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
