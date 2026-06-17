import type { MindElixirData, NodeObj } from "mind-elixir";
import type {
  CaseNature,
  CaseNodeKind,
  CasePriority,
  CaseTreeNode,
  MindMapExtras,
  MindMapSummary,
} from "@case-forge/shared";
import {
  CASE_NODE_KIND_LABELS,
  DEFAULT_CASE_NATURE,
  DEFAULT_CASE_PRIORITY,
  ensureCaseElementChildren,
  getCaseTitleOnly,
  isCaseElementKind,
  isCaseLikeKind,
  nextSixLevelChildKind,
  normalizeCaseNature,
  normalizeCasePriority,
  resolveCaseNature,
  sanitizeCaseTitleText,
  simplifyRequirementTitleForDisplay,
} from "@case-forge/shared";

/**
 * 存放在 mind-elixir 节点 `metadata` 上的案例树元信息。
 * mind-elixir 会在各类操作中保留该字段，因此可借此实现脑图 <-> 案例树的无损往返。
 */
export interface CaseMindMeta {
  kind: CaseNodeKind;
  caseNature?: CaseNature;
  priority?: CasePriority;
  caseType?: string;
  source?: string;
  knowledgeBaseIds?: string[];
  /** 案例节点真实标题（如「案例详情 [正]」），脑图上仅展示业务标题 */
  originalTitle?: string;
  /** 脑图拍平后用于重建 requirement 节点 */
  requirementId?: string;
  requirementTitle?: string;
  /** element 文本，用于回写重建子节点 */
  caseTitle?: string;
  preCondition?: string;
  testStep?: string;
  expectedResult?: string;
}

type CaseNodeObj = NodeObj<CaseMindMeta>;

function natureTag(nature: CaseNature): string {
  return nature === "反" ? "反" : "正";
}

function priorityTag(priority: CasePriority): string {
  return `优先级·${priority}`;
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}

function kindTag(kind: CaseNodeKind): string {
  return CASE_NODE_KIND_LABELS[kind] ?? kind;
}

function buildCaseElementMindChildren(
  caseNode: CaseTreeNode,
  businessTitle: string,
  requirementTitle?: string,
): CaseNodeObj[] {
  return ensureCaseElementChildren(caseNode, businessTitle).flatMap((child) =>
    caseNodeToMind(child, requirementTitle),
  );
}

function caseNodeToMind(
  node: CaseTreeNode,
  requirementTitle?: string,
): CaseNodeObj[] {
  const expanded = node.collapsed ? false : true;

  if (node.kind === "requirement") {
    const reqTitle = simplifyRequirementTitleForDisplay(node.title);
    return [
      {
        id: node.id,
        topic: node.title,
        expanded,
        tags: [kindTag("requirement")],
        metadata: { kind: "requirement" },
        children: (node.children ?? []).flatMap((child) =>
          caseNodeToMind(child, reqTitle),
        ),
      },
    ];
  }

  if (isCaseLikeKind(node.kind)) {
    const requirementSummary = simplifyRequirementTitleForDisplay(
      requirementTitle ?? "",
    );
    const businessTitle = getCaseTitleOnly(node, requirementSummary);
    const nature = resolveCaseNature(node, businessTitle);
    const priority = normalizeCasePriority(node.metadata?.priority);

    return [
      {
        id: node.id,
        topic: businessTitle || sanitizeCaseTitleText(node.title) || "案例",
        expanded,
        tags: [kindTag("case"), natureTag(nature), priorityTag(priority)],
        metadata: {
          kind: "case",
          caseNature: nature,
          priority,
          caseType: node.metadata?.caseType,
          source: node.metadata?.source,
          knowledgeBaseIds: node.metadata?.knowledgeBaseIds,
          originalTitle: node.title,
        },
        children: buildCaseElementMindChildren(
          node,
          businessTitle || sanitizeCaseTitleText(node.title) || "案例",
          requirementTitle,
        ),
      },
    ];
  }

  if (isCaseElementKind(node.kind)) {
    return [
      {
        id: node.id,
        topic: node.title || kindTag(node.kind),
        expanded,
        tags: [kindTag(node.kind)],
        metadata: { kind: node.kind },
        children: [],
      },
    ];
  }

  return [
    {
      id: node.id,
      topic: node.title,
      expanded,
      tags: [kindTag(node.kind)],
      metadata: { kind: node.kind },
      children: (node.children ?? []).flatMap((child) =>
        caseNodeToMind(child, requirementTitle),
      ),
    },
  ];
}

