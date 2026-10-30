import { SoftDeletableEntity } from "@common/entity/soft-deletable.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/**
 * 执行推送集成员：记录案例被关联到哪个执行推送集。
 *
 * 与 api_preprod_run_record 的区别：
 * - 成员表表示「预先编组」，创建推送集后、真正执行前即可写入；
 * - 记录表表示「一次实际执行」，执行推送时按成员逐条落库。
 *
 * 去重说明：MySQL 不支持带条件的部分唯一索引，软删除的行仍占用唯一键，
 * 因此这里用普通索引，(runSetId, caseId) 的唯一性由服务层保证。
 */
@Entity("api_preprod_run_set_case")
@Index("idx_api_preprod_run_set_case", ["runSetId", "caseId"])
@Index("idx_api_preprod_run_set_case_set_sort", ["runSetId", "sortOrder"])
export class ApiPreproductionRunSetCaseEntity extends SoftDeletableEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 36 })
  runSetId: string;

  @Column({ type: "varchar", length: 36 })
  caseId: string;

  @Column({ type: "varchar", length: 36 })
  projectId: string;

  @Column({ type: "varchar", length: 36 })
  transactionId: string;

  @Column({ type: "varchar", length: 255 })
  caseTitle: string;

  @Column({ type: "int", default: 0 })
  sortOrder: number;

  @Column({ type: "varchar", length: 255, default: "system" })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
