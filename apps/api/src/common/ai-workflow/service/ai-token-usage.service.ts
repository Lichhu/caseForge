/**
 * @file AI Chat token 用量落库服务
 * 旁路统计：写入失败只记录告警，调用方以 fire-and-forget 方式触发，不阻塞 AI 主流程。
 */
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  AiChatUsageSource,
  AiTokenUsageEntity,
} from "../entity/ai-token-usage.entity";

/** 写入一条 AI Chat 用量记录所需字段 */
export interface RecordAiTokenUsageInput {
  scene: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  usageSource: AiChatUsageSource;
  inputChars: number;
  outputChars: number;
  durationMs: number;
  attempt: number;
  success: boolean;
  errorMessage?: string | null;
  bizType?: string | null;
  bizId?: string | null;
}

const ERROR_MESSAGE_MAX_LENGTH = 1000;

@Injectable()
export class AiTokenUsageService {
  private readonly logger = new Logger(AiTokenUsageService.name);

  constructor(
    @InjectRepository(AiTokenUsageEntity)
    private readonly usageRepo: Repository<AiTokenUsageEntity>,
  ) {}

  /** 记录一次 AI Chat 调用的 token 用量（内部捕获异常，不会 reject） */
  async record(input: RecordAiTokenUsageInput): Promise<void> {
    try {
      await this.usageRepo.insert({
        scene: input.scene || "unknown",
        model: input.model ?? "",
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        totalTokens: input.totalTokens,
        usageSource: input.usageSource,
        inputChars: input.inputChars,
        outputChars: input.outputChars,
        durationMs: input.durationMs,
        attempt: input.attempt,
        success: input.success,
        errorMessage: input.errorMessage?.slice(0, ERROR_MESSAGE_MAX_LENGTH),
        bizType: input.bizType?.slice(0, 50) || null,
        bizId: input.bizId?.slice(0, 64) || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `AI token 用量写入失败 scene=${input.scene} model=${input.model}: ${message}`,
      );
    }
  }
}
