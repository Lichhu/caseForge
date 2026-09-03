/**
 * @file 消息发送服务：消息先落库（默认未发送），再由轮询任务读取未发送消息推送
 * 1. enqueue：业务事件写入 notify_message，状态默认 pending（未发送），并立即触发一轮推送；
 * 2. pump：定时/触发式扫描到期的未发送消息，占用后置为 sending，推送成功置 sent；
 * 3. 失败重试：按退避阶梯（1/5/15 分钟）重排 nextRetryAt，重试超过 maxRetry 置 failed；
 * 4. 重启恢复：启动时把残留 sending 的消息退回 pending，避免消息丢失。
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { IsNull, LessThanOrEqual, Repository } from "typeorm";
import type { AppConfig } from "@config/app-config.types";
import { mapWithConcurrency } from "@common/util/concurrency.util";
import { NotifyMessageEntity } from "../entity/notify-message.entity";
import { OcuPushService } from "./ocu-push.service";

/** 失败重试退避阶梯（毫秒）：第 1/2/3 次重试分别等待 1/5/15 分钟 */
const RETRY_BACKOFF_STEPS_MS = [60_000, 300_000, 900_000];

/** lastError 落库长度上限（与实体列宽保持一致） */
const LAST_ERROR_MAX_LENGTH = 1000;

/** 入队一条待发送消息所需信息 */
export interface EnqueueNotifyMessageInput {
  /** 业务场景标识，如 requirement.dispatched */
  scene: string;
  /** 收件人账号 */
  receiver: string;
  /** 消息正文 */
  content: string;
  /** 业务对象类型，如 api_requirement */
  bizType?: string | null;
  /** 业务对象 id（汇总类消息可为空） */
  bizId?: string | null;
}

