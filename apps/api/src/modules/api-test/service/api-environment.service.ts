import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  auditFieldsForCreate,
  auditFieldsForUpdate,
} from "../../../common/audit/request-context";
import { scopedWhere } from "../../../common/audit/user-scope";
import { ApiTestEnvironmentEntity } from "../entity/api-test-environment.entity";
import { ApiTestEnvironmentServiceEntity } from "../entity/api-test-environment-service.entity";
import { SaveApiEnvironmentDto } from "../dto/save-environment.dto";
import { SaveApiEnvironmentServiceDto } from "../dto/execution-platform.dto";
import {
  decryptSecrets,
  encryptSecrets,
  maskSecret,
} from "../util/secret-crypto.util";

@Injectable()
export class ApiEnvironmentService {
  constructor(
    @InjectRepository(ApiTestEnvironmentEntity)
    private readonly envRepo: Repository<ApiTestEnvironmentEntity>,
    @InjectRepository(ApiTestEnvironmentServiceEntity)
    private readonly serviceRepo: Repository<ApiTestEnvironmentServiceEntity>,
  ) {}

  async listEnvironments(projectId: string) {
    const rows = await this.envRepo.find({
      where: scopedWhere({ projectId }),
      order: { isDefault: "DESC", updatedAt: "DESC" },
    });
    return rows.map((row) => this.toPublic(row));
  }

  async createEnvironment(projectId: string, payload: SaveApiEnvironmentDto) {
    if (payload.isDefault) {
      await this.clearDefault(projectId);
    }
    const entity = this.envRepo.create({
      projectId,
      name: payload.name,
      baseUrl: payload.baseUrl.replace(/\/$/, ""),
      headers: payload.headers ?? {},
      variables: payload.variables ?? {},
      secretsEncrypted: payload.token
        ? encryptSecrets({ token: payload.token })
        : undefined,
      isDefault: payload.isDefault ?? false,
      enabled: payload.enabled ?? true,
      ...auditFieldsForUpdate(),
    });
    const saved = await this.envRepo.save(entity);
    if (!(await this.hasDefault(projectId))) {
      saved.isDefault = true;
      await this.envRepo.save(saved);
    }
    return this.toPublic(saved);
  }

  async updateEnvironment(
    projectId: string,
    environmentId: string,
    payload: SaveApiEnvironmentDto,
  ) {
    const existing = await this.requireEnv(projectId, environmentId);
    if (payload.isDefault) {
      await this.clearDefault(projectId);
    }
    existing.name = payload.name;
    existing.baseUrl = payload.baseUrl.replace(/\/$/, "");
    existing.headers = payload.headers ?? {};
    existing.variables = payload.variables ?? {};
    if (payload.token) {
      existing.secretsEncrypted = encryptSecrets({ token: payload.token });
    }
    if (payload.isDefault !== undefined) existing.isDefault = payload.isDefault;
    if (payload.enabled !== undefined) existing.enabled = payload.enabled;
    const saved = await this.envRepo.save({
      ...existing,
      ...auditFieldsForUpdate(),
    });
    return this.toPublic(saved);
  }

  async deleteEnvironment(projectId: string, environmentId: string) {
    await this.envRepo.delete(scopedWhere({ projectId, id: environmentId }));
    return { ok: true };
  }

  async getRuntimeEnvironment(
    projectId: string,
    environmentId: string,
    environmentServiceId?: string,
  ) {
    const row = await this.requireEnv(projectId, environmentId);
    const secrets = decryptSecrets(row.secretsEncrypted);
    let baseUrl = row.baseUrl.replace(/\/$/, "");
    let headers = row.headers ?? {};
    let variables = row.variables ?? {};

    if (environmentServiceId) {
      const service = await this.serviceRepo.findOne({
        where: scopedWhere({
          projectId,
          environmentId,
          id: environmentServiceId,
          enabled: true,
        }),
      });
      if (!service) {
        throw new NotFoundException("环境服务不存在或已禁用");
      }
      if (service.baseUrl?.trim()) {
        baseUrl = service.baseUrl.replace(/\/$/, "");
      } else if (service.pathPrefix?.trim()) {
        const prefix = service.pathPrefix.startsWith("/")
          ? service.pathPrefix
          : `/${service.pathPrefix}`;
        baseUrl = `${baseUrl}${prefix}`.replace(/\/$/, "");
      }
      headers = { ...headers, ...(service.headers ?? {}) };
      variables = { ...variables, ...(service.variables ?? {}) };
    }

    return {
      ...row,
      baseUrl,
      secrets,
      headers,
      variables,
      environmentServiceId,
    };
  }

