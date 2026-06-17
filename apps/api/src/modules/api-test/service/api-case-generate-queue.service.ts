/**
 * @file 接口案例生成 DB 任务队列：入队、调度、ETA 统计
 */
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { RequestContext } from "../../../common/audit/request-context";
import { buildCaseGenerateInterruptedMessage } from "@case-editor/util/case-generate-interrupted.util";
import {
  getCaseGenerateActiveCount,
  getCaseGenerateConcurrency,
  getCaseGenerateWaitingCount,
  registerCaseGenerateSlotReleaseHook,
  withCaseGenerateSlot,
} from "@case-editor/util/case-generate-concurrency";
import {
  estimateRemainingSeconds,
  resolveAverageRunSeconds,
} from "@case-editor/util/case-generate-queue-metrics.util";
import {
  buildRunningCountByUser,
  countActiveUsers,
  countUserQueuedAhead,
  estimateFairWaitSeconds,
  getCaseGeneratePerUserMaxRunning,
  pickFairQueuedJob,
} from "@case-editor/util/case-generate-fair-schedule.util";
import {
  ApiCaseGenerateJobEntity,
  ApiCaseGenerateJobStatus,
} from "../entity/api-case-generate-job.entity";
import { ApiCaseService } from "./api-case.service";

export interface ApiCaseGenerateQueueStatus {
  jobId?: string;
  transactionId: string;
  phase: ApiCaseGenerateJobStatus | "none";
  queuePosition: number;
  estimatedWaitSeconds: number;
  estimatedRemainingSeconds: number;
  elapsedSeconds: number;
  resultCount?: number;
  errorMessage?: string;
  averageRunSeconds: number;
  concurrency: number;
  perUserMaxRunning: number;
  globalQueuedCount: number;
  globalRunningCount: number;
  slotWaitingCount: number;
}

