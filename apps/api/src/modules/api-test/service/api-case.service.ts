import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository, In } from "typeorm";
import { AiWorkflowService } from "@common/ai-workflow/service/ai-workflow.service";
import {
  auditFieldsForCreate,
  auditFieldsForUpdate,
  RequestContext,
} from "@common/audit/request-context";
import { scopedWhere } from "@common/audit/user-scope";
import { ApiDocEntity } from "@api-test/entity/api-doc.entity";
import { ApiEndpointEntity } from "@api-test/entity/api-endpoint.entity";
import { ApiTestCaseEntity } from "@api-test/entity/api-test-case.entity";
import { ApiTestExecutionSetCaseEntity } from "@api-test/entity/api-test-execution-set-case.entity";
import { ApiTransactionEntity } from "@api-test/entity/api-transaction.entity";
import { SaveApiCaseDto } from "@api-test/dto/save-api-case.dto";
import { ListApiCasesDto } from "@api-test/dto/list-api-cases.dto";
import {
  maxCaseNoSuffix,
  formatCaseNo,
  nextCaseNo,
} from "@api-test/util/api-case-ai.util";
import {
  assessDocReadiness,
  resolveCanonicalDoc,
} from "@api-test/util/api-canonical-doc.util";
import { toPublicApiCase } from "@common/http/public-response.util";
import {
  DEFAULT_CASE_FORGE_PAGE_SIZE,
  normalizeCaseForgePageSize,
} from "@case-forge/shared";
import { ApiCaseGenerateQueueService } from "./api-case-generate-queue.service";
import { ApiCaseGenerateJobEntity } from "@api-test/entity/api-case-generate-job.entity";
import { ApiCaseGenerateScenarioEntity } from "@api-test/entity/api-case-generate-scenario.entity";
import { ApiTestRunItemEntity } from "@api-test/entity/api-test-run-item.entity";
import { ApiTestRunEntity } from "@api-test/entity/api-test-run.entity";
import type { ApiCaseRequest } from "@case-forge/shared";
import {
  buildScenarioPrompts,
  assertScenarioCoverage,
  parseScenarioAiResult,
  validateScenarioAiResult,
  type ApiCaseScenarioKey,
} from "@api-test/util/api-case-scenarios.util";
import { assembleBodyFromExample } from "@api-test/util/api-case-body-assembler.util";
import { buildCaseRequestFromProfile } from "@api-test/util/api-doc-technical-profile.util";

@Injectable()
export class ApiCaseService {
  private readonly logger = new Logger(ApiCaseService.name);

