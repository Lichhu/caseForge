import { SoftDeletableEntity } from "@common/entity/soft-deletable.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/** 接口 AI 生成案例使用的服务属性及场景映射。 */
@Entity("api_generation_service_property")
@Index("uk_api_generation_service_property_code", ["code"], {
  unique: true,
  where: "deleted_at IS NULL",
})
export class ApiServicePropertyEntity extends SoftDeletableEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ length: 64 })
  code: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: "text", nullable: true })
  description?: string | null;

  @Column({ type: "json" })
  scenarioIds: string[];

  @Column({ type: "int", default: 0 })
  sortOrder: number;

  @Column({
    type: "tinyint",
    default: 1,
    transformer: {
      from: (value: number | boolean | null) => Boolean(value),
      to: (value: boolean) => (value ? 1 : 0),
    },
  })
  isActive: boolean;

  @Column({ nullable: true, default: "system" })
  createdBy: string;

  @Column({ nullable: true, default: "system" })
  modifiedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
