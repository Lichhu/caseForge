import type {
  ManagedCaseOptions,
  ManagedCaseSelection,
} from "@case-forge/shared";
import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { TEST_PLATFORM_CONNECTION } from "@common/test-platform";
import { RequestContext } from "@common/audit/request-context";
import { toPublicApiCase } from "@common/http/public-response.util";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { ApiTestCaseEntity } from "../entity/api-test-case.entity";
import { ApiEndpointEntity } from "../entity/api-endpoint.entity";
import { ApiTransactionEntity } from "../entity/api-transaction.entity";
import { ListManagedCasesDto } from "../dto/list-managed-cases.dto";

// 与生成流程一致：优先比较生成序号；兼容历史日期编码、V+数字编码。
export function managedVersion(alias: string) {
  const field = (name: string) =>
    `NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${alias}.metadata, '$.${name}')), 'null'), '')`;
  const code = field("versionCode");
  const number = field("generateVersion");
  return {
    label: `COALESCE(${code}, CONCAT('V', ${number}), '')`,
    number,
    fallback: `CAST(REPLACE(REPLACE(UPPER(COALESCE(${code}, '0')), 'V', ''), '-', '') AS DECIMAL(24,0))`,
  };
}

type JoinedCase = ApiTestCaseEntity & {
  managementTransaction: ApiTransactionEntity;
  managementProject: CaseProjectEntity;
};

@Injectable()
export class ApiCaseManagementService {
  constructor(
    @InjectRepository(ApiTestCaseEntity)
    private readonly cases: Repository<ApiTestCaseEntity>,
    @InjectDataSource(TEST_PLATFORM_CONNECTION)
    private readonly testDb: DataSource,
  ) {}

  async executionVersions() {
    const rows = await this.testDb.query<
      Array<{ id: string | number; name: string; versionTime: Date | string }>
    >(
      `SELECT id, name, version_time AS versionTime
       FROM t_pre_version
       WHERE data_status = 0
       ORDER BY version_time DESC, id DESC`,
    );
    return rows.map((row) => ({ ...row, id: String(row.id) }));
  }

  async executionPlans(versionId: number, parentId: number) {
    const rows = await this.testDb.query<
      Array<{
        id: string | number;
        pid: string | number;
        versionId: string | number;
        name: string;
        roundNum: string | number | null;
      }>
    >(
      `SELECT id, pid, version_id AS versionId, name, round_num AS roundNum
       FROM t_pre_execute_plan
       WHERE version_id = ? AND data_status = 0 AND pid = ?
       ORDER BY round_num ASC, id ASC`,
      [versionId, parentId],
    );
    return rows.map((row) => ({
      ...row,
      id: String(row.id),
      pid: String(row.pid),
      versionId: String(row.versionId),
    }));
  }

  private base() {
    const user = RequestContext.getUserName();
    return this.cases
      .createQueryBuilder("c")
      .innerJoinAndSelect("c.endpoint", "e")
      .innerJoinAndMapOne(
        "c.managementTransaction",
        ApiTransactionEntity,
        "t",
        "t.id = e.transactionId AND t.projectId = c.projectId",
      )
      .innerJoinAndMapOne(
        "c.managementProject",
        CaseProjectEntity,
        "p",
        "p.id = c.projectId",
      )
      .where(
        "c.createdBy = :user AND p.createdBy = :user AND t.createdBy = :user",
        { user },
      )
      .andWhere("p.platform = :platform", { platform: "api-test" });
  }

