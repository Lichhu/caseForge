/**
 * @file AI 能力服务：AI Chat 结构化、需求总结与 JSON 解析
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  AI_WORKFLOW_CONFIG,
  AiWorkflowModuleConfig,
} from "@common/ai-workflow/ai-workflow.config";
import {
  buildCaseGenerateSummaryPrompt,
  fetchWorkflowFileContents,
  buildStructRequirementPrompt,
} from "@common/ai-workflow/util/workflow-input.util";
import { sanitizeStructuredMarkdown } from "@struct-doc/util/struct-doc.parser";

/**
 * 将 AI 生成 JSON 中常见的中文标点统一为英文标点（仅作用于字符串外部），避免 JSON.parse 失败。
 */
function normalizeJsonText(text: string): string {
  const replacements: Record<string, string> = {
    "，": ",",
    "：": ":",
    "\u201c": '"',
    "\u201d": '"',
    "\u2018": "'",
    "\u2019": "'",
    "（": "(",
    "）": ")",
    "【": "[",
    "】": "]",
    "；": ";",
    "？": "?",
    "！": "!",
    "。": ".",
  };

  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      result += char;
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    result += replacements[char] ?? char;
  }

  return result;
}

/** 全局替换中文标点，仅作解析兜底；会改动字符串内部内容。 */
function normalizeJsonTextAggressive(text: string): string {
  return text
    .replace(/[，]/g, ",")
    .replace(/[：]/g, ":")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[【]/g, "[")
    .replace(/[】]/g, "]")
    .replace(/[；]/g, ";")
    .replace(/[？]/g, "?")
    .replace(/[！]/g, "!")
    .replace(/[。]/g, ".");
}

/** 移除 JSON 末尾多余的逗号（如 `[1, 2,]` 或 `{"a": 1,}`），同时不破坏字符串内容 */
function removeTrailingCommas(text: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      result += char;
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
    } else if (char === ",") {
      // 跳过紧跟在 } 或 ] 前面的逗号
      const next = text.slice(i + 1).trimStart();
      if (next.startsWith("}") || next.startsWith("]")) {
        continue;
      }
      result += char;
    } else {
      result += char;
    }
  }
  return result;
}

/** AI Chat 调用结果 */
export interface AiChatResult {
  text: string;
  rawResponse: unknown;
}

