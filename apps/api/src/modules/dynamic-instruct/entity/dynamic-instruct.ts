/**
 * @file 动态指令实体（历史表 case_dynamic_instruct，测试要点与提示词关联）
 */
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { PromptEntity } from "@scenario/entity/prompt.entity";
import type { TestPointEntity } from "@struct-doc/entity/test-point.entity";

/**
 * 动态指令实体：记录测试要点上的编辑状态、自然语言约束及关联提示词
 */
@Entity('case_dynamic_instruct')
export class DynamicInstructEntity {
    @PrimaryGeneratedColumn({ name: 'id' })
    id: string;

    // 测试要点的状态
    @Column({
        type: 'enum',
        enum: [ '待编辑', '已编辑', '再编辑', '生成中', '生成失败', '生成完成' ],
        default: '待编辑'
    })
    status: string;

    // 是否全量覆盖
    @Column({ default: true })
    isFull: boolean;

    // 是否追加案例
    @Column({ default: false })
    isAppend: boolean;

    // 关联测试要点
    @OneToOne(
      () => require("@struct-doc/entity/test-point.entity").TestPointEntity,
      (tp: TestPointEntity) => tp.selections,
      {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      }
    )
    @JoinColumn({ name: 'testPointId' })
    testPoint: TestPointEntity;

    // 关联具体的提示词 (通过提示词直接关联场景)
    @ManyToOne(() => PromptEntity, (p) => p.selections, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
    })
    @JoinColumn({ name: 'promptId' })
    prompt: PromptEntity;

    // 自然语言
    @Column('text')
    naturalText: string;

    @Column({ nullable: true, default: "system" })
    createdBy: string;

    @Column({ nullable: true, default: "system" })
    modifiedBy: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
