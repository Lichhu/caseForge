/**
 * 测管平台测试案例表 b_case_test（只映射同步写入字段）
 */
import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("b_case_test")
export class TestPlatformCaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "is_ai", type: "int", default: 0, nullable: true })
  isAi?: number;

  @Column({ name: "case_serial_code", type: "varchar", length: 60, nullable: true })
  caseSerialCode?: string;

  @Column({ name: "case_serial", type: "varchar", length: 60 })
  caseSerial: string;

  @Column({ name: "system_name", type: "varchar", length: 64, nullable: true })
  systemName?: string;

  @Column({ name: "model_name", type: "varchar", length: 64, nullable: true })
  modelName?: string;

  @Column({ name: "current_system_name", type: "varchar", length: 64, nullable: true })
  currentSystemName?: string;

  @Column({ name: "functionPointName", type: "varchar", length: 500, nullable: true })
  functionPointName?: string;

  @Column({ name: "case_name", type: "varchar", length: 2000, nullable: true })
  caseName?: string;

  @Column({ name: "case_nature", type: "tinyint", nullable: true })
  caseNature?: number;

  @Column({ name: "test_type", type: "tinyint", nullable: true })
  testType?: number;

  @Column({ name: "case_type", type: "tinyint", nullable: true })
  caseType?: number;

  @Column({ name: "case_execute_type", type: "tinyint", nullable: true })
  caseExecuteType?: number;

  @Column({ name: "test_purpose", type: "varchar", length: 2000, nullable: true })
  testPurpose?: string;

  @Column({ name: "detailed_description", type: "varchar", length: 2000, nullable: true })
  detailedDescription?: string;

  @Column({ type: "tinyint", nullable: true })
  priority?: number;

  @Column({ name: "case_status", type: "tinyint" })
  caseStatus: number;

  @Column({ name: "expected_result", type: "varchar", length: 2000, nullable: true })
  expectedResult?: string;

  @Column({ name: "precondition", type: "varchar", length: 200, nullable: true })
  precondition?: string;

  @Column({ name: "create_by", type: "varchar", length: 20, nullable: true })
  createBy?: string;

  @Column({ name: "update_by", type: "varchar", length: 20, nullable: true })
  updateBy?: string;

  @Column({ name: "data_status", type: "tinyint" })
  dataStatus: number;

  @Column({ name: "project_id", type: "bigint", nullable: true })
  projectId?: string;

  @Column({ name: "case_code", type: "varchar", length: 50, nullable: true })
  caseCode?: string;

  @Column({ name: "report_type", type: "tinyint", nullable: true })
  reportType?: number;

  @Column({ name: "storage_status", type: "tinyint", default: 0 })
  storageStatus: number;

  @Column({ name: "require_codes", type: "varchar", length: 64, nullable: true })
  requireCodes?: string;

  @Column({ name: "label", type: "varchar", length: 200, nullable: true })
  label?: string;
}
