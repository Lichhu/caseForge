import type {
  ApiHttpCaseStep,
  ApiStepTarget,
  ManagedCaseOptions,
  ManagedCaseSelection,
} from "@case-forge/shared";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import { isHttpStep } from "@case-forge/shared";
import { TEST_PLATFORM_CONNECTION } from "@common/test-platform";
import {
  auditFieldsForUpdate,
  RequestContext,
} from "@common/audit/request-context";
import { toPublicApiEndpoint } from "@common/http/public-response.util";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { ApiEndpointEntity } from "../entity/api-endpoint.entity";
import { ApiPreproductionCaseEntity } from "../entity/api-preproduction-case.entity";
import { ApiTransactionEntity } from "../entity/api-transaction.entity";
import { ListManagedCasesDto } from "../dto/list-managed-cases.dto";
import { UpdatePreproductionCaseDto } from "../dto/update-preproduction-case.dto";
import { UpdatePreproductionStepDto } from "../dto/update-preproduction-step.dto";

// 准生产快照把版本字段拆成独立列，优先比较生成序号，兼容日期编码与 V+数字编码。
export function managedVersion(alias: string) {
  const code = `NULLIF(${alias}.versionCode, '')`;
  const number = `${alias}.generateVersion`;
  return {
    label: `COALESCE(${code}, CONCAT('V', ${number}), '')`,
    number,
    fallback: `CAST(REPLACE(REPLACE(UPPER(COALESCE(${code}, '0')), 'V', ''), '-', '') AS DECIMAL(24,0))`,
  };
}

type JoinedCase = ApiPreproductionCaseEntity & {
  managementTransaction: ApiTransactionEntity;
  managementProject: CaseProjectEntity;
  endpoint?: ApiEndpointEntity;
};

