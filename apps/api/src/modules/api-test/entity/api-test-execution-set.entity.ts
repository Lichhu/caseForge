import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("api_test_execution_set")
@Index("idx_api_test_exec_set_project_tx_updated", [
  "projectId",
  "transactionId",
  "updatedAt",
])
export class ApiTestExecutionSetEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  projectId: string;

  @Column()
  transactionId: string;

  @Column()
  name: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ default: true })
  enabled: boolean;

  @Column({ nullable: true })
  lastRunId?: string;

  @Column({ type: "varchar", length: 32, nullable: true })
  lastRunStatus?: "running" | "completed" | "failed";

  @Column({ type: "datetime", nullable: true })
  lastRunAt?: Date;

  @Column({ default: 0 })
  lastPassedCount: number;

  @Column({ default: 0 })
  lastTotalCount: number;

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