  constructor(
    @InjectRepository(ApiTestCaseEntity)
    private readonly caseRepo: Repository<ApiTestCaseEntity>,
    @InjectRepository(ApiEndpointEntity)
    private readonly endpointRepo: Repository<ApiEndpointEntity>,
    @InjectRepository(ApiDocEntity)
    private readonly apiDocRepo: Repository<ApiDocEntity>,
    @InjectRepository(ApiTransactionEntity)
    private readonly transactionRepo: Repository<ApiTransactionEntity>,
    @InjectRepository(ApiTestExecutionSetCaseEntity)
    private readonly setCaseRepo: Repository<ApiTestExecutionSetCaseEntity>,
    private readonly aiWorkflow: AiWorkflowService,
    @Inject(forwardRef(() => ApiCaseGenerateQueueService))
    private readonly generateQueueService: ApiCaseGenerateQueueService,
    @InjectRepository(ApiCaseGenerateJobEntity)
    private readonly generateJobRepo: Repository<ApiCaseGenerateJobEntity>,
    @InjectRepository(ApiCaseGenerateScenarioEntity)
    private readonly scenarioRepo: Repository<ApiCaseGenerateScenarioEntity>,
    @InjectRepository(ApiTestRunItemEntity)
    private readonly runItemRepo: Repository<ApiTestRunItemEntity>,
    @InjectRepository(ApiTestRunEntity)
    private readonly runRepo: Repository<ApiTestRunEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async listCases(
    projectId: string,
    transactionId: string,
    query: ListApiCasesDto = {},
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = normalizeCaseForgePageSize(
      query.pageSize ?? DEFAULT_CASE_FORGE_PAGE_SIZE,
    );

    const qb = this.caseRepo
      .createQueryBuilder("c")
      .innerJoinAndSelect("c.endpoint", "e")
      .where("c.projectId = :projectId", { projectId })
      .andWhere("c.createdBy = :userName", {
        userName: RequestContext.getUserName(),
      })
      .andWhere("e.transactionId = :transactionId", { transactionId });

    if (query.versionCode != null) {
      qb.andWhere("JSON_EXTRACT(c.metadata, '$.versionCode') = :versionCode", {
        versionCode: query.versionCode,
      });
    }
    if (query.channelId != null) {
      qb.andWhere("JSON_EXTRACT(c.metadata, '$.channelId') = :channelId", {
        channelId: query.channelId,
      });
    }

    const [rows, count] = await qb
      .orderBy("c.updatedAt", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return {
      rows: rows.map(toPublicApiCase),
      count,
      page,
      pageSize,
    };
  }

  async createCase(
    projectId: string,
    transactionId: string,
    payload: SaveApiCaseDto,
  ) {
    this.validateCasePayload(payload);
    const endpoint = await this.requireEndpoint(
      projectId,
      payload.endpointId,
      transactionId,
    );
    const transaction = await this.requireTransaction(projectId, transactionId);
    const userName = RequestContext.getUserName();
    const caseNo =
      payload.caseNo?.trim() ||
      (await nextCaseNo(
        this.caseRepo,
        projectId,
        endpoint.id,
        transaction.code,
      ));
    const entity = this.caseRepo.create({
      projectId,
      endpointId: endpoint.id,
      title: payload.title,
      caseNo,
      description: payload.description ?? "",
      remark: payload.remark ?? "",
      transactionCode: payload.transactionCode ?? transaction.code,
      owner: payload.owner?.trim() || userName,
      priority: payload.priority ?? "P1",
      polarity: payload.polarity ?? "positive",
      status: payload.status ?? "ready",
      enabled: payload.enabled ?? true,
      preconditions: payload.preconditions ?? [],
      request: payload.request,
      expected: payload.expected,
      metadata: {
        source: "manual",
        promptIds: payload.promptIds ?? [],
        ...(payload.generateVersion != null
          ? { generateVersion: payload.generateVersion }
          : {}),
        ...(payload.versionCode ? { versionCode: payload.versionCode } : {}),
        ...(payload.debugEnvironmentId
          ? { debugEnvironmentId: payload.debugEnvironmentId }
          : {}),
        ...(payload.debugEnvironmentServiceId
          ? { debugEnvironmentServiceId: payload.debugEnvironmentServiceId }
          : {}),
        ...(payload.debugEncoding
          ? { debugEncoding: payload.debugEncoding }
          : {}),
        ...(payload.lastDebugRun ? { lastDebugRun: payload.lastDebugRun } : {}),
      },
      ...auditFieldsForCreate(),
    });
    const saved = await this.caseRepo.save(entity);
    return toPublicApiCase(
      (await this.caseRepo.findOne({
        where: scopedWhere({ projectId, id: saved.id }),
        relations: ["endpoint"],
      })) ?? saved,
    );
  }

  async updateCase(
    projectId: string,
    transactionId: string,
    caseId: string,
    payload: SaveApiCaseDto,
  ) {
    this.validateCasePayload(payload);
    const existing = await this.caseRepo.findOne({
      where: scopedWhere({ projectId, id: caseId }),
    });
    if (!existing) {
      throw new NotFoundException("案例不存在");
    }
    if (payload.endpointId && payload.endpointId !== existing.endpointId) {
      await this.requireEndpoint(projectId, payload.endpointId, transactionId);
      existing.endpointId = payload.endpointId;
    }
    existing.title = payload.title;
    if (payload.caseNo !== undefined) existing.caseNo = payload.caseNo;
    existing.description = payload.description ?? "";
    existing.remark = payload.remark ?? "";
    if (payload.transactionCode !== undefined) {
      existing.transactionCode = payload.transactionCode;
    }
    if (payload.owner !== undefined) existing.owner = payload.owner;
    existing.priority = payload.priority ?? existing.priority;
    existing.polarity = payload.polarity ?? existing.polarity;
    existing.status = payload.status ?? existing.status;
    if (payload.enabled !== undefined) existing.enabled = payload.enabled;
    existing.preconditions = payload.preconditions ?? [];
    existing.request = payload.request;
    existing.expected = payload.expected;
    existing.metadata = {
      ...existing.metadata,
      source: existing.metadata?.source === "ai" ? "ai_edited" : "manual",
      promptIds:
        payload.promptIds !== undefined
          ? payload.promptIds
          : (existing.metadata?.promptIds ?? []),
      debugEnvironmentId: payload.debugEnvironmentId,
      debugEnvironmentServiceId: payload.debugEnvironmentServiceId,
      debugEncoding: payload.debugEncoding,
      ...(payload.lastDebugRun !== undefined
        ? { lastDebugRun: payload.lastDebugRun }
        : {}),
    };
    const saved = await this.caseRepo.save({
      ...existing,
      ...auditFieldsForUpdate(),
    });
    return toPublicApiCase(
      (await this.caseRepo.findOne({
        where: scopedWhere({ projectId, id: saved.id }),
        relations: ["endpoint"],
      })) ?? saved,
    );
  }

  async persistLastDebugRun(
    projectId: string,
    caseId: string,
    snapshot: NonNullable<ApiTestCaseEntity["metadata"]>["lastDebugRun"],
  ) {
    const existing = await this.caseRepo.findOne({
      where: scopedWhere({ projectId, id: caseId }),
    });
    if (!existing) return;
    existing.metadata = {
      ...existing.metadata,
      lastDebugRun: snapshot,
    };
    await this.caseRepo.save({
      ...existing,
      ...auditFieldsForUpdate(),
    });
  }

  async deleteCase(projectId: string, caseId: string) {
    await this.setCaseRepo.delete({ caseId });
    await this.caseRepo.delete(scopedWhere({ projectId, id: caseId }));
    return { ok: true };
  }

  async batchPatchCaseRequest(
    projectId: string,
    transactionId: string,
    caseIds: string[],
    patch: Partial<ApiCaseRequest>,
    environmentId?: string,
    environmentServiceId?: string,
    encoding?: string,
  ) {
    if (!caseIds.length) throw new BadRequestException("请选择要设置的案例");
    const rows = await this.caseRepo
      .createQueryBuilder("c")
      .innerJoin("c.endpoint", "e")
      .where("c.projectId = :projectId", { projectId })
      .andWhere("c.id IN (:...caseIds)", { caseIds })
      .andWhere("e.transactionId = :transactionId", { transactionId })
      .getMany();
    if (rows.length !== new Set(caseIds).size)
      throw new BadRequestException("部分案例不存在或不属于当前交易");
    for (const row of rows) {
      row.request = {
        ...row.request,
        ...patch,
        headers: patch.headers
          ? { ...(row.request.headers ?? {}), ...patch.headers }
          : row.request.headers,
        query: patch.query
          ? { ...(row.request.query ?? {}), ...patch.query }
          : row.request.query,
      };
      if (environmentId) {
        row.metadata = {
          ...row.metadata,
          debugEnvironmentId: environmentId,
          debugEnvironmentServiceId: environmentServiceId,
        };
      }
      if (encoding) row.metadata = { ...row.metadata, debugEncoding: encoding };
    }
    await this.caseRepo.save(
      rows.map((row) => ({ ...row, ...auditFieldsForUpdate() })),
    );
    return { ok: true, updated: rows.length };
  }

  async generateCases(
    projectId: string,
    transactionId?: string,
    options?: { channelIds?: string[] },
  ) {
    if (!transactionId) {
      throw new BadRequestException("请指定交易码后再生成案例");
    }
    await this.validateGenerateRequest(projectId, transactionId, options);
    const job = await this.generateQueueService.enqueue(
      projectId,
      transactionId,
      options,
    );
    return {
      jobId: job.id,
      status: job.status,
      phase: job.status,
    };
  }

  async getGenerateStatus(projectId: string, transactionId: string) {
    return this.generateQueueService.getStatus(projectId, transactionId);
  }

  async cancelGenerate(projectId: string, transactionId: string) {
    return this.generateQueueService.cancel(projectId, transactionId);
  }

  async listGenerateHistory(projectId: string, transactionId: string) {
    await this.requireTransaction(projectId, transactionId);
    const jobs = await this.generateJobRepo.find({
      where: { projectId, transactionId },
      order: { queuedAt: "DESC" },
      take: 50,
    });
    if (!jobs.length) return [];

    return jobs.map((job) => ({
      jobId: job.id,
      version: job.version ?? null,
      versionCode: job.versionCode ?? null,
      ruleVersion: job.ruleVersion ?? null,
      status: job.status,
      resultCount: job.resultCount ?? null,
      createdBy: job.createdBy ?? null,
      queuedAt: job.queuedAt,
      finishedAt: job.finishedAt ?? null,
      errorMessage: job.errorMessage ?? null,
      scenarioSummary: {
        total: job.scenarioCount ?? 0,
        completed: job.completedScenarioCount ?? 0,
        notApplicable: job.notApplicableScenarioCount ?? 0,
        failed: job.failedScenarioCount ?? 0,
      },
    }));
  }

  async getGenerateVersion(
    projectId: string,
    transactionId: string,
    jobId: string,
  ) {
    const job = await this.generateJobRepo.findOne({
      where: { id: jobId, projectId, transactionId },
    });
    if (!job) throw new NotFoundException("生成版本不存在");
    const scenarios = await this.scenarioRepo.find({
      where: { jobId },
      order: { createdAt: "ASC" },
    });
    return { ...job, scenarios };
  }

  async retryGenerateScenario(
    projectId: string,
    transactionId: string,
    jobId: string,
    scenarioId: string,
  ) {
    const job = await this.generateJobRepo.findOne({
      where: { id: jobId, projectId, transactionId },
    });
    const task = await this.scenarioRepo.findOne({
      where: { id: scenarioId, jobId, projectId, transactionId },
    });
    if (!job || !task) throw new NotFoundException("生成场景不存在");
    if (task.status !== "failed")
      throw new BadRequestException("仅失败场景可以重试");
    task.status = "pending";
    task.errorMessage = null;
    task.finishedAt = null;
    await this.scenarioRepo.save(task);
    job.status = "queued";
    job.finishedAt = null;
    job.errorMessage = null;
    await this.generateJobRepo.save(job);
    this.generateQueueService.triggerPump();
    return this.getGenerateVersion(projectId, transactionId, jobId);
  }

  async deleteGenerateVersion(
    projectId: string,
    transactionId: string,
    jobId: string,
  ) {
    const job = await this.generateJobRepo.findOne({
      where: { id: jobId, projectId, transactionId },
    });
    if (!job) throw new NotFoundException("生成版本不存在");
    if (["queued", "running"].includes(job.status))
      throw new BadRequestException("生成中或重试中的版本不能删除");
    const running = await this.runRepo.count({
      where: { projectId, transactionId, status: "running" },
    });
    if (running > 0)
      throw new BadRequestException("当前交易存在正在执行的任务，不能删除版本");
    const cases = await this.caseRepo.find({ where: { projectId } });
    const versionCases = cases.filter(
      (item) => item.metadata?.generateJobId === jobId,
    );
    const caseIds = versionCases.map((item) => item.id);
    if (caseIds.length) {
      const referenced = await this.setCaseRepo.count({
        where: { caseId: In(caseIds) },
      });
      if (referenced > 0)
        throw new BadRequestException("版本案例已被执行集引用，不能删除");
      const executed = await this.runItemRepo.count({
        where: { caseId: In(caseIds) },
      });
      if (executed > 0)
        throw new BadRequestException("版本案例已有执行记录，不能删除");
      await this.caseRepo.delete({ id: In(caseIds), projectId });
    }
    await this.scenarioRepo.delete({ jobId });
    await this.generateJobRepo.delete({ id: jobId, projectId, transactionId });
    return { ok: true };
  }

  async runQueuedGenerateJob(input: {
    projectId: string;
    transactionId: string;
    jobId: string;
  }) {
    const job = await this.generateJobRepo.findOne({
      where: { id: input.jobId },
    });
    if (!job?.snapshot)
      throw new Error("旧版接口案例生成任务已不再支持，请重新发起生成");
    return this.runScenarioVersion(job);
  }

  private async runScenarioVersion(job: ApiCaseGenerateJobEntity) {
    const transaction = await this.requireTransaction(
      job.projectId,
      job.transactionId,
    );
    const endpoint = await this.endpointRepo.findOne({
      where: { projectId: job.projectId, transactionId: job.transactionId },
      order: { sortOrder: "ASC" },
    });
    if (!endpoint || !job.snapshot)
      throw new BadRequestException("没有可生成案例的接口端点");
    const tasks = await this.scenarioRepo.find({
      where: { jobId: job.id },
      order: { createdAt: "ASC" },
    });
    let createdCount = 0;
    for (const task of tasks) {
      if (!["pending", "failed"].includes(task.status)) continue;
      const latestJob = await this.generateJobRepo.findOne({
        where: { id: job.id },
      });
      if (latestJob?.status === "cancelled") break;
      const started = Date.now();
      task.status = task.attemptCount > 0 ? "retrying" : "running";
      task.attemptCount += 1;
      task.startedAt = new Date();
      task.errorMessage = null;
      await this.scenarioRepo.save(task);
      try {
        const prompts = buildScenarioPrompts({
          scenarioKey: task.scenarioKey as ApiCaseScenarioKey,
          scenarioName: task.scenarioName,
          structuredMarkdown: job.snapshot.structuredMarkdown,
          transactionCode: transaction.code,
          serviceProperty: job.snapshot.profile.serviceProperty,
        });
        task.promptChars = prompts.reduce(
          (sum, item) => sum + item.prompt.length,
          0,
        );
        task.inputFieldCount = prompts.reduce(
          (sum, item) => sum + item.inputFieldCount,
          0,
        );
        const partialResults = [];
        for (const prompt of prompts) {
          const { text } = await this.aiWorkflow.runWithAiChat(prompt.prompt);
          const parsed = parseScenarioAiResult(text);
          if (!parsed) throw new Error("AI 返回内容无法解析为场景结果 JSON");
          partialResults.push(
            validateScenarioAiResult(parsed, job.snapshot.structuredMarkdown),
          );
        }
        const applicableResults = partialResults.filter(
          (item) => item.applicable,
        );
        const result = validateScenarioAiResult(
          {
            applicable: applicableResults.length > 0,
            reason:
              applicableResults
                .map((item) => item.reason)
                .filter(Boolean)
                .join("；") ||
              partialResults
                .map((item) => item.reason)
                .filter(Boolean)
                .join("；"),
            cases: applicableResults.flatMap((item) => item.cases),
          },
          job.snapshot.structuredMarkdown,
        );
        assertScenarioCoverage(
          task.scenarioKey as ApiCaseScenarioKey,
          result,
          job.snapshot.structuredMarkdown,
        );
        task.result = result;
        task.applicableReason = result.reason;
        if (!result.applicable) {
          task.status = "not_applicable";
          task.resultCount = 0;
        } else {
          const count = await this.persistScenarioCases(
            job,
            endpoint,
            transaction.code,
            task,
            result.cases,
          );
          task.status = "completed";
          task.resultCount = count;
          createdCount += count;
        }
      } catch (error) {
        task.status = "failed";
        task.errorMessage = (error as Error).message;
      }
      task.durationMs = Date.now() - started;
      task.finishedAt = new Date();
      await this.scenarioRepo.save(task);
    }
    await this.refreshScenarioSummary(job.id);
    return { count: createdCount, cases: [] };
  }

  private async persistScenarioCases(
    job: ApiCaseGenerateJobEntity,
    endpoint: ApiEndpointEntity,
    transactionCode: string,
    task: ApiCaseGenerateScenarioEntity,
    plans: Array<{
      title: string;
      polarity: "positive" | "negative";
      changes: Array<{ path: string; value: string }>;
      expected?: string;
    }>,
  ) {
    if (!job.snapshot) return 0;
    const profile = job.snapshot.profile;
    const channels = profile.channels.length ? profile.channels : [null];
    let seq = await maxCaseNoSuffix(
      this.caseRepo,
      job.projectId,
      endpoint.id,
      transactionCode,
    );
    const entities: ApiTestCaseEntity[] = [];
    for (const plan of plans) {
      for (const channel of channels) {
        const overrides = Object.fromEntries(
          plan.changes.map((change) => [change.path, change.value]),
        );
        if (channel) {
          overrides["Transaction/Header/sysHeader/clientCd"] = channel.clientCd;
          overrides["Transaction/Header/sysHeader/serviceCd"] =
            channel.serviceCd;
        }
        const assembled = assembleBodyFromExample({
          exampleMessage: profile.exampleMessage,
          overrides,
          messageFormat: profile.messageFormat,
          createMissingPaths: true,
          refreshDynamicHeaders: true,
        });
        seq += 1;
        const transport = profile.transport === "socket" ? "tcp" : "http";
        const request = buildCaseRequestFromProfile(
          endpoint,
          {
            transport,
            messageFormat: profile.messageFormat,
          },
          assembled.body,
        );
        if (task.scenarioKey === "idempotency") request.repeatCount = 2;
        entities.push(
          this.caseRepo.create({
            projectId: job.projectId,
            endpointId: endpoint.id,
            title: `${channel ? `[${channel.name}] ` : ""}${plan.title}`,
            caseNo: formatCaseNo(transactionCode, seq),
            description: plan.expected ?? "",
            transactionCode,
            owner: RequestContext.getUserName(),
            priority: "P1",
            polarity: plan.polarity,
            status: "ready",
            enabled: true,
            preconditions: [],
            request,
            expected: {},
            metadata: {
              source: "ai",
              generateVersion: job.version ?? undefined,
              scenarioName: task.scenarioName,
              generateJobId: job.id,
              versionCode: job.versionCode ?? undefined,
              scenarioTaskId: task.id,
              scenarioKey: task.scenarioKey,
              channelId: channel?.id,
              channelName: channel?.name,
              channelSnapshot: channel
                ? { clientCd: channel.clientCd, serviceCd: channel.serviceCd }
                : undefined,
            },
            ...auditFieldsForCreate(),
          }),
        );
      }
    }
    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.find(ApiTestCaseEntity, {
        where: { projectId: job.projectId },
      });
      const staleIds = existing
        .filter((item) => item.metadata?.scenarioTaskId === task.id)
        .map((item) => item.id);
      if (staleIds.length) {
        await manager.delete(ApiTestExecutionSetCaseEntity, {
          caseId: In(staleIds),
        });
        await manager.delete(ApiTestCaseEntity, {
          id: In(staleIds),
          projectId: job.projectId,
        });
      }
      await manager.save(ApiTestCaseEntity, entities);
    });
    return entities.length;
  }

