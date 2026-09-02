/**
 * @file 场景提示词库实体（prompt_library 表）
 */
import { SoftDeletableEntity } from "@common/entity/soft-deletable.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { ScenarioEntity } from "./scenario.entity";
import { TestPointPromptEntity } from "@dynamic-instruct/entity/test-point-prompt.entity";
import { DynamicInstructEntity } from "@dynamic-instruct/entity/dynamic-instruct";

/**
 * 提示词实体：归属某场景，含名称、内容、标签、排序及启用状态
 */
@Entity("prompt_library")
@Index("idx_scenario_name", ["scenarioId", "name"], { unique: true, where: "deleted_at IS NULL" })
@Index("idx_scenario_sort", ["scenarioId", "sortOrder"])
@Index("idx_scenario_id", ["scenarioId"])
export class PromptEntity extends SoftDeletableEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // 所属场景
  @Column({ name: "scenarioId" })
  scenarioId: string;

  // 关联场景
  @ManyToOne(() => ScenarioEntity, (scenario) => scenario.prompts, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  })
  @JoinColumn({ name: "scenarioId" })
  scenario: ScenarioEntity;

  @OneToMany(() => TestPointPromptEntity, (selection) => selection.prompt)
  testPointSelections: TestPointPromptEntity[];

  selections: DynamicInstructEntity[];

  // 提示词名称
  @Column()
  name: string;

  // 提示词内容
  @Column("text")
  content: string;

  // 提示词标签
  @Column("json")
  tags: string[];

  // 使用次数
  @Column("int")
  usageCount: number;

  // 排序
  @Column("int")
  sortOrder: number;

  // 是否为系统预设
  @Column("tinyint")
  isSystem: boolean;

  // 是否启用
  @Column({
    type: "tinyint",
    transformer: {
      from: (value: number | boolean | null) => Boolean(value),
      to: (value: boolean) => (value ? 1 : 0),
    },
  })
  isActive: boolean;

  // 是否默认勾选
  @Column("tinyint")
  isDefault: boolean;

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
