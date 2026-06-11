import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
  auditFieldsForCreate,
  auditFieldsForUpdate,
} from "../../../common/audit/request-context";
import { scopedWhere } from "../../../common/audit/user-scope";
import { ApiTestCaseEntity } from "../entity/api-test-case.entity";
import { ApiTestExecutionSetCaseEntity } from "../entity/api-test-execution-set-case.entity";
import { ApiTestExecutionSetEntity } from "../entity/api-test-execution-set.entity";
import {
  ReplaceExecutionSetCasesDto,
  SaveApiExecutionSetDto,
} from "../dto/execution-platform.dto";
import { toPublicApiExecutionSet } from "../../../common/http/public-response.util";

@Injectable()
export class ApiExecutionSetService {
  constructor(
    @InjectRepository(ApiTestExecutionSetEntity)
    private readonly setRepo: Repository<ApiTestExecutionSetEntity>,
    @InjectRepository(ApiTestExecutionSetCaseEntity)
    private readonly setCaseRepo: Repository<ApiTestExecutionSetCaseEntity>,
    @InjectRepository(ApiTestCaseEntity)
    private readonly caseRepo: Repository<ApiTestCaseEntity>,
  ) {}

  async listSets(projectId: string, transactionId: string) {
    const sets = await this.setRepo.find({
      where: scopedWhere({ projectId, transactionId }),
      order: { updatedAt: "DESC" },
    });
    const setIds = sets.map((item) => item.id);
    if (!setIds.length) return [];

    const links = await this.setCaseRepo.find({
      where: { executionSetId: In(setIds) },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    const countMap = new Map<string, number>();
    const caseIdsMap = new Map<string, string[]>();
    for (const link of links) {
      countMap.set(link.executionSetId, (countMap.get(link.executionSetId) ?? 0) + 1);
      const ids = caseIdsMap.get(link.executionSetId) ?? [];
      ids.push(link.caseId);
      caseIdsMap.set(link.executionSetId, ids);
    }

    return sets.map((set) =>
      toPublicApiExecutionSet(set, {
        caseCount: countMap.get(set.id) ?? 0,
        caseIds: caseIdsMap.get(set.id) ?? [],
      }),
    );
  }

  async createSet(
    projectId: string,
    transactionId: string,
    payload: SaveApiExecutionSetDto,
  ) {
    const entity = this.setRepo.create({
      projectId,
      transactionId,
      name: payload.name.trim(),
      description: payload.description?.trim(),
      enabled: payload.enabled ?? true,
      ...auditFieldsForCreate(),
    });
    return toPublicApiExecutionSet(await this.setRepo.save(entity));
  }

  async updateSet(
    projectId: string,
    transactionId: string,
    setId: string,
    payload: SaveApiExecutionSetDto,
  ) {
    const existing = await this.requireSet(projectId, transactionId, setId);
    existing.name = payload.name.trim();
    existing.description = payload.description?.trim();
    if (payload.enabled !== undefined) existing.enabled = payload.enabled;
    return toPublicApiExecutionSet(
      await this.setRepo.save({ ...existing, ...auditFieldsForUpdate() }),
    );
  }

  async deleteSet(projectId: string, transactionId: string, setId: string) {
    await this.requireSet(projectId, transactionId, setId);
    await this.setCaseRepo.delete({ executionSetId: setId });
    await this.setRepo.delete({ id: setId });
    return { ok: true };
  }

  async replaceCases(
    projectId: string,
    transactionId: string,
    setId: string,
    payload: ReplaceExecutionSetCasesDto,
  ) {
    await this.requireSet(projectId, transactionId, setId);
    const uniqueCaseIds = dedupeCaseIds(payload.caseIds ?? []);
    await this.assertCasesBelongToTransaction(
      projectId,
      transactionId,
      uniqueCaseIds,
    );
    await this.setCaseRepo.delete({ executionSetId: setId });
    if (!uniqueCaseIds.length) {
      return { caseIds: [] as string[] };
    }
    const rows = uniqueCaseIds.map((caseId, index) =>
      this.setCaseRepo.create({
        executionSetId: setId,
        caseId,
        sortOrder: index,
      }),
    );
    await this.setCaseRepo.save(rows);
    return { caseIds: uniqueCaseIds };
  }

  async getCaseIds(setId: string) {
    const links = await this.setCaseRepo.find({
      where: { executionSetId: setId },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    return links.map((item) => item.caseId);
  }

  async updateLastRun(
    setId: string,
    input: {
      runId: string;
      status: "running" | "completed" | "failed";
      passedCount: number;
      totalCount: number;
    },
  ) {
    await this.setRepo.update(setId, {
      lastRunId: input.runId,
      lastRunStatus: input.status,
      lastRunAt: new Date(),
      lastPassedCount: input.passedCount,
      lastTotalCount: input.totalCount,
    });
  }

  async requireSet(projectId: string, transactionId: string, setId: string) {
    const set = await this.setRepo.findOne({
      where: scopedWhere({ projectId, transactionId, id: setId }),
    });
    if (!set) {
      throw new NotFoundException("执行集不存在");
    }
    return set;
  }

  private async assertCasesBelongToTransaction(
    projectId: string,
    transactionId: string,
    caseIds: string[],
  ) {
    if (!caseIds.length) return;
    const cases = await this.caseRepo.find({
      where: { projectId, id: In(caseIds) },
      relations: ["endpoint"],
    });
    if (cases.length !== caseIds.length) {
      throw new BadRequestException("部分案例不存在");
    }
    const invalid = cases.find(
      (item) => item.endpoint?.transactionId !== transactionId,
    );
    if (invalid) {
      throw new BadRequestException("案例须属于当前交易码");
    }
  }
}

function dedupeCaseIds(caseIds: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of caseIds) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}
