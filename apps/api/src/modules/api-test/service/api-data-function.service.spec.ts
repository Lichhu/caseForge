import { BadRequestException } from "@nestjs/common";
import { encryptSecrets } from "@api-test/util/secret-crypto.util";
import { ApiDataFunctionService } from "./api-data-function.service";

jest.mock("dmdb", () => ({ getConnection: jest.fn() }));

describe("ApiDataFunctionService", () => {
  const functions = [
    {
      id: "fn-1",
      projectId: "p1",
      name: "MSG_ID",
      params: ["base", "step"],
      type: "template" as const,
      config: {
        parts: [
          { kind: "param", value: "base" },
          { kind: "number", value: "2", operator: "concat" },
          { kind: "param", value: "step", operator: "concat" },
        ],
      },
      description: "",
    },
  ];
  const service = new ApiDataFunctionService(
    {} as never,
    { find: jest.fn().mockResolvedValue(functions) } as never,
  );

  it("resolves function calls in nested request data", async () => {
    await expect(
      service.resolveDeep("p1", { body: { id: "${MSG_ID('00', '3')}" } }),
    ).resolves.toEqual({ body: { id: "0023" } });
  });

  it("loads shared functions without project filtering", async () => {
    await service.resolveDeep("another-project", "${MSG_ID('00', '3')}");

    expect((service as any).functionRepo.find).toHaveBeenLastCalledWith({
      order: { updatedAt: "DESC" },
    });
  });

  it("lists shared database connections without project filtering", async () => {
    const connectionRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: "new",
          name: "公共库",
          updatedAt: new Date(),
          passwordEncrypted: "secret",
        },
        {
          id: "old",
          name: "公共库",
          updatedAt: new Date(0),
          passwordEncrypted: "",
        },
      ]),
    };
    const sharedService = new ApiDataFunctionService(
      connectionRepo as never,
      {} as never,
    );

    await expect(sharedService.listConnections("any-project")).resolves.toEqual(
      [
        expect.objectContaining({
          id: "new",
          name: "公共库",
          hasPassword: true,
        }),
      ],
    );
    expect(connectionRepo.find).toHaveBeenCalledWith({
      order: { updatedAt: "DESC" },
    });
  });

  it("returns a readable error when testing a database connection fails", async () => {
    const connectionService = new ApiDataFunctionService(
      { findOne: jest.fn().mockResolvedValue({ id: "db", type: "MySQL" }) } as never,
      {} as never,
    );
    jest
      .spyOn(connectionService as any, "pool")
      .mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(connectionService.testConnection("p1", "db")).rejects.toThrow(
      "数据库连接失败: connect ECONNREFUSED",
    );
  });

  it("awaits DM8 connection failures", async () => {
    const dmdb = require("dmdb");
    dmdb.getConnection.mockRejectedValueOnce(new Error("[20009] 连接超时"));
    const connectionService = new ApiDataFunctionService({} as never, {} as never);

    await expect(
      (connectionService as any).pool({
        type: "DM8",
        host: "10.0.0.1",
        port: 5236,
        username: "SYSDBA",
        passwordEncrypted: encryptSecrets({ password: "secret" }),
      }),
    ).rejects.toThrow("[20009] 连接超时");
  });

  it("requires a database only for database types that need one", async () => {
    const connectionRepo = { create: jest.fn(), save: jest.fn() };
    const connectionService = new ApiDataFunctionService(
      connectionRepo as never,
      {} as never,
    );

    await expect(
      connectionService.saveConnection("p1", {
        name: "pg",
        type: "PostgreSQL",
        host: "localhost",
        port: 5432,
        username: "user",
      }),
    ).rejects.toThrow("请填写数据库名");
  });

  it("rejects unknown functions before sending a request", async () => {
    await expect(
      service.resolveDeep("p1", "${UNKNOWN()}"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("passes a value from the current XML request body to a function", async () => {
    await expect(
      service.resolveDeep("p1", {
        body: "<Transaction><Header><clientCd>003</clientCd><msgId>${MSG_ID($.Transaction.Header.clientCd, '9')}</msgId></Header></Transaction>",
      }),
    ).resolves.toEqual({
      body: "<Transaction><Header><clientCd>003</clientCd><msgId>00329</msgId></Header></Transaction>",
    });
  });

  it("supports numeric operations", async () => {
    await expect(
      service.preview("p1", {
        name: "ADD",
        params: ["base"],
        type: "template",
        config: {
          parts: [
            { kind: "param", value: "base" },
            { kind: "number", value: "2", operator: "add" },
          ],
        },
        values: { base: "3" },
      }),
    ).resolves.toBe(5);
  });

  it("queries one database row", async () => {
    const query = jest.fn().mockResolvedValue([[{ id: 1 }, { id: 2 }]]);
    const pool = { query, end: jest.fn() };
    const sqlService = new ApiDataFunctionService(
      { findOne: jest.fn().mockResolvedValue({ id: "db" }) } as never,
      {} as never,
    );
    jest.spyOn(sqlService as any, "pool").mockResolvedValue(pool);

    await expect(
      sqlService.preview("p1", {
        name: "ROWS",
        params: [],
        type: "sql",
        config: { connectionId: "db", sql: "SELECT id FROM users" },
        values: {},
      }),
    ).resolves.toEqual({ id: 1 });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({ sql: "SELECT id FROM users LIMIT 1" }),
      [],
    );
  });

  it("supports reading a field from a function result", async () => {
    const objectService = new ApiDataFunctionService(
      {} as never,
      {
        find: jest.fn().mockResolvedValue([{ ...functions[0], name: "ROW" }]),
      } as never,
    );
    jest
      .spyOn(objectService as any, "evaluate")
      .mockResolvedValue({ title: "case title" });

    await expect(
      objectService.resolveDeep("p1", "${ROW().title}"),
    ).resolves.toBe("case title");
  });

  it("runs a sandboxed JavaScript function", async () => {
    await expect(
      service.preview("p1", {
        name: "SCRIPT",
        params: ["value"],
        type: "template",
        config: {
          mode: "javascript",
          script: "function(value) { return value.toUpperCase(); }",
        },
        values: { value: "case" },
      }),
    ).resolves.toBe("CASE");
  });

  it("runs an isolated Python function", async () => {
    await expect(
      service.preview("p1", {
        name: "SCRIPT",
        params: [],
        type: "template",
        config: {
          mode: "python",
          script:
            'def function():\n    return datetime.now().strftime("%Y-%m-%d")',
        },
        values: {},
      }),
    ).resolves.toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rejects scripts without the required function entry", async () => {
    await expect(
      service.preview("p1", {
        name: "SCRIPT",
        params: [],
        type: "template",
        config: { mode: "javascript", script: "42" },
        values: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
