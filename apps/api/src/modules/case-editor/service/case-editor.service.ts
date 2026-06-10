/**
 * 案例编辑运行持久化服务：负责案例树运行记录的创建、
 * 查询、更新及树形结构的读写。
 */
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import type { CaseTreeNode, GenerationRun, MindMapExtras } from "@case-forge/shared";
import { ensureCaseMetadata, isCaseLikeKind, normalizeCaseNature, normalizeCasePriority } from "@case-forge/shared";
import { randomUUID } from "node:crypto";
import { CaseEditorEntity } from "@case-editor/entity/case-editor.entity";
import { CaseNodeMetadataEntity } from "@case-editor/entity/case-node-metadata.entity";
import { CaseTreeEntity } from "@case-editor/entity/case-tree.entity";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { DataSource, EntityManager, In, Repository } from "typeorm";
import { scopedWhere } from "../../../common/audit/user-scope";
import { touchProjectUpdatedAt } from "../../../common/project/touch-project.util";
import {
  buildCaseTreeDiffPlan,
  flattenCaseTreeForPersist,
  isFullTreeReplace,
  type CaseTreePersistContext,
} from "@case-editor/util/case-tree-diff.util";

interface TreeSaveContext extends CaseTreePersistContext {}

const TREE_BATCH_CHUNK_SIZE = 400;

