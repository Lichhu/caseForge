/**
 * @file 认证审计日汇总表（auth_event_daily_stat）。
 * 页面卡片和趋势图只读此表，避免扫描原始大表。
 */
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity("auth_event_daily_stat")
export class AuthEventDailyStatEntity {
  /** UTC 日期，格式 YYYY-MM-DD。 */
  @PrimaryColumn({ name: "stat_date", type: "date" })
  statDate: string;

  @PrimaryColumn({
    name: "event_type",
    type: "varchar",
    length: 32,
    charset: "ascii",
  })
  eventType: string;

  @Column({
    name: "event_count",
    type: "bigint",
    unsigned: true,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) => Number(value),
    },
  })
  eventCount: number;

  @UpdateDateColumn({
    name: "updated_at",
    type: "datetime",
    precision: 3,
    default: () => "CURRENT_TIMESTAMP(3)",
    onUpdate: "CURRENT_TIMESTAMP(3)",
  })
  updatedAt: Date;
}
