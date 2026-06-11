import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("api_test_environment")
@Index("idx_api_test_env_project_default", ["projectId", "isDefault"])
export class ApiTestEnvironmentEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  projectId: string;

  @Column()
  name: string;

  @Column({ type: "varchar", length: 512 })
  baseUrl: string;

  @Column({ type: "json", nullable: true })
  headers?: Record<string, string>;

  @Column({ type: "text", nullable: true })
  secretsEncrypted?: string;

  @Column({ type: "json", nullable: true })
  variables?: Record<string, string>;

  @Column({ default: false })
  isDefault: boolean;

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
