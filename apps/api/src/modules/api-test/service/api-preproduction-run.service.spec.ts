import { RequestContext } from "@common/audit/request-context";
import { ApiPreproductionRunService } from "./api-preproduction-run.service";

function makeService(options?: {
  run?: unknown;
  runError?: Error;
  publishError?: Error;
}) {
  const preproductionCase = {
    id: "case-1",
    projectId: "project-1",
    transactionId: "transaction-1",
    title: "准生产案例",
    enabled: true,
    snapshot: {
      steps: [
        { id: "step-1", name: "登录" },
        { id: "step-2", name: "查询余额" },
      ],
    },
  };
  const create = jest.fn((value) => ({
    ...value,
    id: value.id ?? "record-1",
    createdAt: new Date("2026-10-27T00:00:00.000Z"),
  }));
  const records = {
    create,
    save: jest.fn(async (row) => row),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    softDelete: jest.fn(),
  };
  const runSet = {
    id: "set-1",
    versionId: "version-1",
    versionLabel: "V1",
    applicationId: "application-1",
    applicationLabel: "手机银行",
    roundId: "round-1",
    roundLabel: "第一轮",
    status: "running",
    totalCount: 2,
    completedCount: 0,
    passedCount: 0,
    failedCount: 0,
    errorCount: 0,
    pushSuccessCount: 0,
    pushFailedCount: 0,
    createdBy: "alice",
    createdAt: new Date("2026-10-27T00:00:00.000Z"),
  };
  const runSets = {
    create: create,
    save: jest.fn(async (row) => row),
    find: jest.fn().mockResolvedValue([runSet]),
    findAndCount: jest.fn().mockResolvedValue([[runSet], 21]),
    findOne: jest.fn().mockResolvedValue(runSet),
    softDelete: jest.fn(),
  };
  const preproductionCases = {
    findOne: jest.fn().mockResolvedValue(preproductionCase),
    find: jest.fn().mockResolvedValue([preproductionCase]),
  };
  const runSetCases = {
    create: (value: Record<string, unknown>) => ({
      ...value,
      id: value.id ?? "member-1",
    }),
    save: jest.fn(async (row) => row),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({
      id: "member-1",
      runSetId: "set-1",
      caseId: "case-1",
    }),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn(),
    softDelete: jest.fn(),
  };
  const execution = {
    runCases: options?.runError
      ? jest.fn().mockRejectedValue(options.runError)
      : jest.fn().mockResolvedValue(options?.run),
  };
  const delivery = {
    publish: options?.publishError
      ? jest.fn().mockRejectedValue(options.publishError)
      : jest.fn().mockResolvedValue({
          reportUrl: "https://smp.example/reports/run-1.html",
        }),
  };
  const service = new ApiPreproductionRunService(
    records as never,
    runSets as never,
    runSetCases as never,
    preproductionCases as never,
    execution as never,
    delivery as never,
  );
  return { service, records, runSets, runSetCases, preproductionCases, execution, delivery };
}

