import type {
  CaseNature,
  CaseNodeKind,
  CasePriority,
  CaseTreeNode,
} from "./index";
import { DEFAULT_CASE_NATURE, DEFAULT_CASE_PRIORITY } from "./index";

export const CASE_ELEMENT_KINDS = [
  "case_title",
  "case_condition",
  "case_step",
  "case_expected",
] as const;

export type CaseElementKind = (typeof CASE_ELEMENT_KINDS)[number];

export const CASE_NODE_KIND_LABELS: Record<string, string> = {
  root: "根",
  system: "系统",
  module: "功能模块",
  requirement: "测试要点",
  case: "案例",
  case_title: "案例标题",
  case_condition: "前置条件",
  case_step: "测试步骤",
  case_expected: "预期结果",
  scenario: "场景",
  section: "区块",
  condition: "前置条件",
  step: "测试步骤",
  expectation: "预期结果",
  metadata: "元数据",
};

export function nextSixLevelChildKind(kind: CaseNodeKind): CaseNodeKind {
  const map: Partial<Record<CaseNodeKind, CaseNodeKind>> = {
    root: "system",
    system: "module",
    module: "requirement",
    requirement: "case",
    case: "case_title",
  };
  return map[kind] || kind;
}

export function isCaseElementKind(kind: CaseNodeKind): kind is CaseElementKind {
  return CASE_ELEMENT_KINDS.includes(kind as CaseElementKind);
}

/**
 * 案例下六级要素：始终包含「案例标题」节点；缺省时用 titleFallback 或案例节点推导文案补齐。
 * 仅返回已存在的要素节点（除 case_title 外不自动补空节点）。
 */
export function ensureCaseElementChildren(
  caseNode: CaseTreeNode,
  titleFallback?: string,
): CaseTreeNode[] {
  const businessTitle =
    titleFallback?.trim() || getCaseTitleOnly(caseNode) || "案例";
  const byKind = new Map<CaseElementKind, CaseTreeNode>();
  for (const child of caseNode.children ?? []) {
    if (isCaseElementKind(child.kind)) {
      byKind.set(child.kind, child);
    }
  }

  const result: CaseTreeNode[] = [];
  for (const kind of CASE_ELEMENT_KINDS) {
    if (kind === "case_title") {
      const existing = byKind.get("case_title");
      result.push(
        existing
          ? { ...existing, title: existing.title?.trim() || businessTitle }
          : {
              id: `${caseNode.id}-title`,
              title: businessTitle,
              kind: "case_title",
              children: [],
            },
      );
      continue;
    }
    const existing = byKind.get(kind);
    if (existing) {
      result.push(existing);
    }
  }
  return result;
}

const CASE_TAG_IN_BRACKETS =
  "正向|反向|正|反|异常|边界|接口|权限|端到端|UI|并发";

const CASE_TAG_PREFIX_RE = new RegExp(
  `^\\[(${CASE_TAG_IN_BRACKETS})\\]\\s*`,
  "u",
);

const CASE_TAG_SUFFIX_RE = new RegExp(
  `\\s*\\[(${CASE_TAG_IN_BRACKETS})\\]\\s*$`,
  "u",
);

/** 将历史「正向/反向」或空值规范为 正/反 */
export function normalizeCaseNature(value?: string | null): CaseNature {
  const text = (value ?? "").trim();
  if (text === "正" || text === "正向") {
    return "正";
  }
  if (text === "反" || text === "反向") {
    return "反";
  }
  return DEFAULT_CASE_NATURE;
}

/** 从案例节点标题解析极性（含旧版 [异常]/[边界]/[接口] 等，统一归为反） */
export function extractCasePolarity(caseNodeTitle: string): CaseNature | null {
  const text = (caseNodeTitle ?? "").trim();
  const skill = text.match(/案例详情\s*\[(正|反|正向|反向)\]/);
  if (skill) {
    return normalizeCaseNature(skill[1]);
  }
  const legacy = text.match(
    new RegExp(`^\\[(${CASE_TAG_IN_BRACKETS})\\]`, "u"),
  );
  if (!legacy) {
    return null;
  }
  if (legacy[1] === "正向" || legacy[1] === "正") {
    return "正";
  }
  return "反";
}

