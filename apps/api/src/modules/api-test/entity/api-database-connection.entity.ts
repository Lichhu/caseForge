import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("api_database_connection")
@Index("uk_api_database_connection_project_name", ["projectId", "name"], {
  unique: true,
})
export class ApiDatabaseConnectionEntity {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column() projectId: string;
  @Column() name: string;
  @Column() type: string;
  @Column() host: string;
  @Column() port: number;
  @Column() databaseName: string;
  @Column() username: string;
  @Column({ type: "text", nullable: true }) passwordEncrypted?: string;
  @Column({ default: true }) readonly: boolean;
  @Column({ nullable: true, default: "system" }) createdBy: string;
  @Column({ nullable: true, default: "system" }) modifiedBy: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
