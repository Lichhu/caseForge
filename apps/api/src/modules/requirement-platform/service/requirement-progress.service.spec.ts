import { ForbiddenException } from "@nestjs/common";
import { RequestContext } from "@common/audit/request-context";
import { RequirementProgressService } from "./requirement-progress.service";

function buildService(overrides?: {
  isDispatcher?: boolean;
  requirement?: Record<string, unknown>;
  preproductionRows?: Array<Record<string, unknown>>;
}) {
  const requirementRepo = {
    findOne: jest.fn().mockResolvedValue(
      overrides?.requirement ?? {
        id: "req-1",
        projectCode: "XQ2026-0001",
        projectName: "对公账户开户审批流程改造",
        applicationName: "核心系统",
        versionName: "V1.0",
        status: "testing",
        claimedBy: "alice",
        claimedByName: "张三",
        claimedAt: new Date("2026-10-20T02:00:00.000Z"),
        claimedProjectId: "project-1",
        createdAt: new Date("2026-10-18T02:00:00.000Z"),
        updatedAt: new Date("2026-10-20T02:00:00.000Z"),
      },
    ),
  };
  const dispatcherRepo = {
    exists: jest.fn().mockResolvedValue(overrides?.isDispatcher ?? true),
  };
  const projectRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: "project-1",
      title: "对公账户开户审批流程改造",
    }),
  };
  const transactionRepo = {
    find: jest.fn().mockResolvedValue([
      {
        id: "tx-1",
        projectId: "project-1",
        code: "QES001",
        name: "开户资格查询",
        syncStatus: "success",
        runnerCaseIds: ["case-1"],
        createdAt: new Date("2026-10-19T02:00:00.000Z"),
      },
    ]),
  };
  const caseRepo = {
    find: jest.fn().mockResolvedValue([
      {
        id: "case-1",
        projectId: "project-1",
        title: "正常客户开户资格查询",
        caseNo: "CASE-001",
        priority: "P1",
        polarity: "positive",
        enabled: true,
        steps: [
          {
            id: "step-1",
            name: "查询客户信息",
            request: { method: "POST", path: "/customer/query" },
            expected: {},
            exports: [],
          },
          {
            id: "step-2",
            name: "校验账户状态",
            request: { method: "POST", path: "/account/check" },
            expected: {},
            exports: [],
          },
        ],
        endpoint: {
          id: "endpoint-1",
          transactionId: "tx-1",
        },
        metadata: {},
      },
      {
        id: "case-2",
        projectId: "project-1",
        title: "当前版本但未加入执行平台的案例",
        caseNo: "CASE-002",
        priority: "P1",
        polarity: "positive",
        enabled: true,
        steps: [],
        endpoint: {
          id: "endpoint-1",
          transactionId: "tx-1",
        },
        metadata: {},
      },
    ]),
  };
  const runRepo = {
    find: jest.fn().mockResolvedValue([
      {
        id: "run-1",
        projectId: "project-1",
        transactionId: "tx-1",
        status: "completed",
        createdAt: new Date("2026-10-21T02:00:00.000Z"),
        finishedAt: new Date("2026-10-21T02:00:01.000Z"),
      },
    ]),
  };
  const runItemRepo = {
    find: jest.fn().mockResolvedValue([
      {
        runId: "run-1",
        caseId: "case-1",
        caseTitle: "正常客户开户资格查询",
        status: "failed",
        durationMs: 1000,
        requestSnapshot: {
          steps: [
            {
              stepId: "step-1",
              stepName: "查询客户信息",
              status: "passed",
              durationMs: 300,
            },
            {
              stepId: "step-2",
              stepName: "校验账户状态",
              status: "failed",
              durationMs: 700,
              response: { error: "账户状态不匹配" },
              assertions: [
                {
                  name: "账户状态",
                  passed: false,
                  message: "预期正常，实际冻结",
                },
              ],
            },
          ],
        },
        responseSnapshot: { error: "账户状态不匹配" },
        assertions: [],
        createdAt: new Date("2026-10-21T02:00:00.000Z"),
      },
    ]),
  };
  const preproductionRunRepo = {
    find: jest.fn().mockResolvedValue(overrides?.preproductionRows ?? []),
  };
  const service = new RequirementProgressService(
    requirementRepo as never,
    dispatcherRepo as never,
    projectRepo as never,
    transactionRepo as never,
    caseRepo as never,
    runRepo as never,
    runItemRepo as never,
    preproductionRunRepo as never,
  );
  return {
    service,
    requirementRepo,
    dispatcherRepo,
    transactionRepo,
    caseRepo,
    runRepo,
    runItemRepo,
    preproductionRunRepo,
  };
}

