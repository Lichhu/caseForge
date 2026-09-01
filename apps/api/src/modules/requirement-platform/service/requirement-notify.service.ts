/**
 * @file 需求平台消息通知服务：通过行内 OCU 推送接口发送敏行消息
 * 1. 超期提醒：定时扫描创建超阈值（默认 24 小时）仍待分发的需求，
 *    给每个分发人各推一条（userIds 只放一个工号，并发默认 3），消息带该收件人专属访问链接；
 * 2. 事件通知：分发/改派后通知被分发人；认领/拒绝后通知分发人或改派人。
 * 推送关闭（OCU_PUSH_ENABLED=false）时仅输出日志，不真实发送。
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
import { ApiRequirementEntity } from "../entity/api-requirement.entity";
import { ApiRequirementDispatcherEntity } from "../entity/api-requirement-dispatcher.entity";

/** 单次推送请求超时（毫秒） */
const PUSH_REQUEST_TIMEOUT_MS = 10000;

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
    const message = `【需求分发通知】需求 ${requirement.projectCode}「${requirement.projectName}」已分发给你，请及时登录平台认领：${this.portalLink(target)}`;
    this.enqueueSend(target, message);
  }

  /** 认领后：通知分发人/改派人 */
  notifyClaimed(requirement: ApiRequirementEntity): void {
    const target = requirement.dispatchedBy;
    if (!target) {
      return;
    }
    const claimer = requirement.claimedByName ?? requirement.claimedBy ?? "";
    const message = `【需求认领通知】需求 ${requirement.projectCode}「${requirement.projectName}」已由 ${claimer} 认领，可登录平台查看进展：${this.portalLink(target)}`;
    this.enqueueSend(target, message);
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
    const message = `【需求拒绝通知】需求 ${requirement.projectCode}「${requirement.projectName}」被 ${refuserName} 拒绝。${reasonText}请及时登录平台重新分发：${this.portalLink(dispatcher)}`;
    this.enqueueSend(dispatcher, message);
  }

  /**
   * 超期扫描：创建超阈值仍待分发且未提醒过的需求，逐人推送提醒（并发受限），
   * 推送后记录 overdueNotifiedAt 实现「只发一次」（分发/拒绝时重置标记）
   */
  async scanOverdue(): Promise<void> {
    if (this.scanning) {
      return;
    }
    this.scanning = true;
    try {
      const push = this.pushConfig();
      const threshold = new Date(Date.now() - push.overdueThresholdMs);
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
      await this.runConcurrent(
        dispatchers.map((row) => row.userName),
        push.concurrency,
        async (userName) => {
          const message = `【需求分发提醒】当前有 ${overdueRows.length} 条接口测试需求超 ${hours} 小时未分发，请及时登录平台处理：${this.portalLink(userName)}`;
          await this.sendToUser(userName, message);
        },
      );

      await this.requirementRepo.update(
        { id: In(overdueRows.map((row) => row.id)) },
        { overdueNotifiedAt: new Date() },
      );
      this.logger.log(
        `超期扫描推送完成：${overdueRows.length} 条需求 × ${dispatchers.length} 个分发人`,
      );
    } finally {
      this.scanning = false;
    }
  }

  /** process.nextTick 延迟发送：脱离请求主流程，不阻塞接口响应 */
  private enqueueSend(userName: string, message: string): void {
    process.nextTick(() => {
      this.sendToUser(userName, message).catch((error) => {
        this.logger.warn(
          `OCU 推送任务异常 to=${userName}: ${this.errorMessage(error)}`,
        );
      });
    });
  }

  /** 给单个用户发送敏行消息；推送关闭时仅输出日志 */
  private async sendToUser(
    userName: string,
    message: string,
  ): Promise<boolean> {
    const push = this.pushConfig();
    if (!push.enabled) {
      this.logger.log(`[OCU 推送关闭] to=${userName} message=${message}`);
      return true;
    }
    try {
      const response = await fetch(push.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ocuId: push.ocuId,
          ocuSecret: push.ocuSecret,
          serverURL: push.serverURL,
          bearerToken: push.bearerToken,
          userIds: [userName],
          message,
        }),
        signal: AbortSignal.timeout(PUSH_REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(
          `OCU 推送失败 to=${userName} status=${response.status}`,
        );
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(
        `OCU 推送异常 to=${userName}: ${this.errorMessage(error)}`,
      );
      return false;
    }
  }

  /** 需求平台前端访问链接（带收件人工号） */
  private portalLink(userName: string): string {
    const base = this.pushConfig().portalBaseUrl.replace(/\/+$/, "");
    return `${base}/api-test/requirement?userName=${encodeURIComponent(userName)}`;
  }

  /** 简单并发池：控制逐人推送的并发数 */
  private async runConcurrent(
    userNames: string[],
    concurrency: number,
    fn: (userName: string) => Promise<void>,
  ): Promise<void> {
    let cursor = 0;
    const workers = Array.from(
      { length: Math.max(1, Math.min(concurrency, userNames.length)) },
      async () => {
        while (cursor < userNames.length) {
          const current = userNames[cursor];
          cursor += 1;
          await fn(current);
        }
      },
    );
    await Promise.all(workers);
  }

  private pushConfig(): AppConfig["ocuPush"] {
    return this.config.get("ocuPush", { infer: true })!;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
