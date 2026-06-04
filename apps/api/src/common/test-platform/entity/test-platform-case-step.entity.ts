/**
 * 测管平台案例操作步骤表 b_case_operating_step
 */
import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("b_case_operating_step")
export class TestPlatformCaseStepEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "case_id", type: "bigint" })
  caseId: string;

  @Column({ name: "operating_step_summarize", type: "varchar", length: 1024, nullable: true })
  operatingStepSummarize?: string;

  @Column({ name: "serial_number", type: "bigint" })
  serialNumber: number;

  @Column({ name: "expected_result", type: "varchar", length: 1024, nullable: true })
  expectedResult?: string;

  @Column({ name: "create_by", type: "varchar", length: 20, nullable: true })
  createBy?: string;

  @Column({ name: "update_by", type: "varchar", length: 20, nullable: true })
  updateBy?: string;

  @Column({ name: "data_status", type: "tinyint" })
  dataStatus: number;
}
