/**
 * @file 需求平台消息通知服务：组装需求事件消息并写入 notify_message（默认未发送）
 * 1. 事件通知：分发/改派后通知被分发人；认领/拒绝后通知分发人或改派人；
 * 2. 超期提醒：工作日 08:30-17:30（Asia/Shanghai）扫描创建超阈值仍待分发的需求，
 *    按每 20 个需求编号分批给分发人写汇总提醒，全部入队后记录 overdueNotifiedAt。
 * 实际推送由 NotifyMessageService 轮询未发送消息完成（通道为行内 OCU 敏行消息）。
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "@config/app-config.types";
import { In, IsNull, LessThan, Repository } from "typeorm";
import { NotifyMessageService } from "@common/notify/service/notify-message.service";
import { ApiRequirementEntity } from "../entity/api-requirement.entity";
import { ApiRequirementDispatcherEntity } from "../entity/api-requirement-dispatcher.entity";

/** 需求消息的业务对象类型 */
const REQUIREMENT_BIZ_TYPE = "api_requirement";

/** 超期提醒使用的业务时区 */
const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

/** 工作日超期提醒窗口（当天分钟数，首尾包含） */
const OVERDUE_PUSH_START_MINUTE = 8 * 60 + 30;
const OVERDUE_PUSH_END_MINUTE = 17 * 60 + 30;

/** 单条超期提醒最多包含的需求编号数量 */
const OVERDUE_REQUIREMENT_BATCH_SIZE = 20;

const OVERDUE_CLOCK_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: SHANGHAI_TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const WORKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);

/** 需求消息场景标识 */
const REQUIREMENT_SCENES = {
  dispatched: "requirement.dispatched",
  claimed: "requirement.claimed",
  refused: "requirement.refused",
  overdue: "requirement.overdue",
} as const;

