import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { scopedWhere } from "../../../common/audit/user-scope";
import { auditFieldsForUpdate } from "../../../common/audit/request-context";
import { ApiTestCaseEntity } from "../entity/api-test-case.entity";
import { ApiTestRunEntity } from "../entity/api-test-run.entity";
import { ApiTestRunItemEntity } from "../entity/api-test-run-item.entity";
import { ApiEnvironmentService } from "./api-environment.service";
import {
  buildRuntimeVariables,
  substituteDeep,
} from "../util/variable-substitute.util";
import {
  isAllPassed,
  runAssertions,
} from "../util/assertion-runner.util";
import type { ApiRunItemStatus } from "@case-forge/shared";

const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 10;

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
  ) {}

  async runCases(input: {
    projectId: string;
    caseIds: string[];
    environmentId: string;
    concurrency?: number;
  }) {
    if (!input.caseIds.length) {
      throw new BadRequestException("请至少选择一条案例");
    }
    const concurrency = Math.min(
      MAX_CONCURRENCY,
      Math.max(1, input.concurrency ?? DEFAULT_CONCURRENCY),
    );
    const env = await this.environmentService.getRuntimeEnvironment(
      input.projectId,
      input.environmentId,
    );
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
        baseUrl: env.baseUrl,
        headers: env.headers,
        vars,
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

  async listRuns(projectId: string) {
    return this.runRepo.find({
      where: scopedWhere({ projectId }),
      order: { createdAt: "DESC" },
      take: 50,
    });
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
    return { ...run, items };
  }

  private async executeSingleCase(input: {
    runId: string;
    testCase: ApiTestCaseEntity;
    baseUrl: string;
    headers: Record<string, string>;
    vars: Record<string, string>;
  }) {
    const request = substituteDeep(input.testCase.request, input.vars);
    const path = substituteVariablesPath(request.path, input.vars);
    const url = new URL(path.replace(/^\//, ""), `${input.baseUrl}/`);
    if (request.query) {
      for (const [key, value] of Object.entries(request.query)) {
        url.searchParams.set(key, String(value));
      }
    }
    const headers = {
      ...input.headers,
      ...(request.headers ?? {}),
    };
    const requestSnapshot = {
      method: request.method,
      url: url.toString(),
      headers: redactHeaders(headers),
      body: request.body,
    };

    const started = Date.now();
    try {
      const response = await fetch(url.toString(), {
        method: request.method,
        headers,
        body: buildRequestBody(request),
        signal: AbortSignal.timeout(30_000),
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
  return path.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

function buildRequestBody(request: { method: string; body?: unknown }) {
  const upper = request.method.toUpperCase();
  if (["GET", "HEAD"].includes(upper)) return undefined;
  if (request.body === undefined || request.body === null) return undefined;
  if (typeof request.body === "string") return request.body;
  return JSON.stringify(request.body);
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
