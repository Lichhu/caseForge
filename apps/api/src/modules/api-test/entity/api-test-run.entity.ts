import { ApiTestRunItemEntity } from "./api-test-run-item.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("api_test_run")
@Index("idx_api_test_run_project_created", ["projectId", "createdAt"])
export class ApiTestRunEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  projectId: string;

  @Column()
  environmentId: string;

  @Column({ nullable: true })
  environmentServiceId?: string;

  @Column({ nullable: true })
  executionSetId?: string;

  @Column({ nullable: true })
  transactionId?: string;

  @Column({ type: "varchar", length: 32, default: "completed" })
  status: "running" | "completed" | "failed";

  @Column({ default: 0 })
  totalCount: number;

  @Column({ default: 0 })
  passedCount: number;

  @Column({ default: 0 })
  failedCount: number;

  @Column({ default: 0 })
  errorCount: number;

  @Column({ default: 5 })
  concurrency: number;

  @OneToMany(() => ApiTestRunItemEntity, (item) => item.run)
  items: ApiTestRunItemEntity[];

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: "datetime", nullable: true })
  finishedAt?: Date;
}
