import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { AiWorkflowService } from "@common/ai-workflow/service/ai-workflow.service";
import {
  auditFieldsForCreate,
  auditFieldsForUpdate,
  RequestContext,
} from "@common/audit/request-context";
import { scopedWhere, scopedWhereWithSystem } from "@common/audit/user-scope";
import { PromptEntity } from "@scenario/entity/prompt.entity";
import { ApiDocEntity } from "@api-test/entity/api-doc.entity";
import { ApiEndpointEntity } from "@api-test/entity/api-endpoint.entity";
import { ApiTestCaseEntity } from "@api-test/entity/api-test-case.entity";
import { ApiTestExecutionSetCaseEntity } from "@api-test/entity/api-test-execution-set-case.entity";
import { ApiTransactionEntity } from "@api-test/entity/api-transaction.entity";
import { SaveApiCaseDto } from "@api-test/dto/save-api-case.dto";
import { ListApiCasesDto } from "@api-test/dto/list-api-cases.dto";
import {
  generateCasesWithPlan,
  maxCaseNoSuffix,
  formatCaseNo,
  nextCaseNo,
  type ScenarioPromptInfo,
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
    @InjectRepository(PromptEntity)
    private readonly promptRepo: Repository<PromptEntity>,
    private readonly aiWorkflow: AiWorkflowService,
    @Inject(forwardRef(() => ApiCaseGenerateQueueService))
    private readonly generateQueueService: ApiCaseGenerateQueueService,
    @InjectRepository(ApiCaseGenerateJobEntity)
    private readonly generateJobRepo: Repository<ApiCaseGenerateJobEntity>,
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

    if (query.generateVersion != null) {
      qb.andWhere(
        "JSON_EXTRACT(c.metadata, '$.generateVersion') = :generateVersion",
        { generateVersion: query.generateVersion },
      );
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

  async generateCases(
    projectId: string,
    transactionId?: string,
    options?: { endpointIds?: string[]; promptIds?: string[] },
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

    const allPromptIds = [...new Set(jobs.flatMap((j) => j.promptIds ?? []))];
    const prompts = allPromptIds.length
      ? await this.promptRepo.find({
          where: scopedWhereWithSystem({ id: In(allPromptIds) }),
          relations: ["scenario"],
        })
      : [];
    const promptMap = new Map(prompts.map((p) => [p.id, p]));

    return jobs.map((job) => ({
      jobId: job.id,
      version: job.version ?? null,
      status: job.status,
      resultCount: job.resultCount ?? null,
      promptIds: job.promptIds ?? [],
      promptSummaries: (job.promptIds ?? []).map((id) => {
        const p = promptMap.get(id);
        return {
          id,
          name: p?.name?.trim() || null,
          scenarioName: p?.scenario?.name?.trim() || null,
        };
      }),
      createdBy: job.createdBy ?? null,
      queuedAt: job.queuedAt,
      finishedAt: job.finishedAt ?? null,
      errorMessage: job.errorMessage ?? null,
    }));
  }

  async runQueuedGenerateJob(input: {
    projectId: string;
    transactionId: string;
    endpointIds?: string[];
    promptIds?: string[];
    version?: number;
    jobId?: string;
  }) {
    return this.generateCasesInternal(input.projectId, input.transactionId, {
      endpointIds: input.endpointIds,
      promptIds: input.promptIds,
      version: input.version,
      jobId: input.jobId,
    });
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
    options?: { endpointIds?: string[]; promptIds?: string[] },
  ) {
    await this.requireTransaction(projectId, transactionId);
    const endpointIds = options?.endpointIds;
    const baseWhere = { projectId, transactionId };
    const endpoints = await this.endpointRepo.find({
      where: endpointIds?.length
        ? { projectId, id: In(endpointIds), transactionId }
        : baseWhere,
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
    if (options?.promptIds !== undefined) {
      doc.metadata = {
        ...doc.metadata,
        promptIds: options.promptIds,
      };
      await this.apiDocRepo.save(doc);
    }
  }

  private async generateCasesInternal(
    projectId: string,
    transactionId: string,
    options?: {
      endpointIds?: string[];
      promptIds?: string[];
      version?: number;
      jobId?: string;
    },
  ) {
    const transaction = await this.requireTransaction(projectId, transactionId);
    const endpointIds = options?.endpointIds;
    const baseWhere = { projectId, transactionId };
    const endpoints = await this.endpointRepo.find({
      where: endpointIds?.length
        ? { projectId, id: In(endpointIds), transactionId }
        : baseWhere,
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

    const promptIds = options?.promptIds ?? doc.metadata?.promptIds ?? [];
    const scenarioPrompts = await this.resolveScenarioPrompts(promptIds);
    const structuredDoc =
      doc.tempStructuredMarkdown?.trim() ||
      doc.structuredMarkdown?.trim() ||
      doc.extractedRawText?.trim() ||
      "";

    const created: ApiTestCaseEntity[] = [];
    for (const endpoint of endpoints) {
      if (endpoint.transactionId !== transactionId) {
        throw new BadRequestException("接口端点不属于当前交易码");
      }
      if (!this.aiWorkflow.canGenerateApiCases()) {
        throw new BadRequestException(
          "AI Chat 或 at-case-skill 未配置，请检查 AI_CHAT_URL 与 AT_CASE_SKILL_URL",
        );
      }
      if (options?.jobId) {
        const job = await this.generateJobRepo.findOne({
          where: { id: options.jobId },
        });
        if (job?.status === "cancelled") {
          this.logger.log(`案例生成已取消，跳过端点 ${endpoint.id} 的案例保存`);
          continue;
        }
      }

      let seq = await maxCaseNoSuffix(
        this.caseRepo,
        projectId,
        endpoint.id,
        transaction.code,
      );

      const scenarioList: ScenarioPromptInfo[] = scenarioPrompts.length
        ? scenarioPrompts
        : [
            {
              promptId: undefined,
              scenarioName: undefined,
              promptName: undefined,
              content: "",
            },
          ];

      for (const scenarioPrompt of scenarioList) {
        if (options?.jobId) {
          const job = await this.generateJobRepo.findOne({
            where: { id: options.jobId },
          });
          if (job?.status === "cancelled") {
            this.logger.log(
              `案例生成已取消，跳过端点 ${endpoint.id} 的场景 ${scenarioPrompt.scenarioName || "（无场景）"}`,
            );
            break;
          }
        }

        const payloads = await generateCasesWithPlan(
          this.aiWorkflow,
          {
            transactionCode: transaction.code,
            structuredDoc,
            endpoint,
            scenarioPrompt,
            smpData: doc.smpData,
          },
          this.logger,
        );

        if (options?.jobId) {
          const job = await this.generateJobRepo.findOne({
            where: { id: options.jobId },
          });
          if (job?.status === "cancelled") {
            this.logger.log(
              `案例生成已取消，丢弃端点 ${endpoint.id} 场景 ${scenarioPrompt.scenarioName || "（无场景）"} 的 ${payloads.length} 条生成结果`,
            );
            break;
          }
        }

        for (const payload of payloads) {
          seq += 1;
          payload.caseNo = formatCaseNo(transaction.code, seq);
          const entity = this.caseRepo.create({
            projectId,
            endpointId: endpoint.id,
            ...payload,
            transactionCode: payload.transactionCode ?? transaction.code,
            owner: payload.owner?.trim() || RequestContext.getUserName(),
            metadata: {
              ...payload.metadata,
              source: "ai",
              promptIds: [...promptIds],
              generateVersion: options?.version,
            },
            ...auditFieldsForCreate(),
          });
          created.push(await this.caseRepo.save(entity));
        }
      }
    }
    return {
      count: created.length,
      cases: created.map(toPublicApiCase),
    };
  }

  private async resolveScenarioPrompts(
    promptIds: string[],
  ): Promise<ScenarioPromptInfo[]> {
    if (!promptIds.length) {
      return [];
    }
    const prompts = await this.promptRepo.find({
      where: scopedWhereWithSystem({ id: In(promptIds) }),
      relations: ["scenario"],
    });
    const promptMap = new Map(prompts.map((prompt) => [prompt.id, prompt]));
    return promptIds
      .map((id) => {
        const prompt = promptMap.get(id);
        const content = prompt?.content?.trim();
        if (!content) {
          return null;
        }
        const scenarioName = prompt?.scenario?.name?.trim();
        const promptName = prompt?.name?.trim();
        const title =
          scenarioName && promptName
            ? `【${scenarioName} / ${promptName}】`
            : promptName
              ? `【${promptName}】`
              : "";
        return {
          promptId: id,
          scenarioName: scenarioName || undefined,
          promptName: promptName || undefined,
          content: title ? `${title}\n${content}` : content,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
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
