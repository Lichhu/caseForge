import type { CaseTreeNode } from "@case-forge/shared";
import { ensureCaseMetadata, isCaseLikeKind } from "@case-forge/shared";
import type { CaseNodeMetadataEntity } from "@case-editor/entity/case-node-metadata.entity";
import type { CaseTreeEntity } from "@case-editor/entity/case-tree.entity";

export interface CaseTreePersistContext {
  projectId: string;
  caseEditorId: string;
}

export interface FlatTreeNodeRow {
  id: string;
  projectId: string;
  caseEditorId: string;
  title: string;
  kind: CaseTreeNode["kind"];
  parentId?: string;
  collapsed: boolean;
  sortOrder: number;
}

export interface FlatMetadataRow {
  caseTreeId: string;
  caseNature?: string;
  priority?: string;
  caseType?: string;
  source?: string;
  knowledgeBaseIds?: string[];
}

export interface FlattenedCaseTree {
  treeRows: FlatTreeNodeRow[];
  metadataRows: FlatMetadataRow[];
}

export interface CaseTreeDiffPlan {
  treeInserts: FlatTreeNodeRow[];
  treeUpdates: FlatTreeNodeRow[];
  treeDeleteIds: string[];
  metadataInserts: FlatMetadataRow[];
  metadataUpdates: Array<FlatMetadataRow & { id: string }>;
  metadataDeleteCaseTreeIds: string[];
}

export function flattenCaseTreeForPersist(
  tree: CaseTreeNode,
  context: CaseTreePersistContext,
  parentId: string | null = null,
  sortOrder = 0,
  acc: FlattenedCaseTree = { treeRows: [], metadataRows: [] },
): FlattenedCaseTree {
  acc.treeRows.push({
    id: nodeId(tree),
    projectId: context.projectId,
    caseEditorId: context.caseEditorId,
    title: normalizeTitle(tree.title),
    kind: tree.kind,
    parentId: parentId || undefined,
    collapsed: tree.collapsed ?? false,
    sortOrder,
  });

  const metadata = resolveMetadata(tree);
  if (metadata) {
    acc.metadataRows.push({
      caseTreeId: nodeId(tree),
      caseNature: metadata.caseNature,
      priority: metadata.priority,
      caseType: metadata.caseType,
      source: metadata.source,
      knowledgeBaseIds: metadata.knowledgeBaseIds,
    });
  }

  for (let index = 0; index < (tree.children || []).length; index += 1) {
    flattenCaseTreeForPersist(
      tree.children[index],
      context,
      nodeId(tree),
      index,
      acc,
    );
  }

  return acc;
}

export function buildCaseTreeDiffPlan(
  existingNodes: CaseTreeEntity[],
  incoming: FlattenedCaseTree,
): CaseTreeDiffPlan {
  const incomingTreeMap = new Map(
    incoming.treeRows.map((row) => [row.id, row] as const),
  );
  const incomingMetadataMap = new Map(
    incoming.metadataRows.map((row) => [row.caseTreeId, row] as const),
  );
  const existingMap = new Map(existingNodes.map((node) => [node.id, node] as const));

  const plan: CaseTreeDiffPlan = {
    treeInserts: [],
    treeUpdates: [],
    treeDeleteIds: [],
    metadataInserts: [],
    metadataUpdates: [],
    metadataDeleteCaseTreeIds: [],
  };

  for (const row of incoming.treeRows) {
    const old = existingMap.get(row.id);
    if (!old) {
      plan.treeInserts.push(row);
      continue;
    }
    if (treeNodeChanged(old, row)) {
      plan.treeUpdates.push(row);
    }
  }

  for (const node of existingNodes) {
    if (!incomingTreeMap.has(node.id)) {
      plan.treeDeleteIds.push(node.id);
    }
  }

  for (const [caseTreeId, incomingMeta] of incomingMetadataMap) {
    const oldNode = existingMap.get(caseTreeId);
    if (!oldNode || plan.treeDeleteIds.includes(caseTreeId)) {
      continue;
    }
    const oldMeta = oldNode.metadata;
    if (!oldMeta) {
      plan.metadataInserts.push(incomingMeta);
      continue;
    }
    if (!metadataEqual(oldMeta, incomingMeta)) {
      plan.metadataUpdates.push({
        id: oldMeta.id,
        ...incomingMeta,
      });
    }
  }

  for (const node of existingNodes) {
    if (plan.treeDeleteIds.includes(node.id) || !node.metadata) {
      continue;
    }
    if (!incomingMetadataMap.has(node.id)) {
      plan.metadataDeleteCaseTreeIds.push(node.id);
    }
  }

  return plan;
}

export function isFullTreeReplace(plan: CaseTreeDiffPlan, existingCount: number) {
  if (!existingCount) {
    return true;
  }
  const changed =
    plan.treeDeleteIds.length + plan.treeInserts.length + plan.treeUpdates.length;
  return changed >= existingCount * 0.75;
}

function nodeId(node: CaseTreeNode) {
  return node.id;
}

function normalizeTitle(title?: string) {
  return (title ?? "").trim() || "未命名节点";
}

function resolveMetadata(node: CaseTreeNode) {
  if (isCaseLikeKind(node.kind)) {
    return ensureCaseMetadata(node);
  }
  if (node.metadata) {
    return node.metadata;
  }
  return undefined;
}

function treeNodeChanged(old: CaseTreeEntity, incoming: FlatTreeNodeRow) {
  return (
    old.title !== incoming.title ||
    old.kind !== incoming.kind ||
    (old.parentId ?? undefined) !== incoming.parentId ||
    Boolean(old.collapsed) !== incoming.collapsed ||
    old.sortOrder !== incoming.sortOrder
  );
}

function metadataEqual(
  old: CaseNodeMetadataEntity,
  incoming: FlatMetadataRow,
) {
  return (
    (old.caseNature ?? undefined) === (incoming.caseNature ?? undefined) &&
    (old.priority ?? undefined) === (incoming.priority ?? undefined) &&
    (old.caseType ?? undefined) === (incoming.caseType ?? undefined) &&
    (old.source ?? undefined) === (incoming.source ?? undefined) &&
    jsonEqual(old.knowledgeBaseIds, incoming.knowledgeBaseIds)
  );
}

function jsonEqual(left?: string[] | null, right?: string[] | null) {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}