describe("ApiPreproductionRunService", () => {
  it("executes every step and pushes the single-case report to SMP", async () => {
    const { service, execution, delivery } = makeService({
      run: {
        id: "run-1",
        items: [
          {
            status: "passed",
            requestSnapshot: {
              steps: [
                { stepName: "登录", status: "passed" },
                { stepName: "查询余额", status: "passed" },
              ],
            },
          },
        ],
      },
    });

    const result = await RequestContext.run("alice", () =>
      service.runCaseAndPush("project-1", "case-1", {
        versionId: "version-1",
        applicationId: "application-1",
        roundId: "round-1",
      }, "set-1"),
    );

    expect(execution.runCases).toHaveBeenCalledWith(
      expect.objectContaining({
        caseIds: ["case-1"],
        caseSource: "preproduction",
        concurrency: 1,
      }),
    );
    expect(delivery.publish).toHaveBeenCalledWith(
      "project-1",
      "transaction-1",
      "run-1",
      {
        versionId: "version-1",
        applicationId: "application-1",
        roundId: "round-1",
      },
    );
    expect(result).toMatchObject({
      runSetId: "set-1",
      executionStatus: "passed",
      currentStepIndex: 2,
      currentStepName: "全部 2 个步骤执行完成",
      pushStatus: "success",
      reportUrl: "https://smp.example/reports/run-1.html",
    });
  });

  it("records the step where execution stopped while still pushing its result", async () => {
    const { service, delivery } = makeService({
      run: {
        id: "run-2",
        items: [
          {
            status: "failed",
            requestSnapshot: {
              steps: [
                { stepName: "登录", status: "passed" },
                {
                  stepName: "查询余额",
                  status: "failed",
                  assertions: [
                    {
                      passed: false,
                      message: "余额字段不匹配",
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    });

    const result = await RequestContext.run("alice", () =>
      service.runCaseAndPush("project-1", "case-1", {
        versionId: "version-1",
        applicationId: "application-1",
        roundId: "round-1",
      }),
    );

    expect(delivery.publish).toHaveBeenCalled();
    expect(result).toMatchObject({
      executionStatus: "failed",
      currentStepIndex: 2,
      currentStepName: "查询余额",
      executionError: "余额字段不匹配",
      pushStatus: "success",
    });
  });

  it("records a pre-execution blocker without pushing a report", async () => {
    const { service, delivery } = makeService({
      runError: new Error("案例「准生产案例」的步骤「登录」未指定环境地址"),
    });

    const result = await RequestContext.run("alice", () =>
      service.runCaseAndPush("project-1", "case-1", {
        versionId: "version-1",
        applicationId: "application-1",
        roundId: "round-1",
      }),
    );

    expect(delivery.publish).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      executionStatus: "error",
      currentStepName: "登录",
      executionError: expect.stringContaining("未指定环境地址"),
      pushStatus: "failed",
      pushError: "执行未完成，未推送测管",
    });
  });

  it("retries only the SMP push and updates the existing record", async () => {
    const { service, records, execution, delivery } = makeService();
    records.findOne.mockResolvedValue({
      id: "record-1",
      projectId: "project-1",
      transactionId: "transaction-1",
      caseId: "case-1",
      caseTitle: "准生产案例",
      executionStatus: "passed",
      totalSteps: 2,
      runId: "run-1",
      pushStatus: "failed",
      pushError: "offline",
      versionId: "version-1",
      applicationId: "application-1",
      roundId: "round-1",
      createdBy: "alice",
      createdAt: new Date("2026-10-27T00:00:00.000Z"),
    });

    const result = await RequestContext.run("alice", () =>
      service.retryPush("project-1", "record-1"),
    );

    expect(execution.runCases).not.toHaveBeenCalled();
    expect(delivery.publish).toHaveBeenCalledWith(
      "project-1",
      "transaction-1",
      "run-1",
      {
        versionId: "version-1",
        applicationId: "application-1",
        roundId: "round-1",
      },
    );
    expect(result).toMatchObject({
      pushStatus: "success",
      pushError: null,
      reportUrl: "https://smp.example/reports/run-1.html",
    });
  });

  it("creates and lists execution push sets", async () => {
    const { service, records } = makeService();
    records.find.mockResolvedValue([
      {
        runSetId: "set-1",
        executionStatus: "passed",
        pushStatus: "success",
        createdAt: new Date("2026-10-27T01:00:00.000Z"),
      },
    ]);

    const created = await RequestContext.run("alice", () =>
      service.createRunSet({
        versionId: "version-1",
        versionLabel: "V1",
        applicationId: "application-1",
        applicationLabel: "手机银行",
        roundId: "round-1",
        roundLabel: "第一轮",
        totalCount: 2,
      }),
    );
    const result = await RequestContext.run("alice", () =>
      service.listRunSets({ page: 2, size: 10 }),
    );

    expect(created).toMatchObject({
      totalCount: 2,
      status: "running",
      versionLabel: "V1",
      applicationLabel: "手机银行",
      roundLabel: "第一轮",
    });
    expect(result).toMatchObject({ count: 21, page: 2, size: 10 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].lastExecutedAt).toBe("2026-10-27T01:00:00.000Z");
    expect((service as any).runSets.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it("filters run sets by name or version", async () => {
    const { service, runSets } = makeService();

    await RequestContext.run("alice", () =>
      service.listRunSets({ keyword: " 回归 " }),
    );

    const query = runSets.findAndCount.mock.calls[
      runSets.findAndCount.mock.calls.length - 1
    ][0];
    expect(query.where).toHaveLength(2);
    expect(query.where[0].name.value).toBe("%回归%");
    expect(query.where[1].versionLabel.value).toBe("%回归%");
    expect(query.where[0].createdBy).toBe("alice");
    expect(query.where[1].createdBy).toBe("alice");
  });

  it("creates an empty push set that stays pending until it is executed", async () => {
    const { service } = makeService();

    const created = await RequestContext.run("alice", () =>
      service.createRunSet({
        name: "第一轮核心交易回归",
        versionId: "version-1",
        versionLabel: "V1",
      }),
    );

    expect(created).toMatchObject({
      name: "第一轮核心交易回归",
      totalCount: 0,
      status: "pending",
      applicationId: null,
      applicationLabel: null,
      roundId: null,
      roundLabel: null,
    });
  });

  it("associates selected cases into a push set without running them", async () => {
    const { service, runSetCases, execution } = makeService();
    runSetCases.count.mockResolvedValue(1);
    // 第一次 find 用于查已存在成员，第二次用于返回关联后的成员列表。
    runSetCases.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "member-1",
          runSetId: "set-1",
          caseId: "case-1",
          projectId: "project-1",
          transactionId: "transaction-1",
          caseTitle: "准生产案例",
          sortOrder: 0,
          createdAt: new Date("2026-10-27T00:00:00.000Z"),
        },
      ]);

    const members = await RequestContext.run("alice", () =>
      service.attachCases("set-1", ["case-1"]),
    );

    expect(execution.runCases).not.toHaveBeenCalled();
    expect(runSetCases.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          runSetId: "set-1",
          caseId: "case-1",
          caseTitle: "准生产案例",
        }),
      ]),
    );
    expect(members).toHaveLength(1);
  });

  it("rejects associating a disabled case into a push set", async () => {
    const { service, preproductionCases, runSetCases } = makeService();
    preproductionCases.find.mockResolvedValue([
      {
        id: "case-1",
        projectId: "project-1",
        title: "未启用案例",
        enabled: false,
      },
    ]);

    await expect(
      RequestContext.run("alice", () =>
        service.attachCases("set-1", ["case-1"]),
      ),
    ).rejects.toThrow("未启用");
    expect(runSetCases.save).not.toHaveBeenCalled();
  });

  it("removes a case from the push set membership", async () => {
    const { service, runSetCases } = makeService();
    runSetCases.findOne.mockResolvedValue({
      id: "member-1",
      runSetId: "set-1",
      caseId: "case-1",
    });

    await RequestContext.run("alice", () =>
      service.detachCase("set-1", "case-1"),
    );

    expect(runSetCases.softDelete).toHaveBeenCalledWith({ id: "member-1" });
  });

  it("soft deletes the push set and its members while keeping run records", async () => {
    const { service, runSets, runSetCases, records } = makeService();
    runSets.findOne.mockResolvedValue({
      id: "set-1",
      status: "completed",
      createdBy: "alice",
      createdAt: new Date("2026-10-27T00:00:00.000Z"),
    });

    const result = await RequestContext.run("alice", () =>
      service.deleteRunSet("set-1"),
    );

    expect(result).toEqual({ ok: true });
    expect(runSetCases.softDelete).toHaveBeenCalledWith({ runSetId: "set-1" });
    expect(runSets.softDelete).toHaveBeenCalledWith({ id: "set-1" });
    // 执行记录必须保留，需求进度视图依赖它。
    expect(records.softDelete).not.toHaveBeenCalled();
  });

  it("refuses to delete a push set that is still running", async () => {
    const { service, runSets, runSetCases } = makeService();
    runSets.findOne.mockResolvedValue({
      id: "set-1",
      status: "running",
      createdBy: "alice",
      createdAt: new Date("2026-10-27T00:00:00.000Z"),
    });

    await expect(
      RequestContext.run("alice", () => service.deleteRunSet("set-1")),
    ).rejects.toThrow("执行推送中的集合不能删除");
    expect(runSets.softDelete).not.toHaveBeenCalled();
    expect(runSetCases.softDelete).not.toHaveBeenCalled();
  });

  it("refuses to execute a case that is not a member of the push set", async () => {
    const { service, runSetCases, execution } = makeService();
    runSetCases.findOne.mockResolvedValue(null);

    await expect(
      RequestContext.run("alice", () =>
        service.runCaseAndPush(
          "project-1",
          "case-1",
          {
            versionId: "version-1",
            applicationId: "application-1",
            roundId: "round-1",
          },
          "set-1",
        ),
      ),
    ).rejects.toThrow("未关联到此执行推送集");
    expect(execution.runCases).not.toHaveBeenCalled();
  });
});
