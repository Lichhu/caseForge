import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

/** 项目类接口测试报告配置；直接维护数据库，不提供页面编辑入口。 */
@Entity("api_test_report_config")
export class ApiTestReportConfigEntity {
  @PrimaryColumn({ length: 64 })
  configKey: string;

  @Column({ length: 255 })
  configValue: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  description?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
