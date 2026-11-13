/**
 * @file AI Chat token 用量记录（ai_token_usage 表）
 * 每次调用 AI Chat 落一条记录，用于按场景/模型统计 token 消耗与调用耗时。
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/** token 数据来源：provider=接口返回的 usage，estimated=接口未返回时按字符估算，none=调用失败无数据 */
export const AI_CHAT_USAGE_SOURCES = ["provider", "estimated", "none"] as const;

export type AiChatUsageSource = (typeof AI_CHAT_USAGE_SOURCES)[number];

@Entity("ai_token_usage")
@Index("idx_ai_token_usage_created", ["createdAt"])
@Index("idx_ai_token_usage_scene_created", ["scene", "createdAt"])
@Index("idx_ai_token_usage_model_created", ["model", "createdAt"])
export class AiTokenUsageEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** 调用场景，如 api-test.case-plan */
  @Column({ type: "varchar", length: 64, default: "unknown" })
  scene: string;

  /** 实际请求的模型名 */
  @Column({ type: "varchar", length: 100, default: "" })
  model: string;

  /** 输入 token 数 */
  @Column({ type: "int", default: 0 })
  promptTokens: number;

  /** 输出 token 数 */
  @Column({ type: "int", default: 0 })
  completionTokens: number;

  /** 总 token 数 */
  @Column({ type: "int", default: 0 })
  totalTokens: number;

  /** token 数据来源 */
  @Column({
    type: "enum",
    enum: AI_CHAT_USAGE_SOURCES,
    default: "provider",
  })
  usageSource: AiChatUsageSource;

  /** 输入字符数，便于与 token 数据核对 */
  @Column({ type: "int", default: 0 })
  inputChars: number;

  /** 输出字符数 */
  @Column({ type: "int", default: 0 })
  outputChars: number;

  /** 本次调用耗时（毫秒） */
  @Column({ type: "int", default: 0 })
  durationMs: number;

  /** 第几次尝试（从 1 开始，含重试） */
  @Column({ type: "int", default: 1 })
  attempt: number;

  /** 是否成功；失败记录 token 数为 0，仅用于统计调用成功率 */
  @Column({ type: "tinyint", width: 1, default: 1 })
  success: boolean;

  /** 失败原因（最多 1000 字符） */
  @Column({ type: "varchar", length: 1000, nullable: true })
  errorMessage?: string | null;

  /** 业务对象类型，如 struct_doc / api_case_generate_job */
  @Column({ type: "varchar", length: 50, nullable: true })
  bizType?: string | null;

  /** 业务对象 id */
  @Column({ type: "varchar", length: 64, nullable: true })
  bizId?: string | null;

  /** 触发用户，由 AuditSubscriber 自动填充 */
  @Column({ type: "varchar", length: 255, nullable: true, default: "system" })
  createdBy?: string;

  @CreateDateColumn()
  createdAt: Date;
}
