/**
 * @file AI Workflow 调用服务：需求结构化、Markdown 与 JSON 生成
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  AI_WORKFLOW_CONFIG,
  AiWorkflowModuleConfig,
} from "../ai-workflow.config";
import { fetchWorkflowFileContents } from "../util/workflow-input.util";
import { DifyWorkflowService } from "./dify-workflow.service";

/** 工作流执行结果 */
export interface WorkflowRunResult {
  text: string;
  rawResponse: unknown;
}

/** 需求结构化工作流返回结果 */
export interface StructRequirementResult {
  markdown: string;
  rawResponse: unknown;
}

/**
 * AI Workflow 服务：统一通过外部工作流完成 AI 能力调用
 */
@Injectable()
export class AiWorkflowService {
  private readonly logger = new Logger(AiWorkflowService.name);

  constructor(
    @Inject(AI_WORKFLOW_CONFIG)
    private readonly config: AiWorkflowModuleConfig,
    private readonly difyWorkflow: DifyWorkflowService,
  ) {}

  private useDify() {
    return this.difyWorkflow.shouldUse();
  }

  /** 判断 AI Workflow 必要环境变量是否已配置完整 */
  isConfigured() {
    if (this.useDify()) {
      return this.difyWorkflow.isConfigured();
    }
    return Boolean(
      this.config.invokeUrl && this.config.stopUrl && this.config.workflowId,
    );
  }

  /** 是否可用于需求文档结构化（需技能文件 URL） */
  canStructRequirement() {
    return this.isConfigured() && Boolean(this.config.reqDocSkillUrl);
  }

  /** 是否可用于案例生成类任务（需案例技能文件 URL） */
  canGenerateCases() {
    return this.isConfigured() && Boolean(this.config.caseDocSkillUrl);
  }

  getReqDocSkillUrl() {
    return this.config.reqDocSkillUrl;
  }

  getCaseDocSkillUrl() {
    return this.config.caseDocSkillUrl;
  }

  getPromoteUrl() {
    return this.config.caseDocPromoteUrl;
  }

  /** 是否可用于 promote-skill + AI Chat 案例生成 */
  /** 是否已配置 promote-skill + AI Chat（案例 JSON 生成路径） */
  canGenerateJsonCases() {
    return Boolean(this.config.aiChat.url && this.config.caseDocPromoteUrl);
  }

  /**
   * 调用工作流对需求文档进行结构化，返回 Markdown 文本
   * @param requireFileUrl - 需求文档可访问 URL
   * @param skillFileUrl - 解析技能文件 URL，默认取配置项
   */
  async structRequirement(
    requireFileUrl: string,
    skillFileUrl = this.config.reqDocSkillUrl,
    requireFileName?: string,
  ): Promise<StructRequirementResult> {
    if (!this.canStructRequirement()) {
      throw new Error("AI Workflow 未配置，请检查环境变量");
    }

    const { text, rawResponse } = await this.runWithFiles(
      requireFileUrl,
      skillFileUrl,
      requireFileName,
    );
    if (!text.trim()) {
      throw new Error("AI Workflow 未返回结构化 Markdown 内容");
    }

    return {
      markdown: this.stripMarkdownFence(text),
      rawResponse,
    };
  }

  /**
   * 从文件 URL 读取内容后调用工作流
   */
  async runWithFiles(
    requireFileUrl: string,
    skillFileUrl: string,
    requireFileName?: string,
  ): Promise<WorkflowRunResult> {
    if (!requireFileUrl?.trim() || !skillFileUrl?.trim()) {
      throw new Error("工作流输入文件 URL 无效");
    }

    const [requireText, skillText] = await fetchWorkflowFileContents(
      requireFileUrl,
      skillFileUrl,
      requireFileName,
    );

    return this.runWithContent(requireText, skillText);
  }

  /**
   * 以「需求文本 + 技能文本」调用工作流，返回主文本结果
   */
  async runWithContent(
    requireText: string,
    skillText: string,
  ): Promise<WorkflowRunResult> {
    if (!this.isConfigured()) {
      throw new Error("AI Workflow 未配置，请检查环境变量");
    }
    if (!requireText?.trim() || !skillText?.trim()) {
      throw new Error("工作流输入内容无效");
    }

    if (this.useDify()) {
      return this.difyWorkflow.runWithContent(requireText, skillText);
    }

    let sessionId = "";
    try {
      const invokeBody = await this.startSession();
      sessionId = invokeBody.sessionId;
      const rawResponse = await this.submitInput(sessionId, invokeBody, {
        req_input: [requireText],
        skill_input: [skillText],
      });
      const text = this.extractText(rawResponse);
      this.logger.debug(`AI Workflow 结果：${text}`);
      return { text, rawResponse };
    } finally {
      await this.stopSession(sessionId);
    }
  }

