/**
 * 结构化需求文档业务服务。
 * 负责需求文档上传记录、AI 异步结构化、临时文档自动保存、正式保存及测试要点同步。
 */
import { AiWorkflowService } from "../../../common/ai-workflow/service/ai-workflow.service";
import { MinioStorageService } from "@minio/service/minio.service";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import {
  SaveStructDocDto,
  SaveTestPointDto,
} from "@struct-doc/dto/save-struct-doc.dto";
import { StructDocEntity } from "@struct-doc/entity/struct-doc.entity";
import { StructRequirementJobEntity } from "@struct-doc/entity/struct-requirement-job.entity";
import { TestPointEntity } from "@struct-doc/entity/test-point.entity";
import { StructRequirementQueueService } from "@struct-doc/service/struct-requirement-queue.service";
import {
  buildStructuredDocName,
  extractRequirementNo,
  parseStructuredDoc,
  stripDocumentExtension,
} from "@struct-doc/util/struct-doc.parser";
import {
  isStructuringSlotActive,
  withStructuringSlot,
} from "@struct-doc/util/structuring-concurrency";
import { touchProjectUpdatedAt } from "../../../common/project/touch-project.util";
import {
  buildStructuringCancelledMessage,
  buildStructuringTimeoutMessage,
  getStructuringTimeoutMs,
  isStructuringTimedOut,
} from "@struct-doc/util/structuring-timeout.util";
import { In, Repository } from "typeorm";
import { auditFieldsForUpdate } from "../../../common/audit/request-context";
import {
  findOwnedProject,
  getScopedUserName,
  scopedWhere,
} from "../../../common/audit/user-scope";

/** 结构化需求文档核心业务逻辑。 */
@Injectable()
export class StructDocService {
  private readonly logger = new Logger(StructDocService.name);

  constructor(
    @InjectRepository(StructDocEntity)
    private readonly structDocRepo: Repository<StructDocEntity>,
    @InjectRepository(TestPointEntity)
    private readonly testPointRepo: Repository<TestPointEntity>,
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
    @Inject(MinioStorageService)
    private readonly minioService: MinioStorageService,
    @Inject(AiWorkflowService)
    private readonly aiWorkflowService: AiWorkflowService,
    @Inject(forwardRef(() => StructRequirementQueueService))
    private readonly structRequirementQueue: StructRequirementQueueService,
  ) {}

  /**
   * 取消进行中的结构化任务（用于服务重启后状态未恢复等场景）
   */
  async cancelStructuring(projectId: string) {
    await this.ensureProject(projectId);
    const existing = await this.structDocRepo.findOne({
      where: scopedWhere({ projectId }),
    });
    if (!existing) {
      throw new NotFoundException(
        `Project ${projectId} has no struct doc record`,
      );
    }
    if (existing.structuringStatus === "processing") {
      await this.structRequirementQueue.cancelJobs(projectId);
      await this.markStructuringFailed(
        existing.id,
        buildStructuringCancelledMessage(),
      );
    }
    return this.getByProjectId(projectId);
  }

  /**
   * 查询项目需求文档上传状态。
   *
   * @param projectId 项目 ID
   */
  async getUploadStatus(projectId: string) {
    await this.ensureProject(projectId);
    const structDoc = await this.structDocRepo.findOne({
      where: scopedWhere({ projectId }),
    });
    return {
      hasExisting: Boolean(structDoc?.reqDocPath),
      reqDocName: structDoc?.reqDocName,
      reqDocPath: structDoc?.reqDocPath,
      structDocPath: structDoc?.structDocPath,
    };
  }

  /**
   * 按项目 ID 查询结构化文档详情及关联测试要点。
   *
   * @param projectId 项目 ID
   * @returns 含访问 URL 与操作权限标志的详情，无记录时返回 null
   */
  async getByProjectId(projectId: string) {
    await this.ensureProject(projectId);
    const structDoc = await this.structDocRepo.findOne({
      where: scopedWhere({ projectId }),
    });
    if (!structDoc) {
      return null;
    }

    const activeDoc = await this.expireStaleStructuring(structDoc);

    const testPoints = await this.testPointRepo.find({
      where: scopedWhere({ projectId, structDocId: activeDoc.id }),
      order: {
        createdAt: "ASC",
      },
    });

    return await this.toDetail(activeDoc, testPoints);
  }