/** 将历史 P0/P1/P2 或空值规范为 高/中/低 */
export function normalizeCasePriority(value?: string | null): CasePriority {
  const text = (value ?? "").trim();
  if (text === "高" || text === "中" || text === "低") {
    return text;
  }
  if (text === "P0") {
    return "高";
  }
  if (text === "P1") {
    return "中";
  }
  if (text === "P2" || text === "P3") {
    return "低";
  }
  return DEFAULT_CASE_PRIORITY;
}

/** 解析案例性质：优先 metadata，其次标题中的 [正]/[反] */
export function resolveCaseNature(
  caseNode: CaseTreeNode,
  caseNameFallback?: string,
): CaseNature {
  const fromMeta = caseNode.metadata?.caseNature;
  if (fromMeta) {
    return normalizeCaseNature(fromMeta);
  }
  return (
    extractCasePolarity(caseNode.title) ??
    extractCasePolarity(caseNameFallback ?? "") ??
    DEFAULT_CASE_NATURE
  );
}

/** 补齐案例节点 metadata 默认值（性质、优先级） */
export function ensureCaseMetadata(
  caseNode: CaseTreeNode,
  caseNameFallback?: string,
): NonNullable<CaseTreeNode["metadata"]> {
  return {
    ...caseNode.metadata,
    caseNature: resolveCaseNature(caseNode, caseNameFallback),
    priority: normalizeCasePriority(caseNode.metadata?.priority),
    caseType: caseNode.metadata?.caseType,
    source: caseNode.metadata?.source,
    knowledgeBaseIds: caseNode.metadata?.knowledgeBaseIds,
  };
}

export function isCaseLikeKind(kind: CaseNodeKind) {
  return kind === "case" || kind === "scenario";
}

/** 去掉 [异常]/[边界]/[接口]/[正向]/[反向] 等标签，只保留业务文案 */
export function sanitizeCaseTitleText(title: string) {
  let text = (title ?? "").trim();
  text = text.replace(/^案例详情\s*/u, "");
  while (CASE_TAG_PREFIX_RE.test(text)) {
    text = text.replace(CASE_TAG_PREFIX_RE, "").trim();
  }
  text = text.replace(CASE_TAG_SUFFIX_RE, "").trim();
  return text;
}

/** 是否为占位案例标题（未填写真实业务标题） */
export function isPlaceholderCaseTitle(title: string | undefined | null) {
  const text = sanitizeCaseTitleText(title ?? "");
  if (!text || text === "案例标题" || text === "案例" || text === "案例详情") {
    return true;
  }
  if (
    /^案例详情\s*\[(正|反|正向|反向|异常|边界|接口|权限|端到端|UI|并发)\]\s*$/u.test(
      (title ?? "").trim(),
    )
  ) {
    return true;
  }
  return false;
}

export function buildFallbackCaseTitle(
  requirementTitle: string | undefined,
  polarity: CaseNature,
) {
  const base = (requirementTitle || "业务场景").trim();
  if (polarity === "正") {
    return `${base}正常通过验证`;
  }
  return `${base}不满足规则时拦截验证`;
}

/** @deprecated 使用 sanitizeCaseTitleText */
export function stripCasePolaritySuffix(title: string) {
  return sanitizeCaseTitleText(title);
}

/** 案例标题子节点：仅业务描述，不含任何方括号标签 */
export function getCaseTitleOnly(
  caseNode: CaseTreeNode,
  requirementTitle?: string,
) {
  const childTitle = sanitizeCaseTitleText(
    getCaseElementContent(caseNode, "case_title"),
  );
  if (childTitle && !isPlaceholderCaseTitle(childTitle)) {
    return childTitle;
  }
  const polarity =
    caseNode.metadata?.caseNature ?? extractCasePolarity(caseNode.title);
  if (requirementTitle && polarity) {
    return buildFallbackCaseTitle(requirementTitle, polarity);
  }
  return "详情";
}

/** 脑图案例节点：业务标题 + 极性，用于区分同要点下正/反向 */
export function getCaseDisplayTitle(
  caseNode: CaseTreeNode,
  requirementTitle?: string,
) {
  const polarity =
    caseNode.metadata?.caseNature ?? extractCasePolarity(caseNode.title);
  const childTitle = sanitizeCaseTitleText(
    getCaseElementContent(caseNode, "case_title"),
  );
  let base =
    childTitle && !isPlaceholderCaseTitle(childTitle) ? childTitle : "";
  if (!base && requirementTitle) {
    base = buildFallbackCaseTitle(
      requirementTitle,
      polarity || DEFAULT_CASE_NATURE,
    );
  }
  if (base && polarity) {
    return `${base} [${polarity}]`;
  }
  if (base) {
    return base;
  }
  if (polarity) {
    return `案例 [${polarity}]`;
  }
  return sanitizeCaseTitleText(caseNode.title) || caseNode.title;
}

