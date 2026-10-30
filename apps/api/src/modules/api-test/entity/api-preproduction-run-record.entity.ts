import type {
  ApiPreproductionRunExecutionStatus,
  ApiPreproductionRunPushStatus,
} from "@case-forge/shared";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("api_preprod_run_record")
@Index("idx_api_preprod_run_user_created", [
  "createdBy",
  "createdAt",
  "id",
])
@Index("idx_api_preprod_run_case_created", [
  "projectId",
  "caseId",
  "createdAt",
])
export class ApiPreproductionRunRecordEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 36 })
  projectId: string;

  @Column({ type: "varchar", length: 36 })
  transactionId: string;

  @Column({ type: "varchar", length: 36 })
  caseId: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  runSetId?: string | null;

  @Column({ type: "varchar", length: 255 })
  caseTitle: string;

  @Column({ type: "varchar", length: 16 })
  executionStatus: ApiPreproductionRunExecutionStatus;

  @Column({ type: "int", nullable: true })
  currentStepIndex?: number | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  currentStepName?: string | null;

  @Column({ type: "int", default: 0 })
  totalSteps: number;

  @Column({ type: "text", nullable: true })
  executionError?: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  runId?: string | null;

  @Column({ type: "varchar", length: 16, default: "pending" })
  pushStatus: ApiPreproductionRunPushStatus;

  @Column({ type: "text", nullable: true })
  pushError?: string | null;

  @Column({ type: "text", nullable: true })
  reportUrl?: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  versionId?: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  applicationId?: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  roundId?: string | null;

  @Column({ type: "varchar", length: 255, default: "system" })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: "datetime", nullable: true })
  finishedAt?: Date | null;

  @Column({ type: "datetime", nullable: true })
  pushFinishedAt?: Date | null;
}