@Injectable()
export class RequirementNotifyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RequirementNotifyService.name);
  private timer?: NodeJS.Timeout;
  private scanning = false;

  constructor(
    @InjectRepository(ApiRequirementEntity)
    private readonly requirementRepo: Repository<ApiRequirementEntity>,
    @InjectRepository(ApiRequirementDispatcherEntity)
    private readonly dispatcherRepo: Repository<ApiRequirementDispatcherEntity>,
    private readonly messageService: NotifyMessageService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  /** 启动超期定时扫描（间隔毫秒数可配，0 表示关闭） */
  onModuleInit() {
    const intervalMs = this.pushConfig().overdueScanIntervalMs;
    if (intervalMs > 0) {
      this.timer = setInterval(() => {
        this.scanOverdue().catch((error) => {
          this.logger.error(`超期扫描失败: ${this.errorMessage(error)}`);
        });
      }, intervalMs);
      this.logger.log(`需求超期扫描已启用，间隔 ${intervalMs}ms`);
    }
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** 分发/改派后：通知被分发人认领 */
  notifyDispatched(requirement: ApiRequirementEntity): void {
    const target = requirement.dispatchedTo;
    if (!target) {
      return;
    }
    const message = `【需求分发通知】需求 ${requirement.projectCode}「${requirement.projectName}」已分发给你，请及时登录平台认领：${this.portalLink()}`;
    this.enqueue(REQUIREMENT_SCENES.dispatched, requirement, target, message);
  }

  /** 认领后：通知分发人/改派人 */
  notifyClaimed(requirement: ApiRequirementEntity): void {
    const target = requirement.dispatchedBy;
    if (!target) {
      return;
    }
    const claimer = requirement.claimedByName ?? requirement.claimedBy ?? "";
    const message = `【需求认领通知】需求 ${requirement.projectCode}「${requirement.projectName}」已由 ${claimer} 认领，可登录平台查看进展：${this.portalLink()}`;
    this.enqueue(REQUIREMENT_SCENES.claimed, requirement, target, message);
  }

  /**
   * 拒绝后：通知分发人/改派人重新分发
   * @param dispatcher - 分发人（refuse 清空前由调用方捕获）
   * @param refuserName - 拒绝人展示名
   */
  notifyRefused(
    requirement: ApiRequirementEntity,
    dispatcher: string,
    refuserName: string,
    reason?: string | null,
  ): void {
    if (!dispatcher) {
      return;
    }
    const reasonText = reason?.trim() ? `原因：${reason.trim()}。` : "";
    const message = `【需求拒绝通知】需求 ${requirement.projectCode}「${requirement.projectName}」被 ${refuserName} 拒绝。${reasonText}请及时登录平台重新分发：${this.portalLink()}`;
    this.enqueue(REQUIREMENT_SCENES.refused, requirement, dispatcher, message);
  }

  /**
   * 超期扫描：工作日在发送窗口内，创建超阈值仍待分发且未提醒过的需求，
   * 按每 20 个需求编号分批给每个分发人写汇总提醒；
   * 全部消息成功入队后记录 overdueNotifiedAt（分发/拒绝时重置标记）
   */
  async scanOverdue(): Promise<void> {
    if (this.scanning) {
      return;
    }
    this.scanning = true;
    try {
      const now = new Date();
      if (!this.isOverduePushWindow(now)) {
        return;
      }
      const push = this.pushConfig();
      const threshold = new Date(now.getTime() - push.overdueThresholdMs);
      const overdueRows = await this.requirementRepo.find({
        where: {
          status: "pending_dispatch",
          overdueNotifiedAt: IsNull(),
          createdAt: LessThan(threshold),
        },
      });
      if (overdueRows.length === 0) {
        return;
      }

      const dispatchers = await this.dispatcherRepo.find();
      if (dispatchers.length === 0) {
        this.logger.warn(
          `检测到 ${overdueRows.length} 条超期未分发需求，但分发人白名单为空，跳过推送`,
        );
        return;
      }

      const hours = Math.round(push.overdueThresholdMs / 3600000);
      const total = overdueRows.length;
      const codeBatches = this.chunk(
        overdueRows.map((row) => row.projectCode),
        OVERDUE_REQUIREMENT_BATCH_SIZE,
      );
      const messages = dispatchers.flatMap((row) =>
        codeBatches.map((codes, index) => {
          const start = index * OVERDUE_REQUIREMENT_BATCH_SIZE + 1;
          const end = start + codes.length - 1;
          const range =
            codeBatches.length > 1 ? `，本消息为第 ${start}-${end} 条` : "";
          const content =
            `【需求分发提醒】当前有 ${total} 条接口测试需求超 ${hours} 小时未分发` +
            `（共 ${total} 条${range}）。需求编号：${codes.join("、")}。` +
            `请及时登录平台处理：${this.portalLink()}`;
          return this.enqueueMessage(
            REQUIREMENT_SCENES.overdue,
            null,
            row.userName,
            content,
          );
        }),
      );
      const results = await Promise.all(messages);
      const queuedCount = results.filter(Boolean).length;
      if (queuedCount !== results.length) {
        this.logger.warn(
          `超期提醒入队不完整：成功 ${queuedCount}/${results.length} 条，保留未提醒状态等待下次扫描`,
        );
        return;
      }

      await this.requirementRepo.update(
        { id: In(overdueRows.map((row) => row.id)) },
        { overdueNotifiedAt: now },
      );
      this.logger.log(
        `超期扫描消息已入队：${total} 条需求 × ${dispatchers.length} 个分发人，共 ${messages.length} 条消息`,
      );
    } finally {
      this.scanning = false;
    }
  }

  /** 写入需求相关消息（不阻塞业务流程，失败仅记日志） */
  private enqueue(
    scene: string,
    requirement: ApiRequirementEntity,
    receiver: string,
    content: string,
  ): void {
    void this.enqueueMessage(scene, requirement.id, receiver, content);
  }

  /** 写入消息表：默认未发送，由 NotifyMessageService 轮询推送并负责失败重试 */
  private async enqueueMessage(
    scene: string,
    bizId: string | null,
    receiver: string,
    content: string,
  ): Promise<boolean> {
    try {
      await this.messageService.enqueue({
        scene,
        bizType: REQUIREMENT_BIZ_TYPE,
        bizId,
        receiver,
        content,
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `消息入队失败 scene=${scene} to=${receiver}: ${this.errorMessage(error)}`,
      );
      return false;
    }
  }

  /** 判断当前是否处于上海时区的工作日超期提醒窗口 */
  private isOverduePushWindow(now: Date): boolean {
    const parts = OVERDUE_CLOCK_FORMATTER.formatToParts(now);
    const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
    const hour = Number(
      parts.find((part) => part.type === "hour")?.value ?? Number.NaN,
    );
    const minute = Number(
      parts.find((part) => part.type === "minute")?.value ?? Number.NaN,
    );
    if (!WORKDAYS.has(weekday) || !Number.isFinite(hour)) {
      return false;
    }
    const currentMinute = hour * 60 + minute;
    return (
      currentMinute >= OVERDUE_PUSH_START_MINUTE &&
      currentMinute <= OVERDUE_PUSH_END_MINUTE
    );
  }

  /** 按指定大小切分数组 */
  private chunk<T>(items: T[], size: number): T[][] {
    const batches: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      batches.push(items.slice(index, index + size));
    }
    return batches;
  }

  /** 需求平台前端访问链接 */
  private portalLink(): string {
    const base = this.pushConfig().portalBaseUrl.replace(/\/+$/, "");
    return `${base}/api-test/requirement`;
  }

  private pushConfig(): AppConfig["ocuPush"] {
    return this.config.get("ocuPush", { infer: true })!;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