@Injectable()
export class ApiCaseManagementService {
  constructor(
    @InjectRepository(ApiPreproductionCaseEntity)
    private readonly cases: Repository<ApiPreproductionCaseEntity>,
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
        "t.id = c.transactionId AND t.projectId = c.projectId",
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
      qb.andWhere("c.transactionId = :transactionId", {
        transactionId: query.transactionId,
      });
    if (query.applicationPath) {
      const escapedPath = query.applicationPath.replace(
        /[!%_]/g,
        (char) => `!${char}`,
      );
      qb.andWhere(
        "(c.applicationPath = :applicationPath OR c.applicationPath LIKE :applicationPathPrefix ESCAPE '!')",
        {
          applicationPath: query.applicationPath,
          applicationPathPrefix: `${escapedPath}/%`,
        },
      );
    }
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
        .from(ApiPreproductionCaseEntity, "newer")
        .where(
          "newer.projectId = c.projectId AND newer.transactionId = c.transactionId",
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
    const snapshot = row.snapshot ?? {
      request: {},
      expected: {},
    };
    return {
      id: row.id,
      sourceCaseId: row.id,
      projectId: row.projectId,
      endpointId: row.endpointId,
      title: row.title,
      caseNo: row.caseNo,
      description: row.description ?? snapshot.description ?? "",
      remark: row.remark ?? snapshot.remark,
      applicationPath: row.applicationPath ?? null,
      transactionCode: row.transactionCode,
      owner: row.owner,
      priority: row.priority,
      polarity: row.polarity,
      status: row.status,
      enabled: Boolean(Number(row.enabled)),
      preconditions: snapshot.preconditions ?? [],
      steps: snapshot.steps,
      request: snapshot.request,
      expected: snapshot.expected,
      metadata: snapshot.metadata,
      createdBy: snapshot.createdBy ?? row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      transactionId: row.transactionId,
      requirementNo: row.managementProject.requirementNo || "—",
      ...(row.endpoint ? { endpoint: toPublicApiEndpoint(row.endpoint) } : {}),
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
      .addSelect("c.transactionId", "transactionId")
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

  async deleteCases(caseIds: string[]) {
    const ids = [...new Set(caseIds.map((id) => id.trim()).filter(Boolean))];
    if (!ids.length || ids.length > 1000) {
      throw new BadRequestException("一次最多删除 1000 条案例");
    }
    const rows = await this.base()
      .andWhere("c.id IN (:...ids)", { ids })
      .getMany();
    if (rows.length !== ids.length) {
      throw new BadRequestException("部分案例不存在或无权访问，请重新选择");
    }
    await this.cases.softDelete({ id: In(ids) });
    return { deleted: rows.length };
  }

  async updateCaseStep(
    caseId: string,
    stepId: string,
    dto: UpdatePreproductionStepDto,
  ) {
    const row = (await this.base()
      .andWhere("c.id = :caseId", { caseId })
      .getOne()) as JoinedCase | undefined;
    if (!row) throw new NotFoundException("案例不存在或无权访问");

    const snapshot = structuredClone(row.snapshot);
    const steps = snapshot.steps?.length
      ? snapshot.steps
      : [
          {
            id: row.id,
            name: row.title,
            isMainRequest: true,
            request: snapshot.request,
            expected: snapshot.expected,
            exports: [],
          },
        ];
    const step = steps.find((item) => item.id === stepId);
    if (!step) throw new NotFoundException("步骤不存在");
    if (!isHttpStep(step)) {
      throw new BadRequestException("仅支持编辑请求步骤");
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException("步骤名称不能为空");
      step.name = name;
    }
    if (dto.transport !== undefined) step.request.transport = dto.transport;
    if (dto.method !== undefined) step.request.method = dto.method;
    if (dto.path !== undefined) step.request.path = dto.path;
    if (dto.body !== undefined) step.request.body = dto.body;
    if (dto.encoding !== undefined) {
      step.request.encoding = dto.encoding;
      snapshot.metadata = {
        ...(snapshot.metadata ?? {}),
        debugEncoding: dto.encoding,
      };
    }
    if (dto.targetAddress !== undefined) {
      const address = dto.targetAddress.trim();
      const addressChanged = (step.target?.address ?? "") !== address;
      step.target = {
        ...(step.target ?? {}),
        name: step.target?.name ?? "",
        address,
        ...(addressChanged
          ? { environmentId: undefined, environmentServiceId: undefined }
          : {}),
      };
    }
    if (dto.step) {
      const next = dto.step as Partial<ApiHttpCaseStep>;
      if (next.name !== undefined) {
        const name = String(next.name).trim();
        if (!name) throw new BadRequestException("步骤名称不能为空");
        step.name = name;
      }
      if (next.request && typeof next.request === "object") {
        step.request = {
          ...step.request,
          ...next.request,
          method: next.request.method ?? step.request.method,
          path: next.request.path ?? step.request.path,
        };
        if (next.request.encoding !== undefined) {
          snapshot.metadata = {
            ...(snapshot.metadata ?? {}),
            debugEncoding: next.request.encoding,
          };
        }
      }
      if (next.target && typeof next.target === "object") {
        const previousTarget: ApiStepTarget = step.target ?? {
          name: "",
          address: "",
        };
        const address = String(next.target.address ?? "").trim();
        const addressChanged = (previousTarget.address ?? "") !== address;
        const target: ApiStepTarget = {
          ...previousTarget,
          name: String(next.target.name ?? previousTarget.name ?? ""),
          address,
        };
        if (next.target.environmentId !== undefined) {
          target.environmentId = next.target.environmentId;
        } else if (addressChanged) {
          target.environmentId = undefined;
        }
        if (next.target.environmentServiceId !== undefined) {
          target.environmentServiceId = next.target.environmentServiceId;
        } else if (addressChanged) {
          target.environmentServiceId = undefined;
        }
        step.target = target;
      }
      if (next.expected && Array.isArray(next.expected.assertions)) {
        step.expected = next.expected;
      }
      if (Array.isArray(next.exports)) {
        step.exports = next.exports;
      }
    }

    snapshot.steps = steps;
    if (step.isMainRequest || steps.length === 1) {
      snapshot.request = step.request;
      snapshot.expected = step.expected;
    }
    row.snapshot = snapshot;
    await this.cases.save({ ...row, ...auditFieldsForUpdate() });
    return this.publicRow(row);
  }

  async updateCaseInfo(caseId: string, dto: UpdatePreproductionCaseDto) {
    const row = (await this.base()
      .andWhere("c.id = :caseId", { caseId })
      .getOne()) as JoinedCase | undefined;
    if (!row) throw new NotFoundException("案例不存在或无权访问");

    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) throw new BadRequestException("案例名称不能为空");
      row.title = title;
    }
    if (dto.description !== undefined) {
      const description = dto.description.trim();
      row.description = description;
      row.snapshot = { ...row.snapshot, description };
    }
    if (dto.remark !== undefined) {
      const remark = dto.remark.trim();
      row.remark = remark;
      row.snapshot = { ...row.snapshot, remark };
    }

    await this.cases.save({ ...row, ...auditFieldsForUpdate() });
    return this.publicRow(row);
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
    const applicationsQuery = this.base()
      .select("c.applicationPath", "value")
      .distinct(true)
      .andWhere("c.applicationPath IS NOT NULL")
      .andWhere("TRIM(c.applicationPath) <> ''");
    if (query.projectId)
      applicationsQuery.andWhere("p.id = :projectId", {
        projectId: query.projectId,
      });
    if (query.transactionId)
      applicationsQuery.andWhere("t.id = :transactionId", {
        transactionId: query.transactionId,
      });
    const applications = await applicationsQuery
      .orderBy("c.applicationPath", "ASC")
      .getRawMany<{ value: string }>();
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
      applications: applications.map((item) => ({
        value: item.value,
        label: item.value,
      })),
      versions: versions.map((v) => ({ value: v.value, label: v.value })),
    };
  }
}
