/**
 * @file 测试场景库实体（scenario_library 表）
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { PromptEntity } from "./prompt.entity";

/**
 * 场景实体：名称、描述、类别及关联的提示词列表
 */
@Entity("scenario_library")
@Index("idx_scenario_library_active_updated", ["isActive", "updatedAt"])
@Index("idx_scenario_library_name", ["name"])
@Index("idx_scenario_library_user_updated", ["createdBy", "updatedAt"])
export class ScenarioEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // 场景名称
  @Column()
  name: string;

  // 场景描述
  @Column({ type: "text", nullable: true })
  description: string;

  // 场景类别
  @Column()
  category: string;

  // 是否启用
  @Column({
    type: "tinyint",
    transformer: {
      from: (value: number | boolean | null) => Boolean(value),
      to: (value: boolean) => (value ? 1 : 0),
    },
  })
  isActive: boolean;

  // 一对多关系：一个场景包含多个提示词
  @OneToMany(() => PromptEntity, (prompt) => prompt.scenario, {
    cascade: true,
    eager: false,
  })
  prompts: PromptEntity[];

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
