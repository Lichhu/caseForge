/**
 * @file 待发送消息实体（notify_message 表）
 * 业务事件（需求分发/认领/拒绝等）只负责写入消息，默认未发送（pending），
 * 由 NotifyMessageService 轮询未发送消息推送，失败按次数重试，超限标记 failed。
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

/** 消息发送状态：未发送 / 发送中 / 已发送 / 发送失败（重试超限） */
export const NOTIFY_MESSAGE_STATUSES = [
  "pending",
  "sending",
  "sent",
  "failed",
] as const;

export type NotifyMessageStatus = (typeof NOTIFY_MESSAGE_STATUSES)[number];

@Entity("notify_message")
@Index("idx_notify_message_status_retry", ["status", "nextRetryAt"])
@Index("idx_notify_message_biz", ["bizType", "bizId"])
export class NotifyMessageEntity extends SoftDeletableEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** 业务场景标识，如 requirement.dispatched / requirement.claimed */
  @Column({ type: "varchar", length: 50 })
  scene: string;

  /** 业务对象类型，如 api_requirement */
  @Column({ type: "varchar", length: 50, nullable: true })
  bizType?: string | null;

  /** 业务对象 id（汇总类消息可为空） */
  @Column({ type: "varchar", length: 64, nullable: true })
  bizId?: string | null;

  /** 收件人账号 */
  @Column({ type: "varchar", length: 64 })
  receiver: string;

  /** 消息正文 */
  @Column({ type: "text" })
  content: string;

  /** 发送状态，默认未发送 */
  @Column({
    type: "enum",
    enum: NOTIFY_MESSAGE_STATUSES,
    default: "pending",
  })
  status: NotifyMessageStatus;

  /** 已重试次数 */
  @Column({ type: "int", default: 0 })
  retryCount: number;

  /** 最大重试次数，达到后置为 failed */
  @Column({ type: "int", default: 3 })
  maxRetry: number;

  /** 下次可发送时间（null 表示立即可发） */
  @Column({ type: "datetime", precision: 3, nullable: true })
  nextRetryAt?: Date | null;

  /** 最近一次发送失败原因 */
  @Column({ type: "varchar", length: 1000, nullable: true })
  lastError?: string | null;

  /** 发送成功时间 */
  @Column({ type: "datetime", precision: 3, nullable: true })
  sentAt?: Date | null;

  /** 触发消息的操作人（由审计订阅者自动填充，后台任务为 system） */
  @Column({ nullable: true, default: "system" })
  createdBy?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