  private filtered(query: ListManagedCasesDto) {
    if (query.versionCode && !query.transactionId)
      throw new BadRequestException("选择交易后才可筛选版本");
    const qb = this.base();
    if (query.projectId)
      qb.andWhere("c.projectId = :projectId", { projectId: query.projectId });
    if (query.transactionId)
      qb.andWhere("t.id = :transactionId", {
        transactionId: query.transactionId,
      });
    const current = managedVersion("c");
    if (query.versionCode)
      qb.andWhere(`${current.label} = :versionCode`, {
        versionCode: query.versionCode,
      });
    if (query.latestOnly !== false) {
      const other = managedVersion("newer");
      const newer = qb
        .subQuery()
        .select("1")
        .from(ApiTestCaseEntity, "newer")
        .innerJoin(ApiEndpointEntity, "ne", "ne.id = newer.endpointId")
        .where(
          "newer.projectId = c.projectId AND ne.transactionId = e.transactionId",
        )
        .andWhere("newer.createdBy = :user")
        .andWhere(`${other.label} <> ''`)
        .andWhere(
          `(CASE WHEN ${other.number} IS NOT NULL AND ${current.number} IS NOT NULL THEN CAST(${other.number} AS DECIMAL(24,0)) > CAST(${current.number} AS DECIMAL(24,0)) ELSE ${other.fallback} > ${current.fallback} END)`,
        )
        .getQuery();
      // 子查询不受关键词过滤影响，避免搜索旧案例时错误地将旧版本视作最新。
      qb.andWhere(`(${current.label} = '' OR NOT EXISTS ${newer})`);
    }
    if (query.keyword?.trim()) {
      const keyword = query.keyword
        .trim()
        .replace(/[!%_]/g, (char) => `!${char}`);
      qb.andWhere(
        "(c.title LIKE :keyword ESCAPE '!' OR c.caseNo LIKE :keyword ESCAPE '!')",
        { keyword: `%${keyword}%` },
      );
    }
    return qb;
  }

  private publicRow(row: JoinedCase) {
    return {
      ...toPublicApiCase(row),
      transactionId: row.managementTransaction.id,
      transactionCode: row.managementTransaction.code,
      requirementNo: row.managementProject.requirementNo || "—",
    };
  }

  async list(query: ListManagedCasesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const [rows, count] = await this.filtered(query)
      .orderBy("c.createdAt", "DESC")
      .addOrderBy("c.id", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return {
      rows: (rows as JoinedCase[]).map((row) => this.publicRow(row)),
      count,
      page,
      pageSize,
    };
  }

  /** 显式全选时仅返回执行所需轻量标识，不传请求报文、步骤、断言。 */
  async selection(query: ListManagedCasesDto): Promise<ManagedCaseSelection[]> {
    const rows = await this.filtered(query)
      .select("c.id", "id")
      .addSelect("c.projectId", "projectId")
      .addSelect("t.id", "transactionId")
      .addSelect("c.title", "title")
      .addSelect("c.enabled", "enabled")
      .orderBy("c.id", "ASC")
      .getRawMany();
    return rows.map((row) => ({
      ...row,
      enabled: Boolean(Number(row.enabled)),
    }));
  }

  async details(ids: string[]) {
    const rows = await this.base()
      .andWhere("c.id IN (:...ids)", { ids })
      .getMany();
    if (rows.length !== ids.length)
      throw new BadRequestException("部分案例已删除或无权访问，请重新选择");
    const byId = new Map(
      (rows as JoinedCase[]).map((row) => [row.id, this.publicRow(row)]),
    );
    return ids.map((id) => byId.get(id)!);
  }

  /** 独立轻量筛选项，不通过拉取所有案例推导选项。 */
  async options(query: ListManagedCasesDto): Promise<ManagedCaseOptions> {
    const projects = await this.base()
      .select("p.id", "value")
      .addSelect("p.requirementNo", "requirementNo")
      .addSelect("p.title", "title")
      .distinct(true)
      .orderBy("p.requirementNo", "ASC")
      .getRawMany();
    const transactionsQuery = this.base()
      .select("t.id", "value")
      .addSelect("t.code", "code")
      .addSelect("t.name", "name")
      .distinct(true);
    if (query.projectId)
      transactionsQuery.andWhere("p.id = :projectId", {
        projectId: query.projectId,
      });
    const transactions = await transactionsQuery
      .orderBy("t.code", "ASC")
      .getRawMany();
    let versions: { value: string }[] = [];
    if (query.transactionId) {
      const qb = this.base()
        .select(managedVersion("c").label, "value")
        .distinct(true)
        .andWhere("t.id = :transactionId", {
          transactionId: query.transactionId,
        });
      if (query.projectId)
        qb.andWhere("p.id = :projectId", { projectId: query.projectId });
      versions = (await qb.getRawMany<{ value: string }>())
        .filter((v) => v.value)
        .sort((a, b) =>
          b.value.localeCompare(a.value, undefined, { numeric: true }),
        );
    }
    return {
      projects: projects.map((p) => ({
        value: p.value,
        label: `${p.requirementNo || "无编号"} · ${p.title}`,
      })),
      transactions: transactions.map((t) => ({
        value: t.value,
        label: `${t.code} · ${t.name}`,
      })),
      versions: versions.map((v) => ({ value: v.value, label: v.value })),
    };
  }
}
