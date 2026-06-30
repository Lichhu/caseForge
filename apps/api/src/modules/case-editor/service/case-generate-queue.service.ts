/**
 * @file 案例生成 DB 任务队列：入队、调度、ETA 统计
 */
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { TestPointInstructEntity } from "@dynamic-instruct/entity/test-point-instruct.entity";
import { TestPointEntity } from "@struct-doc/entity/test-point.entity";
import {
  CaseGenerateJobEntity,
  CaseGenerateJobStatus,
} from "@case-editor/entity/case-generate-job.entity";
import {
  getCaseGenerateActiveCount,
  getCaseGenerateConcurrency,
  getCaseGenerateWaitingCount,
  setCaseGenerateSlotReleaseHook,
  withCaseGenerateSlot,
} from "@case-editor/util/case-generate-concurrency";
import {
  estimateRemainingSeconds,
  resolveAverageRunSeconds,
} from "@case-editor/util/case-generate-queue-metrics.util";
import { CaseWorkspaceService } from "./case-workspace.service";
import { buildCaseGenerateInterruptedMessage } from "@case-editor/util/case-generate-interrupted.util";
import { isCaseGenerateCancelled } from "@case-editor/util/case-generate-cancel.registry";
import { RequestContext } from "@common/audit/request-context";
import {
  buildRunningCountByUser,
  countActiveUsers,
  countUserQueuedAhead,
  estimateFairWaitSeconds,
  getCaseGeneratePerUserMaxRunning,
  pickFairQueuedJob,
} from "@case-editor/util/case-generate-fair-schedule.util";

export interface CaseGenerateQueueItemStatus {
  testPointId: string;
  jobId: string;
  phase: CaseGenerateJobStatus | "none";
  queuePosition: number;
  queuedAhead: number;
  runningAhead: number;
  estimatedWaitSeconds: number;
  estimatedRemainingSeconds: number;
  elapsedSeconds: number;
  averageRunSeconds: number;
  concurrency: number;
  globalQueuedCount: number;
  globalRunningCount: number;
  perUserMaxRunning: number;
  userQueuedAhead: number;
  errorMessage?: string;
}

export interface CaseGenerateQueueStatusResponse {
  averageRunSeconds: number;
  concurrency: number;
  perUserMaxRunning: number;
  globalQueuedCount: number;
  globalRunningCount: number;
  slotWaitingCount: number;
  items: CaseGenerateQueueItemStatus[];
}

@Injectable()
export class CaseGenerateQueueService implements OnModuleInit {
  private readonly logger = new Logger(CaseGenerateQueueService.name);
  private pumping = false;

  constructor(
    @InjectRepository(CaseGenerateJobEntity)
    private readonly jobRepo: Repository<CaseGenerateJobEntity>,
    @InjectRepository(TestPointInstructEntity)
    private readonly instructRepo: Repository<TestPointInstructEntity>,
    @InjectRepository(TestPointEntity)
    private readonly testPointRepo: Repository<TestPointEntity>,
    @Inject(forwardRef(() => CaseWorkspaceService))
    private readonly workspaceService: CaseWorkspaceService,
  ) {}

