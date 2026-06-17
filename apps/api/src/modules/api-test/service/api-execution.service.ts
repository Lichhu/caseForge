import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import iconv from "iconv-lite";
import { Socket } from "node:net";
import { In, Repository } from "typeorm";
import { scopedWhere } from "../../../common/audit/user-scope";
import { auditFieldsForUpdate } from "../../../common/audit/request-context";
import { ApiTestCaseEntity } from "../entity/api-test-case.entity";
import { ApiTestRunEntity } from "../entity/api-test-run.entity";
import { ApiTestRunItemEntity } from "../entity/api-test-run-item.entity";
import { ApiEnvironmentService } from "./api-environment.service";
import { ApiExecutionSetService } from "./api-execution-set.service";
import {
  buildRuntimeVariables,
  substituteDeep,
} from "../util/variable-substitute.util";
import { isAllPassed, runAssertions } from "../util/assertion-runner.util";
import type { ApiCaseRequest, ApiRunItemStatus } from "@case-forge/shared";
import { toPublicApiRun } from "../../../common/http/public-response.util";

const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 10;
const DEFAULT_TIMEOUT_MS = 30_000;

type RuntimeService = {
  id: string;
  name: string;
  transport?: "http" | "tcp";
  payloadFormat?: string;
  baseUrl?: string;
  pathPrefix?: string;
  host?: string;
  port?: number;
  encoding?: string;
  framing?: { type: "length-prefix"; width: number; encoding?: string };
  headers?: Record<string, string>;
  variables?: Record<string, string>;
};

type RuntimeEnvironment = {
  id: string;
  baseUrl: string;
  headers: Record<string, string>;
  variables: Record<string, string>;
  secrets: Record<string, string>;
  environmentServiceId?: string;
  services?: RuntimeService[];
};

@Injectable()
export class ApiExecutionService {
  constructor(
    @InjectRepository(ApiTestCaseEntity)
    private readonly caseRepo: Repository<ApiTestCaseEntity>,
    @InjectRepository(ApiTestRunEntity)
    private readonly runRepo: Repository<ApiTestRunEntity>,
    @InjectRepository(ApiTestRunItemEntity)
    private readonly runItemRepo: Repository<ApiTestRunItemEntity>,
    private readonly environmentService: ApiEnvironmentService,
    private readonly executionSetService: ApiExecutionSetService,
  ) {}

  async runCases(input: {
    projectId: string;
    caseIds: string[];
    environmentId: string;
    environmentServiceId?: string;
    executionSetId?: string;
    transactionId?: string;
    concurrency?: number;
    encoding?: string;
  }) {
    if (!input.caseIds.length) {
      throw new BadRequestException("请至少选择一条案例");
    }
    const concurrency = Math.min(
      MAX_CONCURRENCY,
      Math.max(1, input.concurrency ?? DEFAULT_CONCURRENCY),
    );
    const env = (await this.environmentService.getRuntimeEnvironment(
      input.projectId,
      input.environmentId,
      input.environmentServiceId,
    )) as RuntimeEnvironment;
    const cases = await this.caseRepo.find({
      where: {
        ...scopedWhere({ projectId: input.projectId }),
        id: In(input.caseIds),
        enabled: true,
      },
      relations: ["endpoint"],
    });
    if (!cases.length) {
      throw new BadRequestException("未找到可执行的启用案例");
    }

    const run = await this.runRepo.save(
      this.runRepo.create({
        projectId: input.projectId,
        environmentId: env.id,
        environmentServiceId: input.environmentServiceId,
        executionSetId: input.executionSetId,
        transactionId: input.transactionId,
        status: "running",
        totalCount: cases.length,
        concurrency,
        ...auditFieldsForUpdate(),
      }),
    );

    const vars = buildRuntimeVariables(env.variables, env.secrets);
    const items: ApiTestRunItemEntity[] = [];
    let passed = 0;
    let failed = 0;
    let error = 0;

    await this.runWithConcurrency(cases, concurrency, async (testCase) => {
      const item = await this.executeSingleCase({
        runId: run.id,
        testCase,
        env,
        vars,
        encoding: input.encoding,
      });
      items.push(item);
      if (item.status === "passed") passed += 1;
      else if (item.status === "failed") failed += 1;
      else error += 1;
    });

    await this.runItemRepo.save(items);
    run.status = "completed";
    run.passedCount = passed;
    run.failedCount = failed;
    run.errorCount = error;
    run.finishedAt = new Date();
    await this.runRepo.save(run);

    return this.getRunDetail(input.projectId, run.id);
  }

