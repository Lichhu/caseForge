import type { ApiStepDebugRecord } from "@case-forge/shared";
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
export class ApiStepDebugRecordEntity extends SoftDeletableEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  projectId: string;

  @Column()
  caseId: string;

  @Column()
  stepId: string;

  @Column({ type: "json" })
  record: ApiStepDebugRecord;

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
