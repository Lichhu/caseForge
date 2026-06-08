/**
 * 测管平台需求表 b_project（只映射同步所需字段）
 */
import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("b_project")
export class TestPlatformProjectEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "project_code", type: "varchar", length: 32, nullable: true })
  projectCode?: string;

  @Column({ name: "project_name", type: "varchar", length: 64 })
  projectName: string;

  @Column({ name: "data_status", type: "tinyint" })
  dataStatus: number;
}
