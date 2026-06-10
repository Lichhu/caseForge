/**
 * @file 测试要点与场景提示词多对多关联实体
 */
import { PromptEntity } from "@scenario/entity/prompt.entity";
import type { TestPointEntity } from "@struct-doc/entity/test-point.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * 测试要点提示词选择实体：记录某测试要点勾选的场景提示词
 */
@Entity("case_test_point_prompt")
@Index("uk_case_test_point_prompt", ["testPointId", "promptId"], { unique: true })
@Index(["testPointId"])
@Index("idx_test_point_prompt_prompt", ["promptId"])
export class TestPointPromptEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  testPointId: string;

  @Column()
  promptId: string;

  @ManyToOne(
    () => require("@struct-doc/entity/test-point.entity").TestPointEntity,
    (testPoint: TestPointEntity) => testPoint.promptSelections,
    {
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
  )
  @JoinColumn({ name: "testPointId" })
  testPoint: TestPointEntity;

  @ManyToOne(() => PromptEntity, (prompt) => prompt.testPointSelections, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  })
  @JoinColumn({ name: "promptId" })
  prompt: PromptEntity;

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