/** 案例树 -> mind-elixir 数据（含摘要 extras） */
export function caseTreeToMindData(
  tree: CaseTreeNode,
  extras?: MindMapExtras | null,
): MindElixirData {
  const summaries = (extras?.summaries ?? []).map((summary) => ({
    ...summary,
  }));
  const roots = caseNodeToMind(tree);
  return {
    nodeData: roots[0],
    summaries,
  } as MindElixirData;
}

function resolveKind(
  obj: CaseNodeObj,
  parentKind: CaseNodeKind | undefined,
): CaseNodeKind {
  const metaKind = obj.metadata?.kind;
  if (metaKind) {
    return metaKind;
  }
  if (!parentKind) {
    return "root";
  }
  // 兼容旧版脑图：module 下直接挂 case（测试要点层被拍平）
  if (parentKind === "module") {
    const meta = obj.metadata ?? {};
    if (
      meta.caseNature ||
      meta.originalTitle ||
      obj.tags?.some((tag) => tag === "正" || tag === "反")
    ) {
      return "case";
    }
  }
  return nextSixLevelChildKind(parentKind);
}

function mindNodeToCase(
  obj: CaseNodeObj,
  parentKind: CaseNodeKind | undefined,
): CaseTreeNode {
  const kind = resolveKind(obj, parentKind);
  const collapsed = obj.expanded === false ? true : undefined;

  if (isCaseLikeKind(kind)) {
    const meta = obj.metadata;
    const nature: CaseNature = meta?.caseNature
      ? normalizeCaseNature(meta.caseNature)
      : DEFAULT_CASE_NATURE;
    const priority: CasePriority = meta?.priority
      ? normalizeCasePriority(meta.priority)
      : DEFAULT_CASE_PRIORITY;
    const title = meta?.originalTitle ?? `案例详情 [${nature}]`;
    const businessTitle =
      sanitizeCaseTitleText(obj.topic ?? "") || (obj.topic ?? "");

    const rawElementChildren = (obj.children ?? []).map((child) =>
      mindNodeToCase(child as CaseNodeObj, kind),
    );
    const elementChildren = ensureCaseElementChildren(
      {
        id: obj.id,
        title,
        kind: "case",
        children: rawElementChildren,
      },
      businessTitle,
    );
    return {
      id: obj.id,
      title,
      kind: "case",
      ...(collapsed ? { collapsed } : {}),
      metadata: {
        caseNature: nature,
        priority,
        caseType: meta?.caseType,
        source: meta?.source,
        knowledgeBaseIds: meta?.knowledgeBaseIds,
      },
      children: elementChildren,
    };
  }

  const rawChildren = (obj.children ?? []) as CaseNodeObj[];

  // 兼容旧版脑图：module 下直接挂 case 时，按 requirementId 重建测试要点层
  if (kind === "module") {
    const requirementGroups = new Map<string, CaseTreeNode>();
    const otherChildren: CaseTreeNode[] = [];
    for (const child of rawChildren) {
      const childMeta = (child.metadata ?? {}) as CaseMindMeta;
      if (childMeta.kind === "case" && childMeta.requirementId) {
        const reqId = childMeta.requirementId;
        if (!requirementGroups.has(reqId)) {
          requirementGroups.set(reqId, {
            id: reqId,
            title: childMeta.requirementTitle || "测试要点",
            kind: "requirement",
            children: [],
          });
        }
        requirementGroups
          .get(reqId)!
          .children.push(mindNodeToCase(child, "requirement"));
      } else {
        otherChildren.push(mindNodeToCase(child, kind));
      }
    }
    if (requirementGroups.size) {
      return {
        id: obj.id,
        title: obj.topic ?? "",
        kind,
        ...(collapsed ? { collapsed } : {}),
        children: [...Array.from(requirementGroups.values()), ...otherChildren],
      };
    }
  }

  return {
    id: obj.id,
    title: obj.topic ?? "",
    kind,
    ...(collapsed ? { collapsed } : {}),
    children: rawChildren.map((child) => mindNodeToCase(child, kind)),
  };
}

/** mind-elixir 数据 -> 案例树 + 摘要 extras */
export function mindDataToCaseTree(data: MindElixirData): {
  tree: CaseTreeNode;
  extras: MindMapExtras;
} {
  const tree = mindNodeToCase(data.nodeData as CaseNodeObj, undefined);
  const summaries: MindMapSummary[] = (data.summaries ?? []).map((summary) => ({
    id: summary.id,
    label: summary.label,
    parent: summary.parent,
    start: summary.start,
    end: summary.end,
    style: summary.style
      ? { stroke: summary.style.stroke, labelColor: summary.style.labelColor }
      : undefined,
  }));
  return { tree, extras: { summaries } };
}
