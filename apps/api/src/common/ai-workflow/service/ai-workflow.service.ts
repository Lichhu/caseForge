/**
 * @file AI 能力服务：AI Chat 结构化、需求总结与 JSON 解析
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  AI_WORKFLOW_CONFIG,
  AiWorkflowModuleConfig,
} from "../ai-workflow.config";
import {
  buildCaseGenerateSummaryPrompt,
  fetchWorkflowFileContents,
  buildStructRequirementPrompt,
  buildStructRequirementChunkPrompt,
} from "../util/workflow-input.util";
import { sanitizeStructuredMarkdown } from "@struct-doc/util/struct-doc.parser";
import {
  estimateRequirementChunkCount,
  extractRequirementStructMeta,
  mergeStructuredMarkdownParts,
  splitRequirementForStructuring,
} from "@struct-doc/util/struct-doc-chunk.util";

/** AI Chat 调用结果 */
export interface AiChatResult {
  text: string;
  rawResponse: unknown;
}

/** 需求结构化返回结果 */
export interface StructRequirementResult {
  markdown: string;
  rawResponse: unknown;
  /** 实际使用的分段数（1 表示单次调用） */
  chunkCount: number;
}

/** AI Chat + Skill 文件能力封装 */
@Injectable()
export class AiWorkflowService {
  private readonly logger = new Logger(AiWorkflowService.name);

  constructor(
    @Inject(AI_WORKFLOW_CONFIG)
    private readonly config: AiWorkflowModuleConfig,
  ) {}

  /** 是否可用于需求文档结构化（需 require-skill 与 AI Chat） */
  canStructRequirement() {
    return Boolean(
      this.config.reqDocSkillUrl?.trim() && this.config.aiChat.url?.trim(),
    );
  }

  getReqDocSkillUrl() {
    return this.config.reqDocSkillUrl;
  }

  getPromoteUrl() {
    return this.config.caseDocPromoteUrl;
  }

  getAtCaseSkillUrl() {
    return this.config.atCaseSkillUrl;
  }

  /** 是否已配置 promote-skill + AI Chat（案例 JSON 生成路径） */
  canGenerateJsonCases() {
    return Boolean(this.config.aiChat.url && this.config.caseDocPromoteUrl);
  }

  /** 是否已配置 at-case-skill + AI Chat（接口测试案例生成） */
  canGenerateApiCases() {
    return Boolean(this.config.aiChat.url?.trim() && this.config.atCaseSkillUrl?.trim());
  }

  /** AI Chat 与 Skill 是否至少配置了一类能力 */
  isAiConfigured() {
    return (
      this.canStructRequirement()
      || this.canGenerateJsonCases()
      || this.canGenerateApiCases()
    );
  }

  /**
   * 调用 AI Chat 对需求文档进行结构化，返回 Markdown 文本
   */
  async structRequirement(
    requireFileUrl: string,
    skillFileUrl = this.config.reqDocSkillUrl,
    requireFileName?: string,
  ): Promise<StructRequirementResult> {
    if (!this.canStructRequirement()) {
      throw new Error(
        "AI Chat 或 require-skill 未配置，请检查 AI_CHAT_URL 与 REQ_DOC_SKILL_URL",
      );
    }
    if (!requireFileUrl?.trim() || !skillFileUrl?.trim()) {
      throw new Error("结构化输入文件 URL 无效");
    }

    const [requireText, skillText] = await fetchWorkflowFileContents(
      requireFileUrl,
      skillFileUrl,
      requireFileName,
    );
    return this.structRequirementFromText(
      requireText,
      skillText,
      requireFileName,
    );
  }

  /**
   * 对已提取的需求正文做结构化（支持长文档分段）
   */
  async structRequirementFromText(
    requireText: string,
    skillText: string,
    requireFileName?: string,
  ): Promise<StructRequirementResult> {
    if (!requireText?.trim()) {
      throw new Error("需求文档内容为空");
    }
    if (!skillText?.trim()) {
      throw new Error("技能文档内容为空");
    }

    const chunks = splitRequirementForStructuring(requireText);
    const meta = extractRequirementStructMeta(requireText);

    if (!chunks?.length) {
      const prompt = buildStructRequirementPrompt(
        skillText,
        requireText,
        requireFileName,
      );
      const { text, rawResponse } = await this.runWithAiChat(prompt);
      if (!text.trim()) {
        throw new Error("AI Chat 未返回结构化 Markdown 内容");
      }
      return {
        markdown: sanitizeStructuredMarkdown(text),
        rawResponse,
        chunkCount: 1,
      };
    }

    this.logger.log(
      `需求文档启用分段结构化：${requireText.length} 字符 → ${chunks.length} 段（按系统章节切分或体积分段）`,
    );

    const parts: string[] = [];
    const partResponses: unknown[] = [];

    for (const chunk of chunks) {
      const prompt = buildStructRequirementChunkPrompt(
        skillText,
        chunk,
        meta,
        requireFileName,
      );
      const { text, rawResponse } = await this.runWithAiChat(prompt);
      if (!text.trim()) {
        throw new Error(
          `AI Chat 未返回第 ${chunk.index + 1}/${chunk.total} 段结构化内容`,
        );
      }
      parts.push(sanitizeStructuredMarkdown(text));
      partResponses.push(rawResponse);
      this.logger.log(
        `分段结构化完成 ${chunk.index + 1}/${chunk.total}，输出 ${text.length} 字符`,
      );
    }

    const markdown = sanitizeStructuredMarkdown(
      mergeStructuredMarkdownParts(parts, meta),
    );
    if (!markdown.trim()) {
      throw new Error("分段结构化合并结果为空");
    }

    return {
      markdown,
      rawResponse: {
        chunked: true,
        chunkCount: chunks.length,
        parts: partResponses,
      },
      chunkCount: chunks.length,
    };
  }

