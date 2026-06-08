import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import type { ApiTestCasePayload } from "@case-forge/shared";
import { auditFieldsForUpdate } from "../../../common/audit/request-context";
import { scopedWhere } from "../../../common/audit/user-scope";
import { ApiEndpointEntity } from "../entity/api-endpoint.entity";
import { ApiTestCaseEntity } from "../entity/api-test-case.entity";
import { SaveApiCaseDto } from "../dto/save-api-case.dto";
import { buildFallbackCasesForEndpoint } from "../util/case-fallback.generator";

@Injectable()
export class ApiCaseService {
  constructor(
    @InjectRepository(ApiTestCaseEntity)
    private readonly caseRepo: Repository<ApiTestCaseEntity>,
    @InjectRepository(ApiEndpointEntity)
    private readonly endpointRepo: Repository<ApiEndpointEntity>,
  ) {}

  listCases(projectId: string) {
    return this.caseRepo.find({
      where: scopedWhere({ projectId }),
      relations: ["endpoint"],
      order: { updatedAt: "DESC" },
    });
  }

  async createCase(projectId: string, payload: SaveApiCaseDto) {
    this.validateCasePayload(payload);
    const endpoint = await this.requireEndpoint(projectId, payload.endpointId);
    const entity = this.caseRepo.create({
      projectId,
      endpointId: endpoint.id,
      title: payload.title,
      description: payload.description ?? "",
      priority: payload.priority ?? "P1",
      polarity: payload.polarity ?? "positive",
      status: payload.status ?? "ready",
      enabled: payload.enabled ?? true,
      preconditions: payload.preconditions ?? [],
      request: payload.request,
      expected: payload.expected,
      metadata: { source: "manual" },
      ...auditFieldsForUpdate(),
    });
    return this.caseRepo.save(entity);
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
    existing.description = payload.description ?? "";
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
    };
    return this.caseRepo.save({ ...existing, ...auditFieldsForUpdate() });
  }

  async deleteCase(projectId: string, caseId: string) {
    await this.caseRepo.delete(scopedWhere({ projectId, id: caseId }));
    return { ok: true };
  }

  async generateCases(projectId: string, endpointIds?: string[]) {
    const endpoints = await this.endpointRepo.find({
      where: endpointIds?.length
        ? { projectId, id: In(endpointIds) }
        : { projectId },
      order: { sortOrder: "ASC" },
    });
    if (!endpoints.length) {
      throw new BadRequestException("没有可生成案例的接口端点");
    }

    const created: ApiTestCaseEntity[] = [];
    for (const endpoint of endpoints) {
      const payloads = buildFallbackCasesForEndpoint(endpoint);
      for (const payload of payloads) {
        const entity = this.caseRepo.create({
          projectId,
          endpointId: endpoint.id,
          ...payload,
          ...auditFieldsForUpdate(),
        });
        created.push(await this.caseRepo.save(entity));
      }
    }
    return { count: created.length, cases: created };
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

  private async requireEndpoint(projectId: string, endpointId?: string) {
    if (!endpointId) {
      throw new BadRequestException("请选择绑定的接口端点");
    }
    const endpoint = await this.endpointRepo.findOne({
      where: { projectId, id: endpointId },
    });
    if (!endpoint) {
      throw new NotFoundException("接口端点不存在");
    }
    return endpoint;
  }
}