  async runExecutionSet(input: {
    projectId: string;
    transactionId: string;
    executionSetId: string;
    environmentId: string;
    environmentServiceId?: string;
    concurrency?: number;
    encoding?: string;
  }) {
    await this.executionSetService.requireSet(
      input.projectId,
      input.transactionId,
      input.executionSetId,
    );
    const caseIds = await this.executionSetService.getCaseIds(
      input.executionSetId,
    );
    if (!caseIds.length) {
      throw new BadRequestException("执行集内暂无案例");
    }
    const detail = await this.runCases({
      projectId: input.projectId,
      caseIds,
      environmentId: input.environmentId,
      environmentServiceId: input.environmentServiceId,
      executionSetId: input.executionSetId,
      transactionId: input.transactionId,
      concurrency: input.concurrency,
      encoding: input.encoding,
    });
    await this.executionSetService.updateLastRun(input.executionSetId, {
      runId: detail.id,
      status: detail.status,
      passedCount: detail.passedCount,
      totalCount: detail.totalCount,
    });
    return detail;
  }

  async listRuns(projectId: string, executionSetId?: string) {
    const runs = await this.runRepo.find({
      where: scopedWhere({
        projectId,
        ...(executionSetId ? { executionSetId } : {}),
      }),
      order: { createdAt: "DESC" },
      take: 50,
    });
    return runs.map((run) => toPublicApiRun(run));
  }

  async getRunDetail(projectId: string, runId: string) {
    const run = await this.runRepo.findOne({
      where: scopedWhere({ projectId, id: runId }),
    });
    if (!run) {
      throw new BadRequestException("执行记录不存在");
    }
    const items = await this.runItemRepo.find({
      where: { runId: run.id },
      order: { createdAt: "ASC" },
    });
    return toPublicApiRun(run, items);
  }

  private async executeSingleCase(input: {
    runId: string;
    testCase: ApiTestCaseEntity;
    env: RuntimeEnvironment;
    vars: Record<string, string>;
    encoding?: string;
  }) {
    const request = substituteDeep(
      input.testCase.request,
      input.vars,
    ) as ApiCaseRequest;
    const transport = request.transport ?? (request.framing ? "tcp" : "http");
    if (transport === "tcp") {
      return this.executeTcpCase({ ...input, request });
    }
    return this.executeHttpCase({ ...input, request });
  }

