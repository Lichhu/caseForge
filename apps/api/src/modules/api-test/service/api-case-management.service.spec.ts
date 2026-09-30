import { DataSource } from "typeorm";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RequestContext } from "@common/audit/request-context";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { ApiTestCaseEntity } from "../entity/api-test-case.entity";
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

describe("managed cases server pagination", () => {
  let source: MetadataSource;
  let service: ApiCaseManagementService;
  beforeAll(async () => {
    source = new MetadataSource({
      type: "mysql",
      database: "test",
      entities: [
        ApiTestCaseEntity,
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
      source.getRepository(ApiTestCaseEntity),
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
    for (const alias of ["c", "e", "t", "p", "newer", "ne"])
      expect(sql).toContain(`\`${alias}\`.\`deleted_at\` IS NULL`);
    for (const alias of ["c", "t", "p"])
      expect(sql).toContain(`\`${alias}\`.\`createdBy\` = ?`);
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("`ne`.`transactionId` = `e`.`transactionId`");
  });
  it("applies keyword outside the latest-version subquery, escapes literal wildcards", () => {
    const qb = (service as any).filtered(
      query({ keyword: "_%!", projectId: "p", transactionId: "t" }),
    );
    expect(qb.getParameters()).toMatchObject({
      keyword: "%!_!%!!%",
      projectId: "p",
      transactionId: "t",
    });
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
      "t.id",
      "c.title",
      "c.enabled",
    ]);
  });
  it("rejects incomplete or inaccessible export selection", async () => {
    const qb = (service as any).base();
    jest.spyOn(service as any, "base").mockReturnValue(qb);
    jest.spyOn(qb, "getMany").mockResolvedValue([]);
    await expect(service.details(["missing"])).rejects.toThrow("无权访问");
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
