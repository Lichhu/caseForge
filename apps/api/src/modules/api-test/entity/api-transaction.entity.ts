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

@Entity("api_transaction")
@Index("uk_api_transaction_project_code", ["projectId", "code"], { unique: true })
@Index("idx_api_transaction_project", ["projectId"])
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

  /** 交易码，如 addCtmSealInfo */
  @Column({ length: 128 })
  code: string;

  /** 接口名称 */
  @Column({ length: 256 })
  name: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
