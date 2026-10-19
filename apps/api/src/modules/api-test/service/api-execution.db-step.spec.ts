import { ApiExecutionService } from "@api-test/service/api-execution.service";
import { ApiTestCaseEntity } from "@api-test/entity/api-test-case.entity";
import { resetDbStepLocksForTest } from "@api-test/util/db-step-lock.util";
import type { ApiCaseStep } from "@case-forge/shared";

/**
 * SQL 步骤执行链路测试。
 *
 * 场景：案例步骤列表里混排 SQL 步骤与请求步骤，SQL 步骤先改数据 / 取数，
 * 提取出的变量给后面的请求步骤用；SQL 失败要让案例在该步停下。
 */
function buildService(runResult?: Record<string, unknown>) {
  const runItemRepo = { create: jest.fn((entity: unknown) => entity) };
  const sqlStepRunner = {
    requireConnection: jest
      .fn()
      .mockResolvedValue({ id: "db-1", name: "账务库" }),
    run: jest.fn().mockResolvedValue({
      connectionId: "db-1",
      connectionName: "账务库",
      mode: "query",
      sql: "select id from t where id = '7'",
      connection: {
        type: "MySQL",
        host: "127.0.0.1",
        port: 3306,
        databaseName: "core",
        username: "tester",
        readonly: false,
      },
      rows: [{ id: 7 }, { id: 8 }],
      rowCount: 2,
      affectedRows: 0,
      durationMs: 12,
      ...runResult,
    }),
  };
  const service = new ApiExecutionService(
    {} as never,
    {} as never,
    runItemRepo as never,
    {} as never,
    {} as never,
    {
      resolveDeep: jest.fn(async (_p: string, value: unknown) => value),
    } as never,
    sqlStepRunner as never,
  );
  return { service, sqlStepRunner, runItemRepo };
}

function buildDbStep(
  overrides?: Partial<Record<string, unknown>>,
): ApiCaseStep {
  return {
    id: "step-db",
    kind: "db",
    name: "打开开关",
    db: {
      connectionId: "db-1",
      mode: "execute",
      sql: "update t_switch set status = 1 where id = '${switchId}'",
      ...overrides,
    },
    exports: [],
  } as ApiCaseStep;
}

async function runSteps(
  service: ApiExecutionService,
  steps: ApiCaseStep[],
  vars: Record<string, string> = {},
) {
  return (service as any).runCaseSteps({
    runId: "run-1",
    testCase: Object.assign(new ApiTestCaseEntity(), {
      id: "case-1",
      projectId: "p1",
      title: "开关案例",
      steps,
    }),
    env: { id: "env", baseUrl: "", headers: {}, variables: {}, secrets: {} },
    vars,
    caseContext: { caseName: "开关案例" },
    lockSession: { acquire: jest.fn(), release: jest.fn(), locked: false },
    lockResources: [{ key: "db-1", label: "账务库" }],
  });
}

describe("SQL 步骤执行", () => {
  beforeEach(() => resetDbStepLocksForTest());

  it("执行 SQL 步骤并把结果记进快照", async () => {
    const { service, sqlStepRunner } = buildService();
    const final = await runSteps(service, [buildDbStep()], {
      switchId: "1001",
    });

    expect(sqlStepRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "db-1",
        mode: "execute",
        // SQL 里的 ${变量} 在执行前替换成真实值
        sql: "update t_switch set status = 1 where id = '1001'",
      }),
    );
    expect(final.status).toBe("passed");
    const [stepSnapshot] = (final.requestSnapshot as any).steps;
    expect(stepSnapshot.request).toMatchObject({
      kind: "db",
      connectionName: "账务库",
      // 执行记录要能看出打到哪个库
      connection: {
        type: "MySQL",
        host: "127.0.0.1",
        port: 3306,
        databaseName: "core",
        username: "tester",
      },
    });
    expect(stepSnapshot.response.body).toMatchObject({
      rows: [{ id: 7 }, { id: 8 }],
      rowCount: 2,
      row: { id: 7 },
    });
  });

  it("查询结果能按 row / rowCount 提取成变量", async () => {
    const { service } = buildService();
    const step = {
      ...buildDbStep({ mode: "query", sql: "select id from t" }),
      exports: [
        { name: "userId", source: "row", expression: "id" },
        { name: "total", source: "rowCount" },
      ],
    } as ApiCaseStep;

    const final = await runSteps(service, [step]);
    const [stepSnapshot] = (final.requestSnapshot as any).steps;
    expect(stepSnapshot.extracted).toEqual({ userId: "7", total: "2" });
  });

  it("改数据影响 0 行时案例在该步停下", async () => {
    const { service } = buildService({
      rows: [],
      rowCount: 0,
      affectedRows: 0,
    });
    const httpStep: ApiCaseStep = {
      id: "step-http",
      name: "调用接口",
      request: { method: "POST", path: "/" },
      expected: {},
      exports: [],
    };
    // 影响行数护栏由 SqlStepRunner 抛错，这里模拟成执行失败
    (service as any).sqlStepRunner.run = jest
      .fn()
      .mockRejectedValue(new Error("update 影响 0 行"));

    const final = await runSteps(service, [buildDbStep(), httpStep]);
    expect(final.status).toBe("error");
    expect((final.responseSnapshot as any).error).toContain("影响 0 行");
    const steps = (final.requestSnapshot as any).steps;
    expect(steps).toHaveLength(1);
    expect(steps[0].stepId).toBe("step-db");
  });

  it("占位在案例开始执行 SQL 步骤时才抢，且带连接名标签", async () => {
    const { service } = buildService();
    const acquire = jest.fn();
    const httpStep: ApiCaseStep = {
      id: "step-http",
      name: "调用接口",
      request: { method: "POST", path: "/" },
      expected: {},
      exports: [],
    };
    // 只验证 SQL 步骤的占位时机，请求步骤用桩替换掉真实发请求
    (service as any).executeHttpStep = jest.fn().mockResolvedValue(
      (service as any).runItemRepo.create({
        id: "item-http",
        status: "passed",
        durationMs: 1,
        requestSnapshot: {},
        responseSnapshot: { status: 200, headers: {}, body: {} },
        assertions: [],
      }),
    );
    await (service as any).runCaseSteps({
      runId: "run-1",
      testCase: Object.assign(new ApiTestCaseEntity(), {
        id: "case-1",
        projectId: "p1",
        title: "开关案例",
        steps: [httpStep, buildDbStep()],
      }),
      env: { id: "env", baseUrl: "", headers: {}, variables: {}, secrets: {} },
      vars: {},
      caseContext: {},
      lockSession: { acquire, release: jest.fn(), locked: false },
      lockResources: [{ key: "db-1", label: "账务库" }],
    });
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquire).toHaveBeenCalledWith([{ key: "db-1", label: "账务库" }]);
  });
});
