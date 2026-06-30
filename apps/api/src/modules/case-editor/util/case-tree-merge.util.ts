import type { CaseTreeNode } from "@case-forge/shared";
import { randomUUID } from "node:crypto";
import type { TestPointSnapshot } from "@case-editor/service/case-pipeline.service";

type AncestorContext = {
  system?: string;
  module?: string;
};

export type CaseTreeMergeMode = "append" | "full";

export type MergeCaseTreeOptions = {
  /** 默认 full；isFull 为 true 的测试要点会先移除原案例再写入新案例 */
  mergeModeByTestPointId?: Map<string, CaseTreeMergeMode>;
};

/** 将本次生成的分支合并进已有案例树，避免「后生成覆盖先看到的模块」 */
export function mergeCaseTreeBranches(
  base: CaseTreeNode,
  incoming: CaseTreeNode,
  testPoints: TestPointSnapshot[],
  options?: MergeCaseTreeOptions,
): CaseTreeNode {
  if (!testPoints.length) {
    return incoming;
  }
  const mergeModeByTestPointId = options?.mergeModeByTestPointId ?? new Map();
  const fullReplacePoints = testPoints.filter(
    (point) => resolveMergeMode(point.id, mergeModeByTestPointId) === "full",
  );

  let merged = cloneTreeNode(base);
  if (fullReplacePoints.length) {
    merged = pruneRequirementsForTestPoints(merged, fullReplacePoints);
  }
  for (const systemNode of incoming.children || []) {
    merged = mergeSystemBranch(
      merged,
      systemNode,
      testPoints,
      mergeModeByTestPointId,
    );
  }
  return merged;
}

function resolveMergeMode(
  testPointId: string,
  mergeModeByTestPointId: Map<string, CaseTreeMergeMode>,
): CaseTreeMergeMode {
  return mergeModeByTestPointId.get(testPointId) ?? "full";
}

export function mergeSourceTestPointIds(
  existing: string[] | undefined,
  incoming: string[],
) {
  return [...new Set([...(existing || []), ...incoming])];
}

/** 合并两棵树后重新分配节点 id，避免子树 id 冲突 */
export function reassignCaseTreeNodeIds(node: CaseTreeNode): CaseTreeNode {
  return {
    ...node,
    id: randomUUID(),
    children: (node.children || []).map((child) => reassignCaseTreeNodeIds(child)),
  };
}

function pruneRequirementsForTestPoints(
  root: CaseTreeNode,
  testPoints: TestPointSnapshot[],
): CaseTreeNode {
  const prune = (node: CaseTreeNode, ctx: AncestorContext): CaseTreeNode | null => {
    const nextCtx: AncestorContext = { ...ctx };
    if (node.kind === "system") {
      nextCtx.system = node.title;
    }
    if (node.kind === "module") {
      nextCtx.module = node.title;
    }

    if (
      node.kind === "requirement" &&
      testPoints.some((point) => matchesTestPoint(node.title, point, nextCtx))
    ) {
      return null;
    }

    const children = (node.children || [])
      .map((child) => prune(child, nextCtx))
      .filter((child): child is CaseTreeNode => Boolean(child));

    if (node.kind === "module" && !children.length) {
      return null;
    }
    if (node.kind === "system" && !children.length) {
      return null;
    }

    return {
      ...node,
      children,
    };
  };

  return prune(cloneTreeNode(root), {}) || cloneTreeNode(root);
}

function matchesTestPoint(
  requirementTitle: string,
  point: TestPointSnapshot,
  ctx: AncestorContext,
) {
  if (ctx.system?.trim() && ctx.system.trim() !== point.system.trim()) {
    return false;
  }
  if (
    ctx.module?.trim() &&
    ctx.module.trim() !== point.featureModule.trim()
  ) {
    return false;
  }
  const normalizedTitle = normalizeText(requirementTitle);
  const normalizedPoint = normalizeText(point.testPoint);
  if (!normalizedPoint) {
    return false;
  }
  return (
    normalizedTitle === normalizedPoint ||
    normalizedTitle.startsWith(`${normalizedPoint}：`) ||
    normalizedTitle.startsWith(`${normalizedPoint}:`)
  );
}

function mergeSystemBranch(
  root: CaseTreeNode,
  incomingSystem: CaseTreeNode,
  testPoints: TestPointSnapshot[],
  mergeModeByTestPointId: Map<string, CaseTreeMergeMode>,
) {
  const children = [...(root.children || [])];
  const index = children.findIndex(
    (item) => item.kind === "system" && item.title === incomingSystem.title,
  );
  if (index === -1) {
    children.push(incomingSystem);
    return { ...root, children };
  }
  children[index] = mergeModuleBranches(
    children[index],
    incomingSystem,
    testPoints,
    mergeModeByTestPointId,
  );
  return { ...root, children };
}

function mergeModuleBranches(
  existingSystem: CaseTreeNode,
  incomingSystem: CaseTreeNode,
  testPoints: TestPointSnapshot[],
  mergeModeByTestPointId: Map<string, CaseTreeMergeMode>,
) {
  const modules = [...(existingSystem.children || [])];
  const systemCtx = existingSystem.title;
  for (const incomingModule of incomingSystem.children || []) {
    if (incomingModule.kind !== "module") {
      continue;
    }
    const index = modules.findIndex(
      (item) => item.kind === "module" && item.title === incomingModule.title,
    );
    if (index === -1) {
      modules.push(incomingModule);
      continue;
    }
    const ctx: AncestorContext = {
      system: systemCtx,
      module: incomingModule.title,
    };
    const mergedChildren = [...(modules[index].children || [])];
    for (const incomingReq of incomingModule.children || []) {
      if (incomingReq.kind !== "requirement") {
        mergedChildren.push(incomingReq);
        continue;
      }
      const point = findTestPointForRequirement(
        incomingReq.title,
        ctx,
        testPoints,
      );
      if (!point) {
        mergedChildren.push(incomingReq);
        continue;
      }
      const mode = resolveMergeMode(point.id, mergeModeByTestPointId);
      const existingIndex = findRequirementIndexForTestPoint(
        mergedChildren,
        point,
        ctx,
      );
      if (existingIndex >= 0 && mode === "append") {
        const existingReq = mergedChildren[existingIndex];
        mergedChildren[existingIndex] = {
          ...existingReq,
          children: [
            ...(existingReq.children || []),
            ...(incomingReq.children || []),
          ],
        };
        continue;
      }
      if (existingIndex >= 0 && mode === "full") {
        continue;
      }
      mergedChildren.push(incomingReq);
    }
    modules[index] = { ...modules[index], children: mergedChildren };
  }
  return { ...existingSystem, children: modules };
}

function findTestPointForRequirement(
  requirementTitle: string,
  ctx: AncestorContext,
  testPoints: TestPointSnapshot[],
) {
  return testPoints.find((point) =>
    matchesTestPoint(requirementTitle, point, ctx),
  );
}

function findRequirementIndexForTestPoint(
  children: CaseTreeNode[],
  point: TestPointSnapshot,
  ctx: AncestorContext,
) {
  return children.findIndex(
    (item) =>
      item.kind === "requirement" && matchesTestPoint(item.title, point, ctx),
  );
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function cloneTreeNode(node: CaseTreeNode): CaseTreeNode {
  return {
    ...node,
    metadata: node.metadata ? { ...node.metadata } : undefined,
    children: (node.children || []).map((child) => cloneTreeNode(child)),
  };
}