  /**
   * 保存已上传的需求文档元数据。
   * 若项目已有需求文档且未传 force，则抛出冲突异常。
   *
   * @param projectId 项目 ID
   * @param payload 需求文档名称、MinIO 路径及是否强制覆盖
   */
  async saveUploadedRequirement(
    projectId: string,
    payload: { reqDocName: string; reqDocPath: string; force?: boolean },
  ) {
    const project = await this.ensureProject(projectId);
    const existing = await this.structDocRepo.findOne({
      where: scopedWhere({ projectId }),
    });

    if (existing) {
      const activeDoc = await this.expireStaleStructuring(existing);
      if (activeDoc.structuringStatus === "processing") {
        throw new ConflictException("结构化进行中，请稍后再上传需求文档");
      }
    }

    if (existing?.reqDocPath && !payload.force) {
      throw new ConflictException({
        message:
          "当前项目已存在需求文档，重新上传需要重新结构化并重新保存，建议新建项目操作",
        code: "REQ_DOC_EXISTS",
        reqDocName: existing.reqDocName,
      });
    }

    if (existing?.reqDocPath && payload.force) {
      await this.testPointRepo.delete({
        projectId,
        structDocId: existing.id,
      });
    }

    const nextTitle =
      stripDocumentExtension(payload.reqDocName) || project.title;

    if (existing) {
      if (payload.force) {
        await this.testPointRepo.delete({
          projectId,
          structDocId: existing.id,
        });
      }

      await this.structDocRepo.update(existing.id, {
        ...(payload.force
          ? {
              reqDocName: payload.reqDocName,
              reqDocPath: payload.reqDocPath,
              aiResponse: null,
              tempStructDoc: null,
              summaryStructDoc: null,
              structuredDocName: null,
              structDocPath: null,
              structuringStatus: "idle" as const,
              structuringError: null,
              structuringStartedAt: null,
            }
          : {
              reqDocName: payload.reqDocName,
              reqDocPath: payload.reqDocPath,
            }),
        ...auditFieldsForUpdate(),
      } as never);
    } else {
      await this.structDocRepo.save(
        this.structDocRepo.create({
          projectId,
          reqDocName: payload.reqDocName,
          reqDocPath: payload.reqDocPath,
          structuringStatus: "idle",
        }),
      );
    }

    await touchProjectUpdatedAt(this.projectRepo, project.id, {
      title: nextTitle,
    });
    return this.getByProjectId(projectId);
  }

  /**
   * 启动异步结构化任务。
   * 若已在处理中则直接返回当前详情，否则后台调用 AI Chat 结构化。
   *
   * @param projectId 项目 ID
   */
  async startStructRequirement(projectId: string) {
    await this.ensureProject(projectId);
    const existing = await this.structDocRepo.findOne({
      where: scopedWhere({ projectId }),
    });
    if (!existing?.reqDocPath) {
      throw new BadRequestException("请先上传需求文档后再进行结构化");
    }

    if (existing.structuringStatus === "processing") {
      const afterExpire = await this.expireStaleStructuring(existing);
      if (afterExpire.structuringStatus === "processing") {
        const activeJob =
          await this.structRequirementQueue.findActiveJob(projectId);
        if (activeJob) {
          return this.getByProjectId(projectId);
        }
      }
    }

    await this.structRequirementQueue.enqueue(
      projectId,
      existing.id,
      getScopedUserName(),
    );
    await touchProjectUpdatedAt(this.projectRepo, projectId);

    return this.getByProjectId(projectId);
  }

