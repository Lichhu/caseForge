/**
 * @file 项目管理业务服务：项目的 CRUD 及级联删除
 */
import type { ProjectPlatform } from "@case-forge/shared";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { CreateProjectDto } from "@project-manage/dto/create-project.dto";
import { UpdateProjectDto } from "@project-manage/dto/update-project.dto";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { CaseEditorEntity } from "@case-editor/entity/case-editor.entity";
import { StructDocEntity } from "@struct-doc/entity/struct-doc.entity";
import { DataSource, EntityManager, Repository } from "typeorm";
import {
  extractProjectCodeFromText,
  isValidProjectRequirementCode,
} from "@case-editor/util/requirement-code.util";
import { auditFieldsForCreate } from "@common/audit/request-context";
import {
  applyUserScope,
  findOwnedProject,
  scopedWhere,
} from "@common/audit/user-scope";
import { toPublicProject } from "@common/http/public-response.util";

function normalizeRequirementNo(raw: string): string {
  const trimmed = raw.trim();
  const code = extractProjectCodeFromText(trimmed) ?? trimmed;
  if (!isValidProjectRequirementCode(code)) {
    throw new BadRequestException(
      "需求编号格式必须为 XQxxxx-xxxx-xx，例如 XQ2026-0818-01",
    );
  }
  return code.toUpperCase();
}

/** 项目列表项：对外字段 + 案例生成次数 */
export type ProjectListItem = ReturnType<typeof toPublicProject> & {
  generationCount: number;
};

/**
 * 项目管理服务：创建、查询、更新、删除项目并统计生成次数
 */
