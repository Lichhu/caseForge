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
})
@Index("idx_api_test_exec_set_case_sort", ["executionSetId", "sortOrder"])
export class ApiTestExecutionSetCaseEntity {
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
