import { DataSource } from "typeorm";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RequestContext } from "@common/audit/request-context";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { ApiPreproductionCaseEntity } from "../entity/api-preproduction-case.entity";
import { ApiEndpointEntity } from "../entity/api-endpoint.entity";
import { ApiTransactionEntity } from "../entity/api-transaction.entity";
import { ApiDocEntity } from "../entity/api-doc.entity";
import {
  ListManagedCasesDto,
  ManagedCaseDetailsDto,
} from "../dto/list-managed-cases.dto";
import { ApiCaseManagementService } from "./api-case-management.service";

class MetadataSource extends DataSource {
  async prepare() {
    await this.buildMetadatas();
  }
}

describe("preproduction cases server pagination", () => {
  let source: MetadataSource;
  let service: ApiCaseManagementService;
  beforeAll(async () => {
    source = new MetadataSource({
      type: "mysql",
      database: "test",
      entities: [
        ApiPreproductionCaseEntity,
        ApiEndpointEntity,
        ApiTransactionEntity,
        ApiDocEntity,
        CaseProjectEntity,
      ],
    });
    // ts-jest isolatedModules 会将跨包字符串联合类型的 design:type 降为 Object；
    // 此处只构建 SQL 元数据，不连接数据库，修正测试编译器的类型擦除。
    const normalize = source.driver.normalizeType.bind(source.driver);
    const typeShim = jest
      .spyOn(source.driver, "normalizeType")
      .mockImplementation((column) =>
        normalize(
          (column.type as unknown) === Object
            ? { ...column, type: String }
            : column,
        ),
      );
    await source.prepare();
    typeShim.mockRestore();
    service = new ApiCaseManagementService(
      source.getRepository(ApiPreproductionCaseEntity),
      { query: jest.fn() } as unknown as DataSource,
    );
  });
  afterEach(() => jest.restoreAllMocks());
  function query(input: Partial<ListManagedCasesDto> = {}) {
    return Object.assign(new ListManagedCasesDto(), input);
  }
  it("loads execution versions and plans from the test-platform database", async () => {
    const testDb = (service as any).testDb as DataSource;
    const queryMock = jest
      .spyOn(testDb, "query")
      .mockResolvedValueOnce([
        { id: 29, name: "版本 29", versionTime: "2026-09-29" },
      ])
      .mockResolvedValueOnce([
        { id: 300, pid: 0, versionId: 29, name: "应用", roundNum: 1 },
      ]);
    await expect(service.executionVersions()).resolves.toEqual([
      { id: "29", name: "版本 29", versionTime: "2026-09-29" },
    ]);
    await expect(service.executionPlans(29, 0)).resolves.toEqual([
      { id: "300", pid: "0", versionId: "29", name: "应用", roundNum: 1 },
    ]);
    expect(queryMock.mock.calls[1][1]).toEqual([29, 0]);
  });
  it("limits queries in TypeORM, with deterministic ordering and database count", async () => {
    const qb = (service as any).filtered(query());
    const mock = jest.spyOn(qb, "getManyAndCount").mockResolvedValue([[], 45]);
    jest.spyOn(service as any, "filtered").mockReturnValue(qb);
    const result = await service.list(query({ page: 3, pageSize: 10 }));
    expect(qb.expressionMap.skip).toBe(20);
    expect(qb.expressionMap.take).toBe(10);
    expect(qb.expressionMap.orderBys).toEqual({
      "c.createdAt": "DESC",
      "c.id": "DESC",
    });
    expect(result).toEqual({ rows: [], count: 45, page: 3, pageSize: 10 });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("scopes joins to owner and excludes deleted records, including version comparison", () => {
    const qb = RequestContext.run("alice", () =>
      (service as any).filtered(query()),
    );
    const sql = qb.getSql();
    expect(qb.getParameters().user).toBe("alice");
    for (const alias of ["c", "e", "t", "p", "newer"])
      expect(sql).toContain(`\`${alias}\`.\`deleted_at\` IS NULL`);
    for (const alias of ["c", "t", "p"])
      expect(sql).toContain(`\`${alias}\`.\`createdBy\` = ?`);
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("`newer`.`transactionId` = `c`.`transactionId`");
  });
  it("applies keyword outside the latest-version subquery, escapes literal wildcards", () => {
    const qb = (service as any).filtered(
      query({
        keyword: "_%!",
        projectId: "p",
        transactionId: "t",
        applicationPath: "/手机银行",
      }),
    );
    expect(qb.getParameters()).toMatchObject({
      keyword: "%!_!%!!%",
      projectId: "p",
      transactionId: "t",
      applicationPath: "/手机银行",
      applicationPathPrefix: "/手机银行/%",
    });
    expect(qb.getSql()).toContain("`c`.`applicationPath` LIKE ? ESCAPE '!'");
    expect(qb.getSql()).toContain("ESCAPE '!'");
    const sql = qb.getQuery();
    expect(sql.indexOf("NOT EXISTS")).toBeLessThan(
      sql.indexOf("LIKE :keyword"),
    );
  });
  it("can disable latest filter and rejects version selection without transaction", () => {
    expect(
      (service as any).filtered(query({ latestOnly: false })).getSql(),
    ).not.toContain("NOT EXISTS");
    expect(() =>
      (service as any).filtered(query({ versionCode: "V1" })),
    ).toThrow("选择交易");
  });
  it("selection queries only lightweight fields without loading request/steps", async () => {
    const qb = (service as any).filtered(query());
    jest.spyOn(service as any, "filtered").mockReturnValue(qb);
    jest.spyOn(qb, "getRawMany").mockResolvedValue([]);
    await service.selection(query());
    const fields = qb.expressionMap.selects.map(
      (s: { selection: string }) => s.selection,
    );
    expect(fields).toEqual([
      "c.id",
      "c.projectId",
      "c.transactionId",
      "c.title",
      "c.enabled",
      "c.applicationPath",
    ]);
  });
  it("rejects incomplete or inaccessible export selection", async () => {
    const qb = (service as any).base();
    jest.spyOn(service as any, "base").mockReturnValue(qb);
    jest.spyOn(qb, "getMany").mockResolvedValue([]);
    await expect(service.details(["missing"])).rejects.toThrow("无权访问");
  });
  it("soft deletes accessible preproduction cases without touching source cases", async () => {
    const qb = (service as any).base();
    jest.spyOn(service as any, "base").mockReturnValue(qb);
    jest.spyOn(qb, "getMany").mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const softDelete = jest
      .spyOn((service as any).cases, "softDelete")
      .mockResolvedValue({ affected: 2 } as any);

    await expect(
      RequestContext.run("alice", () => service.deleteCases(["a", "b"])),
    ).resolves.toEqual({ deleted: 2 });
    expect(softDelete).toHaveBeenCalledTimes(1);
  });
  it("does not delete when any selected preproduction case is inaccessible", async () => {
    const qb = (service as any).base();
    jest.spyOn(service as any, "base").mockReturnValue(qb);
    jest.spyOn(qb, "getMany").mockResolvedValue([{ id: "a" }]);
    const softDelete = jest.spyOn((service as any).cases, "softDelete");

    await expect(
      RequestContext.run("alice", () => service.deleteCases(["a", "missing"])),
    ).rejects.toThrow("无权访问");
    expect(softDelete).not.toHaveBeenCalled();
  });
  it("updates the preproduction step snapshot without touching the source case", async () => {
    const row = {
      id: "c1",
      title: "案例一",
      snapshot: {
        request: {
          method: "GET",
          path: "/old",
          transport: "http",
          encoding: "UTF-8",
        },
        expected: {},
        metadata: { debugEncoding: "UTF-8" },
        steps: [
          {
            id: "s1",
            name: "步骤一",
            isMainRequest: true,
            request: {
              method: "GET",
              path: "/old",
              transport: "http",
              encoding: "UTF-8",
            },
            expected: {},
            exports: [],
            target: {
              name: "旧环境",
              address: "https://old.example.com",
              environmentId: "env-old",
              environmentServiceId: "service-old",
            },
          },
        ],
      },
    };
    const qb = (service as any).base();
    jest.spyOn(service as any, "base").mockReturnValue(qb);
    jest.spyOn(qb, "getOne").mockResolvedValue(row);
    const save = jest
      .spyOn((service as any).cases, "save")
      .mockImplementation(async (value) => value);
    jest.spyOn(service as any, "publicRow").mockReturnValue({ id: "c1" });

    await RequestContext.run("alice", () =>
      service.updateCaseStep("c1", "s1", {
        name: "新步骤",
        targetAddress: "https://new.example.com",
        transport: "tcp",
        method: "PATCH",
        encoding: "GBK",
        path: "/new",
        body: { value: 1 },
      }),
    );

    const saved = save.mock.calls[0][0] as any;
    expect(saved.snapshot.steps[0].target.address).toBe(
      "https://new.example.com",
    );
    expect(saved.snapshot.steps[0].target.environmentId).toBeUndefined();
    expect(saved.snapshot.steps[0].name).toBe("新步骤");
    expect(saved.snapshot.steps[0].request).toMatchObject({
      transport: "tcp",
      method: "PATCH",
      path: "/new",
      encoding: "GBK",
      body: { value: 1 },
    });
    expect(saved.snapshot.request).toMatchObject({
      transport: "tcp",
      method: "PATCH",
      path: "/new",
    });
    expect(saved.snapshot.metadata.debugEncoding).toBe("GBK");
  });

  it("updates the full preproduction request step from the shared step editor", async () => {
    const row = {
      id: "c1",
      title: "案例一",
      snapshot: {
        request: { method: "GET", path: "/old", transport: "http" },
        expected: {},
        metadata: {},
        steps: [
          {
            id: "s1",
            name: "步骤一",
            isMainRequest: true,
            request: {
              method: "GET",
              path: "/old",
              transport: "http",
              encoding: "UTF-8",
            },
            expected: {},
            exports: [],
            target: {
              name: "旧环境",
              address: "https://old.example.com",
              environmentId: "env-old",
              environmentServiceId: "service-old",
            },
          },
        ],
      },
    };
    const qb = (service as any).base();
    jest.spyOn(service as any, "base").mockReturnValue(qb);
    jest.spyOn(qb, "getOne").mockResolvedValue(row);
    const save = jest
      .spyOn((service as any).cases, "save")
      .mockImplementation(async (value) => value);
    jest.spyOn(service as any, "publicRow").mockReturnValue({ id: "c1" });

    await RequestContext.run("alice", () =>
      service.updateCaseStep("c1", "s1", {
        step: {
          ...row.snapshot.steps[0],
          name: "新步骤",
          target: {
            name: "新环境",
            address: "https://new.example.com",
            environmentId: "env-new",
            environmentServiceId: "service-new",
          },
          request: {
            method: "POST",
            path: "/new",
            transport: "http",
            encoding: "GBK",
            contentType: "application/json",
            query: { page: "1" },
            headers: { token: "abc" },
            body: { id: 1 },
            bodyText: '{"id":1}',
          },
          expected: {
            assertions: [
              {
                type: "status",
                operator: "eq",
                expression: "",
                expected: "200",
              },
            ],
          },
          exports: [
            {
              name: "token",
              source: "header",
              expression: "token",
              required: true,
            },
          ],
        },
      }),
    );

    const saved = save.mock.calls[0][0] as any;
    expect(saved.snapshot.steps[0]).toMatchObject({
      name: "新步骤",
      target: {
        name: "新环境",
        address: "https://new.example.com",
        environmentId: "env-new",
        environmentServiceId: "service-new",
      },
      request: {
        method: "POST",
        path: "/new",
        transport: "http",
        encoding: "GBK",
        contentType: "application/json",
        query: { page: "1" },
        headers: { token: "abc" },
        body: { id: 1 },
        bodyText: '{"id":1}',
      },
      exports: [
        {
          name: "token",
          source: "header",
          expression: "token",
          required: true,
        },
      ],
    });
    expect(saved.snapshot.steps[0].expected.assertions).toHaveLength(1);
    expect(saved.snapshot.request).toMatchObject({
      method: "POST",
      path: "/new",
    });
    expect(saved.snapshot.expected.assertions).toHaveLength(1);
    expect(saved.snapshot.metadata.debugEncoding).toBe("GBK");
  });

  it("updates preproduction case title, description and remark only in the snapshot", async () => {
    const row = {
      id: "c1",
      title: "旧名称",
      description: "旧描述",
      remark: "旧备注",
      snapshot: {
        description: "旧描述",
        remark: "旧备注",
        request: {},
        expected: {},
      },
    };
    const qb = (service as any).base();
    jest.spyOn(service as any, "base").mockReturnValue(qb);
    jest.spyOn(qb, "getOne").mockResolvedValue(row);
    const save = jest
      .spyOn((service as any).cases, "save")
      .mockImplementation(async (value) => value);
    jest.spyOn(service as any, "publicRow").mockReturnValue({ id: "c1" });

    await RequestContext.run("alice", () =>
      service.updateCaseInfo("c1", {
        title: "新名称",
        description: "新描述",
        remark: "新备注",
      }),
    );

    const saved = save.mock.calls[0][0] as any;
    expect(saved).toMatchObject({
      title: "新名称",
      description: "新描述",
      remark: "新备注",
    });
    expect(saved.snapshot).toMatchObject({
      description: "新描述",
      remark: "新备注",
    });
  });

  it("deletes a preproduction step and promotes the next HTTP step as main", async () => {
    const row = {
      id: "c1",
      title: "案例一",
      snapshot: {
        request: { method: "GET", path: "/old", transport: "http" },
        expected: { assertions: [] },
        metadata: {},
        steps: [
          {
            id: "s1",
            name: "主请求",
            isMainRequest: true,
            request: { method: "GET", path: "/old", transport: "http" },
            expected: { assertions: [] },
            exports: [],
          },
          {
            id: "s2",
            kind: "db",
            name: "查询数据",
            db: {
              connectionId: "db-1",
              mode: "query",
              sql: "select 1",
            },
            exports: [],
          },
          {
            id: "s3",
            name: "后续请求",
            request: { method: "POST", path: "/next", transport: "http" },
            expected: { assertions: [] },
            exports: [],
          },
        ],
      },
    };
    const qb = (service as any).base();
    jest.spyOn(service as any, "base").mockReturnValue(qb);
    jest.spyOn(qb, "getOne").mockResolvedValue(row);
    const save = jest
      .spyOn((service as any).cases, "save")
      .mockImplementation(async (value) => value);
    jest.spyOn(service as any, "publicRow").mockReturnValue({ id: "c1" });

    await RequestContext.run("alice", () => service.deleteCaseStep("c1", "s1"));

    const saved = save.mock.calls[0][0] as any;
    expect(saved.snapshot.steps.map((step: { id: string }) => step.id)).toEqual(
      ["s2", "s3"],
    );
    expect(saved.snapshot.steps[1]).toMatchObject({
      id: "s3",
      isMainRequest: true,
    });
    expect(saved.snapshot.request).toMatchObject({
      method: "POST",
      path: "/next",
    });
  });

  it("rejects deleting the last preproduction step", async () => {
    const row = {
      id: "c1",
      snapshot: {
        request: { method: "GET", path: "/only", transport: "http" },
        expected: { assertions: [] },
        steps: [
          {
            id: "s1",
            name: "唯一请求",
            isMainRequest: true,
            request: { method: "GET", path: "/only", transport: "http" },
            expected: { assertions: [] },
            exports: [],
          },
        ],
      },
    };
    const qb = (service as any).base();
    jest.spyOn(service as any, "base").mockReturnValue(qb);
    jest.spyOn(qb, "getOne").mockResolvedValue(row);
    const save = jest.spyOn((service as any).cases, "save");

    await expect(
      RequestContext.run("alice", () => service.deleteCaseStep("c1", "s1")),
    ).rejects.toThrow("至少需要保留一个步骤");
    expect(save).not.toHaveBeenCalled();
  });
  it("validates page bounds, sizes, boolean false and export batch limits", async () => {
    expect(
      await validate(
        plainToInstance(ListManagedCasesDto, {
          page: "2",
          pageSize: "20",
          latestOnly: "false",
        }),
      ),
    ).toHaveLength(0);
    expect(
      plainToInstance(ListManagedCasesDto, { latestOnly: "false" }).latestOnly,
    ).toBe(false);
    for (const value of [
      { page: 0 },
      { pageSize: 1000 },
      { latestOnly: "invalid" },
    ])
      expect(
        (await validate(plainToInstance(ListManagedCasesDto, value))).length,
      ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(ManagedCaseDetailsDto, {
            ids: Array.from({ length: 101 }, (_, i) => String(i)),
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
