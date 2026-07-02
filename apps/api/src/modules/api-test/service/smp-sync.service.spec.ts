import { BadRequestException } from "@nestjs/common";
import { RequestContext } from "@common/audit/request-context";
import { SmpSyncService } from "@api-test/service/smp-sync.service";
import type { SmpTransactionCandidate } from "@api-test/service/smp-sync.service";

function createRepoMock() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (e: unknown) => e),
    create: jest.fn((e: unknown) => e),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(0),
  };
}

function createManagerMock() {
  const txRepo = createRepoMock();
  const docRepo = createRepoMock();
  const projectRepo = createRepoMock();
  const manager = {
    getRepository: jest.fn((entity: { name: string }) => {
      if (entity.name === "ApiTransactionEntity") return txRepo;
      if (entity.name === "ApiDocEntity") return docRepo;
      if (entity.name === "CaseProjectEntity") return projectRepo;
      return createRepoMock();
    }),
  };
  return { manager, txRepo, docRepo, projectRepo };
}

function buildService() {
  const transactionRepo = createRepoMock();
  const apiDocRepo = createRepoMock();
  const endpointRepo = createRepoMock();
  const projectRepo = createRepoMock();
  projectRepo.findOne.mockResolvedValue({
    id: "p1",
    platform: "api-test",
    createdBy: "test-user",
  });
  const smpClient = { selectServiceInfoList: jest.fn() };

  const {
    manager,
    txRepo,
    docRepo,
    projectRepo: mgrProjectRepo,
  } = createManagerMock();

  const dataSource = {
    transaction: jest.fn(async (cb: (manager: unknown) => Promise<unknown>) =>
      cb(manager),
    ),
  };

  const service = new SmpSyncService(
    transactionRepo as never,
    apiDocRepo as never,
    endpointRepo as never,
    projectRepo as never,
    dataSource as never,
    smpClient as never,
  );

  return {
    service,
    transactionRepo,
    apiDocRepo,
    projectRepo,
    dataSource,
    manager,
    txRepo,
    docRepo,
    mgrProjectRepo,
  };
}

function makeCandidate(
  overrides?: Partial<SmpTransactionCandidate>,
): SmpTransactionCandidate {
  return {
    code: "PCBS03901001",
    name: "查询客户信息",
    reqCode: "REQ001",
    taskId: "TASK001",
    serviceCode: "SVC001",
    reqSystemId: "SYS001",
    ...overrides,
  };
}

describe("SmpSyncService.syncTransactions", () => {
  it("throws 400 when candidates is empty", async () => {
    const { service } = buildService();
    await expect(service.syncTransactions("p1", [])).rejects.toThrow(
      BadRequestException,
    );
  });

  it("throws 400 on batch-internal duplicate code", async () => {
    const { service } = buildService();
    const c1 = makeCandidate();
    const c2 = makeCandidate({ name: "另一个名字" });
    await expect(
      RequestContext.run("test-user", () =>
        service.syncTransactions("p1", [c1, c2]),
      ),
    ).rejects.toThrow("批量中存在重复服管记录");
  });

  it("throws 400 on batch-internal same code different SMP tuple", async () => {
    const { service } = buildService();
    const c1 = makeCandidate({ taskId: "TASK001" });
    const c2 = makeCandidate({ taskId: "TASK002" });
    await expect(
      RequestContext.run("test-user", () =>
        service.syncTransactions("p1", [c1, c2]),
      ),
    ).rejects.toThrow("批量中存在相同交易码");
  });

  it("throws 400 when code exists locally but not same SMP record", async () => {
    const { service, transactionRepo } = buildService();
    transactionRepo.find.mockResolvedValue([
      {
        id: "tx-1",
        code: "PCBS03901001",
        reqCode: "REQ999",
        taskId: "TASK999",
        serviceCode: "SVC999",
        reqSystemId: "SYS999",
        sortOrder: 0,
      },
    ]);
    const candidate = makeCandidate();
    await expect(
      RequestContext.run("test-user", () =>
        service.syncTransactions("p1", [candidate]),
      ),
    ).rejects.toThrow("已在项目中存在，且非同一服管记录");
  });

  it("creates 2 new transactions + docs in a single transaction", async () => {
    const { service, dataSource, txRepo, docRepo } = buildService();
    const c1 = makeCandidate({ code: "TX001" });
    const c2 = makeCandidate({ code: "TX002", taskId: "TASK002" });

    const result = await RequestContext.run("test-user", () =>
      service.syncTransactions("p1", [c1, c2]),
    );

    expect(result).toEqual({ created: 2, updated: 0 });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(txRepo.save).toHaveBeenCalledTimes(2);
    expect(docRepo.save).toHaveBeenCalledTimes(2);
  });

  it("updates existing transaction without creating new doc", async () => {
    const { service, transactionRepo, txRepo, docRepo } = buildService();
    const existing = {
      id: "tx-1",
      code: "PCBS03901001",
      reqCode: "REQ001",
      taskId: "TASK001",
      serviceCode: "SVC001",
      reqSystemId: "SYS001",
      sortOrder: 0,
      syncStatus: "pending",
    };
    transactionRepo.find.mockResolvedValue([existing]);

    const result = await RequestContext.run("test-user", () =>
      service.syncTransactions("p1", [makeCandidate()]),
    );

    expect(result).toEqual({ created: 0, updated: 1 });
    expect(txRepo.save).toHaveBeenCalledTimes(1);
    expect(docRepo.save).not.toHaveBeenCalled();
  });

  it("rolls back if second create fails (transaction semantics)", async () => {
    const { service, dataSource, txRepo } = buildService();
    txRepo.save
      .mockResolvedValueOnce({ id: "tx-1" })
      .mockRejectedValueOnce(new Error("DB constraint violation"));

    const c1 = makeCandidate({ code: "TX001" });
    const c2 = makeCandidate({ code: "TX002", taskId: "TASK002" });

    await expect(
      RequestContext.run("test-user", () =>
        service.syncTransactions("p1", [c1, c2]),
      ),
    ).rejects.toThrow("DB constraint violation");
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it("assigns sequential sortOrder starting from existing count", async () => {
    const { service, transactionRepo, txRepo } = buildService();
    transactionRepo.find.mockResolvedValue([
      {
        id: "tx-a",
        code: "OLD001",
        reqCode: "R1",
        taskId: "T1",
        serviceCode: "S1",
        reqSystemId: "Y1",
        sortOrder: 0,
      },
      {
        id: "tx-b",
        code: "OLD002",
        reqCode: "R2",
        taskId: "T2",
        serviceCode: "S2",
        reqSystemId: "Y2",
        sortOrder: 1,
      },
    ]);

    const c1 = makeCandidate({ code: "NEW001" });
    const c2 = makeCandidate({ code: "NEW002", taskId: "TASK002" });

    await RequestContext.run("test-user", () =>
      service.syncTransactions("p1", [c1, c2]),
    );

    const firstCreate = txRepo.create.mock.calls[0][0] as {
      sortOrder: number;
    };
    const secondCreate = txRepo.create.mock.calls[1][0] as {
      sortOrder: number;
    };
    expect(firstCreate.sortOrder).toBe(2);
    expect(secondCreate.sortOrder).toBe(3);
  });
});