/** 将整棵树中的案例节点统一为 skill 格式，并清洗标题中的旧标签 */
/** 是否为 normalizeCaseTreeForSkill 自动补的 case_title 占位节点 */
export function isAutoGeneratedCaseTitleNode(node: {
  id: string;
  kind: CaseNodeKind;
}): boolean {
  return node.kind === "case_title" && node.id.endsWith("-title");
}

export interface NormalizeCaseTreeOptions {
  /** 是否自动补齐 case_title 子节点，默认 true（生成/导出链路） */
  injectMissingCaseTitle?: boolean;
  /** 是否将案例节点标题规范为「案例详情 [正/反]」，默认 true */
  normalizeCaseNodeTitle?: boolean;
}

/** 案例编辑台保存：不自动补案例标题，保留用户编辑的节点结构 */
export const EDITOR_CASE_TREE_NORMALIZE_OPTIONS: NormalizeCaseTreeOptions = {
  injectMissingCaseTitle: false,
  normalizeCaseNodeTitle: false,
};

export function normalizeCaseTreeForSkill(
  tree: CaseTreeNode,
  options: NormalizeCaseTreeOptions = {},
): CaseTreeNode {
  const injectMissingCaseTitle = options.injectMissingCaseTitle ?? true;
  const normalizeCaseNodeTitle = options.normalizeCaseNodeTitle ?? true;
  const walk = (
    node: CaseTreeNode,
    requirementTitle?: string,
  ): CaseTreeNode => {
    const nextRequirement =
      node.kind === "requirement"
        ? simplifyRequirementTitleForDisplay(node.title)
        : requirementTitle;
    if (node.kind === "case" || node.kind === "scenario") {
      const polarity = extractCasePolarity(node.title) || DEFAULT_CASE_NATURE;
      const caseNodeTitle = `案例详情 [${polarity}]`;
      const titleOnly = getCaseTitleOnly(
        { ...node, title: node.title },
        nextRequirement,
      );
      let nextChildren = (node.children || []).map((child) => {
        if (child.kind === "case_title") {
          return { ...child, title: titleOnly };
        }
        return walk(child, nextRequirement);
      });
      if (!injectMissingCaseTitle) {
        nextChildren = nextChildren.filter(
          (child) => !isAutoGeneratedCaseTitleNode(child),
        );
      } else if (!nextChildren.some((child) => child.kind === "case_title")) {
        nextChildren.unshift({
          id: `${node.id}-title`,
          title: titleOnly,
          kind: "case_title",
          children: [],
        });
      }
      return {
        ...node,
        title: normalizeCaseNodeTitle ? caseNodeTitle : node.title,
        children: nextChildren,
      };
    }
    return {
      ...node,
      children: (node.children || []).map((child) =>
        walk(child, nextRequirement),
      ),
    };
  };
  return walk(tree);
}

/**
 * 案例编辑台展示用：测试要点节点只保留主描述，不展示验证点/测试方法明细。
 */