/** 需求结构化返回结果 */
export interface StructRequirementResult {
  markdown: string;
  rawResponse: unknown;
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
    return Boolean(
      this.config.aiChat.url?.trim() && this.config.atCaseSkillUrl?.trim(),
    );
  }

  /** AI Chat 与 Skill 是否至少配置了一类能力 */
  isAiConfigured() {
    return (
      this.canStructRequirement() ||
      this.canGenerateJsonCases() ||
      this.canGenerateApiCases()
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
   * 对已提取的需求正文做结构化
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
    };
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

    const startedAt = Date.now();
    const inputChars = input.length;
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
        const timeoutMs = this.config.aiChat.requestTimeoutMs || 600000;
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(timeoutMs),
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
        this.logger.log(
          `AI Chat 完成 durationMs=${Date.now() - startedAt} inputChars=${inputChars} outputChars=${text.length} attempt=${attempt + 1}`,
        );
        return { text, rawResponse: result };
      } catch (error) {
        lastError = error as Error;
        const isTimeout =
          lastError.name === "TimeoutError" || lastError.name === "AbortError";
        this.logger.warn(
          `AI Chat 第 ${attempt + 1} 次调用${isTimeout ? "超时" : "失败"} durationMs=${Date.now() - startedAt} inputChars=${inputChars}: ${lastError.message}`,
        );
      }
    }

    throw lastError ?? new Error("AI Chat 调用失败");
  }

  /**
   * 调用 AI Chat 并解析 JSON 数组；解析失败时追加提示重试一次。
   */
  async runWithAiChatJsonArray<T>(
    input: string,
    model = this.config.aiChat.model,
    options?: { context?: string },
  ): Promise<T[]> {
    const contextLabel = options?.context?.trim() || "AI JSON 解析";
    const { text } = await this.runWithAiChat(input, model);
    let parsed = this.parseJsonArray<T>(text);
    if (parsed?.length) {
      this.logger.log(
        `${contextLabel} JSON 解析成功 items=${parsed.length} outputChars=${text.length}`,
      );
      return parsed;
    }

    this.logger.warn(
      `${contextLabel} JSON 首次解析失败 outputChars=${text.length}，将追加提示重试`,
    );
    const retryPrompt = [
      input.trim(),
      "",
      "---",
      "",
      "你上一次的输出无法被解析为 JSON 数组。",
      "请仅输出 JSON 数组正文，不要使用 markdown 代码块，不要输出解释文字或 thinking 标签。",
    ].join("\n");
    const retry = await this.runWithAiChat(retryPrompt, model);
    parsed = this.parseJsonArray<T>(retry.text);
    if (parsed?.length) {
      this.logger.log(
        `${contextLabel} JSON 重试解析成功 items=${parsed.length} outputChars=${retry.text.length}`,
      );
      return parsed;
    }

    this.logger.warn(
      `${contextLabel} JSON 重试后仍无法解析 outputChars=${retry.text.length}`,
    );
    throw new Error(`${contextLabel} 返回内容无法解析为 JSON 数组`);
  }

  /** 解析 AI 返回文本中的 JSON 数组（兼容 ```json ... ``` 包裹、中文标点、转义等） */
  parseJsonArray<T>(text: string): T[] | null {
    const normalized = this.stripMarkdownFence(text.trim());
    if (!normalized) {
      return null;
    }

    const candidates = [normalized];
    const tripleFenced = normalized.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (tripleFenced?.[1]) {
      candidates.unshift(tripleFenced[1].trim());
    }
    const singleFenced = normalized.match(/`(?:json)?\s*([\s\S]*?)\s*`/i);
    if (singleFenced?.[1]) {
      candidates.unshift(singleFenced[1].trim());
    }

    for (const candidate of candidates) {
      const result = this.tryParseJsonArray<T>(candidate);
      if (result) {
        return result;
      }
    }

    this.logger.warn(
      `AI 返回内容无法解析为 JSON 数组，原始内容前 500 字符：${normalized.slice(0, 500)}`,
    );
    return null;
  }

  private tryParseJsonArray<T>(candidate: string): T[] | null {
    // 1. Direct parse
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (Array.isArray(parsed)) {
        return parsed as T[];
      }
    } catch {
      // continue to fallbacks
    }

    // 2. AI 有时把 JSON 数组当作 JSON 字符串返回（如 "[{...}]"），先解包
    try {
      const unwrapped = JSON.parse(candidate) as string;
      if (typeof unwrapped === "string") {
        const parsed = JSON.parse(normalizeJsonText(unwrapped)) as unknown;
        if (Array.isArray(parsed)) {
          return parsed as T[];
        }
      }
    } catch {
      // not a string literal
    }

    // 3. Extract JSON array between balanced brackets
    const slice = this.extractBalancedJsonArray(candidate);
    if (slice) {
      const variants = [
        slice,
        normalizeJsonText(slice),
        removeTrailingCommas(slice),
        removeTrailingCommas(normalizeJsonText(slice)),
        normalizeJsonTextAggressive(slice),
        removeTrailingCommas(normalizeJsonTextAggressive(slice)),
      ];
      for (const variant of variants) {
        try {
          const parsed = JSON.parse(variant) as unknown;
          if (Array.isArray(parsed)) {
            return parsed as T[];
          }
        } catch {
          // try next variant
        }
      }

      // 3.1 处理 slice 本身是被转义的 JSON 字符串
      try {
        const unescaped = JSON.parse(`"${slice}"`) as string;
        const parsed = JSON.parse(unescaped) as unknown;
        if (Array.isArray(parsed)) {
          return parsed as T[];
        }
      } catch {
        // not doubly-escaped, give up on this candidate
      }
    }

    // 4. AI 有时返回 { "data": [...] } 或 { "list": [...] }，提取其中的数组
    const objectSlice = this.extractBalancedJsonObject(candidate);
    if (objectSlice) {
      const variants = [
        objectSlice,
        normalizeJsonText(objectSlice),
        removeTrailingCommas(objectSlice),
        removeTrailingCommas(normalizeJsonText(objectSlice)),
        normalizeJsonTextAggressive(objectSlice),
        removeTrailingCommas(normalizeJsonTextAggressive(objectSlice)),
      ];
      for (const variant of variants) {
        try {
          const parsed = JSON.parse(variant) as Record<string, unknown>;
          for (const value of Object.values(parsed)) {
            if (Array.isArray(value)) {
              return value as T[];
            }
          }
        } catch {
          // try next variant
        }
      }
    }

    return null;
  }

  private extractBalancedJsonObject(text: string): string | null {
    const start = text.indexOf("{");
    if (start < 0) {
      return null;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const char = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }

    return null;
  }

  private extractBalancedJsonArray(text: string): string | null {
    const start = text.indexOf("[");
    if (start < 0) {
      return null;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const char = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === "[") {
        depth++;
      } else if (char === "]") {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
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
    const bomStripped = text.replace(/^\uFEFF/, "");
    const tripleFenced = bomStripped.match(
      /^```(?:markdown|md|json)?\s*([\s\S]*?)\s*```$/i,
    );
    if (tripleFenced) {
      return tripleFenced[1].trim();
    }
    const singleFenced = bomStripped.match(/^`(?:json)?\s*([\s\S]*?)\s*`$/i);
    if (singleFenced) {
      return singleFenced[1].trim();
    }
    return bomStripped.trim();
  }
}
