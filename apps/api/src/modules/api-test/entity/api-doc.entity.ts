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

export const API_DOC_SOURCES = ["smp", "upload"] as const;

export type ApiDocSource = (typeof API_DOC_SOURCES)[number];

export interface SmpDocumentData {
  callServiceList: unknown[];
  serviceTestList: unknown[];
  approvalInfoList: unknown[];
}

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

  @ManyToOne(() => CaseProjectEntity, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  })
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

  /** 接口文档来源：smp（服管平台）或 upload（上传 Excel） */
  @Column({
    type: "enum",
    enum: API_DOC_SOURCES,
    default: "smp",
    name: "source",
  })
  source: ApiDocSource;

  /** 从 SMP 拉取到的文档数据（callServiceList / serviceTestList / approvalInfoList） */
  @Column({ type: "json", nullable: true, name: "smp_data" })
  smpData?: SmpDocumentData;

  /** 上次同步 SMP 服务调用数据的 hash（用于变更检测） */
  @Column({ length: 64, nullable: true, name: "last_smp_call_service_hash" })
  lastSmpCallServiceHash?: string;

  /** 上次同步 SMP 接口测试数据的 hash（用于变更检测） */
  @Column({ length: 64, nullable: true, name: "last_smp_test_info_hash" })
  lastSmpTestInfoHash?: string;

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