@Injectable()
export class ProjectManageService {
  constructor(
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
    @InjectRepository(CaseEditorEntity)
    private readonly caseEditorRepo: Repository<CaseEditorEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 创建项目，未传标题时自动生成默认名称
   * @param dto - 创建载荷
   */
  async createProject(dto: CreateProjectDto): Promise<ReturnType<typeof toPublicProject>> {
    const platform: ProjectPlatform = dto.platform ?? "case-forge";
    if (platform === "api-test") {
      const title = dto.title?.trim();
      const requirementNo = dto.requirementNo?.trim();
      if (!title) {
        throw new BadRequestException("请输入需求名称");
      }
      if (!requirementNo) {
        throw new BadRequestException("请输入需求编号（XQxxxx-xxxx-xx）");
      }
      const normalizedRequirementNo = normalizeRequirementNo(requirementNo);
      await this.assertApiTestRequirementAvailable(normalizedRequirementNo);
      const project = this.projectRepo.create({
        title,
        description: dto.description?.trim() || "",
        requirementNo: normalizedRequirementNo,
        platform,
        ...auditFieldsForCreate(),
      });
      return toPublicProject(await this.projectRepo.save(project));
    }

    const total = await this.projectRepo.count({
      where: scopedWhere({ platform }),
    });
    const project = this.projectRepo.create({
      title: dto.title?.trim() || `案例生成项目 ${total + 1}`,
      description: dto.description?.trim() || "",
      requirementNo: dto.requirementNo?.trim() || undefined,
      platform,
      ...auditFieldsForCreate(),
    });
    return toPublicProject(await this.projectRepo.save(project));
  }

  /** 校验项目属于指定平台 */
  async assertProjectPlatform(projectId: string, platform: ProjectPlatform) {
    const project = await findOwnedProject(this.projectRepo, projectId);
    if (project.platform !== platform) {
      throw new BadRequestException("项目不属于当前平台");
    }
    return project;
  }

  /**
   * 分页查询项目列表，可按标题或需求编号模糊搜索
   * @param page - 页码，从 1 开始
   * @param size - 每页条数
   * @param input - 搜索关键词
   */
  async listProjects(
    page: number = 1,
    size: number = 10,
    input: string = "",
    platform: ProjectPlatform = "case-forge",
  ): Promise<{ rows: ProjectListItem[]; count: number }> {
    if (page < 1 || size < 1) {
      throw new Error("Invalid page or size value.");
    }

    const query = applyUserScope(
      this.projectRepo
        .createQueryBuilder("project")
        .where("project.platform = :platform", { platform })
        .orderBy("project.updatedAt", "DESC")
        .skip((page - 1) * size)
        .take(size),
      "project",
    );

    const keyword = input.trim();
    if (keyword) {
      query.andWhere(
        "(project.title LIKE :keyword OR project.requirementNo LIKE :keyword)",
        { keyword: `%${keyword}%` },
      );
    }

    const [rows, count] = await query.getManyAndCount();
    const generationCountMap = await this.getGenerationCountMap(
      rows.map((row) => String(row.id)),
    );

    return {
      rows: rows.map((row) => ({
        ...toPublicProject(row),
        generationCount: generationCountMap.get(String(row.id)) ?? 0,
      })),
      count,
    };
  }

  /**
   * 获取单个项目详情（含生成次数）
   * @param projectId - 项目 ID
   */
  async getProject(projectId: string): Promise<ProjectListItem> {
    const project = await findOwnedProject(this.projectRepo, projectId);

    const generationCountMap = await this.getGenerationCountMap([
      String(project.id),
    ]);
    return {
      ...toPublicProject(project),
      generationCount: generationCountMap.get(String(project.id)) ?? 0,
    };
  }

  /**
   * 更新项目信息
   * @param projectId - 项目 ID
   * @param dto - 更新载荷
   */
  async updateProject(
    projectId: string,
    dto: UpdateProjectDto,
  ): Promise<ReturnType<typeof toPublicProject>> {
    const project = await findOwnedProject(this.projectRepo, projectId);

    if (project.platform === "api-test") {
      if (dto.title !== undefined) {
        const title = dto.title.trim();
        if (!title) {
          throw new BadRequestException("请输入需求名称");
        }
        project.title = title;
      }
      if (dto.requirementNo !== undefined) {
        const requirementNo = dto.requirementNo.trim();
        if (!requirementNo) {
          throw new BadRequestException("请输入需求编号（XQxxxx-xxxx-xx）");
        }
        const normalizedRequirementNo = normalizeRequirementNo(requirementNo);
        await this.assertApiTestRequirementAvailable(
          normalizedRequirementNo,
          projectId,
        );
        project.requirementNo = normalizedRequirementNo;
      }
    } else {
      if (dto.title !== undefined) {
        project.title = dto.title.trim();
      }
      if (dto.requirementNo !== undefined) {
        project.requirementNo = dto.requirementNo.trim() || undefined;
      }
    }
    if (dto.description !== undefined) {
      project.description = dto.description.trim();
    }

    return toPublicProject(await this.projectRepo.save(project));
  }

  private async assertApiTestRequirementAvailable(
    requirementNo: string,
    excludeProjectId?: string,
  ) {
    const query = applyUserScope(
      this.projectRepo
        .createQueryBuilder("project")
        .where("project.platform = :platform", { platform: "api-test" })
        .andWhere("project.requirementNo = :requirementNo", { requirementNo }),
      "project",
    );
    if (excludeProjectId) {
      query.andWhere("project.id != :excludeProjectId", { excludeProjectId });
    }
    const existing = await query.getOne();
    if (existing) {
      throw new BadRequestException(`需求编号 ${requirementNo} 已存在，请勿重复创建`);
    }
  }

  /**
   * 删除项目及其关联的结构化文档、案例编辑器等数据
   * @param projectId - 项目 ID
   */
  async deleteProject(
    projectId: string,
  ): Promise<{ id: string; deleted: boolean }> {
    await this.dataSource.transaction(async (manager) => {
      const project = await manager.findOne(CaseProjectEntity, {
        where: scopedWhere({ id: projectId }),
      });
      if (!project) {
        throw new NotFoundException(`Project ${projectId} not found`);
      }
      await this.deleteProjectRelations(manager, projectId);
      await manager.delete(CaseProjectEntity, projectId);
    });

    return { id: projectId, deleted: true };
  }

  /**
   * 批量删除项目（忽略不存在的 ID）
   * @param ids - 项目 ID 列表
   */
  async batchDeleteProjects(
    ids: string[],
  ): Promise<{ ids: string[]; deleted: boolean }> {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (!uniqueIds.length) {
      return { ids: [], deleted: true };
    }

    await this.dataSource.transaction(async (manager) => {
      for (const projectId of uniqueIds) {
        const project = await manager.findOne(CaseProjectEntity, {
          where: scopedWhere({ id: projectId }),
        });
        if (!project) {
          continue;
        }
        await this.deleteProjectRelations(manager, projectId);
        await manager.delete(CaseProjectEntity, projectId);
      }
    });

    return { ids: uniqueIds, deleted: true };
  }

  private async getGenerationCountMap(
    projectIds: string[],
  ): Promise<Map<string, number>> {
    const countMap = new Map<string, number>();
    if (!projectIds.length) {
      return countMap;
    }

    const rows = await this.caseEditorRepo
      .createQueryBuilder("caseEditor")
      .select("caseEditor.projectId", "projectId")
      .addSelect("COUNT(caseEditor.id)", "generationCount")
      .where("caseEditor.projectId IN (:...projectIds)", { projectIds })
      .groupBy("caseEditor.projectId")
      .getRawMany<{ projectId: string; generationCount: string }>();

    for (const row of rows) {
      countMap.set(String(row.projectId), Number(row.generationCount) || 0);
    }
    return countMap;
  }

  private async deleteProjectRelations(
    manager: EntityManager,
    projectId: string,
  ): Promise<void> {
    await manager.delete(CaseEditorEntity, { projectId });
    await manager.delete(StructDocEntity, { projectId });
  }
}