  private async executeHttpCase(input: {
    runId: string;
    testCase: ApiTestCaseEntity;
    env: RuntimeEnvironment;
    vars: Record<string, string>;
    request: ApiCaseRequest;
    encoding?: string;
  }) {
    const service = this.resolveRuntimeService(input.env, "http");
    const baseUrl = this.resolveHttpBaseUrl(input.env, service);
    const path = substituteVariablesPath(input.request.path, input.vars);
    const url = new URL(path.replace(/^\//, ""), `${baseUrl}/`);
    if (input.request.query) {
      for (const [key, value] of Object.entries(input.request.query)) {
        url.searchParams.set(key, String(value));
      }
    }
    const headers = applyTransportEncoding(
      {
        ...input.env.headers,
        ...(service?.headers ?? {}),
        ...(input.request.headers ?? {}),
      },
      input.encoding,
    );
    const requestSnapshot = {
      method: input.request.method,
      url: url.toString(),
      headers: redactHeaders(headers),
      body: input.request.body,
      encoding:
        input.encoding ??
        input.request.encoding ??
        input.request.framing?.encoding,
      transport: input.request.transport ?? "http",
      service: service?.name,
    };

    const started = Date.now();
    try {
      const response = await fetch(url.toString(), {
        method: input.request.method,
        headers,
        body: buildRequestBody(input.request),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
      const durationMs = Date.now() - started;
      const text = await response.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      const responseSnapshot = {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: truncateBody(body),
      };
      const assertions = runAssertions({
        expected: input.testCase.expected,
        statusCode: response.status,
        body,
        durationMs,
      });
      const status: ApiRunItemStatus = isAllPassed(assertions)
        ? "passed"
        : "failed";
      return this.runItemRepo.create({
        runId: input.runId,
        caseId: input.testCase.id,
        caseTitle: input.testCase.title,
        status,
        durationMs,
        requestSnapshot,
        responseSnapshot,
        assertions,
      });
    } catch (err) {
      const durationMs = Date.now() - started;
      return this.runItemRepo.create({
        runId: input.runId,
        caseId: input.testCase.id,
        caseTitle: input.testCase.title,
        status: "error",
        durationMs,
        requestSnapshot,
        responseSnapshot: {
          status: 0,
          headers: {},
          body: null,
          error: err instanceof Error ? err.message : "请求失败",
        },
        assertions: [
          {
            name: "请求执行",
            passed: false,
            expected: "成功发起 HTTP 请求",
            actual: err instanceof Error ? err.message : err,
          },
        ],
      });
    }
  }

  private async executeTcpCase(input: {
    runId: string;
    testCase: ApiTestCaseEntity;
    env: RuntimeEnvironment;
    vars: Record<string, string>;
    request: ApiCaseRequest;
    encoding?: string;
  }) {
    const service = this.resolveRuntimeService(input.env, "tcp");
    const target = this.resolveTcpTarget(input.env, service);
    const encoding =
      input.encoding ??
      input.request.encoding ??
      service?.encoding ??
      input.request.framing?.encoding ??
      "GBK";
    const framing = input.request.framing ?? service?.framing;
    const payload = buildTcpPayload(input.request, encoding, framing);
    const requestSnapshot = {
      method: input.request.method,
      target: `${target.host}:${target.port}`,
      body: input.request.body,
      encoding,
      framing,
      transport: "tcp",
      service: service?.name,
    };
    const started = Date.now();
    try {
      const responseText = await sendTcpPayload(
        target.host,
        target.port,
        payload,
        encoding,
      );
      const durationMs = Date.now() - started;
      const responseSnapshot = {
        status: 200,
        headers: {},
        body: truncateBody(responseText),
      };
      const assertions = runAssertions({
        expected: input.testCase.expected,
        statusCode: 200,
        body: responseText,
        durationMs,
      });
      const status: ApiRunItemStatus = isAllPassed(assertions)
        ? "passed"
        : "failed";
      return this.runItemRepo.create({
        runId: input.runId,
        caseId: input.testCase.id,
        caseTitle: input.testCase.title,
        status,
        durationMs,
        requestSnapshot,
        responseSnapshot,
        assertions,
      });
    } catch (err) {
      const durationMs = Date.now() - started;
      return this.runItemRepo.create({
        runId: input.runId,
        caseId: input.testCase.id,
        caseTitle: input.testCase.title,
        status: "error",
        durationMs,
        requestSnapshot,
        responseSnapshot: {
          status: 0,
          headers: {},
          body: null,
          error: err instanceof Error ? err.message : "TCP 请求失败",
        },
        assertions: [
          {
            name: "请求执行",
            passed: false,
            expected: "成功发起 TCP 请求",
            actual: err instanceof Error ? err.message : err,
          },
        ],
      });
    }
  }

  private resolveRuntimeService(
    env: RuntimeEnvironment,
    transport: "http" | "tcp",
  ) {
    const services = env.services ?? [];
    if (env.environmentServiceId) {
      const selected = services.find(
        (service) => service.id === env.environmentServiceId,
      );
      if (selected?.transport === transport) return selected;
    }
    return services.find(
      (service) => (service.transport ?? "http") === transport,
    );
  }

  private resolveHttpBaseUrl(
    env: RuntimeEnvironment,
    service?: RuntimeService,
  ) {
    let baseUrl = service?.baseUrl?.trim() || env.baseUrl;
    if (service?.pathPrefix?.trim() && !service.baseUrl?.trim()) {
      const prefix = service.pathPrefix.startsWith("/")
        ? service.pathPrefix
        : `/${service.pathPrefix}`;
      baseUrl = `${baseUrl.replace(/\/$/, "")}${prefix}`;
    }
    if (!/^https?:\/\//i.test(baseUrl)) {
      throw new BadRequestException("HTTP 服务需要配置 http(s):// Base URL");
    }
    return baseUrl.replace(/\/$/, "");
  }

  private resolveTcpTarget(env: RuntimeEnvironment, service?: RuntimeService) {
    const host = service?.host?.trim();
    const port = service?.port;
    if (host && port) return { host, port };
    const raw = (service?.baseUrl || env.baseUrl || "").replace(
      /^https?:\/\//i,
      "",
    );
    const [rawHost, rawPort] = raw.split(":");
    const parsedPort = Number(rawPort);
    if (!rawHost || !Number.isFinite(parsedPort)) {
      throw new BadRequestException("TCP 服务需要配置 host 和 port");
    }
    return { host: rawHost, port: parsedPort };
  }

  private async runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ) {
    let index = 0;
    const runners = Array.from({ length: concurrency }, async () => {
      while (index < items.length) {
        const current = items[index];
        index += 1;
        await worker(current);
      }
    });
    await Promise.all(runners);
  }
}

function substituteVariablesPath(path: string, vars: Record<string, string>) {
  return path.replace(
    /\{(\w+)\}/g,
    (_, key: string) => vars[key] ?? `{${key}}`,
  );
}

function buildRequestBody(request: { method: string; body?: unknown }) {
  const upper = request.method.toUpperCase();
  if (["GET", "HEAD"].includes(upper)) return undefined;
  if (request.body === undefined || request.body === null) return undefined;
  if (typeof request.body === "string") return request.body;
  return JSON.stringify(request.body);
}

function buildTcpPayload(
  request: ApiCaseRequest,
  encoding: string,
  framing?: { type: "length-prefix"; width: number; encoding?: string },
) {
  const body =
    typeof request.body === "string"
      ? request.body
      : JSON.stringify(request.body ?? "");
  const bodyBuffer = encodeText(body, encoding);
  if (framing?.type !== "length-prefix") return bodyBuffer;
  const width = framing.width ?? 8;
  const prefix = String(bodyBuffer.length).padStart(width, "0");
  return Buffer.concat([
    encodeText(prefix, framing.encoding ?? encoding),
    bodyBuffer,
  ]);
}

function encodeText(value: string, encoding: string) {
  const normalized = encoding.toLowerCase();
  if (["utf8", "utf-8"].includes(normalized)) {
    return Buffer.from(value, "utf8");
  }
  if (iconv.encodingExists(normalized)) {
    return iconv.encode(value, normalized);
  }
  return Buffer.from(value, "utf8");
}

function sendTcpPayload(
  host: string,
  port: number,
  payload: Buffer,
  encoding: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("TCP 请求超时"));
    }, DEFAULT_TIMEOUT_MS);
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.once("end", () => {
      clearTimeout(timer);
      resolve(decodeText(Buffer.concat(chunks), encoding));
    });
    socket.connect(port, host, () => {
      socket.write(payload);
    });
  });
}

