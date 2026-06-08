import type { AssertionResult, ApiRunItemStatus } from "@case-forge/shared";
import { ApiTestRunEntity } from "./api-test-run.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("api_test_run_item")
@Index("idx_api_test_run_item_run", ["runId"])
export class ApiTestRunItemEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  runId: string;

  @ManyToOne(() => ApiTestRunEntity, (run) => run.items, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  })
  @JoinColumn({ name: "runId" })
  run: ApiTestRunEntity;

  @Column()
  caseId: string;

  @Column()
  caseTitle: string;

  @Column({ length: 16 })
  status: ApiRunItemStatus;

  @Column({ default: 0 })
  durationMs: number;

  @Column({ type: "json" })
  requestSnapshot: Record<string, unknown>;

  @Column({ type: "json", nullable: true })
  responseSnapshot?: {
    status: number;
    headers: Record<string, string>;
    body: unknown;
    error?: string;
  };

  @Column({ type: "json" })
  assertions: AssertionResult[];

  @CreateDateColumn()
  createdAt: Date;
}