  /** 预估结构化分段数（用于超时计算） */
  estimateStructRequirementChunks(requireText: string) {
    return estimateRequirementChunkCount(requireText);
  }

  /** 将结构化 Markdown 压缩为案例生成共用的需求总结 */
  async summarizeForCaseGenerate(
    structuredMarkdown: string,
  ): Promise<AiChatResult> {
    if (!this.config.aiChat.url?.trim()) {
      throw new Error("AI Chat 未配置，请检查 AI_CHAT_URL");
    }
    if (!structuredMarkdown?.trim()) {
      throw new Error("结构化文档为空");
    }

    const prompt = buildCaseGenerateSummaryPrompt(structuredMarkdown);
    const { text, rawResponse } = await this.runWithAiChat(prompt);
    if (!text.trim()) {
      throw new Error("AI Chat 未返回需求总结");
    }

    return {
      text: sanitizeStructuredMarkdown(text),
      rawResponse,
    };
  }

  /**
   * OpenAI 兼容 Chat Completions 调用
   *
   * 配置：AI_CHAT_URL、AI_CHAT_API_KEY、AI_CHAT_MODEL
   */
  async runWithAiChat(
    input: string,
    model = this.config.aiChat.model,
  ): Promise<AiChatResult> {
    const url = this.resolveAiChatUrl();
    if (!url) {
      throw new Error("AI Chat URL 未配置");
    }

    const requestBody = {
      model: model?.trim() || this.config.aiChat.model,
      temperature: 0.3,
      n: 1,
      stream: false,
      presence_penalty: 0,
      frequency_penalty: 0,
      messages: [
        {
          role: "user",
          content: input,
        },
      ],
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.aiChat.apiKey) {
      headers.Authorization = `Bearer ${this.config.aiChat.apiKey}`;
    }

    const maxAttempts = Math.max(1, this.config.aiChat.retryTime + 1);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`AI Chat 请求失败: HTTP ${response.status} ${body}`);
        }

        const result = await response.json();
        const text = this.extractAiChatContent(result);
        this.logger.verbose(`AI Chat 结果：${JSON.stringify(text)}`);
        if (!text.trim()) {
          throw new Error("AI Chat 返回内容为空");
        }
        this.logger.debug(`AI Chat 结果长度：${text.length}`);
        return { text, rawResponse: result };
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `AI Chat 第 ${attempt + 1} 次调用失败: ${lastError.message}`,
        );
      }
    }

    throw lastError ?? new Error("AI Chat 调用失败");
  }

  /** 解析 AI 返回文本中的 JSON 数组（兼容 ```json ... ``` 包裹） */
  parseJsonArray<T>(text: string): T[] | null {
    const normalized = this.stripMarkdownFence(text.trim());
    if (!normalized) {
      return null;
    }

    const candidates = [normalized];
    const fencedJson = normalized.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedJson?.[1]) {
      candidates.unshift(fencedJson[1].trim());
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as unknown;
        if (Array.isArray(parsed)) {
          return parsed as T[];
        }
      } catch {
        const start = candidate.indexOf("[");
        const end = candidate.lastIndexOf("]");
        if (start >= 0 && end > start) {
          try {
            const parsed = JSON.parse(
              candidate.slice(start, end + 1),
            ) as unknown;
            if (Array.isArray(parsed)) {
              return parsed as T[];
            }
          } catch {
            // try next candidate
          }
        }
      }
    }

    return null;
  }

  private resolveAiChatUrl() {
    const base = this.config.aiChat.url?.trim();
    if (!base) {
      return "";
    }
    if (base.endsWith("/chat/completions")) {
      return base;
    }
    return `${base.replace(/\/$/, "")}/chat/completions`;
  }

  private extractAiChatContent(payload: unknown): string {
    const record = payload as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = record?.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      return content;
    }
    return "";
  }

  private stripMarkdownFence(text: string) {
    const fenced = text.match(/^```(?:markdown|md|json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : text.trim();
  }
}
