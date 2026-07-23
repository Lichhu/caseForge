import { BadRequestException } from "@nestjs/common";
import { createHash } from "crypto";
import { RequestContext } from "@common/audit/request-context";
import { SmpSyncService } from "@api-test/service/smp-sync.service";
import type { SmpTransactionCandidate } from "@api-test/service/smp-sync.service";

function hashData(data: unknown, ignoredKey?: string) {
  return createHash("sha256")
    .update(
      JSON.stringify(data, (key, value) =>
        key === ignoredKey ? undefined : value,
      ),
    )
    .digest("hex");
}

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
  const smpClient = {
    selectServiceInfoList: jest.fn(),
    selectCallServiceInfoList: jest.fn(),
    selectTestInfoList: jest.fn(),
  };

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
    smpClient,
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

function makeCallServiceResponse(data: unknown[] = [{ id: 1 }]) {
  return {
    bizResCode: "000000",
    bizResText: "ok",
    data,
  };
}

function makeTestInfoResponse(data: unknown[] = [{ id: 2 }]) {
  return {
    bizResCode: "000000",
    bizResText: "ok",
    data,
  };
}

function makeTransaction(
  overrides?: Partial<{ syncStatus: string; reqCode: string | null }>,
) {
  return {
    id: "tx-1",
    code: "PCBS03901001",
    reqCode: "REQ001",
    taskId: "TASK001",
    serviceCode: "SVC001",
    reqSystemId: "SYS001",
    syncStatus: overrides?.syncStatus ?? "pending",
  };
}