@Injectable()
export class NotifyMessageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotifyMessageService.name);
  private timer?: NodeJS.Timeout;
  private pumping = false;

  constructor(
    @InjectRepository(NotifyMessageEntity)
    private readonly messageRepo: Repository<NotifyMessageEntity>,
    private readonly ocuPush: OcuPushService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  /** 启动：恢复残留发送中的消息，并开启未发送消息轮询（间隔可配，0 表示关闭） */
  onModuleInit() {
    this.background(
      this.recoverInterrupted().then(() => this.pump()),
      "启动推送任务异常",
    );

    const intervalMs = this.notifyConfig().scanIntervalMs;
    if (intervalMs > 0) {
      this.timer = setInterval(() => {
        this.background(this.pump(), "未发送消息轮询异常");
      }, intervalMs);
      this.logger.log(`未发送消息轮询已启用，间隔 ${intervalMs}ms`);
    }
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * 消息入队：写入 notify_message，默认未发送（pending），随后触发一轮推送
   * 调用方无需等待推送结果，失败由轮询任务按次数重试
   */
  async enqueue(
    input: EnqueueNotifyMessageInput,
  ): Promise<NotifyMessageEntity> {
    const message = await this.messageRepo.save(
      this.messageRepo.create({
        scene: input.scene,
        bizType: input.bizType ?? null,
        bizId: input.bizId ?? null,
        receiver: input.receiver,
        content: input.content,
        status: "pending",
        retryCount: 0,
        maxRetry: this.notifyConfig().maxRetry,
        nextRetryAt: null,
      }),
    );
    this.background(this.pump(), `消息推送任务异常 id=${message.id}`);
    return message;
  }

  /**
   * 推送未发送消息：连续排空积压，单轮取满 batchSize 说明还有剩余则继续下一轮
   * 重入直接返回，避免定时器与入队触发叠加造成重复发送
   */
  async pump(): Promise<void> {
    if (this.pumping) {
      return;
    }
    this.pumping = true;
    try {
      // 兜底为 1，避免 batchSize 配成 0/负数时排空循环无法退出
      const batchSize = Math.max(1, this.notifyConfig().batchSize);
      for (;;) {
        const handled = await this.pumpOnce(batchSize);
        if (handled < batchSize) {
          break;
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  /** 单轮推送：取到期的未发送消息并并发推送，返回本轮处理条数 */
  private async pumpOnce(batchSize: number): Promise<number> {
    const now = new Date();
    const rows = await this.messageRepo.find({
      where: [
        { status: "pending", nextRetryAt: IsNull() },
        { status: "pending", nextRetryAt: LessThanOrEqual(now) },
      ],
      order: { createdAt: "ASC" },
      take: batchSize,
    });
    if (rows.length === 0) {
      return 0;
    }

    const concurrency = this.config.get("ocuPush", {
      infer: true,
    })!.concurrency;
    const results = await mapWithConcurrency(rows, concurrency, async (row) =>
      this.deliver(row),
    );
    const sentCount = results.filter(Boolean).length;
    this.logger.log(
      `未发送消息推送完成：本轮 ${rows.length} 条，成功 ${sentCount} 条`,
    );
    return rows.length;
  }

  /**
   * 推送单条消息：先乐观占用（pending → sending）再发送，占用失败说明已被其他轮次处理
   * @returns 是否推送成功
   */
  private async deliver(row: NotifyMessageEntity): Promise<boolean> {
    const claimed = await this.messageRepo.update(
      { id: row.id, status: "pending" },
      { status: "sending" },
    );
    if ((claimed.affected ?? 0) === 0) {
      return false;
    }

    try {
      await this.ocuPush.sendToUser(row.receiver, row.content);
      await this.messageRepo.update(
        { id: row.id },
        { status: "sent", sentAt: new Date(), lastError: null },
      );
      return true;
    } catch (error) {
      await this.markSendFailure(row, this.errorMessage(error));
      return false;
    }
  }

  /** 记录发送失败：未超重试上限则退避后重排为未发送，超限置 failed 不再发送 */
  private async markSendFailure(
    row: NotifyMessageEntity,
    reason: string,
  ): Promise<void> {
    const retryCount = row.retryCount + 1;
    const exhausted = retryCount >= row.maxRetry;
    await this.messageRepo.update(
      { id: row.id },
      {
        status: exhausted ? "failed" : "pending",
        retryCount,
        nextRetryAt: exhausted
          ? null
          : new Date(Date.now() + this.backoffMs(retryCount)),
        lastError: reason.slice(0, LAST_ERROR_MAX_LENGTH),
      },
    );
    this.logger.warn(
      `消息发送失败 id=${row.id} scene=${row.scene} to=${row.receiver} ` +
        `第 ${retryCount}/${row.maxRetry} 次${exhausted ? "（已超限，标记 failed）" : ""}: ${reason}`,
    );
  }

  /** 服务重启时把残留 sending 的消息退回 pending，保证消息不丢（至多重复推送一次） */
  async recoverInterrupted(): Promise<void> {
    const result = await this.messageRepo.update(
      { status: "sending" },
      {
        status: "pending",
        nextRetryAt: null,
        lastError: "服务重启，消息重新入队",
      },
    );
    const affected = result.affected ?? 0;
    if (affected > 0) {
      this.logger.warn(
        `服务启动：已将 ${affected} 条发送中的消息重新置为未发送`,
      );
    }
  }

  /** 第 retryCount 次重试的等待时长，超出阶梯后固定使用最后一档 */
  private backoffMs(retryCount: number): number {
    const index = Math.min(retryCount - 1, RETRY_BACKOFF_STEPS_MS.length - 1);
    return RETRY_BACKOFF_STEPS_MS[Math.max(0, index)];
  }

  /** 后台执行：脱离调用方主流程，异常只记日志 */
  private background(promise: Promise<unknown>, label: string): void {
    promise.catch((error) => {
      this.logger.error(`${label}: ${this.errorMessage(error)}`);
    });
  }

  private notifyConfig(): AppConfig["notify"] {
    return this.config.get("notify", { infer: true })!;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
