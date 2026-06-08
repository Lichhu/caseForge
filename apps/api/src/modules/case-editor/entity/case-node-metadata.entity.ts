/**
 * 案例树节点元数据实体：存储优先级、案例类型、
 * 来源说明及关联知识库等扩展信息。
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { CaseTreeEntity } from "./case-tree.entity";

/** 案例树节点元数据实体，对应 case_node_metadata 表 */
@Entity("case_node_metadata")
@Index(["caseTreeId"])
export class CaseNodeMetadataEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  caseTreeId: string;

  @OneToOne(() => CaseTreeEntity, (caseTree) => caseTree.metadata, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  })
  @JoinColumn({ name: "caseTreeId" })
  caseTree: CaseTreeEntity;

  @Column({ nullable: true })
  caseNature?: string;

  @Column({ nullable: true, default: "高" })
  priority?: string;

  @Column({ nullable: true })
  caseType?: string;

  @Column({ type: "text", nullable: true })
  source?: string;

  /** 关联知识库 ID 列表 */
  @Column({ type: "json", nullable: true })
  knowledgeBaseIds?: string[];

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
