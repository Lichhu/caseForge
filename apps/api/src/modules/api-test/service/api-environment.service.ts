import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  auditFieldsForCreate,
  auditFieldsForUpdate,
} from "../../../common/audit/request-context";
import { ApiTestEnvironmentEntity } from "../entity/api-test-environment.entity";
import { ApiTestEnvironmentServiceEntity } from "../entity/api-test-environment-service.entity";
import { SaveApiEnvironmentDto } from "../dto/save-environment.dto";
import { SaveApiEnvironmentServiceDto } from "../dto/execution-platform.dto";
import {
  applyParsedServerAddress,
  parseServerAddress,
} from "@case-forge/shared";
import {
  decryptSecrets,
  encryptSecrets,
  maskSecret,
} from "../util/secret-crypto.util";
import { toPublicApiEnvironmentService } from "../../../common/http/public-response.util";

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
      scope: payload.scope ?? "system",
      baseUrl: (payload.baseUrl ?? "").replace(/\/$/, ""),
      headers: payload.headers ?? {},
      variables: payload.variables ?? {},
      secretsEncrypted: payload.token
        ? encryptSecrets({ token: payload.token })
        : undefined,
      isDefault: payload.isDefault ?? false,
      enabled: payload.enabled ?? true,
      ...auditFieldsForCreate(),
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
    if (payload.scope !== undefined) existing.scope = payload.scope;
    if (payload.baseUrl !== undefined) {
      existing.baseUrl = payload.baseUrl.replace(/\/$/, "");
    }
    if (payload.headers !== undefined) existing.headers = payload.headers;
    if (payload.variables !== undefined) existing.variables = payload.variables;
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
    await this.envRepo.delete({ id: environmentId });
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
    const services = await this.serviceRepo.find({
      where: { environmentId, enabled: true },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });

    if (environmentServiceId) {
      const service = await this.serviceRepo.findOne({
        where: { environmentId, id: environmentServiceId, enabled: true },
      });
      if (!service) {
        throw new NotFoundException("环境服务不存在或已禁用");
      }
      const resolved = resolveServiceRuntimeTarget(service);
      if (resolved.baseUrl) {
        baseUrl = resolved.baseUrl;
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
      services: services.map((service) => ({
        ...service,
        ...resolveServiceRuntimeTarget(service),
        headers: { ...headers, ...(service.headers ?? {}) },
        variables: { ...variables, ...(service.variables ?? {}) },
      })),
    };
  }

  async listEnvironmentServices(projectId: string, environmentId: string) {
    await this.requireEnv(projectId, environmentId);
    const rows = await this.serviceRepo.find({
      where: { environmentId },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    return rows.map((row) => toPublicApiEnvironmentService(row));
  }

  async createEnvironmentService(
    projectId: string,
    environmentId: string,
    payload: SaveApiEnvironmentServiceDto,
  ) {
    await this.requireEnv(projectId, environmentId);
    const count = await this.serviceRepo.count({
      where: { environmentId },
    });
    const entity = this.serviceRepo.create({
      projectId,
      environmentId,
      name: payload.name.trim(),
      jdbcUrl: payload.jdbcUrl?.trim() || undefined,
      remoteConnection: payload.remoteConnection?.trim() || undefined,
      objectStorage: payload.objectStorage?.trim() || undefined,
      remark: payload.remark?.trim() || undefined,
      payloadFormat: payload.payloadFormat,
      encoding: payload.encoding?.trim(),
      framing: payload.framing,
      headers: payload.headers ?? {},
      variables: payload.variables ?? {},
      sortOrder: count,
      enabled: payload.enabled ?? true,
      transport: "http",
      ...auditFieldsForCreate(),
    });
    this.applyServiceConnectionFields(entity, payload);
    return toPublicApiEnvironmentService(await this.serviceRepo.save(entity));
  }

  async updateEnvironmentService(
    projectId: string,
    environmentId: string,
    serviceId: string,
    payload: SaveApiEnvironmentServiceDto,
  ) {
    const existing = await this.requireService(
      projectId,
      environmentId,
      serviceId,
    );
    existing.name = payload.name.trim();
    existing.jdbcUrl = payload.jdbcUrl?.trim() || undefined;
    existing.remoteConnection = payload.remoteConnection?.trim() || undefined;
    existing.objectStorage = payload.objectStorage?.trim() || undefined;
    existing.remark = payload.remark?.trim() || undefined;
    existing.payloadFormat = payload.payloadFormat;
    existing.encoding = payload.encoding?.trim();
    existing.framing = payload.framing;
    if (payload.headers !== undefined) existing.headers = payload.headers;
    if (payload.variables !== undefined) existing.variables = payload.variables;
    if (payload.enabled !== undefined) existing.enabled = payload.enabled;
    this.applyServiceConnectionFields(existing, payload);
    return toPublicApiEnvironmentService(
      await this.serviceRepo.save({ ...existing, ...auditFieldsForUpdate() }),
    );
  }

  async reorderEnvironmentService(
    projectId: string,
    environmentId: string,
    serviceId: string,
    direction: "up" | "down" | "top",
  ) {
    await this.requireEnv(projectId, environmentId);
    const rows = await this.serviceRepo.find({
      where: { environmentId },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    const index = rows.findIndex((row) => row.id === serviceId);
    if (index < 0) {
      throw new NotFoundException("环境服务不存在");
    }

    if (direction === "top" && index > 0) {
      const [target] = rows.splice(index, 1);
      rows.unshift(target);
    } else if (direction === "up" && index > 0) {
      [rows[index - 1], rows[index]] = [rows[index], rows[index - 1]];
    } else if (direction === "down" && index < rows.length - 1) {
      [rows[index], rows[index + 1]] = [rows[index + 1], rows[index]];
    }

    for (let i = 0; i < rows.length; i += 1) {
      rows[i].sortOrder = i;
      await this.serviceRepo.save({ ...rows[i], ...auditFieldsForUpdate() });
    }
    return { ok: true };
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
    await this.requireEnv(projectId, environmentId);
    const row = await this.serviceRepo.findOne({
      where: { environmentId, id: serviceId },
    });
    if (!row) {
      throw new NotFoundException("环境服务不存在");
    }
    return row;
  }

  private async requireEnv(projectId: string, environmentId: string) {
    const row = await this.envRepo.findOne({
      where: { id: environmentId, enabled: true },
    });
    if (!row) {
      throw new NotFoundException("执行环境不存在或已禁用");
    }
    return row;
  }

  private async clearDefault(projectId: string) {
    await this.envRepo.update({}, { isDefault: false });
  }

  private async hasDefault(projectId: string) {
    const count = await this.envRepo.count({
      where: { isDefault: true },
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
      scope: row.scope ?? "system",
      baseUrl: row.baseUrl,
      headers: row.headers ?? {},
      variables: row.variables ?? {},
      tokenMasked: token ? maskSecret(token) : "",
      hasToken: Boolean(token),
      isDefault: row.isDefault,
      enabled: row.enabled,
    };
  }

  private applyServiceConnectionFields(
    entity: ApiTestEnvironmentServiceEntity,
    payload: SaveApiEnvironmentServiceDto,
  ) {
    const address =
      payload.serverAddress?.trim() ||
      (payload.transport === "tcp" && payload.host && payload.port
        ? `socket2://${payload.host}:${payload.port}`
        : payload.baseUrl?.trim() || "");
    if (address) {
      applyParsedServerAddress(entity, address);
      return;
    }
    if (payload.transport) entity.transport = payload.transport;
    if (payload.baseUrl !== undefined) {
      entity.baseUrl = payload.baseUrl.replace(/\/$/, "");
    }
    if (payload.pathPrefix !== undefined) {
      entity.pathPrefix = payload.pathPrefix?.trim();
    }
    if (payload.host !== undefined) entity.host = payload.host?.trim();
    if (payload.port !== undefined) entity.port = payload.port;
  }
}

function resolveServiceRuntimeTarget(service: ApiTestEnvironmentServiceEntity) {
  const address = service.serverAddress?.trim();
  if (address) {
    const parsed = parseServerAddress(address);
    if (parsed.transport === "http" && parsed.baseUrl) {
      return {
        transport: "http" as const,
        baseUrl: parsed.baseUrl.replace(/\/$/, ""),
        host: undefined,
        port: undefined,
      };
    }
    if (parsed.transport === "tcp" && parsed.host && parsed.port) {
      return {
        transport: "tcp" as const,
        baseUrl: undefined,
        host: parsed.host,
        port: parsed.port,
      };
    }
  }
  if (service.transport === "tcp" && service.host && service.port) {
    return {
      transport: "tcp" as const,
      baseUrl: undefined,
      host: service.host,
      port: service.port,
    };
  }
  let baseUrl = service.baseUrl?.replace(/\/$/, "");
  if (service.pathPrefix?.trim() && baseUrl) {
    const prefix = service.pathPrefix.startsWith("/")
      ? service.pathPrefix
      : `/${service.pathPrefix}`;
    baseUrl = `${baseUrl}${prefix}`.replace(/\/$/, "");
  }
  return {
    transport: (service.transport ?? "http") as "http" | "tcp",
    baseUrl,
    host: service.host,
    port: service.port,
  };
}
