/**
 * 案例树节点实体：以邻接表存储案例树各层级节点，
 * 支持 system/module/requirement/case 等节点类型。
 */
import { CaseNodeKind } from "@case-forge/shared";
import { CaseEditorEntity } from "@case-editor/entity/case-editor.entity";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { CaseNodeMetadataEntity } from "./case-node-metadata.entity";

/**
 * 案例树节点实体，对应 case_tree 表。
 * parentId / caseEditorId / projectId 保留 TypeORM 默认单列索引（供外键使用，勿删）。
 * 复合索引仅用于查询加速，同步时不会替换 FK 依赖的索引。
 */
@Entity("case_tree")
@Index(["parentId"])
@Index(["caseEditorId"])
@Index(["projectId"])
@Index("idx_case_tree_editor_parent_sort", [
  "caseEditorId",
  "parentId",
  "sortOrder",
])
@Index("idx_case_tree_parent_sort", ["parentId", "sortOrder"])
export class CaseTreeEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  projectId: string;

  @ManyToOne(() => CaseProjectEntity, { onDelete: "CASCADE", onUpdate: "CASCADE" })
  @JoinColumn({ name: "projectId" })
  project: CaseProjectEntity;

  @Column({ nullable: true })
  caseEditorId?: string;

  @ManyToOne(() => CaseEditorEntity, (editor) => editor.treeNodes, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  })
  @JoinColumn({ name: "caseEditorId" })
  caseEditor?: CaseEditorEntity;

  @Column()
  title: string;

  /** 节点类型（root/system/module/requirement/case 等） */
  @Column()
  kind: CaseNodeKind;

  @Column({ nullable: true })
  parentId?: string;

  /** 同级节点排序序号 */
  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: false })
  collapsed?: boolean;

  @OneToOne(() => CaseNodeMetadataEntity, (metadata) => metadata.caseTree, {
    cascade: true,
    eager: true,
  })
  metadata?: CaseNodeMetadataEntity;

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