function decodeText(buffer: Buffer, encoding: string): string {
  const normalized = encoding.toLowerCase();
  if (["utf8", "utf-8"].includes(normalized)) {
    return buffer.toString("utf8");
  }
  if (iconv.encodingExists(normalized)) {
    return iconv.decode(buffer, normalized);
  }
  return buffer.toString("utf8");
}

function applyTransportEncoding(
  headers: Record<string, string>,
  encoding?: string,
) {
  if (!encoding?.trim()) return headers;
  const charset = encoding.trim();
  const next = { ...headers };
  for (const [key, value] of Object.entries(next)) {
    if (key.toLowerCase() !== "content-type") continue;
    if (/charset\s*=/i.test(value)) {
      next[key] = value.replace(/charset\s*=\s*[^;]+/i, `charset=${charset}`);
    } else {
      next[key] = `${value}; charset=${charset}`;
    }
  }
  return next;
}

function redactHeaders(headers: Record<string, string>) {
  const copy = { ...headers };
  for (const key of Object.keys(copy)) {
    if (/authorization|token|secret/i.test(key)) {
      copy[key] = "****";
    }
  }
  return copy;
}

function truncateBody(body: unknown, max = 32_000) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  if (text.length <= max) return body;
  return `${text.slice(0, max)}...(truncated)`;
}
