/**
 * 案例编辑运行实体：记录单次案例生成运行的元数据、
 * 关联的案例树根节点及生成状态。
 */
import { CaseTreeEntity } from "@case-editor/entity/case-tree.entity";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { StructDocEntity } from "@struct-doc/entity/struct-doc.entity";
import type { MindMapExtras } from "@case-forge/shared";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/** 案例编辑运行状态枚举值 */
export const CASE_EDITOR_STATUS = [
  "pending",
  "generating",
  "completed",
  "failed",
] as const;

export type CaseEditorStatus = (typeof CASE_EDITOR_STATUS)[number];

/** 案例编辑运行记录实体，对应 case_editor 表 */
@Entity("case_editor")
@Index("idx_case_editor_project", ["projectId", "createdAt"])
@Index("idx_case_editor_project_run", ["projectId", "id"])
export class CaseEditorEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  projectId: string;

  @ManyToOne(() => CaseProjectEntity, { onDelete: "CASCADE", onUpdate: "CASCADE" })
  @JoinColumn({ name: "projectId" })
  project: CaseProjectEntity;

  @Column({ nullable: true })
  structDocId?: string;

  @ManyToOne(() => StructDocEntity, { onDelete: "CASCADE", onUpdate: "CASCADE", nullable: true })
  @JoinColumn({ name: "structDocId" })
  structDoc?: StructDocEntity;

  /** 关联的案例树根节点 ID */
  @Column()
  caseTreeId: string;

  @Column({ nullable: true })
  constraintId?: string;

  @Column({ nullable: true })
  title?: string;

  /** 生成时使用的 LLM 提示词 */
  @Column({ type: "longtext", nullable: true })
  prompt?: string;

  @Column({ nullable: true })
  model?: string;

  @Column({
    type: "enum",
    enum: CASE_EDITOR_STATUS,
    default: "completed",
  })
  status: CaseEditorStatus;

  @Column({ default: 1 })
  version: number;

  /** 本次生成所选的动态测试要点 ID 列表 */
  @Column({ type: "json", nullable: true })
  sourceTestPointIds?: string[];

  /** 思维导图扩展数据（如 Mind Elixir 摘要） */
  @Column({ type: "json", nullable: true })
  mindMapExtras?: MindMapExtras;

  @OneToMany(() => CaseTreeEntity, (node) => node.caseEditor)
  treeNodes: CaseTreeEntity[];

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
