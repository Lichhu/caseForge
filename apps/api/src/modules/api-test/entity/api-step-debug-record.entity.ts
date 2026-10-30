import type {
  ApiDebugRecordScope,
  ApiStepDebugRecord,
} from "@case-forge/shared";
import { SoftDeletableEntity } from "@common/entity/soft-deletable.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("api_step_debug_record")
@Index("idx_api_step_debug_case_step", ["caseId", "stepId", "createdAt"])
@Index("idx_api_step_debug_scope_step", [
  "projectId",
  "caseSource",
  "caseId",
  "stepId",
  "createdAt",
])
export class ApiStepDebugRecordEntity extends SoftDeletableEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 36 })
  projectId: string;

  @Column({ type: "varchar", length: 36 })
  caseId: string;

  /** project=需求接口测试平台，preproduction=准生产管理 */
  @Column({ type: "varchar", length: 16, default: "project" })
  caseSource: ApiDebugRecordScope;

  @Column({ type: "varchar", length: 36 })
  stepId: string;

  @Column({ type: "json" })
  record: ApiStepDebugRecord;

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
