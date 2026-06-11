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

  @Column({ type: "varchar", length: 512, nullable: true })
  baseUrl?: string;

  @Column({ type: "varchar", length: 256, nullable: true })
  pathPrefix?: string;

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
