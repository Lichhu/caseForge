/**
 * @file 敏行消息（OCU）推送传输层：只负责调用行内推送接口，不落库、不重试
 * 推送关闭（OCU_PUSH_ENABLED=false）时仅输出日志并视为发送成功。
 */
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "@config/app-config.types";

/** 单次推送请求超时（毫秒） */
const PUSH_REQUEST_TIMEOUT_MS = 10000;

@Injectable()
export class OcuPushService {
  private readonly logger = new Logger(OcuPushService.name);

  constructor(private readonly config: ConfigService<AppConfig>) {}

  /**
   * 给单个用户发送敏行消息（userIds 只放一个工号）
   * @throws 推送接口返回非 2xx 或请求异常时抛出错误，由调用方决定重试策略
   */
  async sendToUser(userName: string, message: string): Promise<void> {
    const push = this.pushConfig();
    if (!push.enabled) {
      this.logger.log(`[OCU 推送关闭] to=${userName} message=${message}`);
      return;
    }

    let response: Response;
    try {
      response = await fetch(push.url, {
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
    } catch (error) {
      throw new Error(`OCU 推送请求异常: ${this.errorMessage(error)}`);
    }

    if (!response.ok) {
      throw new Error(
        `OCU 推送接口返回 ${response.status} ${response.statusText}`.trim(),
      );
    }
  }

  private pushConfig(): AppConfig["ocuPush"] {
    return this.config.get("ocuPush", { infer: true })!;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
