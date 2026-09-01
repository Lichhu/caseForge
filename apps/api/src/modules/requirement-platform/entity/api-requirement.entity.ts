/**
 * @file 需求平台需求实体（api_requirement 表）
 * 数据源自测管平台库 b_project（SIT 测试中的需求），经服管 serviceList 校验后入库
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/** 需求分发/认领状态 */
export const API_REQUIREMENT_STATUSES = [
  "pending_dispatch",
  "pending_claim",
  "claimed",
] as const;

export type ApiRequirementStatus = (typeof API_REQUIREMENT_STATUSES)[number];

@Entity("api_requirement")
@Index("uk_api_requirement_project_code", ["projectCode"], { unique: true })
@Index("idx_api_requirement_status", ["status"])
export class ApiRequirementEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** 需求 code（源库 b_project.project_code） */
  @Column({ type: "varchar" })
  projectCode: string;

  /** 需求名（源库 b_project.project_name） */
  @Column({ type: "varchar" })
  projectName: string;

  /** 分发/认领状态，默认待分发 */
  @Column({
    type: "enum",
    enum: API_REQUIREMENT_STATUSES,
    default: "pending_dispatch",
  })
  status: ApiRequirementStatus;

  /** 被分发人账号（源库 sys_user.user_name） */
  @Column({ type: "varchar", nullable: true })
  dispatchedTo?: string | null;

  /** 被分发人姓名快照（分发时刻的 nick_name） */
  @Column({ type: "varchar", nullable: true })
  dispatchedToName?: string | null;

  /** 分发人 */
  @Column({ type: "varchar", nullable: true })
  dispatchedBy?: string | null;

  @Column({ type: "datetime", nullable: true })
  dispatchedAt?: Date | null;

  /** 认领人 */
  @Column({ type: "varchar", nullable: true })
  claimedBy?: string | null;

  /** 认领人姓名快照 */
  @Column({ type: "varchar", nullable: true })
  claimedByName?: string | null;

  @Column({ type: "datetime", nullable: true })
  claimedAt?: Date | null;

  /** 认领时自动创建的接口测试项目 id（case_project.id） */
  @Column({ type: "varchar", nullable: true })
  claimedProjectId?: string | null;

  /** 最近一次拒绝认领原因 */
  @Column({ type: "varchar", nullable: true })
  refuseReason?: string | null;

  /** 超期未分发提醒发送时间（null 表示未发送；分发/拒绝时重置） */
  @Column({ type: "datetime", nullable: true })
  overdueNotifiedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