  private async refreshScenarioSummary(jobId: string) {
    const tasks = await this.scenarioRepo.find({ where: { jobId } });
    const job = await this.generateJobRepo.findOne({ where: { id: jobId } });
    if (!job) return;
    job.completedScenarioCount = tasks.filter(
      (task) => task.status === "completed",
    ).length;
    job.notApplicableScenarioCount = tasks.filter(
      (task) => task.status === "not_applicable",
    ).length;
    job.failedScenarioCount = tasks.filter(
      (task) => task.status === "failed",
    ).length;
    await this.generateJobRepo.save(job);
  }

  async cleanupGeneratedCases(
    projectId: string,
    transactionId: string,
    version: number,
  ) {
    const endpoints = await this.endpointRepo.find({
      where: { projectId, transactionId },
      select: ["id"],
    });
    if (!endpoints.length) return 0;
    const endpointIds = endpoints.map((e) => e.id);
    const cases = await this.caseRepo.find({
      where: { projectId, endpointId: In(endpointIds) },
    });
    const toDelete = cases.filter(
      (c) => c.metadata?.generateVersion === version,
    );
    if (!toDelete.length) return 0;
    const caseIds = toDelete.map((c) => c.id);
    await this.setCaseRepo.delete({ caseId: In(caseIds) });
    await this.caseRepo.delete({ id: In(caseIds), projectId });
    return toDelete.length;
  }