  /** 队列 worker：执行单次结构化任务 */
  async runQueuedStructRequirement(job: StructRequirementJobEntity) {
    const { projectId, structDocId } = job;

    if (!(await this.isJobActive(job.id))) {
      return;
    }

    await withStructuringSlot(projectId, async () => {
      const startedAt = new Date();
      await this.structDocRepo.update(structDocId, {
        structuringStartedAt: startedAt,
        structuringStatus: "processing",
        structuringError: undefined,
        ...auditFieldsForUpdate(),
      });

      if (!(await this.isJobActive(job.id))) {
        return;
      }

      const existing = await this.structDocRepo.findOne({
        where: scopedWhere({ id: structDocId, projectId }),
      });
      if (!existing?.reqDocPath) {
        throw new BadRequestException("需求文档不存在");
      }

      const requireFileUrl = await this.minioService.getAccessUrl(
        existing.reqDocPath,
        24 * 3600,
      );
      if (!requireFileUrl) {
        throw new BadRequestException("需求文档地址无效，请重新上传");
      }

      try {
        const { markdown, rawResponse } = await this.withStructuringDeadline(
          startedAt,
          () =>
            this.aiWorkflowService.structRequirement(
              requireFileUrl,
              undefined,
              existing.reqDocName,
            ),
        );

        if (!(await this.isJobActive(job.id))) {
          this.logger.log(
            `结构化结果已丢弃（任务已被取代）projectId=${projectId}`,
          );
          return;
        }

        const parsedTestPoints = parseStructuredDoc(markdown);
        if (!parsedTestPoints.length && markdown.trim()) {
          this.logger.warn(
            `结构化完成但未解析到测试要点 projectId=${projectId}，请检查 Markdown 是否包含「系统」「功能模块」「测试要点」结构`,
          );
        }
        const structuredDocName = buildStructuredDocName(existing.reqDocName);
        const latest = await this.structDocRepo.findOne({
          where: scopedWhere({ id: structDocId, projectId }),
        });
        if (!latest) {
          return;
        }

        await this.structDocRepo.save(
          this.structDocRepo.create({
            ...latest,
            aiResponse: rawResponse as Record<string, unknown>,
            tempStructDoc: markdown,
            summaryStructDoc: undefined,
            structuredDocName,
            structuringStatus: "completed",
            structuringError: undefined,
          }),
        );

        if (parsedTestPoints.length) {
          const merged = await this.mergeParsedTestPointsWithExisting(
            projectId,
            latest.id,
            parsedTestPoints,
          );
          await this.replaceTestPoints(projectId, latest.id, merged);
        }

        try {
          await this.generateAndSaveSummaryStructDoc(
            projectId,
            latest.id,
            markdown,
          );
        } catch (error) {
          this.logger.warn(
            `结构化完成后生成案例用需求总结失败 projectId=${projectId}: ${(error as Error).message}`,
          );
        }

        const requirementNo = extractRequirementNo(markdown);
        await touchProjectUpdatedAt(
          this.projectRepo,
          projectId,
          requirementNo ? { requirementNo } : undefined,
        );
      } catch (error) {
        if (await this.isJobActive(job.id)) {
          await this.markStructuringFailed(
            structDocId,
            (error as Error).message || "结构化失败",
          );
        }
        throw error;
      }
    });
  }

  private async isJobActive(jobId: string) {
    const job = await this.structRequirementQueue.findJobById(jobId);
    if (!job || job.status !== "running") {
      return false;
    }

    const latest = await this.structDocRepo.findOne({
      where: { id: job.structDocId, projectId: job.projectId },
    });
    if (!latest || latest.structuringStatus !== "processing") {
      return false;
    }

    if (job.startedAt && isStructuringTimedOut(job.startedAt)) {
      const message = buildStructuringTimeoutMessage();
      await this.markStructuringFailed(job.structDocId, message);
      await this.structRequirementQueue.failJob(jobId, message);
      return false;
    }

    return true;
  }

  /** 查询/轮询时将超时的 processing 标记为 failed */
  private async expireStaleStructuring(structDoc: StructDocEntity) {
    if (structDoc.structuringStatus !== "processing") {
      return structDoc;
    }
    if (
      !isStructuringTimedOut(structDoc.structuringStartedAt) ||
      !isStructuringSlotActive(structDoc.projectId)
    ) {
      return structDoc;
    }
    await this.markStructuringFailed(
      structDoc.id,
      buildStructuringTimeoutMessage(),
    );
    await this.structRequirementQueue.failActiveJobs(
      structDoc.projectId,
      buildStructuringTimeoutMessage(),
    );
    const refreshed = await this.structDocRepo.findOne({
      where: { id: structDoc.id },
    });
    return refreshed ?? structDoc;
  }

  private async markStructuringFailed(structDocId: string, message: string) {
    await this.structDocRepo.update(
      { id: structDocId, structuringStatus: "processing" },
      {
        structuringStatus: "failed",
        structuringError: message,
        ...auditFieldsForUpdate(),
      },
    );
    this.logger.warn(`结构化任务结束 structDocId=${structDocId}: ${message}`);
  }

