/**
 * @file 本地 Dify Workflow 调用（外网/本地环境）
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  AI_WORKFLOW_CONFIG,
  AiWorkflowModuleConfig,
} from "../ai-workflow.config";
import { truncateWorkflowInput } from "../util/workflow-input.util";
import type { WorkflowRunResult } from "./ai-workflow.service";

const MAX_INPUT_LENGTH = 20_000;

@Injectable()
export class DifyWorkflowService {
  private readonly logger = new Logger(DifyWorkflowService.name);

  constructor(
    @Inject(AI_WORKFLOW_CONFIG)
    private readonly config: AiWorkflowModuleConfig,
  ) {}

  /** 是否启用 Dify（外网模式且配置完整） */
  shouldUse() {
    return this.config.isExternalNetwork && this.isConfigured();
  }

  isConfigured() {
    return Boolean(this.config.dify.workflowUrl && this.config.dify.apiKey);
  }

  /** 以文本内容调用 Dify 工作流 */
  async runWithContent(
    requireText: string,
    skillText: string,
  ): Promise<WorkflowRunResult> {
    if (!this.isConfigured()) {
      throw new Error("Dify Workflow 未配置，请检查环境变量");
    }

    const { workflowUrl, apiKey, user } = this.config.dify;
    const resp = await fetch(workflowUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: {
          requirefile: this.prepareInput(requireText, "req_text"),
          requireparserskillfile: this.prepareInput(skillText, "req_skill"),
        },
        response_mode: "blocking",
        user,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new Error(
        `Dify Workflow 执行失败: HTTP ${resp.status}${detail ? ` - ${detail.slice(0, 200)}` : ""}`,
      );
    }

    const rawResponse = await resp.json();
    const text = this.extractText(rawResponse);
    this.logger.debug(`Dify Workflow 返回文本: ${text}`);
    if (!text.trim()) {
      throw new Error("Dify Workflow 未返回有效文本");
    }

    return { text, rawResponse };
  }

  private prepareInput(text: string, field: string) {
    return truncateWorkflowInput(text.trim(), MAX_INPUT_LENGTH, () => {
      this.logger.warn(
        `Dify 输入 ${field} 超过 ${MAX_INPUT_LENGTH} 字符，已截断`,
      );
    });
  }

  private extractText(payload: unknown): string {
    const record = payload as Record<string, unknown> | null;
    const outputs =
      (record?.data as Record<string, unknown> | undefined)?.outputs ??
      record?.outputs;
    if (outputs && typeof outputs === "object") {
      const outputRecord = outputs as Record<string, unknown>;
      for (const key of [
        "text",
        "textString",
        "result",
        "output",
        "answer",
        "content",
      ]) {
        const value = outputRecord[key];
        if (typeof value === "string" && value.trim()) {
          return value.trim();
        }
      }
    }

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

      const obj = current as Record<string, unknown>;
      for (const key of [
        "text",
        "textString",
        "output",
        "answer",
        "content",
        "result",
      ]) {
        const value = obj[key];
        if (typeof value === "string" && value.trim()) {
          texts.push(value.trim());
        }
      }

      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) {
          queue.push(...value);
        } else if (value && typeof value === "object") {
          queue.push(value);
        }
      }
    }

    return texts.sort((a, b) => b.length - a.length)[0] || "";
  }
}