  async checkDocReadiness(projectId: string, transactionId: string) {
    await this.requireTransaction(projectId, transactionId);
    const doc = await this.apiDocRepo.findOne({
      where: scopedWhere({ projectId, transactionId }),
    });
    if (!doc) {
      return {
        ok: false,
        message: "请先上传并结构化接口文档",
        fieldCount: 0,
        endpoints: [],
      };
    }
    const structuredDoc =
      doc.tempStructuredMarkdown?.trim() ||
      doc.structuredMarkdown?.trim() ||
      doc.extractedRawText?.trim() ||
      "";
    const endpoints = await this.endpointRepo.find({
      where: { projectId, transactionId, apiDocId: doc.id },
      order: { sortOrder: "ASC" },
    });
    const results = endpoints.map((ep) => {
      const canonicalDoc = resolveCanonicalDoc(structuredDoc, ep.requestNotes);
      const readiness = assessDocReadiness(canonicalDoc, ep.path, doc.smpData);
      return {
        endpointId: ep.id,
        endpointName: ep.name,
        ok: readiness.ok,
        message: readiness.message,
        fieldCount: readiness.fieldCount,
        transport: readiness.profile.transport,
        messageFormat: readiness.profile.messageFormat,
      };
    });
    if (!results.length) {
      return {
        ok: false,
        message: "没有接口端点，请先结构化文档并提取接口",
        fieldCount: 0,
        endpoints: [],
      };
    }
    const allOk = results.every((r) => r.ok);
    return {
      ok: allOk,
      message: allOk
        ? "文档就绪"
        : (results.find((r) => !r.ok)?.message ?? "文档未就绪"),
      fieldCount: results[0]?.fieldCount ?? 0,
      endpoints: results,
    };
  }

