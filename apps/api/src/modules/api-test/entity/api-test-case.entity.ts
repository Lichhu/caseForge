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

  @Column({ type: "text", nullable: true })
  description?: string;

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
  metadata?: { source?: ApiCaseSource; inferredFields?: string[] };

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