  onModuleInit() {
    setCaseGenerateSlotReleaseHook(() => {
      void this.pump();
    });
    void this.recoverInterruptedJobs()
      .then(() => this.reconcileGeneratingInstructs())
      .then(() => this.pump());
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
      `服务启动：已将 ${running.length} 条运行中的案例生成任务重新入队`,
    );
  }

  /** 将 DB 中「生成中」但无活跃任务的测试要点重新入队 */
  async reconcileGeneratingInstructs() {
    const generating = await this.instructRepo.find({
      where: { status: "生成中" },
    });
    if (!generating.length) {
      return;
    }

    const testPointIds = generating.map((item) => item.testPointId);
    const testPoints = await this.testPointRepo.find({
      where: { id: In(testPointIds) },
    });
    const projectByTestPoint = new Map(
      testPoints.map((item) => [item.id, item.projectId]),
    );

    const activeJobs = await this.jobRepo.find({
      where: {
        testPointId: In(testPointIds),
        status: In(["queued", "running"]),
      },
    });
    const activeTestPoints = new Set(activeJobs.map((job) => job.testPointId));

    let requeued = 0;
    for (const instruct of generating) {
      if (activeTestPoints.has(instruct.testPointId)) {
        continue;
      }
      const projectId = projectByTestPoint.get(instruct.testPointId);
      if (!projectId) {
        continue;
      }
      await this.enqueue(projectId, [instruct.testPointId]);
      requeued += 1;
    }

    if (requeued) {
      this.logger.warn(
        `服务启动：已为 ${requeued} 条「生成中」测试要点补建队列任务`,
      );
    }
  }

  async enqueue(
    projectId: string,
    testPointIds: string[],
    model?: string,
  ): Promise<CaseGenerateJobEntity[]> {
    const uniqueIds = [...new Set(testPointIds)];
    if (!uniqueIds.length) {
      return [];
    }

    const existing = await this.jobRepo.find({
      where: {
        projectId,
        testPointId: In(uniqueIds),
        status: In(["queued", "running"]),
      },
    });
    const activeByTestPoint = new Map(
      existing.map((job) => [job.testPointId, job]),
    );

    const now = new Date();
    const created: CaseGenerateJobEntity[] = [];
    for (const testPointId of uniqueIds) {
      if (activeByTestPoint.has(testPointId)) {
        continue;
      }
      created.push(
        this.jobRepo.create({
          projectId,
          testPointId,
          model,
          status: "queued",
          queuedAt: now,
          createdBy: RequestContext.getUserName(),
        }),
      );
    }

    if (created.length) {
      await this.jobRepo.save(created);
    }
    void this.pump();
    return [...existing, ...created];
  }

  async cancelJobs(projectId: string, testPointIds: string[]) {
    const uniqueIds = [...new Set(testPointIds)];
    if (!uniqueIds.length) {
      return;
    }
    const jobs = await this.jobRepo.find({
      where: {
        projectId,
        testPointId: In(uniqueIds),
        status: In(["queued", "running"]),
      },
    });
    if (!jobs.length) {
      return;
    }
    const now = new Date();
    for (const job of jobs) {
      job.status = "cancelled";
      job.finishedAt = now;
    }
    await this.jobRepo.save(jobs);
  }

  async getQueueStatus(
    projectId: string,
    testPointIds?: string[],
  ): Promise<CaseGenerateQueueStatusResponse> {
    const concurrency = getCaseGenerateConcurrency();
    const perUserMaxRunning = getCaseGeneratePerUserMaxRunning();
    const averageRunSeconds = await this.loadAverageRunSeconds();
    const activeJobs = await this.jobRepo.find({
      where: { status: In(["queued", "running"]) },
      order: { queuedAt: "ASC" },
    });
    const queuedJobs = activeJobs.filter((job) => job.status === "queued");
    const globalQueuedCount = queuedJobs.length;
    const globalRunningCount = activeJobs.filter((job) => job.status === "running").length;
    const activeUsers = countActiveUsers(activeJobs);
    const fairQueueIndexByJobId = this.buildFairQueueIndex(activeJobs);

    const where: Record<string, unknown> = { projectId };
    if (testPointIds?.length) {
      where.testPointId = In([...new Set(testPointIds)]);
    }
    const projectJobs = await this.jobRepo.find({
      where,
      order: { queuedAt: "DESC" },
      take: 200,
    });

    const latestByTestPoint = new Map<string, CaseGenerateJobEntity>();
    for (const job of projectJobs) {
      if (!latestByTestPoint.has(job.testPointId)) {
        latestByTestPoint.set(job.testPointId, job);
      }
    }

    const items: CaseGenerateQueueItemStatus[] = [];
    for (const job of latestByTestPoint.values()) {
      if (job.status === "failed") {
        items.push(
          this.buildItemStatus(job, {
            averageRunSeconds,
            concurrency,
            perUserMaxRunning,
            globalQueuedCount,
            globalRunningCount,
            activeUsers,
            queuedJobs,
            queueIndex: -1,
          }),
        );
        continue;
      }
      if (job.status !== "queued" && job.status !== "running") {
        continue;
      }
      const queueIndex = fairQueueIndexByJobId.get(job.id) ?? activeJobs.length;
      items.push(
        this.buildItemStatus(job, {
          averageRunSeconds,
          concurrency,
          perUserMaxRunning,
          globalQueuedCount,
          globalRunningCount,
          activeUsers,
          queuedJobs,
          queueIndex,
        }),
      );
    }

    items.sort(
      (a, b) => a.queuePosition - b.queuePosition || a.testPointId.localeCompare(b.testPointId),
    );

    return {
      averageRunSeconds,
      concurrency,
      perUserMaxRunning,
      globalQueuedCount,
      globalRunningCount,
      slotWaitingCount: getCaseGenerateWaitingCount(),
      items,
    };
  }

  /** 模拟公平调度顺序，用于 ETA 展示 */
  private buildFairQueueIndex(activeJobs: CaseGenerateJobEntity[]) {
    const queuedJobs = activeJobs.filter((job) => job.status === "queued");
    const runningJobs = activeJobs.filter((job) => job.status === "running");
    const runningByUser = buildRunningCountByUser(runningJobs);
    const perUserMax = getCaseGeneratePerUserMaxRunning();
    const remainingQueued = [...queuedJobs];
    const order: CaseGenerateJobEntity[] = [];

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

  private buildItemStatus(
    job: CaseGenerateJobEntity,
    context: {
      averageRunSeconds: number;
      concurrency: number;
      perUserMaxRunning: number;
      globalQueuedCount: number;
      globalRunningCount: number;
      activeUsers: number;
      queuedJobs: CaseGenerateJobEntity[];
      queueIndex: number;
    },
  ): CaseGenerateQueueItemStatus {
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
      testPointId: job.testPointId,
      jobId: job.id,
      phase: job.status,
      queuePosition,
      queuedAhead: Math.max(0, context.queueIndex),
      runningAhead: context.globalRunningCount,
      estimatedWaitSeconds,
      estimatedRemainingSeconds,
      elapsedSeconds,
      averageRunSeconds: context.averageRunSeconds,
      concurrency: context.concurrency,
      globalQueuedCount: context.globalQueuedCount,
      globalRunningCount: context.globalRunningCount,
      perUserMaxRunning: context.perUserMaxRunning,
      userQueuedAhead,
      errorMessage: job.errorMessage ?? undefined,
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

  private async claimNextJob(): Promise<CaseGenerateJobEntity | null> {
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

  private async runJob(job: CaseGenerateJobEntity) {
    await withCaseGenerateSlot(async () => {
      try {
        await this.workspaceService.runQueuedGenerateJob({
          projectId: job.projectId,
          testPointId: job.testPointId,
          model: job.model,
        });
        const latest = await this.jobRepo.findOne({ where: { id: job.id } });
        if (!latest) {
          return;
        }
        if (
          latest.status === "cancelled" ||
          isCaseGenerateCancelled(job.projectId, job.testPointId)
        ) {
          if (latest.status !== "cancelled") {
            latest.status = "cancelled";
            latest.finishedAt = new Date();
            await this.jobRepo.save(latest);
          }
          return;
        }
        latest.status = "completed";
        latest.finishedAt = new Date();
        latest.errorMessage = null;
        await this.jobRepo.save(latest);
      } catch (error) {
        const refreshed = await this.jobRepo.findOne({ where: { id: job.id } });
        const message =
          (error as Error)?.message ||
          refreshed?.errorMessage ||
          "案例生成失败，请稍后重试";
        if (refreshed && refreshed.status !== "cancelled") {
          refreshed.status = "failed";
          refreshed.finishedAt = new Date();
          refreshed.errorMessage = message;
          await this.jobRepo.save(refreshed);
        }
        this.logger.warn(
          `案例生成任务失败 ${job.projectId}/${job.testPointId}: ${message}`,
        );
      }
    });
    void this.pump();
  }
}