  private async withStructuringDeadline<T>(
    structuringStartedAt: Date,
    run: () => Promise<T>,
  ): Promise<T> {
    const remaining =
      getStructuringTimeoutMs() - (Date.now() - structuringStartedAt.getTime());
    if (remaining <= 0) {
      throw new Error(buildStructuringTimeoutMessage());
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        run(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(buildStructuringTimeoutMessage())),
            remaining,
          );
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * 获取案例生成用的需求上下文：优先返回已缓存的总结，缺失时按需生成。
   * 生成失败时回退为完整结构化 Markdown。
   */
  async ensureSummaryStructDoc(projectId: string): Promise<string> {
    const existing = await this.structDocRepo.findOne({
      where: scopedWhere({ projectId }),
    });
    const sourceMarkdown = existing?.tempStructDoc?.trim();
    if (!existing || !sourceMarkdown) {
      throw new BadRequestException(
        "需求前景为空，请先在「结构化需求文档」完成结构化并保存",
      );
    }
    if (existing.summaryStructDoc?.trim()) {
      return existing.summaryStructDoc.trim();
    }

    try {
      return await this.generateAndSaveSummaryStructDoc(
        projectId,
        existing.id,
        sourceMarkdown,
      );
    } catch (error) {
      this.logger.warn(
        `生成案例用需求总结失败，回退全文 projectId=${projectId}: ${(error as Error).message}`,
      );
      return sourceMarkdown;
    }
  }

  private async generateAndSaveSummaryStructDoc(
    projectId: string,
    structDocId: string,
    sourceMarkdown: string,
  ) {
    const { text } = await this.aiWorkflowService.summarizeForCaseGenerate(
      sourceMarkdown,
    );
    const summary = text.trim();
    if (!summary) {
      throw new Error("AI 未返回有效需求总结");
    }

    await this.structDocRepo.update(structDocId, {
      summaryStructDoc: summary,
      ...auditFieldsForUpdate(),
    });
    await touchProjectUpdatedAt(this.projectRepo, projectId);
    return summary;
  }

  /**
   * 自动保存在线编辑中的临时结构化 Markdown。
   *
   * @param projectId 项目 ID
   * @param tempStructDoc 临时 Markdown，未传则保留原值
   */
  async autoSaveTempStructDoc(projectId: string, tempStructDoc?: string) {
    await this.ensureProject(projectId);
    const existing = await this.structDocRepo.findOne({
      where: scopedWhere({ projectId }),
    });
    if (!existing) {
      throw new NotFoundException(
        `Project ${projectId} has no struct doc record`,
      );
    }

    const nextTempStructDoc = tempStructDoc ?? existing.tempStructDoc;
    const shouldClearSummary =
      tempStructDoc !== undefined && tempStructDoc !== existing.tempStructDoc;

    await this.structDocRepo.update(existing.id, {
      tempStructDoc: nextTempStructDoc,
      ...(shouldClearSummary ? { summaryStructDoc: null } : {}),
      ...auditFieldsForUpdate(),
    } as never);
    await touchProjectUpdatedAt(this.projectRepo, projectId);

    return this.getByProjectId(projectId);
  }

  /**
   * 将结构化文档正式保存到 MinIO，并同步测试要点与项目需求编号。
   *
   * @param projectId 项目 ID
   * @param dto 结构化文档内容与可选测试要点
   */
  async saveStructDoc(projectId: string, dto: SaveStructDocDto) {
    await this.ensureProject(projectId);
    const existing = await this.structDocRepo.findOne({
      where: scopedWhere({ projectId }),
    });
    const tempStructDoc = dto.tempStructDoc ?? existing?.tempStructDoc;

    if (!existing?.reqDocPath) {
      throw new BadRequestException("请先上传需求文档");
    }
    if (!tempStructDoc?.trim()) {
      throw new BadRequestException("请先结构化需求文档后再保存");
    }

    const structuredDocName =
      dto.structuredDocName ??
      existing.structuredDocName ??
      buildStructuredDocName(existing.reqDocName);
    const objectPath = this.minioService.buildProjectObjectPath(
      projectId,
      structuredDocName,
    );

    await this.minioService.uploadFile(
      objectPath,
      Buffer.from(tempStructDoc, "utf8"),
    );

    const structDoc = await this.structDocRepo.save(
      this.structDocRepo.create({
        ...existing,
        projectId,
        structuredDocName,
        tempStructDoc,
        structDocPath: objectPath,
      }),
    );
    await this.structDocRepo.update(structDoc.id, {
      summaryStructDoc: null,
    } as never);

    if (dto.testPoints !== undefined) {
      await this.replaceTestPoints(projectId, structDoc.id, dto.testPoints);
    } else {
      await this.syncTestPointsFromMarkdown(
        projectId,
        structDoc.id,
        tempStructDoc,
        "保存结构化文档时未解析到测试要点",
      );
    }

    const requirementNo = extractRequirementNo(tempStructDoc);
    await touchProjectUpdatedAt(
      this.projectRepo,
      projectId,
      requirementNo ? { requirementNo } : undefined,
    );

    return this.getByProjectId(projectId);
  }

  /**
   * 全量替换指定结构化文档下的测试要点（增量更新：保留传入 ID，删除其余）。
   *
   * @param projectId 项目 ID
   * @param structDocId 结构化文档 ID
   * @param items 测试要点列表
   */
  /** 从 Markdown 解析测试要点并同步（解析失败时不删除已有数据） */
  private async syncTestPointsFromMarkdown(
    projectId: string,
    structDocId: string,
    markdown: string,
    emptyWarnMessage: string,
  ) {
    const parsed = parseStructuredDoc(markdown);
    if (!parsed.length) {
      if (markdown.trim()) {
        this.logger.warn(`${emptyWarnMessage} projectId=${projectId}`);
      }
      return;
    }
    const merged = await this.mergeParsedTestPointsWithExisting(
      projectId,
      structDocId,
      parsed,
    );
    await this.replaceTestPoints(projectId, structDocId, merged);
  }

  /**
   * 按「系统 + 功能模块 + 测试要点」匹配已有记录，保留 id 以维持动态指令关联
   */
  private async mergeParsedTestPointsWithExisting(
    projectId: string,
    structDocId: string,
    parsed: ReturnType<typeof parseStructuredDoc>,
  ): Promise<SaveTestPointDto[]> {
    const existing = await this.testPointRepo.find({
      where: scopedWhere({ projectId, structDocId }),
    });
    const idByKey = new Map(
      existing.map((item) => [this.testPointMatchKey(item), item.id]),
    );

    return parsed.map((item) => ({
      ...item,
      id: idByKey.get(this.testPointMatchKey(item)),
    }));
  }

  private testPointMatchKey(item: {
    system?: string;
    featureModule?: string;
    testPoint?: string;
  }) {
    return [item.system, item.featureModule, item.testPoint]
      .map((value) => value?.trim() || "")
      .join("|");
  }

  private assertTestPointDefinitionFields(items: SaveTestPointDto[]) {
    for (const [index, item] of items.entries()) {
      const system = item.system?.trim() || "";
      const featureModule = item.featureModule?.trim() || "";
      const testPoint = item.testPoint?.trim() || "";
      const allEmpty = !system && !featureModule && !testPoint;
      if (allEmpty) {
        continue;
      }
      if (!system || !featureModule || !testPoint) {
        const label =
          testPoint ||
          system ||
          featureModule ||
          item.id ||
          `第 ${index + 1} 条`;
        throw new BadRequestException(
          `测试要点「${label}」的系统、功能模块、测试要点均不能为空`,
        );
      }
    }
  }

  private async replaceTestPoints(
    projectId: string,
    structDocId: string,
    items: SaveTestPointDto[],
  ) {
    this.assertTestPointDefinitionFields(items);

    const idsToKeep = items
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id));
    const existing = await this.testPointRepo.find({
      where: scopedWhere({ projectId, structDocId }),
      select: ["id"],
    });
    const toDelete = existing
      .map((item) => item.id)
      .filter((id) => !idsToKeep.includes(id));