function makeDoc(overrides?: {
  lastSmpCallServiceHash?: string;
  lastSmpTestInfoHash?: string;
  lastGeneratedSmpCallServiceHash?: string;
  lastGeneratedSmpTestInfoHash?: string;
}) {
  return {
    id: "doc-1",
    projectId: "p1",
    transactionId: "tx-1",
    lastSmpCallServiceHash: overrides?.lastSmpCallServiceHash,
    lastSmpTestInfoHash: overrides?.lastSmpTestInfoHash,
    lastGeneratedSmpCallServiceHash: overrides?.lastGeneratedSmpCallServiceHash,
    lastGeneratedSmpTestInfoHash: overrides?.lastGeneratedSmpTestInfoHash,
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

describe("SmpSyncService.refreshTransactionDocumentFromSmp", () => {
  it("keeps pending when first refresh has no previous hash", async () => {
    const { service, transactionRepo, apiDocRepo, smpClient } = buildService();
    transactionRepo.findOne.mockResolvedValue(makeTransaction());
    apiDocRepo.findOne.mockResolvedValue(makeDoc());
    smpClient.selectCallServiceInfoList.mockResolvedValue(
      makeCallServiceResponse(),
    );
    smpClient.selectTestInfoList.mockResolvedValue(makeTestInfoResponse());

    const result = await RequestContext.run("test-user", () =>
      service.refreshTransactionDocumentFromSmp("p1", "tx-1"),
    );

    expect(result.syncStatus).toBe("pending");
    expect(result.needsRegenerate).toBe(false);
    expect(result.changed).toBe(false);
    expect(transactionRepo.save).not.toHaveBeenCalled();
  });

  it("keeps pending when hash changes before any successful generation", async () => {
    const { service, transactionRepo, apiDocRepo, smpClient } = buildService();
    transactionRepo.findOne.mockResolvedValue(makeTransaction());
    apiDocRepo.findOne.mockResolvedValue(
      makeDoc({ lastSmpCallServiceHash: "old-hash" }),
    );
    smpClient.selectCallServiceInfoList.mockResolvedValue(
      makeCallServiceResponse([{ id: "new" }]),
    );
    smpClient.selectTestInfoList.mockResolvedValue(makeTestInfoResponse());

    const result = await RequestContext.run("test-user", () =>
      service.refreshTransactionDocumentFromSmp("p1", "tx-1"),
    );

    expect(result.syncStatus).toBe("pending");
    expect(result.needsRegenerate).toBe(false);
    expect(result.changed).toBe(true);
    expect(transactionRepo.save).not.toHaveBeenCalled();
  });

  it("marks changed when success and hash changes", async () => {
    const { service, transactionRepo, apiDocRepo, smpClient } = buildService();
    transactionRepo.findOne.mockResolvedValue(
      makeTransaction({ syncStatus: "success" }),
    );
    apiDocRepo.findOne.mockResolvedValue(
      makeDoc({
        lastSmpCallServiceHash: "old-hash",
        lastGeneratedSmpCallServiceHash: "old-hash",
      }),
    );
    smpClient.selectCallServiceInfoList.mockResolvedValue(
      makeCallServiceResponse([{ id: "new" }]),
    );
    smpClient.selectTestInfoList.mockResolvedValue(makeTestInfoResponse());

    const result = await RequestContext.run("test-user", () =>
      service.refreshTransactionDocumentFromSmp("p1", "tx-1"),
    );

    expect(result.syncStatus).toBe("changed");
    expect(result.needsRegenerate).toBe(true);
    expect(result.changed).toBe(true);
    expect(transactionRepo.save).toHaveBeenCalledTimes(1);
    const saved = transactionRepo.save.mock.calls[0][0] as {
      syncStatus: string;
    };
    expect(saved.syncStatus).toBe("changed");
  });

  it("keeps success when hash unchanged", async () => {
    const { service, transactionRepo, apiDocRepo, smpClient } = buildService();
    const data = [{ id: "same" }];
    const hash = hashData(data);
    const testInfoData = [{ id: "test" }];
    const testInfoHash = hashData(testInfoData, "requestBody");
    transactionRepo.findOne.mockResolvedValue(
      makeTransaction({ syncStatus: "success" }),
    );
    apiDocRepo.findOne.mockResolvedValue(
      makeDoc({
        lastSmpCallServiceHash: hash,
        lastSmpTestInfoHash: testInfoHash,
        lastGeneratedSmpCallServiceHash: hash,
        lastGeneratedSmpTestInfoHash: testInfoHash,
      }),
    );
    smpClient.selectCallServiceInfoList.mockResolvedValue(
      makeCallServiceResponse(data),
    );
    smpClient.selectTestInfoList.mockResolvedValue(
      makeTestInfoResponse(testInfoData),
    );

    const result = await RequestContext.run("test-user", () =>
      service.refreshTransactionDocumentFromSmp("p1", "tx-1"),
    );

    expect(result.syncStatus).toBe("success");
    expect(result.needsRegenerate).toBe(false);
    expect(result.changed).toBe(false);
    expect(transactionRepo.save).not.toHaveBeenCalled();
  });

  it("keeps generating when hash changes during generation", async () => {
    const { service, transactionRepo, apiDocRepo, smpClient } = buildService();
    transactionRepo.findOne.mockResolvedValue(
      makeTransaction({ syncStatus: "generating" }),
    );
    apiDocRepo.findOne.mockResolvedValue(
      makeDoc({ lastSmpCallServiceHash: "old-hash" }),
    );
    smpClient.selectCallServiceInfoList.mockResolvedValue(
      makeCallServiceResponse([{ id: "new" }]),
    );
    smpClient.selectTestInfoList.mockResolvedValue(makeTestInfoResponse());

    const result = await RequestContext.run("test-user", () =>
      service.refreshTransactionDocumentFromSmp("p1", "tx-1"),
    );

    expect(result.syncStatus).toBe("generating");
    expect(result.needsRegenerate).toBe(false);
    expect(result.changed).toBe(true);
    expect(transactionRepo.save).not.toHaveBeenCalled();
  });

  it("keeps changed when already changed regardless of hash", async () => {
    const { service, transactionRepo, apiDocRepo, smpClient } = buildService();
    transactionRepo.findOne.mockResolvedValue(
      makeTransaction({ syncStatus: "changed" }),
    );
    apiDocRepo.findOne.mockResolvedValue(
      makeDoc({ lastSmpCallServiceHash: "old-hash" }),
    );
    smpClient.selectCallServiceInfoList.mockResolvedValue(
      makeCallServiceResponse([{ id: "new" }]),
    );
    smpClient.selectTestInfoList.mockResolvedValue(makeTestInfoResponse());

    const result = await RequestContext.run("test-user", () =>
      service.refreshTransactionDocumentFromSmp("p1", "tx-1"),
    );

    expect(result.syncStatus).toBe("changed");
    expect(result.needsRegenerate).toBe(false);
    expect(result.changed).toBe(true);
    expect(transactionRepo.save).not.toHaveBeenCalled();
  });

  it("keeps failed when hash changes before retry", async () => {
    const { service, transactionRepo, apiDocRepo, smpClient } = buildService();
    transactionRepo.findOne.mockResolvedValue(
      makeTransaction({ syncStatus: "failed" }),
    );
    apiDocRepo.findOne.mockResolvedValue(
      makeDoc({ lastSmpCallServiceHash: "old-hash" }),
    );
    smpClient.selectCallServiceInfoList.mockResolvedValue(
      makeCallServiceResponse([{ id: "new" }]),
    );
    smpClient.selectTestInfoList.mockResolvedValue(makeTestInfoResponse());

    const result = await RequestContext.run("test-user", () =>
      service.refreshTransactionDocumentFromSmp("p1", "tx-1"),
    );

    expect(result.syncStatus).toBe("failed");
    expect(result.needsRegenerate).toBe(false);
    expect(result.changed).toBe(true);
    expect(transactionRepo.save).not.toHaveBeenCalled();
  });

  it("marks changed when success and data changed but no generated hash yet", async () => {
    const { service, transactionRepo, apiDocRepo, smpClient } = buildService();
    transactionRepo.findOne.mockResolvedValue(
      makeTransaction({ syncStatus: "success" }),
    );
    apiDocRepo.findOne.mockResolvedValue(
      makeDoc({ lastSmpCallServiceHash: "old-hash" }),
    );
    smpClient.selectCallServiceInfoList.mockResolvedValue(
      makeCallServiceResponse([{ id: "new" }]),
    );
    smpClient.selectTestInfoList.mockResolvedValue(makeTestInfoResponse());

    const result = await RequestContext.run("test-user", () =>
      service.refreshTransactionDocumentFromSmp("p1", "tx-1"),
    );

    expect(result.syncStatus).toBe("changed");
    expect(result.needsRegenerate).toBe(true);
    expect(result.changed).toBe(true);
    expect(transactionRepo.save).toHaveBeenCalledTimes(1);
  });

  it("keeps success when generated baseline only has callService and testInfo baseline is empty", async () => {
    const { service, transactionRepo, apiDocRepo, smpClient } = buildService();
    const callServiceData = [{ id: "same" }];
    const callServiceHash = hashData(callServiceData);
    transactionRepo.findOne.mockResolvedValue(
      makeTransaction({ syncStatus: "success" }),
    );
    apiDocRepo.findOne.mockResolvedValue(
      makeDoc({
        lastSmpCallServiceHash: callServiceHash,
        lastSmpTestInfoHash: undefined,
        lastGeneratedSmpCallServiceHash: callServiceHash,
        lastGeneratedSmpTestInfoHash: undefined,
      }),
    );
    smpClient.selectCallServiceInfoList.mockResolvedValue(
      makeCallServiceResponse(callServiceData),
    );
    smpClient.selectTestInfoList.mockResolvedValue(
      makeTestInfoResponse([{ id: "new-test" }]),
    );

    const result = await RequestContext.run("test-user", () =>
      service.refreshTransactionDocumentFromSmp("p1", "tx-1"),
    );

    expect(result.syncStatus).toBe("success");
    expect(result.needsRegenerate).toBe(false);
    expect(result.changed).toBe(false);
    expect(transactionRepo.save).not.toHaveBeenCalled();
  });

  it("marks changed when only testInfo changes and full generated baseline exists", async () => {
    const { service, transactionRepo, apiDocRepo, smpClient } = buildService();
    const callServiceData = [{ id: "same" }];
    const callServiceHash = hashData(callServiceData);
    const oldTestInfoData = [{ id: "old-test" }];
    const oldTestInfoHash = hashData(oldTestInfoData, "requestBody");
    transactionRepo.findOne.mockResolvedValue(
      makeTransaction({ syncStatus: "success" }),
    );
    apiDocRepo.findOne.mockResolvedValue(
      makeDoc({
        lastSmpCallServiceHash: callServiceHash,
        lastSmpTestInfoHash: oldTestInfoHash,
        lastGeneratedSmpCallServiceHash: callServiceHash,
        lastGeneratedSmpTestInfoHash: oldTestInfoHash,
      }),
    );
    smpClient.selectCallServiceInfoList.mockResolvedValue(
      makeCallServiceResponse(callServiceData),
    );
    smpClient.selectTestInfoList.mockResolvedValue(
      makeTestInfoResponse([{ id: "new-test" }]),
    );

    const result = await RequestContext.run("test-user", () =>
      service.refreshTransactionDocumentFromSmp("p1", "tx-1"),
    );

    expect(result.syncStatus).toBe("changed");
    expect(result.needsRegenerate).toBe(true);
    expect(result.changed).toBe(true);
    expect(transactionRepo.save).toHaveBeenCalledTimes(1);
  });

  it("ignores requestBody changes when checking SMP changes", async () => {
    const { service, transactionRepo, apiDocRepo, smpClient } = buildService();
    const callServiceData = [{ id: "same" }];
    const callServiceHash = hashData(callServiceData);
    const oldTestInfoData = [{ requestBody: '{"custId":"old"}', requestUrl: "/test" }];
    const testInfoHash = hashData(oldTestInfoData, "requestBody");
    transactionRepo.findOne.mockResolvedValue(
      makeTransaction({ syncStatus: "success" }),
    );
    apiDocRepo.findOne.mockResolvedValue(
      makeDoc({
        lastSmpCallServiceHash: callServiceHash,
        lastSmpTestInfoHash: testInfoHash,
        lastGeneratedSmpCallServiceHash: callServiceHash,
        lastGeneratedSmpTestInfoHash: testInfoHash,
      }),
    );
    smpClient.selectCallServiceInfoList.mockResolvedValue(
      makeCallServiceResponse(callServiceData),
    );
    smpClient.selectTestInfoList.mockResolvedValue(
      makeTestInfoResponse([
        { requestBody: '{"custId":"${FUNC()}"}', requestUrl: "/test" },
      ]),
    );

    const result = await RequestContext.run("test-user", () =>
      service.refreshTransactionDocumentFromSmp("p1", "tx-1"),
    );

    expect(result.changed).toBe(false);
    expect(result.needsRegenerate).toBe(false);
    expect(result.syncStatus).toBe("success");
  });

  it("keeps pending when only testInfo changes and no successful generation", async () => {
    const { service, transactionRepo, apiDocRepo, smpClient } = buildService();
    const callServiceData = [{ id: "same" }];
    const callServiceHash = hashData(callServiceData);
    const oldTestInfoData = [{ id: "old-test" }];
    const oldTestInfoHash = hashData(oldTestInfoData, "requestBody");
    transactionRepo.findOne.mockResolvedValue(
      makeTransaction({ syncStatus: "pending" }),
    );
    apiDocRepo.findOne.mockResolvedValue(
      makeDoc({
        lastSmpCallServiceHash: callServiceHash,
        lastSmpTestInfoHash: oldTestInfoHash,
      }),
    );
    smpClient.selectCallServiceInfoList.mockResolvedValue(
      makeCallServiceResponse(callServiceData),
    );
    smpClient.selectTestInfoList.mockResolvedValue(
      makeTestInfoResponse([{ id: "new-test" }]),
    );

    const result = await RequestContext.run("test-user", () =>
      service.refreshTransactionDocumentFromSmp("p1", "tx-1"),
    );

    expect(result.syncStatus).toBe("pending");
    expect(result.needsRegenerate).toBe(false);
    expect(result.changed).toBe(true);
    expect(transactionRepo.save).not.toHaveBeenCalled();
  });
});
