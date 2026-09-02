import type { ApiCaseStep } from "@case-forge/shared";
import { SoftDeletableEntity } from "@common/entity/soft-deletable.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("api_step_library")
@Index("idx_api_step_library_user", ["createdBy", "updatedAt"])
export class ApiStepLibraryEntity extends SoftDeletableEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: "json" })
  step: ApiCaseStep;

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
