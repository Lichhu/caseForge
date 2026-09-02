/**
 * @file 需求平台分发人白名单实体（api_requirement_dispatcher 表）
 * 名单内用户可查看全部需求并执行分发/同步操作，数据由 DBA 手工维护
 */
import { SoftDeletableEntity } from "@common/entity/soft-deletable.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("api_requirement_dispatcher")
@Index("uk_api_requirement_dispatcher_user", ["userName"], { unique: true, where: "deleted_at IS NULL" })
export class ApiRequirementDispatcherEntity extends SoftDeletableEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** 分发人账号（与请求上下文 userName 对应） */
  @Column()
  userName: string;

  @Column({ nullable: true })
  remark?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