@Injectable()
export class ApiCaseGenerateQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApiCaseGenerateQueueService.name);
  private pumping = false;
  private unregisterSlotHook?: () => void;

  constructor(
    @InjectRepository(ApiCaseGenerateJobEntity)
    private readonly jobRepo: Repository<ApiCaseGenerateJobEntity>,
    @Inject(forwardRef(() => ApiCaseService))
    private readonly apiCaseService: ApiCaseService,
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
    if (!running.length) {
      return;
    }
    const message = buildCaseGenerateInterruptedMessage();
    for (const job of running) {
      job.status = "queued";
      job.startedAt = null;
      job.finishedAt = null;
      job.errorMessage = message;
    }
    await this.jobRepo.save(running);
    this.logger.warn(
      `服务启动：已将 ${running.length} 条运行中的接口案例生成任务重新入队`,
    );
  }

  async enqueue(
    projectId: string,
    transactionId: string,
    options?: { endpointIds?: string[]; promptIds?: string[] },
  ): Promise<ApiCaseGenerateJobEntity> {
    const existing = await this.jobRepo.findOne({
      where: {
        projectId,
        transactionId,
        status: In(["queued", "running"]),
      },
      order: { queuedAt: "DESC" },
    });
    if (existing) {
      return existing;
    }

    const job = await this.jobRepo.save(
      this.jobRepo.create({
        projectId,
        transactionId,
        endpointIds: options?.endpointIds?.length
          ? [...new Set(options.endpointIds)]
          : null,
        promptIds: options?.promptIds?.length
          ? [...new Set(options.promptIds)]
          : null,
        status: "queued",
        queuedAt: new Date(),
        createdBy: RequestContext.getUserName(),
      }),
    );
    void this.pump();
    return job;
  }

  async cancel(projectId: string, transactionId: string) {
    const jobs = await this.jobRepo.find({
      where: {
        projectId,
        transactionId,
        status: In(["queued", "running"]),
      },
    });
    if (!jobs.length) {
      return { ok: true };
    }
    const now = new Date();
    for (const job of jobs) {
      job.status = "cancelled";
      job.finishedAt = now;
    }
    await this.jobRepo.save(jobs);
    return { ok: true };
  }

  async getStatus(
    projectId: string,
    transactionId: string,
  ): Promise<ApiCaseGenerateQueueStatus> {
    const concurrency = getCaseGenerateConcurrency();
    const perUserMaxRunning = getCaseGeneratePerUserMaxRunning();
    const averageRunSeconds = await this.loadAverageRunSeconds();
    const activeJobs = await this.jobRepo.find({
      where: { status: In(["queued", "running"]) },
      order: { queuedAt: "ASC" },
    });
    const queuedJobs = activeJobs.filter((job) => job.status === "queued");
    const globalQueuedCount = queuedJobs.length;
    const globalRunningCount = activeJobs.filter(
      (job) => job.status === "running",
    ).length;
    const activeUsers = countActiveUsers(activeJobs);
    const fairQueueIndexByJobId = this.buildFairQueueIndex(activeJobs);

    const latest = await this.jobRepo.findOne({
      where: { projectId, transactionId },
      order: { queuedAt: "DESC" },
    });

    if (!latest) {
      return {
        transactionId,
        phase: "none",
        queuePosition: 0,
        estimatedWaitSeconds: 0,
        estimatedRemainingSeconds: 0,
        elapsedSeconds: 0,
        averageRunSeconds,
        concurrency,
        perUserMaxRunning,
        globalQueuedCount,
        globalRunningCount,
        slotWaitingCount: getCaseGenerateWaitingCount(),
      };
    }

    if (
      latest.status !== "queued" &&
      latest.status !== "running" &&
      latest.status !== "failed"
    ) {
      return {
        jobId: latest.id,
        transactionId,
        phase: latest.status,
        queuePosition: 0,
        estimatedWaitSeconds: 0,
        estimatedRemainingSeconds: 0,
        elapsedSeconds: 0,
        resultCount: latest.resultCount ?? undefined,
        errorMessage: latest.errorMessage ?? undefined,
        averageRunSeconds,
        concurrency,
        perUserMaxRunning,
        globalQueuedCount,
        globalRunningCount,
        slotWaitingCount: getCaseGenerateWaitingCount(),
      };
    }

    const queueIndex =
      latest.status === "queued" || latest.status === "running"
        ? (fairQueueIndexByJobId.get(latest.id) ?? activeJobs.length)
        : -1;

    return this.buildStatus(latest, {
      averageRunSeconds,
      concurrency,
      perUserMaxRunning,
      globalQueuedCount,
      globalRunningCount,
      activeUsers,
      queuedJobs,
      queueIndex,
    });
  }

  async pump() {
    if (this.pumping) {
      return;
    }
    this.pumping = true;
    try {
      const limit = getCaseGenerateConcurrency();
      while (getCaseGenerateActiveCount() < limit) {
        const job = await this.claimNextJob();
        if (!job) {
          break;
        }
        void this.runJob(job);
      }
    } finally {
      this.pumping = false;
    }
  }

  private buildFairQueueIndex(activeJobs: ApiCaseGenerateJobEntity[]) {
    const queuedJobs = activeJobs.filter((job) => job.status === "queued");
    const runningJobs = activeJobs.filter((job) => job.status === "running");
    const runningByUser = buildRunningCountByUser(runningJobs);
    const perUserMax = getCaseGeneratePerUserMaxRunning();
    const remainingQueued = [...queuedJobs];
    const order: ApiCaseGenerateJobEntity[] = [];

    while (remainingQueued.length) {
      const picked = pickFairQueuedJob(remainingQueued, runningByUser, perUserMax);
      if (!picked) {
        order.push(...remainingQueued);
        break;
      }
      order.push(picked);
      const index = remainingQueued.findIndex((job) => job.id === picked.id);
      if (index >= 0) {
        remainingQueued.splice(index, 1);
      }
    }

    return new Map(order.map((job, index) => [job.id, index]));
  }

  private buildStatus(
    job: ApiCaseGenerateJobEntity,
    context: {
      averageRunSeconds: number;
      concurrency: number;
      perUserMaxRunning: number;
      globalQueuedCount: number;
      globalRunningCount: number;
      activeUsers: number;
      queuedJobs: ApiCaseGenerateJobEntity[];
      queueIndex: number;
    },
  ): ApiCaseGenerateQueueStatus {
    const now = Date.now();
    const queuePosition =
      context.queueIndex >= 0 ? context.queueIndex + 1 : 0;
    const userQueuedAhead =
      job.status === "queued"
        ? countUserQueuedAhead(job, context.queuedJobs)
        : 0;

    let estimatedWaitSeconds = 0;
    let estimatedRemainingSeconds = 0;
    let elapsedSeconds = 0;

    if (job.status === "queued" && context.queueIndex >= 0) {
      estimatedWaitSeconds = estimateFairWaitSeconds({
        userQueuedAhead,
        concurrency: context.concurrency,
        perUserMax: context.perUserMaxRunning,
        activeUsers: context.activeUsers,
        averageRunSeconds: context.averageRunSeconds,
      });
    }
    if (job.status === "running" && job.startedAt) {
      elapsedSeconds = Math.max(
        0,
        Math.floor((now - job.startedAt.getTime()) / 1000),
      );
      estimatedRemainingSeconds = estimateRemainingSeconds(
        job.startedAt,
        context.averageRunSeconds,
        now,
      );
    }

    return {
      jobId: job.id,
      transactionId: job.transactionId,
      phase: job.status,
      queuePosition,
      estimatedWaitSeconds,
      estimatedRemainingSeconds,
      elapsedSeconds,
      resultCount: job.resultCount ?? undefined,
      errorMessage: job.errorMessage ?? undefined,
      averageRunSeconds: context.averageRunSeconds,
      concurrency: context.concurrency,
      perUserMaxRunning: context.perUserMaxRunning,
      globalQueuedCount: context.globalQueuedCount,
      globalRunningCount: context.globalRunningCount,
      slotWaitingCount: getCaseGenerateWaitingCount(),
    };
  }

  private async loadAverageRunSeconds() {
    const recent = await this.jobRepo.find({
      where: { status: "completed" },
      order: { finishedAt: "DESC" },
      take: 30,
    });
    return resolveAverageRunSeconds(recent);
  }

  private async claimNextJob(): Promise<ApiCaseGenerateJobEntity | null> {
    const perUserMax = getCaseGeneratePerUserMaxRunning();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const [queuedJobs, runningJobs] = await Promise.all([
        this.jobRepo.find({
          where: { status: "queued" },
          order: { queuedAt: "ASC" },
        }),
        this.jobRepo.find({ where: { status: "running" } }),
      ]);
      if (!queuedJobs.length) {
        return null;
      }

      const runningByUser = buildRunningCountByUser(runningJobs);
      const candidate = pickFairQueuedJob(
        queuedJobs,
        runningByUser,
        perUserMax,
      );
      if (!candidate) {
        return null;
      }

      const result = await this.jobRepo.update(
        { id: candidate.id, status: "queued" },
        {
          status: "running",
          startedAt: new Date(),
          errorMessage: null,
        },
      );
      if (result.affected !== 1) {
        continue;
      }

      return this.jobRepo.findOne({ where: { id: candidate.id } });
    }

    return null;
  }

  private async runJob(job: ApiCaseGenerateJobEntity) {
    await withCaseGenerateSlot(async () => {
      try {
        const result = await RequestContext.run(
          job.createdBy || "system",
          async () =>
            this.apiCaseService.runQueuedGenerateJob({
              projectId: job.projectId,
              transactionId: job.transactionId,
              endpointIds: job.endpointIds ?? undefined,
              promptIds: job.promptIds ?? undefined,
            }),
        );

        const latest = await this.jobRepo.findOne({ where: { id: job.id } });
        if (!latest) {
          return;
        }
        if (latest.status === "cancelled") {
          return;
        }
        latest.status = "completed";
        latest.finishedAt = new Date();
        latest.resultCount = result.count;
        latest.errorMessage = null;
        await this.jobRepo.save(latest);
      } catch (error) {
        const refreshed = await this.jobRepo.findOne({ where: { id: job.id } });
        const message =
          (error as Error)?.message ||
          refreshed?.errorMessage ||
          "接口案例生成失败，请稍后重试";
        if (refreshed && refreshed.status !== "cancelled") {
          refreshed.status = "failed";
          refreshed.finishedAt = new Date();
          refreshed.errorMessage = message;
          await this.jobRepo.save(refreshed);
        }
        this.logger.warn(
          `接口案例生成任务失败 ${job.projectId}/${job.transactionId}: ${message}`,
        );
      }
    });
    void this.pump();
  }
}
