import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { ApiEndpointEntity } from "./api-endpoint.entity";
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

export const API_STRUCTURING_STATUS = [
  "idle",
  "processing",
  "completed",
  "failed",
] as const;

export type ApiStructuringStatus = (typeof API_STRUCTURING_STATUS)[number];

@Entity("api_doc")
@Index("uk_api_doc_transaction", ["transactionId"], { unique: true })
@Index("idx_api_doc_project", ["projectId"])
export class ApiDocEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  projectId: string;

  @Column({ nullable: true, length: 36 })
  transactionId?: string;

  @ManyToOne(() => CaseProjectEntity, { onDelete: "CASCADE", onUpdate: "CASCADE" })
  @JoinColumn({ name: "projectId" })
  project: CaseProjectEntity;

  @Column({ nullable: true })
  sourceDocName?: string;

  @Column({ nullable: true })
  sourceDocPath?: string;

  @Column({ type: "longtext", nullable: true })
  structuredMarkdown?: string;

  @Column({ type: "longtext", nullable: true })
  tempStructuredMarkdown?: string;

  @Column({ type: "longtext", nullable: true })
  extractedRawText?: string;

  @Column({
    type: "enum",
    enum: API_STRUCTURING_STATUS,
    default: "idle",
  })
  structuringStatus: ApiStructuringStatus;

  @Column({ type: "text", nullable: true })
  structuringError?: string;

  @Column({ type: "json", nullable: true })
  metadata?: {
    promptIds?: string[];
  };

  @OneToMany(() => ApiEndpointEntity, (endpoint) => endpoint.apiDoc)
  endpoints: ApiEndpointEntity[];

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
