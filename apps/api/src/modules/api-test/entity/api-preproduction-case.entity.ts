import type {
  ApiCaseExpected,
  ApiCasePolarity,
  ApiCasePriority,
  ApiCaseRequest,
  ApiCaseStatus,
  ApiCaseStep,
} from "@case-forge/shared";
import { SoftDeletableEntity } from "@common/entity/soft-deletable.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { ApiEndpointEntity } from "./api-endpoint.entity";

/** 准生产案例保存的案例内容快照 */
export interface ApiPreproductionCaseSnapshot {
  description?: string;
  remark?: string;
  preconditions?: string[];
  createdBy?: string;
  request: ApiCaseRequest;
  expected: ApiCaseExpected;
  steps?: ApiCaseStep[];
  metadata?: Record<string, unknown>;
}

/**
 * 准生产案例：由项目管理中的接口案例同步生成的快照。
 *
 * id 直接复用源案例 id，便于执行平台按原案例执行；重复同步按该 id 更新。
 */
@Entity("api_preprod_case")
@Index("idx_api_preprod_project_tx", ["projectId", "transactionId"])
@Index("idx_api_preprod_user_updated", ["createdBy", "updatedAt"])
export class ApiPreproductionCaseEntity extends SoftDeletableEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 36 })
  projectId: string;

  @Column({ type: "varchar", length: 36 })
  transactionId: string;

  @Column({ type: "varchar", length: 36 })
  endpointId: string;

  @ManyToOne(() => ApiEndpointEntity, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: "endpointId" })
  endpoint?: ApiEndpointEntity;

  @Column({ type: "varchar", length: 64, nullable: true })
  caseNo?: string | null;

  @Column({ type: "varchar", length: 255 })
  title: string;

  @Column({ type: "text", nullable: true })
  description?: string | null;

  @Column({ type: "text", nullable: true })
  remark?: string | null;

  @Column({ type: "text", nullable: true })
  applicationPath?: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  transactionCode?: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  owner?: string | null;

  @Column({ type: "varchar", length: 8, default: "P1" })
  priority: ApiCasePriority;

  @Column({ type: "varchar", length: 16, default: "positive" })
  polarity: ApiCasePolarity;

  @Column({ type: "varchar", length: 16, default: "ready" })
  status: ApiCaseStatus;

  @Column({ type: "tinyint", default: 1 })
  enabled: boolean;

  @Column({ type: "varchar", length: 32, nullable: true })
  versionCode?: string | null;

  @Column({ type: "int", nullable: true })
  generateVersion?: number | null;

  @Column({ type: "json" })
  snapshot: ApiPreproductionCaseSnapshot;

  @Column({ type: "datetime", nullable: true })
  sourceUpdatedAt?: Date | null;

  @Column({ type: "datetime", nullable: true })
  syncedAt?: Date | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  syncedBy?: string | null;

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