  async listEnvironmentServices(projectId: string, environmentId: string) {
    await this.requireEnv(projectId, environmentId);
    return this.serviceRepo.find({
      where: scopedWhere({ projectId, environmentId }),
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
  }

  async createEnvironmentService(
    projectId: string,
    environmentId: string,
    payload: SaveApiEnvironmentServiceDto,
  ) {
    await this.requireEnv(projectId, environmentId);
    const count = await this.serviceRepo.count({
      where: scopedWhere({ projectId, environmentId }),
    });
    const entity = this.serviceRepo.create({
      projectId,
      environmentId,
      name: payload.name.trim(),
      baseUrl: payload.baseUrl?.replace(/\/$/, ""),
      pathPrefix: payload.pathPrefix?.trim(),
      headers: payload.headers ?? {},
      variables: payload.variables ?? {},
      sortOrder: count,
      enabled: payload.enabled ?? true,
      ...auditFieldsForCreate(),
    });
    return this.serviceRepo.save(entity);
  }

  async updateEnvironmentService(
    projectId: string,
    environmentId: string,
    serviceId: string,
    payload: SaveApiEnvironmentServiceDto,
  ) {
    const existing = await this.requireService(projectId, environmentId, serviceId);
    existing.name = payload.name.trim();
    existing.baseUrl = payload.baseUrl?.replace(/\/$/, "");
    existing.pathPrefix = payload.pathPrefix?.trim();
    existing.headers = payload.headers ?? {};
    existing.variables = payload.variables ?? {};
    if (payload.enabled !== undefined) existing.enabled = payload.enabled;
    return this.serviceRepo.save({ ...existing, ...auditFieldsForUpdate() });
  }

  async deleteEnvironmentService(
    projectId: string,
    environmentId: string,
    serviceId: string,
  ) {
    await this.requireService(projectId, environmentId, serviceId);
    await this.serviceRepo.delete({ id: serviceId });
    return { ok: true };
  }

  private async requireService(
    projectId: string,
    environmentId: string,
    serviceId: string,
  ) {
    const row = await this.serviceRepo.findOne({
      where: scopedWhere({
        projectId,
        environmentId,
        id: serviceId,
      }),
    });
    if (!row) {
      throw new NotFoundException("环境服务不存在");
    }
    return row;
  }

  private async requireEnv(projectId: string, environmentId: string) {
    const row = await this.envRepo.findOne({
      where: scopedWhere({ projectId, id: environmentId, enabled: true }),
    });
    if (!row) {
      throw new NotFoundException("执行环境不存在或已禁用");
    }
    return row;
  }

  private async clearDefault(projectId: string) {
    await this.envRepo.update(scopedWhere({ projectId }), { isDefault: false });
  }

  private async hasDefault(projectId: string) {
    const count = await this.envRepo.count({
      where: scopedWhere({ projectId, isDefault: true }),
    });
    return count > 0;
  }

  private toPublic(row: ApiTestEnvironmentEntity) {
    const secrets = decryptSecrets(row.secretsEncrypted);
    const token = secrets.token ?? "";
    return {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      baseUrl: row.baseUrl,
      headers: row.headers ?? {},
      variables: row.variables ?? {},
      tokenMasked: token ? maskSecret(token) : "",
      hasToken: Boolean(token),
      isDefault: row.isDefault,
      enabled: row.enabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