/** 案例编辑运行与案例树持久化服务 */
@Injectable()
export class CaseEditorService {
  constructor(
    @InjectRepository(CaseEditorEntity)
    private readonly caseEditorRepo: Repository<CaseEditorEntity>,
    @InjectRepository(CaseTreeEntity)
    private readonly caseTreeRepo: Repository<CaseTreeEntity>,
    @InjectRepository(CaseNodeMetadataEntity)
    private readonly caseNodeMetadataRepo: Repository<CaseNodeMetadataEntity>,
    @InjectRepository(CaseProjectEntity)
    private readonly projectRepo: Repository<CaseProjectEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** 创建一次案例生成运行并持久化案例树 */
  async createRun(input: {
    projectId: string;
    structDocId?: string;
    constraintId?: string;
    prompt?: string;
    model?: string;
    tree: CaseTreeNode;
    mindMapExtras?: MindMapExtras;
    status?: CaseEditorEntity["status"];
    sourceTestPointIds?: string[];
  }): Promise<GenerationRun> {
    const editorId = randomUUID();
    const context: TreeSaveContext = {
      projectId: input.projectId,
      caseEditorId: editorId,
    };

    const editor = await this.dataSource.transaction(async (manager) => {
      const editorEntity = manager.create(CaseEditorEntity, {
        id: editorId,
        projectId: input.projectId,
        structDocId: input.structDocId || undefined,
        caseTreeId: input.tree.id,
        constraintId: input.constraintId,
        title: input.tree.title,
        prompt: input.prompt,
        model: input.model,
        status: input.status ?? "completed",
        sourceTestPointIds: input.sourceTestPointIds,
        mindMapExtras: input.mindMapExtras,
      });
      await manager.save(CaseEditorEntity, editorEntity);
      await this.insertTreeBatch(
        manager,
        flattenCaseTreeForPersist(input.tree, context),
      );
      return editorEntity;
    });
    return this.toGenerationRun(editor, input.tree);
  }

  /** 查询项目下所有案例生成运行记录 */
  async listRuns(projectId: string): Promise<GenerationRun[]> {
    const editors = await this.caseEditorRepo.find({
      where: scopedWhere({ projectId }),
      order: { createdAt: "DESC" },
    });
    const runs = await Promise.all(
      editors.map(async (editor) =>
        this.toGenerationRun(
          editor,
          await this.loadTree(editor.caseTreeId, editor.id),
        ),
      ),
    );
    return runs;
  }

  /** 按 ID 查询单次案例生成运行 */
  async getRun(projectId: string, runId: string): Promise<GenerationRun> {
    const editor = await this.caseEditorRepo.findOne({
      where: scopedWhere({ projectId, id: runId }),
    });
    if (!editor) {
      throw new NotFoundException(`Run ${runId} not found`);
    }
    const tree = await this.loadTree(editor.caseTreeId, editor.id);
    return this.toGenerationRun(editor, tree);
  }

  /** 更新运行记录关联的案例树并递增版本号 */
  async updateRunTree(
    projectId: string,
    runId: string,
    tree: CaseTreeNode,
    mindMapExtras?: MindMapExtras,
  ): Promise<GenerationRun> {
    const editor = await this.caseEditorRepo.findOne({
      where: scopedWhere({ projectId, id: runId }),
    });
    if (!editor) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    const context: TreeSaveContext = {
      projectId,
      caseEditorId: editor.id,
    };

    await this.dataSource.transaction(async (manager) => {
      await this.applyTreeDiff(manager, tree, context);
      editor.caseTreeId = tree.id;
      editor.title = tree.title;
      editor.version += 1;
      editor.mindMapExtras = mindMapExtras ?? { summaries: [] };
      await manager.save(editor);
    });

    await touchProjectUpdatedAt(this.projectRepo, projectId);

    return this.toGenerationRunMeta(editor);
  }

  private async applyTreeDiff(
    manager: EntityManager,
    tree: CaseTreeNode,
    context: TreeSaveContext,
  ): Promise<void> {
    const existing = await manager.find(CaseTreeEntity, {
      where: { caseEditorId: context.caseEditorId },
      relations: ["metadata"],
    });
    const incoming = flattenCaseTreeForPersist(tree, context);
    const plan = buildCaseTreeDiffPlan(existing, incoming);

    if (isFullTreeReplace(plan, existing.length)) {
      await manager.delete(CaseTreeEntity, { caseEditorId: context.caseEditorId });
      await this.insertTreeBatch(manager, incoming);
      return;
    }

    await this.deleteByIds(
      manager,
      CaseTreeEntity,
      plan.treeDeleteIds,
      { caseEditorId: context.caseEditorId },
    );
    await this.deleteByCaseTreeIds(manager, plan.metadataDeleteCaseTreeIds);
    await this.insertTreeBatch(manager, {
      treeRows: plan.treeInserts,
      metadataRows: plan.metadataInserts,
    });
    await this.saveInChunks(manager, CaseTreeEntity, plan.treeUpdates);
    await this.saveInChunks(manager, CaseNodeMetadataEntity, plan.metadataUpdates);
  }

  private async deleteByIds(
    manager: EntityManager,
    entity: typeof CaseTreeEntity,
    ids: string[],
    scope: { caseEditorId: string },
  ) {
    for (let index = 0; index < ids.length; index += TREE_BATCH_CHUNK_SIZE) {
      const chunk = ids.slice(index, index + TREE_BATCH_CHUNK_SIZE);
      if (!chunk.length) continue;
      await manager.delete(entity, { id: In(chunk), ...scope });
    }
  }

  private async deleteByCaseTreeIds(
    manager: EntityManager,
    caseTreeIds: string[],
  ) {
    for (let index = 0; index < caseTreeIds.length; index += TREE_BATCH_CHUNK_SIZE) {
      const chunk = caseTreeIds.slice(index, index + TREE_BATCH_CHUNK_SIZE);
      if (!chunk.length) continue;
      await manager.delete(CaseNodeMetadataEntity, { caseTreeId: In(chunk) });
    }
  }

  private async saveInChunks(
    manager: EntityManager,
    entity: typeof CaseTreeEntity | typeof CaseNodeMetadataEntity,
    rows: object[],
  ) {
    for (let index = 0; index < rows.length; index += TREE_BATCH_CHUNK_SIZE) {
      const chunk = rows.slice(index, index + TREE_BATCH_CHUNK_SIZE);
      if (!chunk.length) continue;
      await manager.save(entity, chunk);
    }
  }

  private async insertTreeBatch(
    manager: EntityManager,
    flattened: ReturnType<typeof flattenCaseTreeForPersist>,
  ): Promise<void> {
    for (let index = 0; index < flattened.treeRows.length; index += TREE_BATCH_CHUNK_SIZE) {
      await manager.insert(
        CaseTreeEntity,
        flattened.treeRows.slice(index, index + TREE_BATCH_CHUNK_SIZE),
      );
    }
    for (let index = 0; index < flattened.metadataRows.length; index += TREE_BATCH_CHUNK_SIZE) {
      await manager.insert(
        CaseNodeMetadataEntity,
        flattened.metadataRows.slice(index, index + TREE_BATCH_CHUNK_SIZE),
      );
    }
  }

  /** 保存接口仅返回运行元数据，避免大树重复下发 */
  private toGenerationRunMeta(editor: CaseEditorEntity): GenerationRun {
    return {
      id: editor.id,
      projectId: editor.projectId,
      constraintId: editor.constraintId,
      prompt: editor.prompt || "",
      model: editor.model || "local-rule-generator",
      tree: {
        id: editor.caseTreeId || editor.id,
        title: editor.title || "未命名",
        kind: "root",
        children: [],
      },
      mindMapExtras: editor.mindMapExtras,
      sourceTestPointIds: editor.sourceTestPointIds,
      createdAt: editor.createdAt.toISOString(),
    };
  }

  private async loadTree(
    rootId: string,
    caseEditorId?: string,
  ): Promise<CaseTreeNode> {
    const nodes = caseEditorId
      ? await this.loadTreeNodesByEditor(caseEditorId)
      : await this.collectTreeNodes(rootId);
    const nodeMap = new Map<string, CaseTreeNode>();
    for (const entity of nodes) {
      nodeMap.set(entity.id, {
        id: entity.id,
        title: entity.title,
        kind: entity.kind,
        collapsed: entity.collapsed,
        metadata: entity.metadata
          ? {
              caseNature: entity.metadata.caseNature
                ? normalizeCaseNature(entity.metadata.caseNature)
                : undefined,
              priority: entity.metadata.priority
                ? normalizeCasePriority(entity.metadata.priority)
                : undefined,
              caseType: entity.metadata.caseType,
              source: entity.metadata.source,
              knowledgeBaseIds: entity.metadata.knowledgeBaseIds,
            }
          : undefined,
        children: [],
      });
    }

    let root: CaseTreeNode | null = null;
    for (const entity of nodes.sort((a, b) => a.sortOrder - b.sortOrder)) {
      const current = nodeMap.get(entity.id)!;
      if (!entity.parentId) {
        root = current;
        continue;
      }
      nodeMap.get(entity.parentId)?.children.push(current);
    }

    if (!root) {
      throw new NotFoundException(`Root tree ${rootId} not found`);
    }
    return this.normalizeLoadedTree(root);
  }

  private normalizeLoadedTree(node: CaseTreeNode): CaseTreeNode {
    const children = (node.children || []).map((child) =>
      this.normalizeLoadedTree(child),
    );
    if (isCaseLikeKind(node.kind)) {
      return {
        ...node,
        metadata: ensureCaseMetadata(node),
        children,
      };
    }
    return { ...node, children };
  }

  /** 按运行 ID 一次加载整棵案例树（替代逐层 BFS，减少 round-trip） */
  private async loadTreeNodesByEditor(
    caseEditorId: string,
  ): Promise<CaseTreeEntity[]> {
    return this.caseTreeRepo.find({
      where: { caseEditorId },
      relations: ["metadata"],
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
  }

  private async collectTreeNodes(rootId: string): Promise<CaseTreeEntity[]> {
    const all: CaseTreeEntity[] = [];
    let frontier = [rootId];

    while (frontier.length) {
      const current = await this.caseTreeRepo.find({
        where: [{ id: In(frontier) }, { parentId: In(frontier) }],
        relations: ["metadata"],
        order: { sortOrder: "ASC", createdAt: "ASC" },
      });
      const unseen = current.filter(
        (item) => !all.some((existing) => existing.id === item.id),
      );
      all.push(...unseen);
      frontier = unseen.map((item) => item.id);
      if (!frontier.length) {
        break;
      }
      frontier = (
        await this.caseTreeRepo.find({
          where: { parentId: In(frontier) },
          select: ["id"],
        })
      ).map((item) => item.id);
    }

    return all;
  }

  private toGenerationRun(
    editor: CaseEditorEntity,
    tree: CaseTreeNode,
  ): GenerationRun {
    return {
      id: editor.id,
      projectId: editor.projectId,
      constraintId: editor.constraintId,
      prompt: editor.prompt || "",
      model: editor.model || "local-rule-generator",
      tree,
      mindMapExtras: editor.mindMapExtras,
      sourceTestPointIds: editor.sourceTestPointIds,
      createdAt: editor.createdAt.toISOString(),
    };
  }
}
