import type {
  ApiCaseExpected,
  ApiCasePolarity,
  ApiCasePriority,
  ApiCaseRequest,
  ApiCaseSource,
  ApiCaseStatus,
} from "@case-forge/shared";
import { ApiEndpointEntity } from "./api-endpoint.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("api_test_case")
@Index("idx_api_test_case_project", ["projectId"])
@Index("idx_api_test_case_project_endpoint", ["projectId", "endpointId"])
export class ApiTestCaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  projectId: string;

  @Column()
  endpointId: string;

  @ManyToOne(() => ApiEndpointEntity, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  })
  @JoinColumn({ name: "endpointId" })
  endpoint: ApiEndpointEntity;

  @Column()
  title: string;

  @Column({ length: 64, nullable: true })
  caseNo?: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ type: "text", nullable: true })
  remark?: string;

  @Column({ length: 128, nullable: true })
  transactionCode?: string;

  @Column({ length: 255, nullable: true })
  owner?: string;

  @Column({ length: 8, default: "P1" })
  priority: ApiCasePriority;

  @Column({ length: 16, default: "positive" })
  polarity: ApiCasePolarity;

  @Column({ length: 16, default: "ready" })
  status: ApiCaseStatus;

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: "json", nullable: true })
  preconditions?: string[];

  @Column({ type: "json" })
  request: ApiCaseRequest;

  @Column({ type: "json" })
  expected: ApiCaseExpected;

  @Column({ type: "json", nullable: true })
  metadata?: {
    source?: ApiCaseSource;
    inferredFields?: string[];
    promptIds?: string[];
  };

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
