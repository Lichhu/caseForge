/**
 * @file 需求结构化 DB 任务队列：入队、调度、重启恢复
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
import { StructDocEntity } from "@struct-doc/entity/struct-doc.entity";
import { StructRequirementJobEntity } from "@struct-doc/entity/struct-requirement-job.entity";
import { StructDocService } from "@struct-doc/service/struct-doc.service";
import {
  getStructuringConcurrency,
  setStructuringSlotReleaseHook,
} from "@struct-doc/util/structuring-concurrency";
import { buildStructRequirementRecoverMessage } from "@struct-doc/util/struct-requirement-interrupted.util";
import { RequestContext } from "@common/audit/request-context";

@Injectable()
export class StructRequirementQueueService implements OnModuleInit {
  private readonly logger = new Logger(StructRequirementQueueService.name);
  private pumping = false;

  constructor(
    @InjectRepository(StructRequirementJobEntity)
    private readonly jobRepo: Repository<StructRequirementJobEntity>,
    @InjectRepository(StructDocEntity)
    private readonly structDocRepo: Repository<StructDocEntity>,
    @Inject(forwardRef(() => StructDocService))
    private readonly structDocService: StructDocService,
  ) {}

  onModuleInit() {
    setStructuringSlotReleaseHook(() => {
      void this.pump();
    });
    void this.recoverInterruptedJobs()
      .then(() => this.reconcileProcessingStructDocs())
      .then(() => this.pump());
  }

  async findActiveJob(projectId: string, structDocId?: string) {
    return this.jobRepo.findOne({
      where: {
        projectId,
        ...(structDocId ? { structDocId } : {}),
        status: In(["queued", "running"]),
      },
      order: { queuedAt: "DESC" },
    });
  }

  findJobById(jobId: string) {
    return this.jobRepo.findOne({ where: { id: jobId } });
  }

  async failJob(jobId: string, message: string) {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job || job.status === "cancelled" || job.status === "completed") {
      return;
    }
    job.status = "failed";
    job.finishedAt = new Date();
    job.errorMessage = message;
    await this.jobRepo.save(job);
  }

  async failActiveJobs(projectId: string, message: string) {
    const jobs = await this.jobRepo.find({
      where: {
        projectId,
        status: In(["queued", "running"]),
      },
    });
    if (!jobs.length) {
      return;
    }
    const now = new Date();
    for (const job of jobs) {
      job.status = "failed";
      job.finishedAt = now;
      job.errorMessage = message;
    }
    await this.jobRepo.save(jobs);
  }

  async enqueue(projectId: string, structDocId: string, userName: string) {
    const existing = await this.findActiveJob(projectId, structDocId);
    if (existing) {
      return existing;
    }

    await this.structDocRepo.update(structDocId, {
      structuringStatus: "processing",
      structuringError: undefined,
      structuringStartedAt: new Date(),
    });

    const job = await this.jobRepo.save(
      this.jobRepo.create({
        projectId,
        structDocId,
        status: "queued",
        queuedAt: new Date(),
        createdBy: userName,
      }),
    );
    void this.pump();
    return job;
  }

  async cancelJobs(projectId: string, structDocId?: string) {
    const jobs = await this.jobRepo.find({
      where: {
        projectId,
        ...(structDocId ? { structDocId } : {}),
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

  async recoverInterruptedJobs() {
    const running = await this.jobRepo.find({
      where: { status: "running" },
    });
    if (!running.length) {
      return;
    }
    const message = buildStructRequirementRecoverMessage();
    for (const job of running) {
      job.status = "queued";
      job.startedAt = null;
      job.finishedAt = null;
      job.errorMessage = message;
    }
    await this.jobRepo.save(running);
    this.logger.warn(
      `服务启动：已将 ${running.length} 条运行中的结构化任务重新入队`,
    );
  }

  /** 将 DB 中 processing 但无活跃队列任务的结构化文档补建任务 */
  async reconcileProcessingStructDocs() {
    const processingDocs = await this.structDocRepo.find({
      where: { structuringStatus: "processing" },
    });
    if (!processingDocs.length) {
      return;
    }

    let requeued = 0;
    for (const doc of processingDocs) {
      const active = await this.findActiveJob(doc.projectId, doc.id);
      if (active) {
        continue;
      }
      await this.jobRepo.save(
        this.jobRepo.create({
          projectId: doc.projectId,
          structDocId: doc.id,
          status: "queued",
          queuedAt: new Date(),
          createdBy: "system",
        }),
      );
      requeued += 1;
    }

    if (requeued) {
      this.logger.warn(
        `服务启动：已为 ${requeued} 个「结构化中」项目补建队列任务`,
      );
    }
  }

  async pump() {
    if (this.pumping) {
      return;
    }
    this.pumping = true;
    try {
      const limit = getStructuringConcurrency();
      const runningCount = await this.jobRepo.count({
        where: { status: "running" },
      });
      let available = limit - runningCount;
      while (available > 0) {
        const job = await this.claimNextJob();
        if (!job) {
          break;
        }
        void this.runJob(job);
        available -= 1;
      }
    } finally {
      this.pumping = false;
    }
  }

  private async claimNextJob(): Promise<StructRequirementJobEntity | null> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = await this.jobRepo.findOne({
        where: { status: "queued" },
        order: { queuedAt: "ASC" },
      });
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

  private async runJob(job: StructRequirementJobEntity) {
    try {
      await RequestContext.run(job.createdBy || "system", async () => {
        await this.structDocService.runQueuedStructRequirement(job);
      });

      const latest = await this.jobRepo.findOne({ where: { id: job.id } });
      if (!latest || latest.status === "cancelled") {
        return;
      }

      const doc = await this.structDocRepo.findOne({
        where: { id: job.structDocId },
      });
      if (doc?.structuringStatus === "completed") {
        latest.status = "completed";
        latest.finishedAt = new Date();
        latest.errorMessage = null;
        await this.jobRepo.save(latest);
        return;
      }

      if (doc?.structuringStatus === "failed" && latest.status === "running") {
        latest.status = "failed";
        latest.finishedAt = new Date();
        latest.errorMessage =
          doc.structuringError ||
          latest.errorMessage ||
          "结构化失败，请稍后重试";
        await this.jobRepo.save(latest);
      }
    } catch (error) {
      const refreshed = await this.jobRepo.findOne({ where: { id: job.id } });
      const message =
        (error as Error)?.message ||
        refreshed?.errorMessage ||
        "结构化失败，请稍后重试";
      if (refreshed && refreshed.status !== "cancelled") {
        refreshed.status = "failed";
        refreshed.finishedAt = new Date();
        refreshed.errorMessage = message;
        await this.jobRepo.save(refreshed);
      }
      this.logger.warn(`结构化任务失败 projectId=${job.projectId}: ${message}`);
    } finally {
      void this.pump();
    }
  }
}