  /**
   * 案例生成专用：OpenAI 兼容 Chat Completions 调用
   *
   * 配置：AI_CHAT_URL（可只配 base，会自动补 /chat/completions）、AI_CHAT_API_KEY、AI_CHAT_MODEL
   * 入参为已替换占位符后的 promote-skill 全文（单条 user message）
   */
  async runWithAiChat(
    input: string,
    model = this.config.aiChat.model,
  ): Promise<WorkflowRunResult> {
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

  /**
   * 解析 AI 返回文本中的 JSON 数组（兼容 ```json ... ``` 包裹）
   * 案例生成场景：数组元素为 JsonCaseItem
   */
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

  /** 从工作流输出文本中解析 JSON 对象 */
  parseJsonObject<T>(text: string): T | null {
    const normalized = this.stripMarkdownFence(text.trim());
    if (!normalized) {
      return null;
    }

    const candidates = [normalized];
    const fencedJson = normalized.match(/(?:json)?\s*([\s\S]*?)\s*/i);
    if (fencedJson?.[1]) {
      candidates.unshift(fencedJson[1].trim());
    }

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate) as T;
      } catch {
        const start = candidate.indexOf("{");
        const end = candidate.lastIndexOf("}");
        if (start >= 0 && end > start) {
          try {
            return JSON.parse(candidate.slice(start, end + 1)) as T;
          } catch {
            // try next candidate
          }
        }
      }
    }

    return null;
  }

  private async startSession() {
    const invokeResp = await fetch(this.config.invokeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflow_id: this.config.workflowId,
        stream: false,
      }),
    });

    if (!invokeResp.ok) {
      throw new Error(`AI Workflow 启动失败: HTTP ${invokeResp.status}`);
    }

    const invokeBody = (await invokeResp.json()) as {
      data?: {
        session_id?: string;
        events?: Array<Record<string, unknown>>;
      };
    };
    const sessionId = invokeBody.data?.session_id || "";
    const events = invokeBody.data?.events || [];
    const inputEvent = events.find((item) => item.event === "input");
    const messageId = inputEvent?.message_id as string | undefined;
    const nodeId = inputEvent?.node_id as string | undefined;

    if (!sessionId || !messageId || !nodeId) {
      throw new Error("AI Workflow 未返回有效的 session 或 input 节点");
    }

    return { sessionId, messageId, nodeId };
  }

  private async submitInput(
    sessionId: string,
    session: { messageId: string; nodeId: string },
    input: Record<string, string[]>,
  ) {
    const respResult = await fetch(this.config.invokeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflow_id: this.config.workflowId,
        session_id: sessionId,
        message_id: session.messageId,
        stream: false,
        input: {
          [session.nodeId]: input,
        },
      }),
    });

    if (!respResult.ok) {
      throw new Error(`AI Workflow 执行失败: HTTP ${respResult.status}`);
    }

    return respResult.json();
  }

  private async stopSession(sessionId: string) {
    if (!sessionId) {
      return;
    }
    try {
      await fetch(this.config.stopUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow_id: this.config.workflowId,
          session_id: sessionId,
        }),
      });
    } catch (error) {
      this.logger.warn(
        `关闭 AI Workflow session 失败: ${(error as Error).message}`,
      );
    }
  }

  private extractText(payload: unknown): string {
    const queue: unknown[] = [payload];
    const texts: string[] = [];

    while (queue.length) {
      const current = queue.shift();
      if (typeof current === "string") {
        if (current.trim()) {
          texts.push(current.trim());
        }
        continue;
      }
      if (!current || typeof current !== "object") {
        continue;
      }

      const record = current as Record<string, unknown>;
      for (const key of [
        "markdown",
        "structuredMarkdown",
        "output",
        "message",
        "text",
        "content",
        "answer",
        "result",
      ]) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) {
          texts.push(value.trim());
        }
      }

      for (const value of Object.values(record)) {
        if (Array.isArray(value)) {
          queue.push(...value);
        } else if (value && typeof value === "object") {
          queue.push(value);
        }
      }
    }

    return texts.sort((a, b) => b.length - a.length)[0] || "";
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
    return this.extractText(payload);
  }

  private stripMarkdownFence(text: string) {
    const fenced = text.match(/^```(?:markdown|md|json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : text.trim();
  }
}
