import { RequestContext } from "@common/audit/request-context";
import { ApiTestController } from "./api-test.controller";

function makeController(
  result: {
    statusCode: number;
    body: unknown;
    error?: string;
  } = { statusCode: 200, body: { ok: true } },
) {
  const persistLastDebugRun = jest.fn().mockResolvedValue(undefined);
  const create = jest.fn((value) => value);
  const save = jest.fn().mockResolvedValue(undefined);
  const find = jest.fn().mockResolvedValue([]);
  const softDelete = jest.fn().mockResolvedValue(undefined);
  const previewSql = jest.fn().mockResolvedValue({
    columns: ["flag"],
    rows: [{ flag: "true" }],
    rowCount: 1,
    truncated: false,
    durationMs: 12,
    connectionName: "演示库",
    connection: {
      type: "MySQL",
      host: "127.0.0.1",
      port: 3306,
      databaseName: "case_forge",
      username: "tester",
      readonly: true,
    },
    connectionReadonly: true,
  });
  const controller = Object.create(
    ApiTestController.prototype,
  ) as ApiTestController;
  Object.assign(controller, {
    apiExecutionService: {
      debugRun: jest.fn().mockResolvedValue({
        ...result,
        headers: {
          "content-type": "application/json",
          "set-cookie": "session=secret",
        },
        request: {
          method: "GET",
          path: "/cases",
          headers: { Authorization: "Bearer secret" },
        },
        bodySize: 11,
        durationMs: 8,
        assertions: [],
      }),
    },
    apiCaseService: { persistLastDebugRun },
    sqlStepRunner: { preview: previewSql },
    stepDebugRepo: {
      create,
      save,
      find,
      softDelete,
    },
  });
  return {
    controller,
    persistLastDebugRun,
    create,
    save,
    find,
    softDelete,
    previewSql,
  };
}

describe("ApiTestController step debug records", () => {
  it("persists a preproduction record without updating the project case", async () => {
    const { controller, persistLastDebugRun, save } = makeController();

    const result = await RequestContext.run("alice", () =>
      controller.debugRunCase("p1", {
        request: { method: "GET", path: "/cases" },
        target: { name: "测试环境", address: "http://127.0.0.1:34550" },
        caseId: "c1",
        stepId: "s1",
        caseSource: "preproduction",
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(persistLastDebugRun).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        caseId: "c1",
        caseSource: "preproduction",
        stepId: "s1",
        createdBy: "alice",
        record: expect.objectContaining({
          request: {
            method: "GET",
            path: "/cases",
            headers: { Authorization: "****" },
          },
          response: {
            statusCode: 200,
            headers: {
              "content-type": "application/json",
              "set-cookie": "****",
            },
            body: { ok: true },
            error: undefined,
          },
          target: { name: "测试环境", address: "http://127.0.0.1:34550" },
        }),
      }),
    );
  });

  it("keeps project debug metadata on the project side", async () => {
    const { controller, persistLastDebugRun, save } = makeController();

    await RequestContext.run("alice", () =>
      controller.debugRunCase("p1", {
        request: { method: "GET", path: "/cases" },
        target: { name: "测试环境", address: "http://127.0.0.1:34550" },
        caseId: "c1",
      }),
    );

    expect(persistLastDebugRun).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("queries and clears debug records by their business source", async () => {
    const { controller, find, softDelete } = makeController();

    await RequestContext.run("alice", async () => {
      await controller.listStepDebugRecords("p1", "c1", "s1", "preproduction");
      await controller.clearStepDebugRecords("p1", "c1", "s1", "preproduction");
    });

    const expectedWhere = {
      projectId: "p1",
      caseSource: "preproduction",
      caseId: "c1",
      stepId: "s1",
      createdBy: "alice",
    };
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(softDelete).toHaveBeenCalledWith(expectedWhere);
  });

  it("persists SQL debug snapshots in the same step history", async () => {
    const { controller, previewSql, save } = makeController();

    const result = await RequestContext.run("alice", () =>
      controller.debugSqlStep("p1", {
        connectionId: "db-1",
        sql: "select 1 as flag",
        caseId: "c1",
        stepId: "sql-step-1",
        caseSource: "preproduction",
      }),
    );

    expect(previewSql).toHaveBeenCalledWith({
      connectionId: "db-1",
      sql: "select 1 as flag",
      timeoutMs: undefined,
    });
    expect(result).toMatchObject({
      columns: ["flag"],
      rows: [{ flag: "true" }],
      connectionName: "演示库",
    });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        caseId: "c1",
        caseSource: "preproduction",
        stepId: "sql-step-1",
        createdBy: "alice",
        record: expect.objectContaining({
          request: expect.objectContaining({
            kind: "db",
            connectionId: "db-1",
            mode: "query",
            sql: "select 1 as flag",
          }),
          response: expect.objectContaining({
            statusCode: 200,
            body: expect.objectContaining({
              columns: ["flag"],
              rowCount: 1,
            }),
          }),
          statusCode: 200,
        }),
      }),
    );
  });

  it("persists failed SQL debug attempts", async () => {
    const { controller, previewSql, save } = makeController();
    previewSql.mockRejectedValueOnce(new Error("表不存在"));

    await expect(
      RequestContext.run("alice", () =>
        controller.debugSqlStep("p1", {
          connectionId: "db-1",
          sql: "select * from missing_table",
          caseId: "c1",
          stepId: "sql-step-1",
          caseSource: "preproduction",
        }),
      ),
    ).rejects.toThrow("表不存在");

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          statusCode: 0,
          error: "表不存在",
          request: expect.objectContaining({
            kind: "db",
            connectionId: "db-1",
          }),
        }),
      }),
    );
  });
});
