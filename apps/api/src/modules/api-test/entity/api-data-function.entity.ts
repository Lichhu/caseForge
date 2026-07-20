import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("api_data_function")
@Index("uk_api_data_function_project_name", ["projectId", "name"], {
  unique: true,
})
export class ApiDataFunctionEntity {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column() projectId: string;
  @Column() name: string;
  @Column({ type: "json" }) params: string[];
  @Column({ type: "varchar", length: 16 }) type: "template" | "sql";
  @Column({ type: "json" }) config: Record<string, unknown>;
  @Column({ type: "varchar", length: 500, default: "" }) description: string;
  @Column({ nullable: true, default: "system" }) createdBy: string;
  @Column({ nullable: true, default: "system" }) modifiedBy: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
