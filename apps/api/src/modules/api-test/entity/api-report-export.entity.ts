import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("api_report_export")
@Index("idx_report_export_tx", ["projectId", "transactionId", "createdAt"])
export class ApiReportExportEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  projectId: string;

  @Column()
  transactionId: string;

  /** xlsx | pdf | html */
  @Column({ length: 16 })
  format: string;

  @Column()
  runId: string;

  @Column()
  fileName: string;

  @Column()
  contentType: string;

  /** 导出产物 base64，用于历史重新下载 */
  @Column({ type: "longtext" })
  contentBase64: string;

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
