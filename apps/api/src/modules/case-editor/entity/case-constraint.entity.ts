/**
 * 案例生成约束快照实体：持久化约束输入 JSON。
 * markdown 列保留兼容旧数据，新记录不再写入内容。
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 案例生成约束快照实体，对应 case_constraint 表 */
@Entity('case_constraint')
@Index("idx_case_constraint_project", ["projectId", "createdAt"])
@Index("idx_case_constraint_struct_doc", ["structDocId"])
export class CaseConstraintEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column({ nullable: true })
  structDocId?: string;

  /** 约束输入参数（场景标签、分组策略、功能点指令等） */
  @Column({ type: 'json' })
  input: Record<string, unknown>;

  /** @deprecated 已不再生成，保留列兼容历史数据 */
  @Column({ type: 'longtext', default: null })
  markdown: string;

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
