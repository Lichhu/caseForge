import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("api_test_environment_service")
@Index("idx_api_test_env_service_env", ["environmentId"])
@Index("idx_api_test_env_service_project_env", ["projectId", "environmentId"])
export class ApiTestEnvironmentServiceEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  projectId: string;

  @Column()
  environmentId: string;

  @Column()
  name: string;

  @Column({ type: "varchar", length: 1024, nullable: true })
  serverAddress?: string;

  @Column({ type: "varchar", length: 1024, nullable: true })
  jdbcUrl?: string;

  @Column({ type: "varchar", length: 512, nullable: true })
  remoteConnection?: string;

  @Column({ type: "varchar", length: 512, nullable: true })
  objectStorage?: string;

  @Column({ type: "text", nullable: true })
  remark?: string;

  @Column({ type: "varchar", length: 16, default: "http" })
  transport: "http" | "tcp";

  @Column({ type: "varchar", length: 16, nullable: true })
  payloadFormat?: "json" | "xml" | "text" | "soap" | "other";

  @Column({ type: "varchar", length: 512, nullable: true })
  baseUrl?: string;

  @Column({ type: "varchar", length: 256, nullable: true })
  pathPrefix?: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  host?: string;

  @Column({ type: "int", nullable: true })
  port?: number;

  @Column({ type: "varchar", length: 32, nullable: true })
  encoding?: string;

  @Column({ type: "json", nullable: true })
  framing?: { type: "length-prefix"; width: number; encoding?: string };

  @Column({ type: "json", nullable: true })
  headers?: Record<string, string>;

  @Column({ type: "json", nullable: true })
  variables?: Record<string, string>;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  enabled: boolean;

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
