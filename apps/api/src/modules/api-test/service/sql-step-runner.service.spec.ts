import { NotFoundException } from "@nestjs/common";
import { SqlStepRunnerService } from "./sql-step-runner.service";
import { createDatabasePool } from "@api-test/util/database-pool.util";

jest.mock("@api-test/util/database-pool.util", () => ({
  createDatabasePool: jest.fn(),
}));

const createPoolMock = createDatabasePool as jest.MockedFunction<
  typeof createDatabasePool
>;

function buildService(connection?: Record<string, unknown>) {
  const connectionRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: "db-1",
      name: "账务库",
      type: "MySQL",
      host: "127.0.0.1",
      port: 3306,
      databaseName: "core",
      username: "tester",
      readonly: true,
      ...connection,
    }),
  };
  return new SqlStepRunnerService(connectionRepo as never);
}

function mockPool(query: jest.Mock, runRolledBack?: jest.Mock) {
  createPoolMock.mockResolvedValue({
    query,
    end: jest.fn().mockResolvedValue(undefined),
    ...(runRolledBack ? { runRolledBack } : {}),
  } as never);
}

describe("SqlStepRunnerService", () => {
  beforeEach(() => createPoolMock.mockReset());

  it("只读连接不允许执行 update", async () => {
    const service = buildService({ readonly: true });
    await expect(
      service.run({
        connectionId: "db-1",
        mode: "execute",
        sql: "update t_switch set status = 1 where id = 1",
      }),
    ).rejects.toThrow("标记为只读");
    expect(createPoolMock).not.toHaveBeenCalled();
  });

  it("update 必须带 where，校验收在连库之前", async () => {
    const service = buildService({ readonly: false });
    await expect(
      service.run({
        connectionId: "db-1",
        mode: "execute",
        sql: "update t_switch set status = 1",
      }),
    ).rejects.toThrow("where");
    expect(createPoolMock).not.toHaveBeenCalled();
  });

  it("update 影响 0 行直接报错", async () => {
    const service = buildService({ readonly: false });
    mockPool(jest.fn().mockResolvedValue([[], undefined, { affectedRows: 0 }]));
    await expect(
      service.run({
        connectionId: "db-1",
        mode: "execute",
        sql: "update t_switch set status = 1 where id = '9'",
      }),
    ).rejects.toThrow("影响 0 行");
  });

  it("影响行数超过上限报错", async () => {
    const service = buildService({ readonly: false });
    mockPool(
      jest.fn().mockResolvedValue([[], undefined, { affectedRows: 12 }]),
    );
    await expect(
      service.run({
        connectionId: "db-1",
        mode: "execute",
        sql: "update t_switch set status = 1 where tenant = 'a'",
        maxAffectedRows: 5,
      }),
    ).rejects.toThrow("超过上限 5 行");
  });

  it("查询返回行与行数，SQL 原样执行不做绑定", async () => {
    const service = buildService({ readonly: true });
    const query = jest
      .fn()
      .mockResolvedValue([[{ id: 1 }, { id: 2 }], [], { rowCount: 2 }]);
    mockPool(query);
    const result = await service.run({
      connectionId: "db-1",
      mode: "query",
      sql: "select id from t_user where id > '0'",
    });
    expect(result.rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.rowCount).toBe(2);
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: "select id from t_user where id > '0'",
      }),
      [],
    );
  });

  it("驱动不上报影响行数时跳过行数护栏", async () => {
    const service = buildService({ readonly: false });
    mockPool(jest.fn().mockResolvedValue([[], undefined, {}]));
    await expect(
      service.run({
        connectionId: "db-1",
        mode: "execute",
        sql: "update t_switch set status = 1 where id = '1'",
      }),
    ).resolves.toMatchObject({ affectedRows: undefined, rowCount: 0 });
  });

  it("连接不存在时报 404 文案", async () => {
    const connectionRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new SqlStepRunnerService(connectionRepo as never);
    await expect(
      service.run({
        connectionId: "missing",
        mode: "query",
        sql: "select 1",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("SqlStepRunnerService 试运行", () => {
  beforeEach(() => createPoolMock.mockReset());

  it("返回列名与前若干行", async () => {
    const service = buildService({ readonly: true });
    mockPool(
      jest.fn().mockResolvedValue([
        [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
        ],
        [],
        { rowCount: 2 },
      ]),
    );
    await expect(
      service.preview({ connectionId: "db-1", sql: "select id, name from t" }),
    ).resolves.toMatchObject({
      columns: ["id", "name"],
      rowCount: 2,
      truncated: false,
      connectionName: "账务库",
    });
  });

  it("结果为空时用驱动的字段元数据给出列名", async () => {
    const service = buildService({ readonly: true });
    mockPool(
      jest
        .fn()
        .mockResolvedValue([[], [{ name: "id" }, { name: "amount" }], {}]),
    );
    await expect(
      service.preview({ connectionId: "db-1", sql: "select * from t" }),
    ).resolves.toMatchObject({ columns: ["id", "amount"], rowCount: 0 });
  });

  it("超过 50 行只返回前 50 行并标记截断", async () => {
    const service = buildService({ readonly: true });
    const rows = Array.from({ length: 80 }, (_, index) => ({ id: index }));
    mockPool(jest.fn().mockResolvedValue([rows, [], { rowCount: 80 }]));
    const result = await service.preview({
      connectionId: "db-1",
      sql: "select id from t",
    });
    expect(result.rows).toHaveLength(50);
    expect(result.rowCount).toBe(80);
    expect(result.truncated).toBe(true);
  });

  it("改数据语句在事务里执行后回滚，只报告影响行数", async () => {
    const service = buildService({ readonly: false });
    const runRolledBack = jest
      .fn()
      .mockResolvedValue([[], undefined, { affectedRows: 3 }]);
    mockPool(jest.fn(), runRolledBack);
    await expect(
      service.preview({
        connectionId: "db-1",
        sql: "update t_switch set status = 1 where id = '1'",
      }),
    ).resolves.toMatchObject({
      rolledBack: true,
      affectedRows: 3,
      rows: [],
      connectionName: "账务库",
    });
    expect(runRolledBack).toHaveBeenCalledWith(
      "update t_switch set status = 1 where id = '1'",
      [],
    );
  });

  it("只读连接也允许改数据试运行（回滚不落库）", async () => {
    const service = buildService({ readonly: true });
    mockPool(
      jest.fn(),
      jest.fn().mockResolvedValue([[], undefined, { affectedRows: 1 }]),
    );
    await expect(
      service.preview({
        connectionId: "db-1",
        sql: "update t_switch set status = 1 where id = '1'",
      }),
    ).resolves.toMatchObject({ rolledBack: true, affectedRows: 1 });
  });

  it("驱动不支持回滚时明确报错", async () => {
    const service = buildService({ readonly: false });
    mockPool(jest.fn());
    await expect(
      service.preview({
        connectionId: "db-1",
        sql: "update t_switch set status = 1 where id = '1'",
      }),
    ).rejects.toThrow("暂不支持改数据试运行");
  });
});
