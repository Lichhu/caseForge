/**
 * @file AI Chat token 用量解析工具
 * 优先读取 OpenAI 兼容接口返回的 usage；接口未返回时按中英文字符数粗略估算，
 * 并通过 usageSource 标记数据来源，避免把估算值误当精确账单。
 */
import type { AiChatUsageSource } from "../entity/ai-token-usage.entity";

/** 单次 AI Chat 调用的 token 用量 */
export interface AiChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  source: AiChatUsageSource;
}

type TokenLike = number | string | null | undefined;

/** 读取 usage 中的 token 字段（兼容 prompt_tokens / input_tokens 等命名） */
function readToken(value: TokenLike): number {
  const num = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(num) && (num as number) > 0
    ? Math.round(num as number)
    : 0;
}

/**
 * 从 AI Chat 响应中解析 token 用量
 * @param rawResponse - 原始响应体
 * @param input - 请求提示词
 * @param output - 返回文本
 */
export function extractAiChatUsage(
  rawResponse: unknown,
  input: string,
  output: string,
): AiChatUsage {
  const usage = (rawResponse as { usage?: Record<string, unknown> } | null)
    ?.usage;
  const promptTokens = readToken(
    (usage?.prompt_tokens ?? usage?.input_tokens) as TokenLike,
  );
  const completionTokens = readToken(
    (usage?.completion_tokens ?? usage?.output_tokens) as TokenLike,
  );
  const totalTokens = readToken(usage?.total_tokens as TokenLike);

  if (promptTokens || completionTokens || totalTokens) {
    return {
      promptTokens,
      completionTokens,
      totalTokens: totalTokens || promptTokens + completionTokens,
      source: "provider",
    };
  }

  const estimatedPrompt = estimateTokenCount(input);
  const estimatedCompletion = estimateTokenCount(output);
  return {
    promptTokens: estimatedPrompt,
    completionTokens: estimatedCompletion,
    totalTokens: estimatedPrompt + estimatedCompletion,
    source: "estimated",
  };
}

/**
 * 粗略估算 token 数：CJK 字符按 1 token，其余字符按 4 字符 1 token。
 * 仅用于供应商未返回 usage 时的兜底，误差较大。
 */
export function estimateTokenCount(text: string): number {
  if (!text) {
    return 0;
  }
  const cjkCount = (
    text.match(
      /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g,
    ) ?? []
  ).length;
  const otherCount = text.length - cjkCount;
  return Math.max(1, Math.ceil(cjkCount + otherCount / 4));
}
