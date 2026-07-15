/**
 * @file AI 断言生成 DB 任务队列：入队、调度、重启恢复
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import { RequestContext } from "@common/audit/request-context";
import { AiWorkflowService } from "@common/ai-workflow/service/ai-workflow.service";
import {
  getCaseGenerateActiveCount,
  getCaseGenerateConcurrency,
  getCaseGenerateWaitingCount,
  registerCaseGenerateSlotReleaseHook,
  withCaseGenerateSlot,
} from "@case-editor/util/case-generate-concurrency";
import { generateAssertionsFromResponse } from "@api-test/util/api-case-ai.util";
import {
  ApiAssertionGenerateJobEntity,
  ApiAssertionGenerateJobStatus,
} from "@api-test/entity/api-assertion-generate-job.entity";
import type { ApiAssertion } from "@case-forge/shared";

export interface ApiAssertionGenerateQueueStatus {
  jobId: string;
  phase: ApiAssertionGenerateJobStatus | "none";
  queuePosition: number;
  estimatedWaitSeconds: number;
  elapsedSeconds: number;
  resultCount?: number;
  errorMessage?: string;
  globalQueuedCount: number;
  globalRunningCount: number;
  slotWaitingCount: number;
}

@Injectable()
export class ApiAssertionGenerateQueueService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ApiAssertionGenerateQueueService.name);
  private pumping = false;
  private unregisterSlotHook?: () => void;

  constructor(
    @InjectRepository(ApiAssertionGenerateJobEntity)
    private readonly jobRepo: Repository<ApiAssertionGenerateJobEntity>,
    private readonly aiWorkflow: AiWorkflowService,
  ) {}

  onModuleInit() {
    this.unregisterSlotHook = registerCaseGenerateSlotReleaseHook(() => {
      void this.pump();
    });
    void this.recoverInterruptedJobs().then(() => this.pump());
  }

  onModuleDestroy() {
    this.unregisterSlotHook?.();
  }

  async recoverInterruptedJobs() {
    const running = await this.jobRepo.find({
      where: { status: "running" },
    });
    if (!running.length) return;
    for (const job of running) {
      job.status = "queued";
      job.startedAt = null;
      job.finishedAt = null;
      job.errorMessage = "服务重启，任务已重新入队";
    }
    await this.jobRepo.save(running);
    this.logger.warn(
      `服务启动：已将 ${running.length} 条运行中的断言生成任务重新入队`,
    );
  }

  async enqueue(input: {
    projectId: string;
    transactionId: string;
    caseId?: string;
    transport: string;
    messageFormat: string;
    polarity: "positive" | "negative";
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
  }): Promise<ApiAssertionGenerateJobEntity> {
    const bodyStr =
      typeof input.body === "string"
        ? input.body
        : JSON.stringify(input.body ?? null);

    const existing = await this.jobRepo.findOne({
      where: {
        projectId: input.projectId,
        transactionId: input.transactionId,
        caseId: input.caseId ?? IsNull(),
        status: In(["queued", "running"]),
      },
      order: { queuedAt: "DESC" },
    });

    if (existing && existing.status === "running") {
      return existing;
    }

    if (existing) {
      existing.transport = input.transport;
      existing.messageFormat = input.messageFormat;
      existing.polarity = input.polarity;
      existing.statusCode = input.statusCode;
      existing.headers = input.headers;
      existing.body = bodyStr;
      existing.queuedAt = new Date();
      existing.errorMessage = null;
      existing.status = "queued";
      await this.jobRepo.save(existing);
      void this.pump();
      return existing;
    }

    const job = await this.jobRepo.save(
      this.jobRepo.create({
        projectId: input.projectId,
        transactionId: input.transactionId,
        caseId: input.caseId ?? null,
        transport: input.transport,
        messageFormat: input.messageFormat,
        polarity: input.polarity,
        statusCode: input.statusCode,
        headers: input.headers,
        body: bodyStr,
        status: "queued",
        queuedAt: new Date(),
        createdBy: RequestContext.getUserName(),
      }),
    );
    void this.pump();
    return job;
  }

  async getStatus(
    projectId: string,
    transactionId: string,
    caseId?: string,
    jobId?: string,
  ): Promise<ApiAssertionGenerateQueueStatus> {
    const activeJobs = await this.jobRepo.find({
      where: { status: In(["queued", "running"]) },
      order: { queuedAt: "ASC" },
    });
    const queuedJobs = activeJobs.filter((j) => j.status === "queued");
    const globalQueuedCount = queuedJobs.length;
    const globalRunningCount = activeJobs.filter(
      (j) => j.status === "running",
    ).length;

    const latest = await this.jobRepo.findOne({
      where: {
        ...(jobId ? { id: jobId } : {}),
        projectId,
        transactionId,
        ...(!jobId && (caseId ? { caseId } : { caseId: IsNull() })),
      },
      order: { queuedAt: "DESC" },
    });

    if (!latest) {
      return {
        jobId: "",
        phase: "none",
        queuePosition: 0,
        estimatedWaitSeconds: 0,
        elapsedSeconds: 0,
        globalQueuedCount,
        globalRunningCount,
        slotWaitingCount: getCaseGenerateWaitingCount(),
      };
    }

    const queuePosition =
      latest.status === "queued"
        ? queuedJobs.findIndex((j) => j.id === latest.id) + 1
        : 0;

    const elapsedSeconds =
      latest.status === "running" && latest.startedAt
        ? Math.max(
            0,
            Math.floor((Date.now() - latest.startedAt.getTime()) / 1000),
          )
        : 0;

    const estimatedWaitSeconds =
      latest.status === "queued" && queuePosition > 0 ? queuePosition * 15 : 0;

    const resultCount = Array.isArray(latest.resultAssertions)
      ? (latest.resultAssertions as unknown[]).length
      : undefined;

    return {
      jobId: latest.id,
      phase: latest.status,
      queuePosition,
      estimatedWaitSeconds,
      elapsedSeconds,
      resultCount,
      errorMessage: latest.errorMessage ?? undefined,
      globalQueuedCount,
      globalRunningCount,
      slotWaitingCount: getCaseGenerateWaitingCount(),
    };
  }

  async getResult(
    projectId: string,
    transactionId: string,
    caseId?: string,
    jobId?: string,
  ): Promise<{ assertions: ApiAssertion[] } | null> {
    const latest = await this.jobRepo.findOne({
      where: {
        ...(jobId ? { id: jobId } : {}),
        projectId,
        transactionId,
        status: "completed",
        ...(!jobId && (caseId ? { caseId } : { caseId: IsNull() })),
      },
      order: { queuedAt: "DESC" },
    });
    if (!latest || !latest.resultAssertions) return null;
    return {
      assertions: latest.resultAssertions as ApiAssertion[],
    };
  }

  async cancel(
    projectId: string,
    transactionId: string,
    caseId?: string,
    jobId?: string,
  ) {
    const jobs = await this.jobRepo.find({
      where: {
        ...(jobId ? { id: jobId } : {}),
        projectId,
        transactionId,
        ...(!jobId && (caseId ? { caseId } : { caseId: IsNull() })),
        status: In(["queued", "running"]),
      },
    });
    if (!jobs.length) return { ok: true };
    const now = new Date();
    for (const job of jobs) {
      job.status = "cancelled";
      job.finishedAt = now;
    }
    await this.jobRepo.save(jobs);
    return { ok: true };
  }

  async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      const limit = getCaseGenerateConcurrency();
      while (getCaseGenerateActiveCount() < limit) {
        const job = await this.claimNextJob();
        if (!job) break;
        void this.runJob(job.id);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async claimNextJob() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const job = await this.jobRepo.findOne({
        where: { status: "queued" },
        order: { queuedAt: "ASC" },
      });
      if (!job) return null;
      const result = await this.jobRepo.update(
        { id: job.id, status: "queued" },
        { status: "running", startedAt: new Date(), errorMessage: null },
      );
      if (result.affected === 1) return job;
    }
    return null;
  }

  private async runJob(jobId: string) {
    await withCaseGenerateSlot(async () => {
      const job = await this.jobRepo.findOne({ where: { id: jobId } });
      if (!job || job.status === "cancelled") return;

      try {
        let body: unknown = job.body;
        try {
          body = JSON.parse(job.body);
        } catch {
          // keep as string
        }

        const assertions = await generateAssertionsFromResponse(
          this.aiWorkflow,
          {
            transport: job.transport,
            messageFormat: job.messageFormat,
            polarity: job.polarity as "positive" | "negative",
            statusCode: job.statusCode,
            headers: job.headers,
            body,
          },
        );

        const latest = await this.jobRepo.findOne({ where: { id: jobId } });
        if (!latest) return;
        if (latest.status === "cancelled") return;

        latest.status = "completed";
        latest.finishedAt = new Date();
        latest.resultAssertions = assertions as unknown;
        latest.errorMessage = null;
        await this.jobRepo.save(latest);
      } catch (error) {
        const refreshed = await this.jobRepo.findOne({ where: { id: jobId } });
        if (!refreshed) return;
        if (refreshed.status === "cancelled") return;
        refreshed.status = "failed";
        refreshed.finishedAt = new Date();
        refreshed.errorMessage =
          (error as Error)?.message || "AI 断言生成失败，请稍后重试";
        await this.jobRepo.save(refreshed);
        this.logger.warn(
          `断言生成任务失败 ${jobId}: ${refreshed.errorMessage}`,
        );
      }
    });
    void this.pump();
  }
}