describe("RequirementProgressService", () => {
  it("仅分发人可以查看需求完成情况", async () => {
    const { service, requirementRepo } = buildService({ isDispatcher: false });

    await expect(
      RequestContext.run("not-dispatcher", () =>
        service.getByRequirementId("req-1"),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(requirementRepo.findOne).not.toHaveBeenCalled();
  });

  it("拒绝查看待分发或待受理需求", async () => {
    const { service } = buildService({
      requirement: {
        id: "req-1",
        projectCode: "XQ2026-0001",
        projectName: "待分发需求",
        status: "pending_dispatch",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await expect(
      RequestContext.run("dispatcher", () =>
        service.getByRequirementId("req-1"),
      ),
    ).rejects.toThrow("仅可查看测试中、已完成或已打回需求的完成情况");
  });

  it("按需求、交易、案例、步骤和执行结果组装完成情况", async () => {
    const { service } = buildService();

    const result = await RequestContext.run("dispatcher", () =>
      service.getByRequirementId("req-1"),
    );

    expect(result.projectId).toBe("project-1");
    expect(result.summary).toMatchObject({
      transactionCount: 1,
      caseCount: 1,
      stepCount: 2,
      executedCaseCount: 1,
      failedCount: 1,
    });
    expect(result.transactions[0]).toMatchObject({
      code: "QES001",
      name: "开户资格查询",
      caseCount: 1,
      executedCaseCount: 1,
      failedCount: 1,
    });
    expect(result.transactions[0].cases.map((item) => item.id)).toEqual([
      "case-1",
    ]);
    expect(result.transactions[0].cases[0].latestExecution).toMatchObject({
      source: "api-test",
      status: "failed",
      runId: "run-1",
    });
    expect(result.transactions[0].cases[0].steps).toMatchObject([
      {
        id: "step-1",
        name: "查询客户信息",
        executionStatus: "passed",
        durationMs: 300,
      },
      {
        id: "step-2",
        name: "校验账户状态",
        executionStatus: "failed",
        durationMs: 700,
        error: "账户状态不匹配",
      },
    ]);
  });

  it("优先展示较新的测管执行推送结果", async () => {
    const { service } = buildService({
      preproductionRows: [
        {
          projectId: "project-1",
          transactionId: "tx-1",
          caseId: "case-1",
          runId: "run-1",
          executionStatus: "passed",
          pushStatus: "success",
          reportUrl: "https://test.example.com/report/run-1",
          createdAt: new Date("2026-10-22T02:00:00.000Z"),
          finishedAt: new Date("2026-10-22T02:00:01.000Z"),
        },
      ],
    });

    const result = await RequestContext.run("dispatcher", () =>
      service.getByRequirementId("req-1"),
    );

    expect(result.summary).toMatchObject({
      passedCount: 1,
      failedCount: 0,
      pushSuccessCount: 1,
    });
    expect(result.transactions[0].cases[0].latestExecution).toMatchObject({
      source: "preproduction",
      status: "passed",
      pushStatus: "success",
      reportUrl: "https://test.example.com/report/run-1",
    });
  });
});
