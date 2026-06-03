/**
 * @file 案例生成项目实体（case_project 表）
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

/**
 * 案例项目实体：标题、描述、需求编号及审计字段
 */
@Entity("case_project")
@Index("idx_case_project_requirement_no", ["requirementNo"])
@Index("idx_case_project_updated_at", ["updatedAt"])
export class CaseProjectEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // 项目标题
  @Column({ nullable: true })
  title: string;

  // 项目描述
  @Column({ nullable: true })
  description: string;

  // 需求编号（结构化文档识别后可回填，用于列表检索）
  @Column({ nullable: true })
  requirementNo?: string;

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
