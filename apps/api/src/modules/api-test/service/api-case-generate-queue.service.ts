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
import { RequestContext } from "@common/audit/request-context";
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
} from "@api-test/entity/api-case-generate-job.entity";
import { ApiDocEntity } from "@api-test/entity/api-doc.entity";
import { ApiTransactionEntity } from "@api-test/entity/api-transaction.entity";
import { ApiCaseService } from "./api-case.service";
import { ApiCaseGenerateScenarioEntity } from "@api-test/entity/api-case-generate-scenario.entity";
import {
  API_CASE_RULE_VERSION,
  scenariosForProperty,
} from "@api-test/util/api-case-scenarios.util";

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
export class ApiCaseGenerateQueueService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ApiCaseGenerateQueueService.name);
  private pumping = false;
  private unregisterSlotHook?: () => void;

  constructor(
    @InjectRepository(ApiCaseGenerateJobEntity)
    private readonly jobRepo: Repository<ApiCaseGenerateJobEntity>,
    @InjectRepository(ApiTransactionEntity)
    private readonly transactionRepo: Repository<ApiTransactionEntity>,
    @InjectRepository(ApiDocEntity)
    private readonly apiDocRepo: Repository<ApiDocEntity>,
    @InjectRepository(ApiCaseGenerateScenarioEntity)
    private readonly scenarioRepo: Repository<ApiCaseGenerateScenarioEntity>,
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
    options?: { channelIds?: string[] },
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
      if (existing.status === "running") {
        return existing;
      }
      return existing;
    }

    const doc = await this.apiDocRepo.findOne({
      where: { projectId, transactionId },
    });
    const profile = doc?.metadata?.generationProfile;
    if (!doc || !profile?.exampleMessage.trim()) {
      throw new Error("请先完整填写服务属性、通讯方式、报文类型和示例报文");
    }
    const selectedChannels = profile.channels.filter((channel) =>
      (options?.channelIds ?? []).includes(channel.id),
    );
    const versionCode = this.formatVersionCode(new Date());
    const scenarios = scenariosForProperty(profile.serviceProperty);
    const job = await this.jobRepo.save(
      this.jobRepo.create({
        projectId,
        transactionId,
        endpointIds: null,
        promptIds: null,
        status: "queued",
        versionCode,
        ruleVersion: API_CASE_RULE_VERSION,
        snapshot: {
          profile: { ...profile, channels: selectedChannels },
          structuredMarkdown:
            doc.tempStructuredMarkdown?.trim() ||
            doc.structuredMarkdown?.trim() ||
            "",
        },
        scenarioCount: scenarios.length,
        queuedAt: new Date(),
        createdBy: RequestContext.getUserName(),
      }),
    );
    await this.scenarioRepo.save(
      scenarios.map((scenario) =>
        this.scenarioRepo.create({
          jobId: job.id,
          projectId,
          transactionId,
          scenarioKey: scenario.key,
          scenarioName: scenario.name,
          status: "pending",
        }),
      ),
    );
    await this.updateTransactionSyncStatus(
      projectId,
      transactionId,
      "generating",
    );
    void this.pump();
    return job;
  }

  triggerPump() {
    void this.pump();
  }

  private formatVersionCode(date: Date) {
    const parts = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("");
    const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
      .map((value) => String(value).padStart(2, "0"))
      .join("");
    return `${parts}-${time}`;
  }

  private sameIdList(
    a: string[] | null | undefined,
    b: string[] | null | undefined,
  ): boolean {
    const left = (a ?? []).slice().sort();
    const right = (b ?? []).slice().sort();
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
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
    await this.updateTransactionSyncStatus(
      projectId,
      transactionId,
      "cancelled",
    );
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
      const picked = pickFairQueuedJob(
        remainingQueued,
        runningByUser,
        perUserMax,
      );
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
    const queuePosition = context.queueIndex >= 0 ? context.queueIndex + 1 : 0;
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
    let version = 0;
    await withCaseGenerateSlot(async () => {
      try {
        version =
          job.version ??
          (await this.assignNextVersion(job.projectId, job.transactionId));
        const latestJob = await this.jobRepo.findOne({ where: { id: job.id } });
        if (latestJob && latestJob.status === "cancelled") {
          return;
        }
        if (latestJob) {
          latestJob.version = version;
          await this.jobRepo.save(latestJob);
        }

        const result = await RequestContext.run(
          job.createdBy || "system",
          async () =>
            this.apiCaseService.runQueuedGenerateJob({
              projectId: job.projectId,
              transactionId: job.transactionId,
              jobId: job.id,
            }),
        );

        const latest = await this.jobRepo.findOne({ where: { id: job.id } });
        if (!latest) {
          return;
        }
        if (latest.status === "cancelled") {
          const deleted = await this.apiCaseService.cleanupGeneratedCases(
            job.projectId,
            job.transactionId,
            version,
          );
          latest.resultCount = 0;
          await this.jobRepo.save(latest);
          this.logger.log(
            `案例生成已取消，清理 ${deleted} 条已写入案例 (v${version})`,
          );
          return;
        }
        const summarized = await this.jobRepo.findOne({
          where: { id: job.id },
        });
        latest.status =
          (summarized?.failedScenarioCount ?? 0) > 0 ? "partial" : "completed";
        latest.completedScenarioCount =
          summarized?.completedScenarioCount ?? latest.completedScenarioCount;
        latest.notApplicableScenarioCount =
          summarized?.notApplicableScenarioCount ??
          latest.notApplicableScenarioCount;
        latest.failedScenarioCount =
          summarized?.failedScenarioCount ?? latest.failedScenarioCount;
        latest.finishedAt = new Date();
        latest.resultCount = (latest.resultCount ?? 0) + result.count;
        latest.version = version;
        latest.errorMessage = null;
        await this.jobRepo.save(latest);
        await this.updateTransactionSyncStatus(
          job.projectId,
          job.transactionId,
          "success",
        );
        await this.updateDocGeneratedHashes(job.projectId, job.transactionId);
      } catch (error) {
        const refreshed = await this.jobRepo.findOne({ where: { id: job.id } });
        const message =
          (error as Error)?.message ||
          refreshed?.errorMessage ||
          "接口案例生成失败，请稍后重试";
        const isCancelled = refreshed?.status === "cancelled";
        if (refreshed && !isCancelled) {
          refreshed.status = "failed";
          refreshed.finishedAt = new Date();
          refreshed.errorMessage = message;
          await this.jobRepo.save(refreshed);
        } else if (refreshed && isCancelled) {
          if (version > 0) {
            const deleted = await this.apiCaseService.cleanupGeneratedCases(
              job.projectId,
              job.transactionId,
              version,
            );
            this.logger.log(
              `案例生成已取消（异常路径），清理 ${deleted} 条已写入案例 (v${version})`,
            );
          }
          refreshed.resultCount = 0;
          await this.jobRepo.save(refreshed);
        }
        await this.updateTransactionSyncStatus(
          job.projectId,
          job.transactionId,
          isCancelled ? "cancelled" : "failed",
          isCancelled ? undefined : message,
        );
        this.logger.warn(
          `接口案例生成任务失败 ${job.projectId}/${job.transactionId}: ${message}`,
        );
      }
    });
    void this.pump();
  }

  private async updateTransactionSyncStatus(
    projectId: string,
    transactionId: string,
    status: "generating" | "success" | "failed" | "cancelled",
    error?: string,
  ) {
    await this.transactionRepo.update(
      { projectId, id: transactionId },
      {
        syncStatus: status,
        syncError: error?.trim() || undefined,
      },
    );
  }

  private async updateDocGeneratedHashes(
    projectId: string,
    transactionId: string,
  ) {
    const doc = await this.apiDocRepo.findOne({
      where: { projectId, transactionId },
    });
    if (!doc) return;
    if (!doc.lastSmpCallServiceHash) return;
    await this.apiDocRepo.update(
      { projectId, id: doc.id },
      {
        lastGeneratedSmpCallServiceHash: doc.lastSmpCallServiceHash,
        lastGeneratedSmpTestInfoHash: doc.lastSmpTestInfoHash,
      },
    );
  }

  private async assignNextVersion(
    projectId: string,
    transactionId: string,
  ): Promise<number> {
    const row = await this.jobRepo
      .createQueryBuilder("j")
      .select("MAX(j.version)", "maxVer")
      .where("j.projectId = :projectId", { projectId })
      .andWhere("j.transactionId = :transactionId", { transactionId })
      .getRawOne<{ maxVer: string | number | null }>();
    return Number(row?.maxVer ?? 0) + 1;
  }
}
