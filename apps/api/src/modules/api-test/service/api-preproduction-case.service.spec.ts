import { RequestContext } from "@common/audit/request-context";
import { ApiPreproductionCaseService } from "./api-preproduction-case.service";

function makeService(options?: {
  applicationName?: string | null;
  transactionRunnerCaseIds?: string[];
  sourceCases?: unknown[];
  existingPreproduction?: unknown[];
}) {
  const project = {
    id: "p1",
    createdBy: "alice",
    platform: "api-test",
  };
  const transaction = {
    id: "t1",
    projectId: "p1",
    code: "TX1",
    name: "交易一",
    createdBy: "alice",
    runnerCaseIds: options?.transactionRunnerCaseIds ?? ["c1", "missing"],
  };
  const manager = {
    save: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ApiPreproductionCaseService(
    {
      find: jest.fn().mockResolvedValue(options?.sourceCases ?? []),
    } as any,
    {
      find: jest.fn().mockResolvedValue(options?.existingPreproduction ?? []),
      create: jest.fn((value) => value),
    } as any,
    {
      find: jest.fn().mockResolvedValue([transaction]),
    } as any,
    {
      findOne: jest.fn().mockResolvedValue(project),
    } as any,
    {
      findOne: jest.fn().mockResolvedValue({
        id: "r1",
        projectCode: "XQ2026-0001-01",
        projectName: "需求一",
        applicationName:
          options?.applicationName === undefined
            ? "手机银行"
            : options.applicationName,
      }),
    } as any,
    {
      transaction: jest.fn(async (callback) => callback(manager)),
    } as any,
  );
  return { service, manager, transaction };
}

function sourceCase() {
  return {
    id: "c1",
    projectId: "p1",
    endpointId: "e1",
    title: "案例一",
    caseNo: "TX1-001",
    description: "描述",
    remark: "备注",
    applicationPath: "/最新归属",
    transactionCode: "TX1",
    owner: "alice",
    priority: "P1",
    polarity: "positive",
    status: "ready",
    enabled: true,
    preconditions: [],
    request: { method: "GET", path: "/demo" },
    expected: { status: 200 },
    steps: [],
    metadata: {
      versionCode: "20261019-000000",
      generateVersion: 1,
    },
    updatedAt: new Date("2026-10-18T08:00:00.000Z"),
    createdBy: "alice",
    modifiedBy: "alice",
    endpoint: {
      id: "e1",
      projectId: "p1",
      transactionId: "t1",
    },
  };
}

describe("ApiPreproductionCaseService", () => {
  it("previews linked runner cases and skips invalid links", async () => {
    const { service } = makeService({
      sourceCases: [sourceCase()],
      existingPreproduction: [{ id: "c1" }],
    });

    const result = await RequestContext.run("alice", () =>
      service.preview("p1", ["t1"]),
    );

    expect(result.applicationMissing).toBe(false);
    expect(result.invalidCaseCount).toBe(1);
    expect(result.totalLinkedCount).toBe(2);
    expect(result.syncableCount).toBe(1);
    expect(result.cases).toEqual([
      expect.objectContaining({
        id: "c1",
        transactionId: "t1",
        alreadySynced: true,
        enabled: true,
        versionCode: "20261019-000000",
      }),
    ]);
  });

  it("reports missing requirement application without blocking preview", async () => {
    const { service } = makeService({
      applicationName: "  ",
      sourceCases: [sourceCase()],
    });

    const result = await RequestContext.run("alice", () =>
      service.preview("p1", ["t1"]),
    );

    expect(result.applicationMissing).toBe(true);
  });

  it("can check the requirement application before transactions are selected", async () => {
    const { service } = makeService();

    const result = await RequestContext.run("alice", () =>
      service.preview("p1", []),
    );

    expect(result.applicationMissing).toBe(false);
    expect(result.transactions).toEqual([]);
    expect(result.cases).toEqual([]);
  });

  it("does not overwrite an existing preproduction case", async () => {
    const { service, manager } = makeService({
      sourceCases: [sourceCase()],
      existingPreproduction: [
        { id: "c1", createdBy: "alice", deletedAt: null },
      ],
    });

    const result = await RequestContext.run("alice", () =>
      service.syncSelectedCases("p1", ["t1"], ["c1", "missing"]),
    );

    expect(result).toMatchObject({
      created: 0,
      updated: 0,
      skipped: 2,
      total: 2,
      transactionCount: 1,
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it("allows syncing again after the preproduction case is deleted", async () => {
    const { service, manager } = makeService({
      sourceCases: [sourceCase()],
      existingPreproduction: [
        {
          id: "c1",
          createdBy: "alice",
          deletedAt: new Date("2026-10-19T00:00:00.000Z"),
        },
      ],
    });

    const result = await RequestContext.run("alice", () =>
      service.syncSelectedCases("p1", ["t1"], ["c1"]),
    );

    expect(result).toMatchObject({
      created: 0,
      updated: 1,
      skipped: 0,
      total: 1,
      transactionCount: 1,
    });
    const savedRows = manager.save.mock.calls[0][1];
    expect(savedRows[0]).toMatchObject({
      id: "c1",
      deletedAt: null,
      applicationPath: "手机银行",
      versionCode: "20261019-000000",
      generateVersion: 1,
    });
    expect(savedRows[0].snapshot.request).toEqual({
      method: "GET",
      path: "/demo",
    });
  });

  it("blocks sync when the requirement application is empty", async () => {
    const { service } = makeService({ applicationName: "" });

    await expect(
      RequestContext.run("alice", () =>
        service.syncSelectedCases("p1", ["t1"], ["c1"]),
      ),
    ).rejects.toThrow("维护需求所属应用");
  });
});
