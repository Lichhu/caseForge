/**
 * 案例编辑运行持久化服务：负责案例树运行记录的创建、
 * 查询、更新及树形结构的读写。
 */
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import type { CaseTreeNode, GenerationRun, MindMapExtras } from "@case-forge/shared";
import { randomUUID } from "node:crypto";
import { CaseEditorEntity } from "@case-editor/entity/case-editor.entity";
import { CaseNodeMetadataEntity } from "@case-editor/entity/case-node-metadata.entity";
import { CaseTreeEntity } from "@case-editor/entity/case-tree.entity";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { DataSource, EntityManager, In, Repository } from "typeorm";
import { scopedWhere } from "../../../common/audit/user-scope";
import { touchProjectUpdatedAt } from "../../../common/project/touch-project.util";

interface TreeSaveContext {
  projectId: string;
  caseEditorId: string;
}

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
      await this.saveTree(manager, input.tree, null, context);
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
      await manager.delete(CaseTreeEntity, { caseEditorId: editor.id });
      await this.saveTree(manager, tree, null, context);
      editor.caseTreeId = tree.id;
      editor.title = tree.title;
      editor.version += 1;
      editor.mindMapExtras = mindMapExtras ?? { summaries: [] };
      await manager.save(editor);
    });

    await touchProjectUpdatedAt(this.projectRepo, projectId);

    return this.toGenerationRun(editor, tree);
  }

  private async saveTree(
    manager: EntityManager,
    node: CaseTreeNode,
    parentId: string | null,
    context: TreeSaveContext,
    sortOrder = 0,
  ): Promise<void> {
    await manager.save(
      CaseTreeEntity,
      manager.create(CaseTreeEntity, {
        id: node.id,
        projectId: context.projectId,
        caseEditorId: context.caseEditorId,
        title: (node.title ?? "").trim() || "未命名节点",
        kind: node.kind,
        parentId: parentId || undefined,
        collapsed: node.collapsed ?? false,
        sortOrder,
      }),
    );

    if (node.metadata) {
      await manager.save(
        CaseNodeMetadataEntity,
        manager.create(CaseNodeMetadataEntity, {
          caseTreeId: node.id,
          priority: node.metadata.priority,
          caseType: node.metadata.caseType,
          source: node.metadata.source,
          knowledgeBaseIds: node.metadata.knowledgeBaseIds,
        }),
      );
    }

    for (let index = 0; index < (node.children || []).length; index += 1) {
      await this.saveTree(
        manager,
        node.children[index],
        node.id,
        context,
        index,
      );
    }
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
              priority: entity.metadata.priority as any,
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
    return root;
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