    if (toDelete.length) {
      await this.testPointRepo.delete({ id: In(toDelete) });
    }

    const entities = items.map((item) =>
      this.testPointRepo.create({
        id: item.id,
        projectId,
        structDocId,
        system: item.system?.trim() || "",
        systemDesc: item.systemDesc?.trim() || "",
        featureModule: item.featureModule?.trim() || "",
        featureDesc: item.featureDesc?.trim() || "",
        testPoint: item.testPoint?.trim() || "",
        testPointDesc: item.testPointDesc?.trim() || "",
      }),
    );

    if (entities.length) {
      await this.testPointRepo.save(entities);
    }
  }

  /**
   * 将实体转换为前端详情对象，附加 MinIO 访问 URL 与页面操作权限标志。
   *
   * @param structDoc 结构化文档实体
   * @param testPoints 关联测试要点列表
   */
  private async toDetail(
    structDoc: StructDocEntity,
    testPoints: TestPointEntity[],
  ) {
    const [reqDocUrl, structDocUrl] = await Promise.all([
      this.minioService.getAccessUrl(structDoc.reqDocPath),
      this.minioService.getAccessUrl(structDoc.structDocPath),
    ]);

    return {
      ...structDoc,
      reqDocUrl,
      structDocUrl,
      canStructure:
        Boolean(structDoc.reqDocPath) &&
        structDoc.structuringStatus !== "processing",
      canSave:
        Boolean(structDoc.tempStructDoc?.trim()) &&
        structDoc.structuringStatus !== "processing",
      isStructuring: structDoc.structuringStatus === "processing",
      canEnterDynamicInstruct: Boolean(structDoc.structDocPath),
      testPoints,
    };
  }

  /**
   * 校验项目是否存在，不存在则抛出 404。
   *
   * @param projectId 项目 ID
   */
  private async ensureProject(projectId: string) {
    return findOwnedProject(this.projectRepo, projectId);
  }
}
