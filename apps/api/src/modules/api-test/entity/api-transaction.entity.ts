import { CaseProjectEntity } from "@project-manage/entity/project.entity";
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

export type ApiTransactionSyncStatus =
  | "pending"
  | "generating"
  | "success"
  | "failed"
  | "cancelled"
  | "changed";

@Entity("api_transaction")
@Index(
  "uk_api_transaction_smp",
  ["projectId", "reqCode", "taskId", "serviceCode", "reqSystemId", "code"],
  {
    unique: true,
    where: "req_code IS NOT NULL",
  },
)
export class ApiTransactionEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ length: 36 })
  projectId: string;

  @ManyToOne(() => CaseProjectEntity, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: "projectId" })
  project: CaseProjectEntity;

  /** 交易码，如 addCtmSealInfo / PCBS03901001 */
  @Column({ length: 128 })
  code: string;

  /** 接口名称 */
  @Column({ length: 256 })
  name: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ default: 0 })
  sortOrder: number;

  /** 需求编号（SMP 来源） */
  @Column({ length: 64, nullable: true, name: "req_code" })
  reqCode?: string;

  /** 任务ID（SMP 来源） */
  @Column({ length: 64, nullable: true, name: "task_id" })
  taskId?: string;

  /** 服务编码（SMP 来源） */
  @Column({ length: 64, nullable: true, name: "service_code" })
  serviceCode?: string;

  /** 需求系统ID（SMP 来源） */
  @Column({ length: 32, nullable: true, name: "req_system_id" })
  reqSystemId?: string;

  /** 同步状态：待生成 / 生成中 / 生成成功 / 生成失败 / 取消生成 / 已变更 */
  @Column({
    type: "enum",
    enum: [
      "pending",
      "generating",
      "success",
      "failed",
      "cancelled",
      "changed",
    ],
    nullable: true,
    default: "pending",
    name: "sync_status",
  })
  syncStatus?: ApiTransactionSyncStatus;

  /** 同步失败原因 */
  @Column({ type: "text", nullable: true, name: "sync_error" })
  syncError?: string;

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
