import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import iconv from "iconv-lite";
import { Socket } from "node:net";
import { In, Repository } from "typeorm";
import { scopedWhere } from "@common/audit/user-scope";
import { auditFieldsForCreate } from "@common/audit/request-context";
import { ApiTestCaseEntity } from "@api-test/entity/api-test-case.entity";
import { ApiTestRunEntity } from "@api-test/entity/api-test-run.entity";
import { ApiTestRunItemEntity } from "@api-test/entity/api-test-run-item.entity";
import { ApiEnvironmentService } from "./api-environment.service";
import { ApiExecutionSetService } from "./api-execution-set.service";
import {
  buildRuntimeVariables,
  substituteDeep,
} from "@api-test/util/variable-substitute.util";
import {
  isAllPassed,
  runAssertions,
  extractExportValue,
} from "@api-test/util/assertion-runner.util";
import type {
  ApiCaseExpected,
  ApiCaseRequest,
  ApiRunItemStatus,
  ApiCaseStep,
} from "@case-forge/shared";
import { parseServerAddress } from "@case-forge/shared";
import { toPublicApiRun } from "@common/http/public-response.util";
import { ApiDataFunctionService } from "./api-data-function.service";
import type { DataFunctionContext } from "./api-data-function.service";
import { SAMPLE_CONTEXT } from "./api-data-function.service";
import type { ApiStepTarget } from "@case-forge/shared";

