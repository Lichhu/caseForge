import { SoftDeletableEntity } from "@common/entity/soft-deletable.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export const API_CASE_SCENARIO_STATUS = [
  "pending",
  "running",
  "completed",
  "not_applicable",
  "failed",
  "retrying",
] as const;
export type ApiCaseScenarioStatus = (typeof API_CASE_SCENARIO_STATUS)[number];

@Entity("api_case_generate_scenario")
@Index("uk_api_case_generate_scenario_job_key", ["jobId", "scenarioKey"], {
  unique: true,
  where: "deleted_at IS NULL",
})
@Index("idx_api_case_generate_scenario_job_status", ["jobId", "status"])
export class ApiCaseGenerateScenarioEntity extends SoftDeletableEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  jobId: string;

  @Column()
  projectId: string;

  @Column()
  transactionId: string;

  @Column({ length: 64 })
  scenarioKey: string;

  @Column({ length: 128 })
  scenarioName: string;

  @Column({ type: "varchar", length: 32, default: "pending" })
  status: ApiCaseScenarioStatus;

  @Column({ type: "text", nullable: true })
  applicableReason?: string | null;

  @Column({ type: "json", nullable: true })
  result?: unknown;

  @Column({ type: "int", default: 0 })
  resultCount: number;

  @Column({ type: "int", default: 0 })
  attemptCount: number;

  @Column({ type: "int", default: 0 })
  promptChars: number;

  @Column({ type: "int", default: 0 })
  inputFieldCount: number;

  @Column({ type: "int", nullable: true })
  durationMs?: number | null;

  @Column({ type: "text", nullable: true })
  errorMessage?: string | null;

  @Column({ type: "datetime", precision: 3, nullable: true })
  startedAt?: Date | null;

  @Column({ type: "datetime", precision: 3, nullable: true })
  finishedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
