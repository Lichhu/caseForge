import type { ApiPreproductionRunSetStatus } from "@case-forge/shared";
import { SoftDeletableEntity } from "@common/entity/soft-deletable.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("api_preprod_run_set")
@Index("idx_api_preprod_run_set_user_created", [
  "createdBy",
  "createdAt",
  "id",
])
export class ApiPreproductionRunSetEntity extends SoftDeletableEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  name?: string | null;

  @Column({ type: "varchar", length: 36 })
  versionId: string;

  @Column({ type: "varchar", length: 255 })
  versionLabel: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  applicationId?: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  applicationLabel?: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  roundId?: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  roundLabel?: string | null;

  @Column({ type: "varchar", length: 24, default: "pending" })
  status: ApiPreproductionRunSetStatus;

  @Column({ type: "int", default: 0 })
  totalCount: number;

  @Column({ type: "int", default: 0 })
  completedCount: number;

  @Column({ type: "int", default: 0 })
  passedCount: number;

  @Column({ type: "int", default: 0 })
  failedCount: number;

  @Column({ type: "int", default: 0 })
  errorCount: number;

  @Column({ type: "int", default: 0 })
  pushSuccessCount: number;

  @Column({ type: "int", default: 0 })
  pushFailedCount: number;

  @Column({ type: "varchar", length: 255, default: "system" })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: "datetime", nullable: true })
  finishedAt?: Date | null;
}