const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 10;
const DEFAULT_TIMEOUT_MS = 30_000;
const TCP_IDLE_TIMEOUT_MS = 1_500;

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
    private readonly dataFunctionService: ApiDataFunctionService,
  ) {}

  async runCases(input: {
    projectId: string;
    caseIds: string[];
    environmentId?: string;
    environmentServiceId?: string;
    executionSetId?: string;
    transactionId?: string;
    concurrency?: number;
    encoding?: string;
    runId?: string;
  }) {
    if (!input.caseIds.length) {
      throw new BadRequestException("请至少选择一条案例");
    }
    const concurrency = Math.min(
      MAX_CONCURRENCY,
      Math.max(1, input.concurrency ?? DEFAULT_CONCURRENCY),
    );
    const foundCases = await this.caseRepo.find({
      where: {
        ...scopedWhere({ projectId: input.projectId }),
        id: In(input.caseIds),
        enabled: true,
      },
      relations: ["endpoint"],
    });
    const caseMap = new Map(foundCases.map((item) => [item.id, item]));
    const cases = input.caseIds
      .map((id) => caseMap.get(id))
      .filter((item): item is ApiTestCaseEntity => Boolean(item));
    if (!cases.length) {
      throw new BadRequestException("未找到可执行的启用案例");
    }
    const orderedFlow = Boolean(input.executionSetId || input.transactionId);
    if (orderedFlow) {
      assertCaseDependencyOrder(cases);
    }
    const runtimeByCase = new Map<string, RuntimeEnvironment>();
    for (const testCase of cases) {
      if (testCase.steps?.length) {
        const missing = testCase.steps.find((step) => !step.target?.address?.trim());
        if (missing) throw new BadRequestException(`案例「${testCase.title}」的步骤「${missing.name}」未指定环境地址`);
        runtimeByCase.set(testCase.id, environmentFromStep(testCase.steps[0]));
        continue;
      }
      const environmentId =
        testCase.metadata?.debugEnvironmentId ?? input.environmentId;
      if (!environmentId)
        throw new BadRequestException(
          `案例「${testCase.title}」未指定执行环境`,
        );
      runtimeByCase.set(
        testCase.id,
        (await this.environmentService.getRuntimeEnvironment(
          input.projectId,
          environmentId,
          testCase.metadata?.debugEnvironmentServiceId ??
            input.environmentServiceId,
        )) as RuntimeEnvironment,
      );
    }
    const env = runtimeByCase.get(cases[0].id)!;

    let run: ApiTestRunEntity;
    let preservedItems: ApiTestRunItemEntity[] = [];
    if (input.runId) {
      const existing = await this.runRepo.findOne({
        where: scopedWhere({ projectId: input.projectId, id: input.runId }),
      });
      if (!existing) {
        throw new BadRequestException("执行记录不存在");
      }
      const existingItems = await this.runItemRepo.find({ where: { runId: existing.id } });
      const rerunCaseIds = new Set(cases.map((testCase) => testCase.id));
      preservedItems = existingItems.filter((item) => !rerunCaseIds.has(item.caseId));
      await this.runItemRepo.delete({
        runId: existing.id,
        caseId: In([...rerunCaseIds]),
      });
      existing.environmentId = env.id;
      existing.environmentServiceId = input.environmentServiceId;
      existing.executionSetId = input.executionSetId ?? existing.executionSetId;
      existing.transactionId = input.transactionId ?? existing.transactionId;
      existing.status = "running";
      existing.versionCode = formatRunVersionCode(new Date());
      existing.totalCount = preservedItems.length + cases.length;
      existing.passedCount = 0;
      existing.failedCount = 0;
      existing.errorCount = 0;
      existing.concurrency = concurrency;
      existing.finishedAt = undefined;
      run = await this.runRepo.save(existing);
    } else {
      run = await this.runRepo.save(
        this.runRepo.create({
          projectId: input.projectId,
          environmentId: env.id,
          environmentServiceId: input.environmentServiceId,
          executionSetId: input.executionSetId,
          transactionId: input.transactionId,
          versionCode: formatRunVersionCode(new Date()),
          status: "running",
          totalCount: cases.length,
          concurrency,
          ...auditFieldsForCreate(),
        }),
      );
    }

    const items: ApiTestRunItemEntity[] = [];
    let passed = preservedItems.filter((item) => item.status === "passed").length;
    let failed = preservedItems.filter((item) => item.status === "failed").length;
    let error = preservedItems.filter((item) => item.status === "error").length;

    const sharedVars: Record<string, string> = {};
    await this.runWithConcurrency(cases, orderedFlow ? 1 : concurrency, async (testCase) => {
      const caseEnv = runtimeByCase.get(testCase.id)!;
      const item = await this.executeSingleCase({
        runId: run.id,
        testCase,
        env: caseEnv,
        vars: {
          ...buildRuntimeVariables(caseEnv.variables, caseEnv.secrets),
          ...sharedVars,
        },
        encoding: testCase.metadata?.debugEncoding ?? input.encoding,
      });
      items.push(item);
      const exports = testCase.metadata?.exports ?? [];
      for (const binding of exports) {
        const value = extractExportValue(binding, item.requestSnapshot, item.responseSnapshot);
        if (value !== undefined && value !== null && String(value) !== "") {
          sharedVars[`${testCase.caseNo ?? testCase.id}.${binding.name}`] = String(value);
        } else if (binding.required) {
          item.status = "error";
          item.responseSnapshot = {
            ...(item.responseSnapshot ?? { status: 0, headers: {}, body: null }),
            error: `共享变量提取失败：${binding.name}`,
          };
        }
      }
      if (item.status === "passed") passed += 1;
      else if (item.status === "failed") failed += 1;
      else error += 1;
    });

    await this.runItemRepo.save([...preservedItems, ...items]);
    run.status = "completed";
    run.passedCount = passed;
    run.failedCount = failed;
    run.errorCount = error;
    run.finishedAt = new Date();
    await this.runRepo.save(run);

    const detail = await this.getRunDetail(input.projectId, run.id);
    if (input.executionSetId) {
      await this.executionSetService.updateLastRun(input.executionSetId, {
        runId: detail.id,
        status: detail.status,
        passedCount: detail.passedCount,
        totalCount: detail.totalCount,
      });
    }
    return detail;
  }

  async runExecutionSet(input: {
    projectId: string;
    transactionId: string;
    executionSetId: string;
    environmentId?: string;
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
      concurrency: 1,
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

  async deleteRun(projectId: string, runId: string) {
    const run = await this.runRepo.findOne({
      where: scopedWhere({ projectId, id: runId }),
    });
    if (!run) {
      throw new BadRequestException("执行记录不存在");
    }
    const executionSetId = run.executionSetId;
    await this.runItemRepo.delete({ runId: run.id });
    await this.runRepo.delete(run.id);
    if (executionSetId) {
      const [nextRun] = await this.runRepo.find({
        where: scopedWhere({ projectId, executionSetId }),
        order: { createdAt: "DESC" },
        take: 1,
      });
      await this.executionSetService.clearLastRunIfMatches(
        projectId,
        executionSetId,
        runId,
        nextRun ?? null,
      );
    }
  }

  private async executeSingleCase(input: {
    runId: string;
    testCase: ApiTestCaseEntity;
    env: RuntimeEnvironment;
    vars: Record<string, string>;
    encoding?: string;
  }) {
    const steps = input.testCase.steps;
    const caseContext: DataFunctionContext = {
      caseName: input.testCase.title,
      caseNo: input.testCase.caseNo,
    };
    if (!steps?.length)
      return this.executeSingleStep({ ...input, caseContext });
    const vars = { ...input.vars };
    const stepResults: Array<Record<string, unknown>> = [];
    let final: ApiTestRunItemEntity | undefined;
    for (const step of steps) {
      const stepCase = Object.assign(new ApiTestCaseEntity(), input.testCase, {
        title: `${input.testCase.title} / ${step.name}`,
        request: step.request,
        expected: step.expected,
        metadata: { ...input.testCase.metadata, exports: step.exports },
      });
      const result = await this.executeSingleStep({ ...input, testCase: stepCase, env: environmentFromStep(step), vars, caseContext });
      const extracted: Record<string, string> = {};
      for (const binding of step.exports) {
        const value = extractExportValue(binding, result.requestSnapshot, result.responseSnapshot);
        if (value !== undefined && value !== null && String(value) !== "") extracted[binding.name] = vars[binding.name] = String(value);
        else if (binding.required) {
          result.status = "error";
          result.responseSnapshot = { ...(result.responseSnapshot ?? { status: 0, headers: {}, body: null }), error: `${binding.source === "request" ? "请求" : "响应"}提取失败：${binding.name}` };
        }
      }
      stepResults.push({ stepId: step.id, stepName: step.name, status: result.status, durationMs: result.durationMs, request: result.requestSnapshot, response: result.responseSnapshot, assertions: result.assertions, extracted });
      final = result;
      if (result.status !== "passed") break;
    }
    if (!final) throw new BadRequestException("案例没有可执行步骤");
    final.caseTitle = input.testCase.title;
    final.durationMs = stepResults.reduce((sum, item) => sum + Number(item.durationMs ?? 0), 0);
    final.requestSnapshot = { steps: stepResults };
    final.responseSnapshot = { status: final.responseSnapshot?.status ?? 0, headers: final.responseSnapshot?.headers ?? {}, body: { steps: stepResults }, error: final.responseSnapshot?.error };
    return final;
  }

  private async executeSingleStep(input: {
    runId: string;
    testCase: ApiTestCaseEntity;
    env: RuntimeEnvironment;
    vars: Record<string, string>;
    encoding?: string;
    caseContext?: DataFunctionContext;
  }) {
    const substituted = substituteDeep(
      input.testCase.request,
      input.vars,
    ) as ApiCaseRequest;
    const request = (await this.dataFunctionService.resolveDeep(
      input.testCase.projectId,
      substituted,
      input.caseContext,
    )) as ApiCaseRequest;
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
    applyEncodedQuery(
      url,
      input.request.query,
      input.encoding ?? input.request.encoding,
    );
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
      let response: Response | undefined;
      for (
        let attempt = 0;
        attempt < Math.max(1, input.request.repeatCount ?? 1);
        attempt += 1
      ) {
        response = await fetch(url.toString(), {
          method: input.request.method,
          headers,
          body: buildEncodedHttpBody(
            input.request,
            input.encoding ?? input.request.encoding,
          ),
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });
      }
      if (!response) throw new Error("请求未执行");
      const durationMs = Date.now() - started;
      const responseBuffer = Buffer.from(await response.arrayBuffer());
      const responseHeaders = Object.fromEntries(response.headers.entries());
      const text = decodeHttpResponse(
        responseBuffer,
        responseHeaders,
        input.encoding ?? input.request.encoding,
      );
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      const responseSnapshot = {
        status: response.status,
        headers: responseHeaders,
        body: truncateBody(body),
      };
      const assertions = runAssertions({
        expected: input.testCase.expected,
        statusCode: response.status,
        headers: responseHeaders,
        body,
        bodySize: responseBuffer.length,
        durationMs,
        polarity: input.testCase.polarity,
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
    const resolvedFraming = framing ? { ...framing, encoding } : undefined;
    const payload = buildTcpPayload(input.request, encoding, resolvedFraming);
    const requestSnapshot = {
      method: input.request.method,
      target: `${target.host}:${target.port}`,
      body: input.request.body,
      encoding,
      framing: resolvedFraming,
      transport: "tcp",
      service: service?.name,
    };
    const started = Date.now();
    try {
      let responseText = "";
      for (
        let attempt = 0;
        attempt < Math.max(1, input.request.repeatCount ?? 1);
        attempt += 1
      ) {
        responseText = await sendTcpPayload(
          target.host,
          target.port,
          payload,
          encoding,
          resolvedFraming,
        );
      }
      const durationMs = Date.now() - started;
      const responseSnapshot = {
        status: -1,
        headers: {},
        body: truncateBody(responseText),
      };
      const assertions = runAssertions({
        expected: input.testCase.expected,
        statusCode: -1,
        headers: {},
        body: responseText,
        bodySize: responseText.length,
        durationMs,
        polarity: input.testCase.polarity,
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

  async debugRun(input: {
    projectId: string;
    request: ApiCaseRequest;
    expected?: ApiCaseExpected;
    polarity?: "positive" | "negative";
    environmentId?: string;
    target?: ApiStepTarget;
    environmentServiceId?: string;
    encoding?: string;
    caseId?: string;
  }): Promise<DebugRunResult> {
    const env = input.target
      ? environmentFromStep({ id: "debug", name: "调试", target: input.target, request: input.request, expected: input.expected ?? {}, exports: [] })
      : (await this.environmentService.getRuntimeEnvironment(input.projectId, input.environmentId!, input.environmentServiceId)) as RuntimeEnvironment;
    const vars = buildRuntimeVariables(env.variables, env.secrets);
    const substituted = substituteDeep(input.request, vars) as ApiCaseRequest;
    let caseContext: DataFunctionContext | undefined;
    if (input.caseId) {
      const debugCase = await this.caseRepo.findOne({
        where: { id: input.caseId, projectId: input.projectId },
      });
      if (debugCase)
        caseContext = {
          caseName: debugCase.title,
          caseNo: debugCase.caseNo,
        };
    }
    // 步骤库调试等无案例上下文的场景回退示例值，保证 CASE_NAME/CASE_NO 可调试
    const request = (await this.dataFunctionService.resolveDeep(
      input.projectId,
      substituted,
      caseContext ?? SAMPLE_CONTEXT,
    )) as ApiCaseRequest;
    const transport = request.transport ?? (request.framing ? "tcp" : "http");

    if (transport === "tcp") {
      return this.debugRunTcp({
        request,
        env,
        vars,
        expected: input.expected,
        polarity: input.polarity,
        encoding: input.encoding,
      });
    }
    return this.debugRunHttp({
      request,
      env,
      vars,
      expected: input.expected,
      polarity: input.polarity,
      encoding: input.encoding,
    });
  }

  private async debugRunHttp(input: {
    request: ApiCaseRequest;
    env: RuntimeEnvironment;
    vars: Record<string, string>;
    expected?: ApiCaseExpected;
    polarity?: "positive" | "negative";
    encoding?: string;
  }): Promise<DebugRunResult> {
    const service = this.resolveRuntimeService(input.env, "http");
    const baseUrl = this.resolveHttpBaseUrl(input.env, service);
    const path = substituteVariablesPath(input.request.path, input.vars);
    const url = new URL(path.replace(/^\//, ""), `${baseUrl}/`);
    applyEncodedQuery(
      url,
      input.request.query,
      input.encoding ?? input.request.encoding,
    );
    const headers = applyTransportEncoding(
      {
        ...input.env.headers,
        ...(service?.headers ?? {}),
        ...(input.request.headers ?? {}),
      },
      input.encoding ?? input.request.encoding,
    );

    const started = Date.now();
    try {
      let response: Response | undefined;
      for (
        let attempt = 0;
        attempt < Math.max(1, input.request.repeatCount ?? 1);
        attempt += 1
      ) {
        response = await fetch(url.toString(), {
          method: input.request.method,
          headers,
          body: buildEncodedHttpBody(
            input.request,
            input.encoding ?? input.request.encoding,
          ),
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });
      }
      if (!response) throw new Error("请求未执行");
      const durationMs = Date.now() - started;
      const responseBuffer = Buffer.from(await response.arrayBuffer());
      const responseHeaders = Object.fromEntries(response.headers.entries());
      const text = decodeHttpResponse(
        responseBuffer,
        responseHeaders,
        input.encoding ?? input.request.encoding,
      );
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      const assertions = runAssertions({
        expected: input.expected ?? {},
        statusCode: response.status,
        headers: responseHeaders,
        body,
        bodySize: responseBuffer.length,
        durationMs,
        polarity: input.polarity,
      });
      return {
        statusCode: response.status,
        headers: responseHeaders,
        body: truncateBody(body),
        request: input.request,
        requestBody: input.request.body,
        bodySize: responseBuffer.length,
        durationMs,
        assertions,
      };
    } catch (err) {
      const durationMs = Date.now() - started;
      return {
        statusCode: 0,
        headers: {},
        body: null,
        request: input.request,
        requestBody: input.request.body,
        bodySize: 0,
        durationMs,
        error: err instanceof Error ? err.message : "请求失败",
        assertions: [],
      };
    }
  }

  private async debugRunTcp(input: {
    request: ApiCaseRequest;
    env: RuntimeEnvironment;
    vars: Record<string, string>;
    expected?: ApiCaseExpected;
    polarity?: "positive" | "negative";
    encoding?: string;
  }): Promise<DebugRunResult> {
    const service = this.resolveRuntimeService(input.env, "tcp");
    const target = this.resolveTcpTarget(input.env, service);
    const encoding =
      input.encoding ??
      input.request.encoding ??
      service?.encoding ??
      input.request.framing?.encoding ??
      "GBK";
    const framing = input.request.framing ?? service?.framing;
    const resolvedFraming = framing ? { ...framing, encoding } : undefined;
    const payload = buildTcpPayload(input.request, encoding, resolvedFraming);

    const started = Date.now();
    try {
      let responseText = "";
      for (
        let attempt = 0;
        attempt < Math.max(1, input.request.repeatCount ?? 1);
        attempt += 1
      ) {
        responseText = await sendTcpPayload(
          target.host,
          target.port,
          payload,
          encoding,
          resolvedFraming,
        );
      }
      const durationMs = Date.now() - started;
      const assertions = runAssertions({
        expected: input.expected ?? {},
        statusCode: -1,
        headers: {},
        body: responseText,
        bodySize: responseText.length,
        durationMs,
        polarity: input.polarity,
      });
      return {
        statusCode: -1,
        headers: {},
        body: truncateBody(responseText),
        request: input.request,
        requestBody: input.request.body,
        bodySize: responseText.length,
        durationMs,
        assertions,
      };
    } catch (err) {
      const durationMs = Date.now() - started;
      return {
        statusCode: 0,
        headers: {},
        body: null,
        request: input.request,
        requestBody: input.request.body,
        bodySize: 0,
        durationMs,
        error: err instanceof Error ? err.message : "TCP 请求失败",
        assertions: [],
      };
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
      const hasHttpService = (env.services ?? []).some(
        (s) => (s.transport ?? "http") === "http",
      );
      const hint = hasHttpService
        ? "请检查环境下的 HTTP 服务是否配置了有效的 http(s):// 服务器地址"
        : "当前环境下没有 HTTP 服务，请在「环境维护」中新增一个服务，服务器地址填写 http://host:port";
      throw new BadRequestException(
        `HTTP 服务需要配置 http(s):// Base URL。${hint}`,
      );
    }
    return baseUrl.replace(/\/$/, "");
  }

  private resolveTcpTarget(env: RuntimeEnvironment, service?: RuntimeService) {
    const host = service?.host?.trim();
    const port = service?.port;
    if (host && port) return { host, port };
    const raw = (service?.baseUrl || env.baseUrl || "")
      .replace(/^(socket2?|tcp):\/\//i, "")
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "");
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

export function environmentFromStep(step: ApiCaseStep): RuntimeEnvironment {
  const address = step.target?.address?.trim() ?? "";
  const transport = step.request.transport ?? (step.request.framing ? "tcp" : "http");
  if (transport === "tcp") {
    const parsed = parseServerAddress(address);
    if (!parsed.host || !parsed.port) {
      throw new BadRequestException(`步骤「${step.name}」的 TCP 地址格式应为 host:port（如 32.114.71.6:60030，也支持 socket2://host:port）`);
    }
    return { id: step.id, baseUrl: "", headers: step.target?.headers ?? {}, variables: {}, secrets: {}, services: [{ id: step.id, name: step.target?.name || step.name, transport: "tcp", host: parsed.host, port: parsed.port, headers: step.target?.headers }] };
  }
  if (!/^https?:\/\//i.test(address)) throw new BadRequestException(`步骤「${step.name}」的 HTTP 地址必须以 http:// 或 https:// 开头`);
  return { id: step.id, baseUrl: address, headers: step.target?.headers ?? {}, variables: {}, secrets: {} };
}

function formatRunVersionCode(date: Date) {
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, "0"))
    .join("");
  return `${day}-${time}`;
}

function assertCaseDependencyOrder(cases: ApiTestCaseEntity[]) {
  const indexByNumber = new Map(cases.filter((item) => item.caseNo).map((item, index) => [item.caseNo!, index]));
  for (const [index, testCase] of cases.entries()) {
    for (const match of JSON.stringify(testCase.request).matchAll(/\$\{([^{}]+)\}/g)) {
      const dot = match[1].lastIndexOf(".");
      if (dot < 1) continue;
      const producerNo = match[1].slice(0, dot);
      const producerIndex = indexByNumber.get(producerNo);
      if (producerIndex === undefined) continue;
      if (producerIndex >= index) {
        throw new BadRequestException(`案例 ${testCase.caseNo} 引用了 ${producerNo} 的变量，请将 ${producerNo} 排在前面`);
      }
    }
  }
}

function substituteVariablesPath(path: string, vars: Record<string, string>) {
  return path.replace(
    /\{(\w+)\}/g,
    (_, key: string) => vars[key] ?? `{${key}}`,
  );
}

export function buildEncodedHttpBody(
  request: { method: string; body?: unknown },
  encoding = "UTF-8",
) {
  const upper = request.method.toUpperCase();
  if (["GET", "HEAD"].includes(upper)) return undefined;
  if (request.body === undefined || request.body === null) return undefined;
  const body =
    typeof request.body === "string"
      ? request.body
      : JSON.stringify(request.body);
  const buffer = encodeText(body, encoding);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

export function encodeQueryComponent(value: string, encoding = "UTF-8") {
  return Array.from(encodeText(value, encoding), (byte) =>
    (byte >= 0x41 && byte <= 0x5a) ||
    (byte >= 0x61 && byte <= 0x7a) ||
    (byte >= 0x30 && byte <= 0x39) ||
    [0x2d, 0x2e, 0x5f, 0x7e].includes(byte)
      ? String.fromCharCode(byte)
      : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`,
  ).join("");
}

function applyEncodedQuery(
  url: URL,
  query: ApiCaseRequest["query"],
  encoding = "UTF-8",
) {
  if (!query) return;
  url.search = Object.entries(query)
    .map(
      ([key, value]) =>
        `${encodeQueryComponent(key, encoding)}=${encodeQueryComponent(String(value), encoding)}`,
    )
    .join("&");
}

function decodeHttpResponse(
  buffer: Buffer,
  headers: Record<string, string>,
  fallback = "UTF-8",
) {
  const contentType = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === "content-type",
  )?.[1];
  const charset = contentType?.match(/charset\s*=\s*([^;\s]+)/i)?.[1];
  return decodeText(buffer, charset || fallback);
}

export function buildTcpPayload(
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

export function sendTcpPayload(
  host: string,
  port: number,
  payload: Buffer,
  encoding: string,
  framing?: { type: "length-prefix"; width?: number; encoding?: string },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const chunks: Buffer[] = [];
    const frameWidth = framing ? (framing.width ?? 8) : 0;
    let totalReceived = 0;
    let expectedTotal: number | undefined;
    let prefixChecked = false;
    let settled = false;
    let connected = false;
    let idleTimer: NodeJS.Timeout | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (idleTimer) clearTimeout(idleTimer);
      socket.destroy();
      const buf = Buffer.concat(chunks);
      const responseEncoding = detectResponseEncoding(buf, encoding);
      resolve(decodeText(buf, responseEncoding));
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (idleTimer) clearTimeout(idleTimer);
      socket.destroy();
      reject(error);
    };
    const timer = setTimeout(() => {
      if (chunks.length > 0) {
        finish();
      } else if (!connected) {
        fail(new Error(`TCP 连接超时（${host}:${port}），请确认地址可达`));
      } else {
        fail(
          new Error(
            `TCP 已连接但未收到响应（${host}:${port}），请检查长度前缀与编码配置`,
          ),
        );
      }
    }, DEFAULT_TIMEOUT_MS);
    const decodeAccumulated = () => decodeText(Buffer.concat(chunks), encoding);
    const isComplete = () => {
      if (frameWidth <= 0) return false;
      if (!prefixChecked && totalReceived >= frameWidth) {
        prefixChecked = true;
        const head = Buffer.concat(chunks)
          .subarray(0, frameWidth)
          .toString("latin1");
        if (/^\d+$/.test(head)) {
          expectedTotal = frameWidth + Number(head);
        }
      }
      if (expectedTotal !== undefined && totalReceived >= expectedTotal) {
        return true;
      }
      return decodeAccumulated().includes("</Transaction>");
    };
    socket.once("error", (error) => fail(error));
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      totalReceived += chunk.length;
      if (isComplete()) {
        finish();
        return;
      }
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, TCP_IDLE_TIMEOUT_MS);
    });
    socket.once("end", finish);
    socket.once("close", () => {
      if (chunks.length > 0) finish();
    });
    socket.connect(port, host, () => {
      connected = true;
      if (framing) {
        socket.write(payload);
      } else {
        socket.end(payload);
      }
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

function detectResponseEncoding(buffer: Buffer, fallback: string): string {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return "UTF-8";
  }
  const head = buffer
    .subarray(0, Math.min(buffer.length, 200))
    .toString("latin1");
  const xmlDecl = head.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i);
  if (xmlDecl) return xmlDecl[1];
  return fallback;
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

export interface DebugRunResult {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  /** 实际发出的请求报文（变量替换 + 数据函数解析后），供前端解析请求体字段 */
  requestBody?: unknown;
  /** 变量替换 + 数据函数解析后的完整请求，供调试记录留存 */
  request?: ApiCaseRequest;
  bodySize: number;
  durationMs: number;
  error?: string;
  assertions: Array<{
    name: string;
    passed: boolean;
    expected: unknown;
    actual: unknown;
    message?: string;
  }>;
}
