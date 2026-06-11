import { ApiDocEntity } from "./api-doc.entity";
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

@Entity("api_endpoint")
@Index("idx_api_endpoint_doc", ["apiDocId"])
@Index("idx_api_endpoint_transaction", ["transactionId"])
@Index("idx_api_endpoint_project_transaction", ["projectId", "transactionId"])
export class ApiEndpointEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  projectId: string;

  @Column({ nullable: true, length: 36 })
  transactionId?: string;

  @Column()
  apiDocId: string;

  @ManyToOne(() => ApiDocEntity, (doc) => doc.endpoints, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  })
  @JoinColumn({ name: "apiDocId" })
  apiDoc: ApiDocEntity;

  @Column()
  name: string;

  @Column({ length: 16 })
  method: string;

  @Column({ type: "varchar", length: 512 })
  path: string;

  @Column({ type: "text", nullable: true })
  summary?: string;

  @Column({ type: "text", nullable: true })
  requestNotes?: string;

  @Column({ type: "text", nullable: true })
  responseNotes?: string;

  @Column({ type: "json", nullable: true })
  tags?: string[];

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