export function simplifyRequirementTitleForDisplay(title: string): string {
  const text = (title ?? "").trim();
  if (!text) {
    return text;
  }

  const colonMatch = text.match(/^(.+?)[：:]\s*([\s\S]*)$/);
  if (colonMatch) {
    const head = colonMatch[1].trim();
    const tail = colonMatch[2];
    if (/验证点|测试方法/.test(tail)) {
      return head;
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const kept: string[] = [];
  for (const line of lines) {
    if (/^[-*•]?\s*验证点[：:]/u.test(line)) {
      break;
    }
    if (/^[-*•]?\s*测试方法[：:]/u.test(line)) {
      break;
    }
    kept.push(line.replace(/^[-*•]\s*/, "").trim());
  }

  if (!kept.length) {
    const firstLine = text.split(/\r?\n/)[0]?.trim() || text;
    return firstLine.replace(/[：:].*$/, "").trim() || firstLine;
  }

  const first = kept[0];
  if (/验证点|测试方法/.test(first)) {
    return (
      text
        .split(/\r?\n/)[0]
        ?.replace(/[：:].*$/, "")
        .trim() || text
    );
  }
  return first;
}

export interface CaseExcelRow {
  root: string;
  system: string;
  module: string;
  requirement: string;
  caseName: string;
  caseNature: CaseNature;
  priority: CasePriority;
  caseTitle: string;
  caseCondition: string;
  caseStep: string;
  caseExpected: string;
  caseNodeId: string;
  elementNodeIds: Partial<Record<CaseElementKind, string>>;
}

export interface CaseExcelMergeCell {
  row: number;
  col: number;
  rowSpan: number;
}

export interface CaseExcelViewModel {
  rows: CaseExcelRow[];
  merges: CaseExcelMergeCell[];
}

export interface CaseExcelRowListQuery {
  requirement?: string;
  system?: string;
  module?: string;
  priority?: CasePriority;
  caseNature?: CaseNature;
  keyword?: string;
}

export interface CaseExcelRowListPage {
  items: CaseExcelRow[];
  total: number;
  totalRows: number;
  page: number;
  pageSize: number;
  requirements: string[];
  systems: string[];
  modules: string[];
  focusPage?: number;
  /** idsOnly 查询时返回的全部匹配 caseNodeId */
  ids?: string[];
}

export function matchesCaseExcelRowFilter(
  row: CaseExcelRow,
  query: CaseExcelRowListQuery,
): boolean {
  if (query.requirement && row.requirement !== query.requirement) {
    return false;
  }
  if (query.system && row.system !== query.system) {
    return false;
  }
  if (query.module && row.module !== query.module) {
    return false;
  }
  if (query.priority && row.priority !== query.priority) {
    return false;
  }
  if (query.caseNature && row.caseNature !== query.caseNature) {
    return false;
  }
  const keyword = query.keyword?.trim().toLowerCase();
  if (!keyword) {
    return true;
  }
  const haystack = [
    row.caseName,
    row.caseTitle,
    row.caseNature,
    row.priority,
    row.caseCondition,
    row.caseStep,
    row.caseExpected,
  ]
    .join("\n")
    .toLowerCase();
  return haystack.includes(keyword);
}

export function filterCaseExcelRows(
  rows: CaseExcelRow[],
  query: CaseExcelRowListQuery,
): CaseExcelRow[] {
  return rows.filter((row) => matchesCaseExcelRowFilter(row, query));
}

export function collectCaseExcelRequirements(rows: CaseExcelRow[]): string[] {
  return collectCaseExcelFieldValues(rows, (row) => row.requirement);
}

export function collectCaseExcelSystems(rows: CaseExcelRow[]): string[] {
  return collectCaseExcelFieldValues(rows, (row) => row.system);
}

export function collectCaseExcelModules(rows: CaseExcelRow[]): string[] {
  return collectCaseExcelFieldValues(rows, (row) => row.module);
}

function collectCaseExcelFieldValues(
  rows: CaseExcelRow[],
  pick: (row: CaseExcelRow) => string,
): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const row of rows) {
    const value = pick(row).trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    values.push(value);
  }
  return values.sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function paginateCaseExcelRows(
  rows: CaseExcelRow[],
  page: number,
  pageSize: number,
): CaseExcelRow[] {
  const start = (Math.max(1, page) - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export function findCaseExcelRowPage(
  rows: CaseExcelRow[],
  caseNodeId: string,
  pageSize: number,
): number | undefined {
  const index = rows.findIndex((row) => row.caseNodeId === caseNodeId);
  if (index < 0) {
    return undefined;
  }
  return Math.floor(index / pageSize) + 1;
}

export function getCaseElementContent(
  caseNode: CaseTreeNode,
  kind: CaseElementKind,
) {
  const child = caseNode.children?.find((item) => item.kind === kind);
  if (child) {
    return child.title;
  }
  if (kind === "case_title") {
    return caseNode.title;
  }
  return "";
}

export function flattenCaseTreeToExcel(tree: CaseTreeNode): CaseExcelViewModel {
  const rows: CaseExcelRow[] = [];

  const walk = (
    node: CaseTreeNode,
    ancestors: Partial<
      Record<"root" | "system" | "module" | "requirement", CaseTreeNode>
    >,
  ) => {
    const nextAncestors = { ...ancestors };
    if (node.kind === "root") nextAncestors.root = node;
    if (node.kind === "system") nextAncestors.system = node;
    if (node.kind === "module") nextAncestors.module = node;
    if (node.kind === "requirement") nextAncestors.requirement = node;

    if (node.kind === "case" || node.kind === "scenario") {
      const requirementTitle = (nextAncestors.requirement?.title || "").trim();
      const requirementSummary =
        simplifyRequirementTitleForDisplay(requirementTitle);
      const caseTitle = getCaseTitleOnly(node, requirementSummary);
      const metadata = ensureCaseMetadata(node, caseTitle);
      const caseName = isPlaceholderCaseTitle(node.title)
        ? caseTitle
        : sanitizeCaseTitleText(node.title) || caseTitle;
      rows.push({
        root: nextAncestors.root?.title || "",
        system: nextAncestors.system?.title || "",
        module: nextAncestors.module?.title || "",
        requirement: requirementTitle,
        caseName,
        caseNature: metadata.caseNature!,
        priority: metadata.priority!,
        caseTitle,
        caseCondition: getLegacyOrElementContent(
          node,
          "case_condition",
          "condition",
        ),
        caseStep: getLegacyOrElementContent(node, "case_step", "step"),
        caseExpected: getLegacyOrElementContent(
          node,
          "case_expected",
          "expectation",
        ),
        caseNodeId: node.id,
        elementNodeIds: collectElementNodeIds(node),
      });
      return;
    }

    for (const child of node.children || []) {
      walk(child, nextAncestors);
    }
  };

  walk(tree, {});
  return {
    rows,
    merges: buildExcelMerges(rows),
  };
}

function getLegacyOrElementContent(
  caseNode: CaseTreeNode,
  elementKind: CaseElementKind,
  legacyKind: CaseNodeKind,
) {
  const direct = getCaseElementContent(caseNode, elementKind);
  if (direct) {
    return direct;
  }
  const section = caseNode.children?.find(
    (item) =>
      item.kind === "section" &&
      item.title.includes(
        elementKind === "case_condition"
          ? "前置"
          : elementKind === "case_step"
            ? "步骤"
            : "预期",
      ),
  );
  if (!section) {
    return "";
  }
  return (section.children || [])
    .filter((item) => item.kind === legacyKind)
    .map((item) => item.title.replace(/^\d+\.\s*/, ""))
    .join("\n");
}

function collectElementNodeIds(caseNode: CaseTreeNode) {
  const ids: Partial<Record<CaseElementKind, string>> = {};
  for (const kind of CASE_ELEMENT_KINDS) {
    const child = caseNode.children?.find((item) => item.kind === kind);
    if (child) {
      ids[kind] = child.id;
    }
  }
  return ids;
}

function buildExcelMerges(rows: CaseExcelRow[]): CaseExcelMergeCell[] {
  const merges: CaseExcelMergeCell[] = [];
  const columns: Array<keyof CaseExcelRow> = [
    "root",
    "system",
    "module",
    "requirement",
  ];
  columns.forEach((column, colIndex) => {
    let start = 0;
    while (start < rows.length) {
      let end = start + 1;
      while (
        end < rows.length &&
        rows[end][column] === rows[start][column] &&
        rows[end][column]
      ) {
        const sameParents = columns
          .slice(0, colIndex)
          .every(
            (parentKey) => rows[end][parentKey] === rows[start][parentKey],
          );
        if (!sameParents) {
          break;
        }
        end += 1;
      }
      const span = end - start;
      if (span > 1) {
        merges.push({ row: start, col: colIndex, rowSpan: span });
      }
      start = end;
    }
  });
  return merges;
}

/** 深拷贝案例树（兼容 Vue 响应式对象，避免 structuredClone 失败） */
export function cloneCaseTree(node: CaseTreeNode): CaseTreeNode {
  return {
    id: node.id,
    title: node.title,
    kind: node.kind,
    collapsed: node.collapsed,
    metadata: node.metadata
      ? {
          caseNature: node.metadata.caseNature,
          priority: node.metadata.priority,
          caseType: node.metadata.caseType,
          source: node.metadata.source,
          knowledgeBaseIds: node.metadata.knowledgeBaseIds
            ? [...node.metadata.knowledgeBaseIds]
            : undefined,
        }
      : undefined,
    children: (node.children || []).map(cloneCaseTree),
  };
}

export interface CaseExcelRowPath {
  root: string;
  system: string;
  module: string;
  requirement: string;
}

export function pickCaseExcelRowPath(row: CaseExcelRow): CaseExcelRowPath {
  return {
    root: row.root,
    system: row.system,
    module: row.module,
    requirement: row.requirement,
  };
}

function findChildByKindAndTitle(
  parent: CaseTreeNode,
  kind: CaseNodeKind,
  title: string,
): CaseTreeNode | null {
  const trimmed = title.trim();
  if (!trimmed) {
    return null;
  }
  return (
    (parent.children || []).find(
      (child) => child.kind === kind && child.title.trim() === trimmed,
    ) || null
  );
}

function ensureChildByKindAndTitle(
  parent: CaseTreeNode,
  kind: CaseNodeKind,
  title: string,
): CaseTreeNode {
  const trimmed = title.trim();
  const existing = findChildByKindAndTitle(parent, kind, trimmed);
  if (existing) {
    return existing;
  }
  const node: CaseTreeNode = {
    id: cryptoRandomId(),
    title: trimmed,
    kind,
    children: [],
  };
  parent.children = parent.children || [];
  parent.children.push(node);
  return node;
}

function findRootNodeByTitle(
  tree: CaseTreeNode,
  rootTitle: string,
): CaseTreeNode | null {
  const trimmed = rootTitle.trim();
  if (!trimmed) {
    return null;
  }
  let found: CaseTreeNode | null = null;
  const walk = (node: CaseTreeNode) => {
    if (found) {
      return;
    }
    if (node.kind === "root" && node.title.trim() === trimmed) {
      found = node;
      return;
    }
    for (const child of node.children || []) {
      walk(child);
    }
  };
  walk(tree);
  return found;
}

function ensureRequirementNodeByPath(
  tree: CaseTreeNode,
  path: CaseExcelRowPath,
): CaseTreeNode | null {
  const rootTitle = path.root.trim();
  const systemTitle = path.system.trim();
  const moduleTitle = path.module.trim();
  const requirementTitle = path.requirement.trim();
  if (!rootTitle || !systemTitle || !moduleTitle || !requirementTitle) {
    return null;
  }
  const rootNode = findRootNodeByTitle(tree, rootTitle);
  if (!rootNode) {
    return null;
  }
  const systemNode = ensureChildByKindAndTitle(rootNode, "system", systemTitle);
  const moduleNode = ensureChildByKindAndTitle(
    systemNode,
    "module",
    moduleTitle,
  );
  return ensureChildByKindAndTitle(moduleNode, "requirement", requirementTitle);
}

function findRequirementNodeByPath(
  tree: CaseTreeNode,
  path: CaseExcelRowPath,
): CaseTreeNode | null {
  let found: CaseTreeNode | null = null;
  const walk = (
    node: CaseTreeNode,
    ancestors: Partial<Record<"root" | "system" | "module", string>>,
  ) => {
    const nextAncestors = { ...ancestors };
    if (node.kind === "root") nextAncestors.root = node.title.trim();
    if (node.kind === "system") nextAncestors.system = node.title.trim();
    if (node.kind === "module") nextAncestors.module = node.title.trim();
    if (node.kind === "requirement") {
      if (
        (nextAncestors.root || "") === path.root.trim() &&
        (nextAncestors.system || "") === path.system.trim() &&
        (nextAncestors.module || "") === path.module.trim() &&
        node.title.trim() === path.requirement.trim()
      ) {
        found = node;
        return;
      }
    }
    for (const child of node.children || []) {
      walk(child, nextAncestors);
    }
  };
  walk(tree, {});
  return found;
}

/** 在指定测试要点下新增一条案例行 */
export interface NewCaseRowInput {
  caseName: string;
  caseTitle?: string;
  caseCondition?: string;
  caseStep?: string;
  caseExpected?: string;
  caseNature?: CaseNature;
  priority?: CasePriority;
}

/** 在指定测试要点下新增一条案例行 */
export function addCaseRowToTree(
  tree: CaseTreeNode,
  path: CaseExcelRowPath,
  input?: NewCaseRowInput,
): { tree: CaseTreeNode; caseNodeId: string } | null {
  const clone = cloneCaseTree(tree);
  const requirementNode =
    findRequirementNodeByPath(clone, path) ||
    ensureRequirementNodeByPath(clone, path);
  if (!requirementNode) {
    return null;
  }
  const caseNodeId = cryptoRandomId();
  const caseName =
    input?.caseName?.trim() || input?.caseTitle?.trim() || "新案例";
  const caseTitle = input?.caseTitle?.trim() || caseName;
  const caseNature = normalizeCaseNature(input?.caseNature);
  const priority = normalizeCasePriority(input?.priority);
  const newCase: CaseTreeNode = {
    id: caseNodeId,
    title: caseName,
    kind: "case",
    metadata: {
      caseNature,
      priority,
    },
    children: [],
  };
  upsertCaseElement(newCase, "case_title", caseTitle);
  if (input?.caseCondition?.trim()) {
    upsertCaseElement(newCase, "case_condition", input.caseCondition.trim());
  }
  if (input?.caseStep?.trim()) {
    upsertCaseElement(newCase, "case_step", input.caseStep.trim());
  }
  if (input?.caseExpected?.trim()) {
    upsertCaseElement(newCase, "case_expected", input.caseExpected.trim());
  }
  requirementNode.children = requirementNode.children || [];
  requirementNode.children.push(newCase);
  return { tree: clone, caseNodeId };
}

/** 从案例树中删除指定案例节点（仅 case / scenario） */
export function removeCaseFromTree(
  tree: CaseTreeNode,
  caseNodeId: string,
): CaseTreeNode | null {
  const clone = cloneCaseTree(tree);
  const target = findNodeById(clone, caseNodeId);
  if (!target || !isCaseLikeKind(target.kind)) {
    return null;
  }
  if (!removeNodeById(clone, caseNodeId)) {
    return null;
  }
  return clone;
}

function removeNodeById(parent: CaseTreeNode, nodeId: string): boolean {
  if (!parent.children?.length) {
    return false;
  }
  const index = parent.children.findIndex((child) => child.id === nodeId);
  if (index >= 0) {
    parent.children.splice(index, 1);
    return true;
  }
  for (const child of parent.children) {
    if (removeNodeById(child, nodeId)) {
      return true;
    }
  }
  return false;
}

export function applyExcelRowToTree(
  tree: CaseTreeNode,
  row: CaseExcelRow,
): CaseTreeNode {
  const clone = cloneCaseTree(tree);
  const caseNode = findNodeById(clone, row.caseNodeId);
  if (!caseNode) {
    return clone;
  }
  caseNode.title = row.caseName;
  caseNode.metadata = {
    ...ensureCaseMetadata(caseNode, row.caseName),
    caseNature: normalizeCaseNature(row.caseNature),
    priority: normalizeCasePriority(row.priority),
  };
  upsertCaseElement(caseNode, "case_title", row.caseTitle || row.caseName);
  upsertCaseElement(caseNode, "case_condition", row.caseCondition);
  upsertCaseElement(caseNode, "case_step", row.caseStep);
  upsertCaseElement(caseNode, "case_expected", row.caseExpected);
  return clone;
}

function upsertCaseElement(
  caseNode: CaseTreeNode,
  kind: CaseElementKind,
  title: string,
) {
  const existing = caseNode.children?.find((item) => item.kind === kind);
  if (existing) {
    existing.title = title;
    return;
  }
  caseNode.children = caseNode.children || [];
  caseNode.children.push({
    id: cryptoRandomId(),
    title,
    kind,
    children: [],
  });
}

function findNodeById(node: CaseTreeNode, nodeId: string): CaseTreeNode | null {
  if (node.id === nodeId) {
    return node;
  }
  for (const child of node.children || []) {
    const found = findNodeById(child, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

/** 在案例树中按 ID 查找节点 */
export function findCaseTreeNodeById(
  node: CaseTreeNode,
  nodeId: string,
): CaseTreeNode | null {
  return findNodeById(node, nodeId);
}

/** 测试要点节点下直接子案例数量 */
export function countDirectCaseChildren(node: CaseTreeNode): number {
  return (node.children || []).filter(
    (child) => child.kind === "case" || child.kind === "scenario",
  ).length;
}

/** 按需加载：某测试要点下的子节点（案例子树） */
export interface RunNodeChildrenResponse {
  nodeId: string;
  children: CaseTreeNode[];
  total: number;
}

/** 统计案例叶子节点数量（case / scenario） */
export function countCaseTreeLeaves(node: CaseTreeNode): number {
  if (node.kind === "case" || node.kind === "scenario") {
    return 1;
  }
  return (node.children || []).reduce(
    (total, child) => total + countCaseTreeLeaves(child),
    0,
  );
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `node-${Math.random().toString(36).slice(2, 10)}`;
}