  private async validateGenerateRequest(
    projectId: string,
    transactionId: string,
    _options?: { channelIds?: string[] },
  ) {
    await this.requireTransaction(projectId, transactionId);
    const endpoints = await this.endpointRepo.find({
      where: { projectId, transactionId },
      order: { sortOrder: "ASC" },
    });
    if (!endpoints.length) {
      throw new BadRequestException("没有可生成案例的接口端点");
    }
    const doc = await this.apiDocRepo.findOne({
      where: scopedWhere({ projectId, transactionId }),
    });
    if (!doc) {
      throw new BadRequestException("请先上传并结构化接口文档");
    }
    if (!doc.metadata?.generationProfile?.exampleMessage.trim()) {
      throw new BadRequestException("请先填写完整生成参数和示例报文");
    }
  }

  private validateCasePayload(payload: SaveApiCaseDto) {
    const transport =
      payload.request?.transport ??
      (payload.request?.framing?.type === "length-prefix" ? "tcp" : "http");

    if (transport === "http") {
      if (!payload.request?.method?.trim() || !payload.request?.path?.trim()) {
        throw new BadRequestException("HTTP 案例请求必须包含 method 与 path");
      }
      return;
    }

    if (
      payload.request?.body === undefined ||
      payload.request?.body === null ||
      (typeof payload.request.body === "string" && !payload.request.body.trim())
    ) {
      throw new BadRequestException("TCP 案例必须配置请求报文体");
    }
  }

  private async requireEndpoint(
    projectId: string,
    endpointId?: string,
    transactionId?: string,
  ) {
    if (!endpointId) {
      throw new BadRequestException("请选择绑定的接口端点");
    }
    const endpoint = await this.endpointRepo.findOne({
      where: { projectId, id: endpointId },
    });
    if (!endpoint) {
      throw new NotFoundException("接口端点不存在");
    }
    if (
      transactionId &&
      endpoint.transactionId &&
      endpoint.transactionId !== transactionId
    ) {
      throw new BadRequestException("接口端点不属于当前交易码");
    }
    return endpoint;
  }

  private async requireTransaction(projectId: string, transactionId: string) {
    const transaction = await this.transactionRepo.findOne({
      where: scopedWhere({ projectId, id: transactionId }),
    });
    if (!transaction) {
      throw new NotFoundException("交易码不存在");
    }
    return transaction;
  }
}
