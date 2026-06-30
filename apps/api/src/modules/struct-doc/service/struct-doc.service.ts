/**
 * 结构化需求文档业务服务。
 * 负责需求文档上传记录、AI 异步结构化、临时文档自动保存、正式保存及测试要点同步。
 */
import { AiWorkflowService } from "@common/ai-workflow/service/ai-workflow.service";
import { MinioStorageService } from "@minio/service/minio.service";
import {
  BadRequestException,
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
  parseStructuredDoc,
} from "@struct-doc/util/struct-doc.parser";
import {
  isStructuringSlotActive,
  withStructuringSlot,
} from "@struct-doc/util/structuring-concurrency";
import { touchProjectUpdatedAt } from "@common/project/touch-project.util";
import {
  buildStructuringCancelledMessage,
  buildStructuringTimeoutMessage,
  getStructuringTimeoutMs,
  isStructuringTimedOut,
} from "@struct-doc/util/structuring-timeout.util";
import { fetchWorkflowFileContents } from "@common/ai-workflow/util/workflow-input.util";
import { In, Repository } from "typeorm";
import { auditFieldsForUpdate } from "@common/audit/request-context";
import {
  findOwnedProject,
  getScopedUserName,
  scopedWhere,
} from "@common/audit/user-scope";
import { toPublicStructDocDetail } from "@common/http/public-response.util";

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
  async cancelStructuring(projectId: string, structDocId: string) {
    await this.ensureProject(projectId);
    const existing = await this.requireStructDoc(projectId, structDocId);
    if (existing.structuringStatus === "processing") {
      await this.structRequirementQueue.cancelJobs(projectId, structDocId);
      await this.markStructuringFailed(
        existing.id,
        buildStructuringCancelledMessage(),
      );
    }
    return this.getByStructDocId(projectId, structDocId);
  }

  /**
   * 删除结构化文档及其关联数据（测试要点、MinIO 文件等）。
   */
  async deleteStructDoc(projectId: string, structDocId: string) {
    await this.ensureProject(projectId);
    const doc = await this.requireStructDoc(projectId, structDocId);

    if (doc.structuringStatus === "processing") {
      await this.structRequirementQueue.cancelJobs(projectId, structDocId);
    }

    // 删除 MinIO 上关联文件
    const pathsToDelete = [doc.reqDocPath, doc.structDocPath].filter(
      (p): p is string => Boolean(p),
    );
    for (const objectPath of pathsToDelete) {
      try {
        await this.minioService.deleteObject(objectPath);
      } catch (error) {
        this.logger.warn(
          `删除 MinIO 文件失败: ${objectPath}, ${(error as Error).message}`,
        );
      }
    }

    await this.structDocRepo.delete({ id: structDocId });
    return { id: structDocId, deleted: true };
  }

  /**
   * 查询项目需求文档上传状态。
   *
   * @param projectId 项目 ID
   */
  async getUploadStatus(projectId: string) {
    await this.ensureProject(projectId);
    const docs = await this.structDocRepo.find({
      where: scopedWhere({ projectId }),
      order: { createdAt: "ASC" },
    });
    return {
      hasExisting: docs.some((d) => Boolean(d.reqDocPath)),
      docs: docs.map((d) => ({
        id: d.id,
        reqDocName: d.reqDocName,
        structuringStatus: d.structuringStatus,
      })),
    };
  }

  /**
   * 按项目 ID 查询所有结构化文档列表（含测试要点）。
   *
   * @param projectId 项目 ID
   * @returns 文档详情列表，无记录时返回空数组
   */
  async listByProjectId(
    projectId: string,
    options?: { includeTestPoints?: boolean },
  ) {
    await this.ensureProject(projectId);
    const docs = await this.structDocRepo.find({
      where: scopedWhere({ projectId }),
      order: { createdAt: "ASC" },
    });
    if (!docs.length) {
      return [];
    }

    const results = await Promise.all(
      docs.map(async (doc) => {
        const activeDoc = await this.expireStaleStructuring(doc);
        const testPoints =
          options?.includeTestPoints === false
            ? []
            : await this.testPointRepo.find({
                where: scopedWhere({
                  projectId,
                  structDocId: activeDoc.id,
                }),
                order: { createdAt: "ASC" },
              });
        return this.toDetail(activeDoc, testPoints);
      }),
    );
    return results;
  }

  /**
   * 按结构化文档 ID 查询单条详情及关联测试要点。
   */
  async getByStructDocId(
    projectId: string,
    structDocId: string,
    options?: { includeTestPoints?: boolean },
  ) {
    await this.ensureProject(projectId);
    const structDoc = await this.requireStructDoc(projectId, structDocId);

    const activeDoc = await this.expireStaleStructuring(structDoc);

    const testPoints =
      options?.includeTestPoints === false
        ? []
        : await this.testPointRepo.find({
            where: scopedWhere({ projectId, structDocId: activeDoc.id }),
            order: { createdAt: "ASC" },
          });

    return await this.toDetail(activeDoc, testPoints);
  }

  /** 查找并校验结构化文档归属 */
  private async requireStructDoc(projectId: string, structDocId: string) {
    const existing = await this.structDocRepo.findOne({
      where: scopedWhere({ id: structDocId, projectId }),
    });
    if (!existing) {
      throw new NotFoundException(
        `Project ${projectId} has no struct doc ${structDocId}`,
      );
    }
    return existing;
  }

  /**
   * 保存已上传的需求文档元数据（每次上传创建新记录）。
   *
   * @param projectId 项目 ID
   * @param payload 需求文档名称、MinIO 路径
   */
  async saveUploadedRequirement(
    projectId: string,
    payload: { reqDocName: string; reqDocPath: string },
  ) {
    const project = await this.ensureProject(projectId);

    const saved = await this.structDocRepo.save(
      this.structDocRepo.create({
        projectId,
        reqDocName: payload.reqDocName,
        reqDocPath: payload.reqDocPath,
        structuringStatus: "idle",
      }),
    );

    await touchProjectUpdatedAt(this.projectRepo, project.id);
    return this.getByStructDocId(projectId, saved.id);
  }

  /**
   * 启动异步结构化任务。
   * 若已在处理中则直接返回当前详情，否则后台调用 AI Chat 结构化。
   *
   * @param projectId 项目 ID
   * @param structDocId 结构化文档 ID
   */
  async startStructRequirement(projectId: string, structDocId: string) {
    await this.ensureProject(projectId);
    const existing = await this.requireStructDoc(projectId, structDocId);
    if (!existing?.reqDocPath) {
      throw new BadRequestException("请先上传需求文档后再进行结构化");
    }

    if (existing.structuringStatus === "processing") {
      const afterExpire = await this.expireStaleStructuring(existing);
      if (afterExpire.structuringStatus === "processing") {
        const activeJob = await this.structRequirementQueue.findActiveJob(
          projectId,
          structDocId,
        );
        if (activeJob) {
          return this.getByStructDocId(projectId, structDocId);
        }
      }
    }

    await this.structRequirementQueue.enqueue(
      projectId,
      structDocId,
      getScopedUserName(),
    );
    await touchProjectUpdatedAt(this.projectRepo, projectId);

    return this.getByStructDocId(projectId, structDocId);
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

      const skillFileUrl = this.aiWorkflowService.getReqDocSkillUrl();
      const [requireText, skillText] = await fetchWorkflowFileContents(
        requireFileUrl,
        skillFileUrl,
        existing.reqDocName,
      );
      try {
        const { markdown, rawResponse } = await this.withStructuringDeadline(
          startedAt,
          () =>
            this.aiWorkflowService.structRequirementFromText(
              requireText,
              skillText,
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
        const parseWarning = this.buildParseWarning(
          parsedTestPoints.length,
          markdown,
        );
        if (parseWarning) {
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
            parsedTestPointCount: parsedTestPoints.length,
            parseWarning,
            structuredDocName,
            structuringStatus: "completed",
            structuringError: undefined,
          }),
        );

        if (parsedTestPoints.length) {
          await this.appendMissingTestPoints(
            projectId,
            latest.id,
            parsedTestPoints,
          );
        }

        await touchProjectUpdatedAt(this.projectRepo, projectId);
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
   * 获取案例生成用的需求上下文：聚合项目下所有已保存的结构化文档，优先返回已缓存的总结，缺失时按需生成。
   * 生成失败时回退为完整结构化 Markdown 拼接。
   */
  async ensureSummaryStructDoc(projectId: string): Promise<string> {
    const docs = await this.structDocRepo.find({
      where: scopedWhere({ projectId }),
      order: { createdAt: "ASC" },
    });
    const savedDocs = docs.filter((d) => d.tempStructDoc?.trim());
    if (!savedDocs.length) {
      throw new BadRequestException(
        "需求前景为空，请先在「结构化需求文档」完成结构化并保存",
      );
    }

    const primaryDoc = savedDocs[0];
    const primarySummary = primaryDoc.summaryStructDoc?.trim();
    const allHaveCachedSummary = savedDocs.every((d) =>
      d.summaryStructDoc?.trim(),
    );
    if (allHaveCachedSummary && primarySummary) {
      const uniqueSummaries = [
        ...new Set(
          savedDocs.map((d) => d.summaryStructDoc!.trim()).filter(Boolean),
        ),
      ];
      // 聚合 summary 只存一处；历史数据若各文档重复，也只返回单份。
      return uniqueSummaries.length === 1
        ? uniqueSummaries[0]
        : uniqueSummaries.join("\n\n---\n\n");
    }

    const fullMarkdown = savedDocs
      .map((d) => d.tempStructDoc!.trim())
      .join("\n\n---\n\n");

    try {
      const { text } =
        await this.aiWorkflowService.summarizeForCaseGenerate(fullMarkdown);
      const summary = text.trim();
      if (summary) {
        await this.structDocRepo.update(primaryDoc.id, {
          summaryStructDoc: summary,
          ...auditFieldsForUpdate(),
        } as never);
        const otherDocIds = savedDocs.slice(1).map((d) => d.id);
        if (otherDocIds.length) {
          await this.structDocRepo.update(
            { id: In(otherDocIds) },
            {
              summaryStructDoc: null,
              ...auditFieldsForUpdate(),
            } as never,
          );
        }
        await touchProjectUpdatedAt(this.projectRepo, projectId);
        return summary;
      }
    } catch (error) {
      this.logger.warn(
        `生成案例用需求总结失败，回退全文 projectId=${projectId}: ${(error as Error).message}`,
      );
    }
    return fullMarkdown;
  }

  /**
   * 自动保存在线编辑中的临时结构化 Markdown。
   *
   * @param projectId 项目 ID
   * @param structDocId 结构化文档 ID
   * @param tempStructDoc 临时 Markdown，未传则保留原值
   */
  async autoSaveTempStructDoc(
    projectId: string,
    structDocId: string,
    tempStructDoc?: string,
  ) {
    await this.ensureProject(projectId);
    const existing = await this.requireStructDoc(projectId, structDocId);

    const nextTempStructDoc = tempStructDoc ?? existing.tempStructDoc;
    const shouldClearSummary =
      tempStructDoc !== undefined && tempStructDoc !== existing.tempStructDoc;

    await this.structDocRepo.update(existing.id, {
      tempStructDoc: nextTempStructDoc,
      ...(shouldClearSummary ? { summaryStructDoc: null } : {}),
      ...auditFieldsForUpdate(),
    } as never);
    await touchProjectUpdatedAt(this.projectRepo, projectId);

    return this.getByStructDocId(projectId, structDocId);
  }

  /**
   * 将结构化文档正式保存到 MinIO，并同步测试要点与项目需求编号。
   *
   * @param projectId 项目 ID
   * @param structDocId 结构化文档 ID
   * @param dto 结构化文档内容与可选测试要点
   */
  async saveStructDoc(
    projectId: string,
    structDocId: string,
    dto: SaveStructDocDto,
  ) {
    await this.ensureProject(projectId);
    const existing = await this.requireStructDoc(projectId, structDocId);
    const tempStructDoc = dto.tempStructDoc ?? existing.tempStructDoc;

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

    await this.structDocRepo.update(existing.id, {
      structuredDocName,
      tempStructDoc,
      structDocPath: objectPath,
      summaryStructDoc: null,
      ...auditFieldsForUpdate(),
    } as never);

    if (dto.testPoints !== undefined) {
      await this.replaceTestPoints(projectId, structDocId, dto.testPoints);
    } else {
      await this.syncTestPointsFromMarkdown(
        projectId,
        structDocId,
        tempStructDoc,
        "保存结构化文档时未解析到测试要点",
      );
    }

    await touchProjectUpdatedAt(this.projectRepo, projectId);

    return this.getByStructDocId(projectId, structDocId);
  }

  /**
   * 从 Markdown 解析测试要点并增量同步：已存在的（按项目 + 系统 + 功能模块 + 测试要点标题）保留不动，仅新增缺失项。
   */
  private async syncTestPointsFromMarkdown(
    projectId: string,
    structDocId: string,
    markdown: string,
    emptyWarnMessage: string,
  ) {
    const parsed = parseStructuredDoc(markdown);
    const parseWarning = this.buildParseWarning(parsed.length, markdown);
    if (parseWarning) {
      this.logger.warn(`${emptyWarnMessage} projectId=${projectId}`);
    }
    await this.structDocRepo.update(structDocId, {
      parsedTestPointCount: parsed.length,
      parseWarning,
      ...auditFieldsForUpdate(),
    } as never);
    if (!parsed.length) {
      return;
    }
    await this.appendMissingTestPoints(projectId, structDocId, parsed);
  }

  private buildParseWarning(parsedCount: number, markdown: string) {
    if (!markdown.trim()) {
      return undefined;
    }
    if (parsedCount > 0) {
      return undefined;
    }
    return "未从结构化文档中解析到测试要点，请检查是否包含「系统」「功能模块」「测试要点」结构";
  }

  /**
   * 按「项目 ID + 系统 + 功能模块 + 测试要点标题」判断是否已存在；
   * 存在则按需更新描述字段，不存在则新增，不删除已有记录。
   */
  private async appendMissingTestPoints(
    projectId: string,
    structDocId: string,
    items: SaveTestPointDto[],
  ) {
    this.assertTestPointDefinitionFields(items);

    const existing = await this.testPointRepo.find({
      where: scopedWhere({ projectId }),
    });
    const existingByContent = new Map<string, TestPointEntity>();
    for (const row of existing) {
      const key = this.testPointContentKey(row);
      if (key && !existingByContent.has(key)) {
        existingByContent.set(key, row);
      }
    }

    const seenIncoming = new Set<string>();
    const toInsert: SaveTestPointDto[] = [];
    const toUpdate: TestPointEntity[] = [];

    for (const item of items) {
      const key = this.testPointContentKey(item);
      if (!key || seenIncoming.has(key)) {
        continue;
      }
      seenIncoming.add(key);

      const existingRow = existingByContent.get(key);
      if (existingRow) {
        const nextSystemDesc =
          item.systemDesc?.trim() || existingRow.systemDesc || "";
        const nextFeatureDesc =
          item.featureDesc?.trim() || existingRow.featureDesc || "";
        const nextTestPointDesc =
          item.testPointDesc?.trim() || existingRow.testPointDesc || "";
        if (
          nextSystemDesc !== (existingRow.systemDesc || "") ||
          nextFeatureDesc !== (existingRow.featureDesc || "") ||
          nextTestPointDesc !== (existingRow.testPointDesc || "")
        ) {
          existingRow.systemDesc = nextSystemDesc;
          existingRow.featureDesc = nextFeatureDesc;
          existingRow.testPointDesc = nextTestPointDesc;
          toUpdate.push(existingRow);
        }
        continue;
      }

      toInsert.push(item);
    }

    if (toUpdate.length) {
      await this.testPointRepo.save(toUpdate);
    }

    if (!toInsert.length) {
      return;
    }

    const entities = toInsert.map((item) =>
      this.testPointRepo.create({
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
    await this.testPointRepo.save(entities);
  }

  private testPointContentKey(item: {
    system?: string;
    featureModule?: string;
    testPoint?: string;
  }) {
    const system = item.system?.trim() || "";
    const featureModule = item.featureModule?.trim() || "";
    const testPoint = item.testPoint?.trim() || "";
    if (!system || !featureModule || !testPoint) {
      return "";
    }
    return `${system}|${featureModule}|${testPoint}`;
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

  /**
   * 全量替换测试要点（仅用于前端显式提交 testPoints 列表时，支持删改）。
   */
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

    return toPublicStructDocDetail(structDoc, testPoints, {
      reqDocUrl,
      structDocUrl,
    });
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
