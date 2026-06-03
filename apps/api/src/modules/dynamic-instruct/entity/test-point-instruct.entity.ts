/**
 * @file 测试要点动态指令主表实体（状态、自然语言、全量/追加标志）
 */
import { TestPointEntity } from "@struct-doc/entity/test-point.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/** 测试要点动态指令允许的状态枚举值 */
export const TEST_POINT_INSTRUCT_STATUS = [
  "待编辑",
  "已编辑",
  "再编辑",
  "生成中",
  "生成失败",
  "生成完成",
] as const;

/** 测试要点动态指令状态类型 */
export type TestPointInstructStatus = (typeof TEST_POINT_INSTRUCT_STATUS)[number];

/**
 * 测试要点指令实体：与测试要点一对一，存储编辑状态与自然语言约束
 */
@Entity("case_test_point_instruct")
@Index("uk_case_test_point_instruct_test_point", ["testPointId"], {
  unique: true,
})
export class TestPointInstructEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  testPointId: string;

  @OneToOne(() => TestPointEntity, (testPoint) => testPoint.instruct, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  })
  @JoinColumn({ name: "testPointId" })
  testPoint: TestPointEntity;

  @Column({
    type: "enum",
    enum: TEST_POINT_INSTRUCT_STATUS,
    default: "待编辑",
  })
  status: TestPointInstructStatus;

  @Column({ type: "text", nullable: true })
  naturalText?: string;

  @Column({ default: false })
  isFull: boolean;

  @Column({ default: true })
  isAppend: boolean;

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
