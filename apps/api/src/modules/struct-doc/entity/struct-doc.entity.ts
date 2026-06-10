/**
 * 结构化需求文档实体定义。
 * 映射 case_struct_doc 表，记录需求文档、结构化结果及异步结构化任务状态。
 */
import { TestPointEntity } from "@struct-doc/entity/test-point.entity";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
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

/** 结构化任务状态枚举值 */
export const STRUCTURING_STATUS = [
  "idle",
  "processing",
  "completed",
  "failed",
] as const;

/** 结构化任务状态类型 */
export type StructuringStatus = (typeof STRUCTURING_STATUS)[number];

/** 项目级结构化需求文档记录，每个项目唯一一条。 */
@Entity("case_struct_doc")
@Index("uk_case_struct_doc_project", ["projectId"], { unique: true })
export class StructDocEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** 所属项目 ID */
  @Column()
  projectId: string;

  @ManyToOne(() => CaseProjectEntity, { onDelete: "CASCADE", onUpdate: "CASCADE" })
  @JoinColumn({ name: "projectId" })
  project: CaseProjectEntity;

  /** 原始需求文档文件名 */
  @Column({ nullable: true })
  reqDocName?: string;

  /** 原始需求文档在 MinIO 中的对象路径 */
  @Column({ nullable: true })
  reqDocPath?: string;

  /** AI 结构化返回的原始响应 JSON */
  @Column({ type: "json", nullable: true })
  aiResponse?: Record<string, unknown>;

  /** 结构化文档文件名 */
  @Column({ nullable: true })
  structuredDocName?: string;

  /** 已保存的结构化文档在 MinIO 中的对象路径 */
  @Column({ nullable: true })
  structDocPath?: string;

  /** 在线编辑中的临时结构化 Markdown，尚未写入 MinIO */
  @Column({ type: "longtext", nullable: true })
  tempStructDoc?: string;

  /** 案例生成共用的需求总结（由 tempStructDoc 压缩生成，显著短于全文） */
  @Column({ type: "longtext", nullable: true })
  summaryStructDoc?: string;

  /** 异步结构化任务状态 */
  @Column({
    type: "enum",
    enum: STRUCTURING_STATUS,
    default: "idle",
  })
  structuringStatus: StructuringStatus;

  /** 结构化失败时的错误信息 */
  @Column({ type: "text", nullable: true })
  structuringError?: string;

  /** 结构化任务开始时间 */
  @Column({ type: "datetime", nullable: true })
  structuringStartedAt?: Date;

  @OneToMany(() => TestPointEntity, (testPoint) => testPoint.structDoc)
  testPoints: TestPointEntity[];

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
