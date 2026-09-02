import { SoftDeletableEntity } from "@common/entity/soft-deletable.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("api_test_execution_set_case")
@Index("uk_api_test_exec_set_case", ["executionSetId", "caseId"], {
  unique: true,
  where: "deleted_at IS NULL",
})
@Index("idx_api_test_exec_set_case_sort", ["executionSetId", "sortOrder"])
export class ApiTestExecutionSetCaseEntity extends SoftDeletableEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  executionSetId: string;

  @Column()
  caseId: string;

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;
}
