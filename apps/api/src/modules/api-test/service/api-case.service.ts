import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { AiWorkflowService } from "../../../common/ai-workflow/service/ai-workflow.service";
import {
  auditFieldsForCreate,
  auditFieldsForUpdate,
  RequestContext,
} from "../../../common/audit/request-context";
import { scopedWhere, scopedWhereWithSystem } from "../../../common/audit/user-scope";
import { PromptEntity } from "@scenario/entity/prompt.entity";
import { ApiDocEntity } from "../entity/api-doc.entity";
import { ApiEndpointEntity } from "../entity/api-endpoint.entity";
import { ApiTestCaseEntity } from "../entity/api-test-case.entity";
import { ApiTransactionEntity } from "../entity/api-transaction.entity";
import { SaveApiCaseDto } from "../dto/save-api-case.dto";
import { ListApiCasesDto } from "../dto/list-api-cases.dto";
import {
  generateCasesWithAi,
  nextCaseNo,
} from "../util/api-case-ai.util";
import { buildFallbackCasesForEndpoint } from "../util/case-fallback.generator";
import { toPublicApiCase } from "../../../common/http/public-response.util";
import {
  DEFAULT_CASE_FORGE_PAGE_SIZE,
  normalizeCaseForgePageSize,
} from "@case-forge/shared";

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
    @InjectRepository(PromptEntity)
    private readonly promptRepo: Repository<PromptEntity>,
    private readonly aiWorkflow: AiWorkflowService,
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
      .andWhere("e.transactionId = :transactionId", { transactionId })
      .orderBy("c.updatedAt", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [rows, count] = await qb.getManyAndCount();
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

  async updateCase(projectId: string, caseId: string, payload: SaveApiCaseDto) {
    this.validateCasePayload(payload);
    const existing = await this.caseRepo.findOne({
      where: scopedWhere({ projectId, id: caseId }),
    });
    if (!existing) {
      throw new NotFoundException("案例不存在");
    }
    if (payload.endpointId && payload.endpointId !== existing.endpointId) {
      await this.requireEndpoint(projectId, payload.endpointId);
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
          : existing.metadata?.promptIds ?? [],
    };
    const saved = await this.caseRepo.save({ ...existing, ...auditFieldsForUpdate() });
    return toPublicApiCase(
      (await this.caseRepo.findOne({
        where: scopedWhere({ projectId, id: saved.id }),
        relations: ["endpoint"],
      })) ?? saved,
    );
  }

  async deleteCase(projectId: string, caseId: string) {
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
    if (options?.promptIds !== undefined) {
      doc.metadata = {
        ...doc.metadata,
        promptIds: options.promptIds,
      };
      await this.apiDocRepo.save(doc);
    }
    const promptIds = doc.metadata?.promptIds ?? [];
    const scenarioPromptText = await this.resolveScenarioPromptText(promptIds);
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
      let payloads;
      try {
        if (structuredDoc && this.aiWorkflow.canGenerateJsonCases()) {
          payloads = await generateCasesWithAi(this.aiWorkflow, {
            transactionCode: transaction.code,
            structuredDoc,
            endpoint,
            scenarioPromptText,
          });
        } else {
          throw new Error("fallback");
        }
      } catch (error) {
        this.logger.warn(
          `AI 案例生成失败，使用模板兜底（${endpoint.name}）：${error instanceof Error ? error.message : error}`,
        );
        payloads = buildFallbackCasesForEndpoint(endpoint, transaction.code);
      }

      for (const payload of payloads) {
        const entity = this.caseRepo.create({
          projectId,
          endpointId: endpoint.id,
          ...payload,
          transactionCode: payload.transactionCode ?? transaction.code,
          owner: payload.owner?.trim() || RequestContext.getUserName(),
          metadata: {
            source: "ai",
            promptIds: [...promptIds],
          },
          ...auditFieldsForCreate(),
        });
        created.push(await this.caseRepo.save(entity));
      }
    }
    return {
      count: created.length,
      cases: created.map(toPublicApiCase),
    };
  }

  private async resolveScenarioPromptText(promptIds: string[]) {
    if (!promptIds.length) {
      return "";
    }
    const prompts = await this.promptRepo.find({
      where: scopedWhereWithSystem({ id: In(promptIds) }),
    });
    const promptMap = new Map(prompts.map((prompt) => [prompt.id, prompt]));
    return promptIds
      .map((id) => promptMap.get(id)?.content?.trim())
      .filter((content): content is string => Boolean(content))
      .join("\n\n");
  }

  private validateCasePayload(payload: SaveApiCaseDto) {
    if (!payload.request?.method || !payload.request?.path) {
      throw new BadRequestException("案例请求必须包含 method 与 path");
    }
    if (
      payload.expected?.statusCode === undefined ||
      payload.expected?.statusCode === null
    ) {
      throw new BadRequestException("案例必须配置预期状态码");
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

