/**
 * 测试要点实体定义。
 * 映射 case_test_point 表，存储从结构化文档解析出的系统、模块与测试要点信息。
 */
import { DynamicInstructEntity } from "@dynamic-instruct/entity/dynamic-instruct";
import { TestPointInstructEntity } from "@dynamic-instruct/entity/test-point-instruct.entity";
import { TestPointPromptEntity } from "@dynamic-instruct/entity/test-point-prompt.entity";
import { StructDocEntity } from "@struct-doc/entity/struct-doc.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/** 结构化文档解析出的测试要点，关联项目与结构化文档。 */
@Entity("case_test_point")
@Index(["projectId", "structDocId"])
@Index(["structDocId", "testPoint"])
export class TestPointEntity {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    // 项目ID
    @Column()
    projectId: string;

    // 结构化文档ID
    @Column()
    structDocId: string;

    @ManyToOne(() => StructDocEntity, (structDoc) => structDoc.testPoints, {
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    })
    @JoinColumn({ name: "structDocId" })
    structDoc: StructDocEntity;

    // 系统
    @Column()
    system: string;

    // 系统描述
    @Column()
    systemDesc: string;
    
    // 功能模块
    @Column()
    featureModule: string;

    // 功能模块描述
    @Column()
    featureDesc: string;

    // 测试要点
    @Column()
    testPoint: string;

    // 测试要点描述
    @Column()
    testPointDesc: string;

    @OneToOne(() => TestPointInstructEntity, (instruct) => instruct.testPoint)
    instruct?: TestPointInstructEntity;
  
    @OneToMany(() => TestPointPromptEntity, (selection) => selection.testPoint)
    promptSelections: TestPointPromptEntity[];
  

    // 新增：一对多关系，指向中间表
    @OneToOne(() => DynamicInstructEntity, (selection) => selection.testPoint, {
      cascade: true,
      eager: false
    })
    selections: DynamicInstructEntity;


    @Column({ nullable: true, default: "system" })
    createdBy: string;
    
    @Column({ nullable: true, default: "system" })
    modifiedBy: string;

    @CreateDateColumn()
    createdAt: Date;
  
    @UpdateDateColumn()
    updatedAt: Date;
}