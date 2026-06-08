import type { CaseNature, CaseNodeKind, CasePriority, CaseTreeNode } from './index';
import { DEFAULT_CASE_PRIORITY } from './index';

export const CASE_ELEMENT_KINDS = [
  'case_title',
  'case_condition',
  'case_step',
  'case_expected',
] as const;

export type CaseElementKind = (typeof CASE_ELEMENT_KINDS)[number];

export const CASE_NODE_KIND_LABELS: Record<string, string> = {
  root: '根',
  system: '系统',
  module: '功能模块',
  requirement: '测试要点',
  case: '案例',
  case_title: '案例标题',
  case_condition: '前置条件',
  case_step: '测试步骤',
  case_expected: '预期结果',
  scenario: '场景',
  section: '区块',
  condition: '前置条件',
  step: '测试步骤',
  expectation: '预期结果',
  metadata: '元数据',
};

export function nextSixLevelChildKind(kind: CaseNodeKind): CaseNodeKind {
  const map: Partial<Record<CaseNodeKind, CaseNodeKind>> = {
    root: 'system',
    system: 'module',
    module: 'requirement',
    requirement: 'case',
    case: 'case_title',
  };
  return map[kind] || kind;
}

export function isCaseElementKind(kind: CaseNodeKind) {
  return CASE_ELEMENT_KINDS.includes(kind as CaseElementKind);
}

const CASE_TAG_IN_BRACKETS =
  '正向|反向|异常|边界|接口|权限|端到端|UI|并发';

const CASE_TAG_PREFIX_RE = new RegExp(
  `^\\[(${CASE_TAG_IN_BRACKETS})\\]\\s*`,
  'u',
);

const CASE_TAG_SUFFIX_RE = new RegExp(
  `\\s*\\[(${CASE_TAG_IN_BRACKETS})\\]\\s*$`,
  'u',
);

/** 从案例节点标题解析极性（含旧版 [异常]/[边界]/[接口] 等，统一归为反向） */
export function extractCasePolarity(caseNodeTitle: string): '正向' | '反向' | null {
  const text = (caseNodeTitle ?? '').trim();
  const skill = text.match(/案例详情\s*\[(正向|反向)\]/);
  if (skill) {
    return skill[1] as '正向' | '反向';
  }
  const legacy = text.match(new RegExp(`^\\[(${CASE_TAG_IN_BRACKETS})\\]`, 'u'));
  if (!legacy) {
    return null;
  }
  return legacy[1] === '正向' ? '正向' : '反向';
}

/** 将历史 P0/P1/P2 或空值规范为 高/中/低 */
export function normalizeCasePriority(value?: string | null): CasePriority {
  const text = (value ?? '').trim();
  if (text === '高' || text === '中' || text === '低') {
    return text;
  }
  if (text === 'P0') {
    return '高';
  }
  if (text === 'P1') {
    return '中';
  }
  if (text === 'P2' || text === 'P3') {
    return '低';
  }
  return DEFAULT_CASE_PRIORITY;
}

/** 解析案例性质：优先 metadata，其次标题中的 [正向]/[反向] */
export function resolveCaseNature(
  caseNode: CaseTreeNode,
  caseNameFallback?: string,
): CaseNature {
  const fromMeta = caseNode.metadata?.caseNature;
  if (fromMeta === '正向' || fromMeta === '反向') {
    return fromMeta;
  }
  return (
    extractCasePolarity(caseNode.title)
    ?? extractCasePolarity(caseNameFallback ?? '')
    ?? '正向'
  );
}

/** 补齐案例节点 metadata 默认值（性质、优先级） */
export function ensureCaseMetadata(
  caseNode: CaseTreeNode,
  caseNameFallback?: string,
): NonNullable<CaseTreeNode['metadata']> {
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
  return kind === 'case' || kind === 'scenario';
}

/** 去掉 [异常]/[边界]/[接口]/[正向]/[反向] 等标签，只保留业务文案 */
export function sanitizeCaseTitleText(title: string) {
  let text = (title ?? '').trim();
  text = text.replace(/^案例详情\s*/u, '');
  while (CASE_TAG_PREFIX_RE.test(text)) {
    text = text.replace(CASE_TAG_PREFIX_RE, '').trim();
  }
  text = text.replace(CASE_TAG_SUFFIX_RE, '').trim();
  return text;
}

/** 是否为占位案例标题（未填写真实业务标题） */
export function isPlaceholderCaseTitle(title: string | undefined | null) {
  const text = sanitizeCaseTitleText(title ?? '');
  if (!text || text === '案例标题' || text === '案例' || text === '案例详情') {
    return true;
  }
  if (/^案例详情\s*\[(正向|反向|异常|边界|接口|权限|端到端|UI|并发)\]\s*$/u.test(
    (title ?? '').trim(),
  )) {
    return true;
  }
  return false;
}

export function buildFallbackCaseTitle(
  requirementTitle: string | undefined,
  polarity: '正向' | '反向',
) {
  const base = (requirementTitle || '业务场景').trim();
  if (polarity === '正向') {
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
    getCaseElementContent(caseNode, 'case_title'),
  );
  if (childTitle && !isPlaceholderCaseTitle(childTitle)) {
    return childTitle;
  }
  const polarity =
    caseNode.metadata?.caseNature ?? extractCasePolarity(caseNode.title);
  if (requirementTitle && polarity) {
    return buildFallbackCaseTitle(requirementTitle, polarity);
  }
  return '详情';
}

/** 脑图案例节点：业务标题 + 极性，用于区分同要点下正/反向 */
export function getCaseDisplayTitle(
  caseNode: CaseTreeNode,
  requirementTitle?: string,
) {
  const polarity =
    caseNode.metadata?.caseNature ?? extractCasePolarity(caseNode.title);
  const childTitle = sanitizeCaseTitleText(
    getCaseElementContent(caseNode, 'case_title'),
  );
  let base = childTitle && !isPlaceholderCaseTitle(childTitle) ? childTitle : '';
  if (!base && requirementTitle) {
    base = buildFallbackCaseTitle(requirementTitle, polarity || '正向');
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
export function normalizeCaseTreeForSkill(tree: CaseTreeNode): CaseTreeNode {
  const walk = (
    node: CaseTreeNode,
    requirementTitle?: string,
  ): CaseTreeNode => {
    const nextRequirement =
      node.kind === 'requirement'
        ? simplifyRequirementTitleForDisplay(node.title)
        : requirementTitle;
    if (node.kind === 'case' || node.kind === 'scenario') {
      const polarity = extractCasePolarity(node.title) || '正向';
      const caseNodeTitle = `案例详情 [${polarity}]`;
      const titleOnly = getCaseTitleOnly(
        { ...node, title: node.title },
        nextRequirement,
      );
      const nextChildren = (node.children || []).map((child) => {
        if (child.kind === 'case_title') {
          return { ...child, title: titleOnly };
        }
        return walk(child, nextRequirement);
      });
      if (!nextChildren.some((child) => child.kind === 'case_title')) {
        nextChildren.unshift({
          id: `${node.id}-title`,
          title: titleOnly,
          kind: 'case_title',
          children: [],
        });
      }
      return { ...node, title: caseNodeTitle, children: nextChildren };
    }
    return {
      ...node,
      children: (node.children || []).map((child) => walk(child, nextRequirement)),
    };
  };
  return walk(tree);
}

/**
 * 案例编辑台展示用：测试要点节点只保留主描述，不展示验证点/测试方法明细。
 */
export function simplifyRequirementTitleForDisplay(title: string): string {
  const text = (title ?? '').trim();
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
    kept.push(line.replace(/^[-*•]\s*/, '').trim());
  }

  if (!kept.length) {
    const firstLine = text.split(/\r?\n/)[0]?.trim() || text;
    return firstLine.replace(/[：:].*$/, '').trim() || firstLine;
  }

  const first = kept[0];
  if (/验证点|测试方法/.test(first)) {
    return text.split(/\r?\n/)[0]?.replace(/[：:].*$/, '').trim() || text;
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

export function getCaseElementContent(caseNode: CaseTreeNode, kind: CaseElementKind) {
  const child = caseNode.children?.find((item) => item.kind === kind);
  if (child) {
    return child.title;
  }
  if (kind === 'case_title') {
    return caseNode.title;
  }
  return '';
}

export function flattenCaseTreeToExcel(tree: CaseTreeNode): CaseExcelViewModel {
  const rows: CaseExcelRow[] = [];

  const walk = (
    node: CaseTreeNode,
    ancestors: Partial<Record<'root' | 'system' | 'module' | 'requirement', CaseTreeNode>>,
  ) => {
    const nextAncestors = { ...ancestors };
    if (node.kind === 'root') nextAncestors.root = node;
    if (node.kind === 'system') nextAncestors.system = node;
    if (node.kind === 'module') nextAncestors.module = node;
    if (node.kind === 'requirement') nextAncestors.requirement = node;

    if (node.kind === 'case' || node.kind === 'scenario') {
      const requirementTitle = (nextAncestors.requirement?.title || '').trim();
      const requirementSummary = simplifyRequirementTitleForDisplay(requirementTitle);
      const caseTitle = getCaseTitleOnly(node, requirementSummary);
      const metadata = ensureCaseMetadata(node, caseTitle);
      const caseName = isPlaceholderCaseTitle(node.title)
        ? caseTitle
        : sanitizeCaseTitleText(node.title) || caseTitle;
      rows.push({
        root: nextAncestors.root?.title || '',
        system: nextAncestors.system?.title || '',
        module: nextAncestors.module?.title || '',
        requirement: requirementTitle,
        caseName,
        caseNature: metadata.caseNature!,
        priority: metadata.priority!,
        caseTitle,
        caseCondition: getLegacyOrElementContent(node, 'case_condition', 'condition'),
        caseStep: getLegacyOrElementContent(node, 'case_step', 'step'),
        caseExpected: getLegacyOrElementContent(node, 'case_expected', 'expectation'),
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
  const section = caseNode.children?.find((item) => item.kind === 'section' && item.title.includes(
    elementKind === 'case_condition' ? '前置' : elementKind === 'case_step' ? '步骤' : '预期',
  ));
  if (!section) {
    return '';
  }
  return (section.children || [])
    .filter((item) => item.kind === legacyKind)
    .map((item) => item.title.replace(/^\d+\.\s*/, ''))
    .join('\n');
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
  const columns: Array<keyof CaseExcelRow> = ['root', 'system', 'module', 'requirement'];
  columns.forEach((column, colIndex) => {
    let start = 0;
    while (start < rows.length) {
      let end = start + 1;
      while (end < rows.length && rows[end][column] === rows[start][column] && rows[end][column]) {
        const sameParents = columns
          .slice(0, colIndex)
          .every((parentKey) => rows[end][parentKey] === rows[start][parentKey]);
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

export function applyExcelRowToTree(tree: CaseTreeNode, row: CaseExcelRow): CaseTreeNode {
  const clone = cloneCaseTree(tree);
  const caseNode = findNodeById(clone, row.caseNodeId);
  if (!caseNode) {
    return clone;
  }
  caseNode.title = row.caseName;
  caseNode.metadata = {
    ...ensureCaseMetadata(caseNode, row.caseName),
    caseNature: row.caseNature,
    priority: normalizeCasePriority(row.priority),
  };
  upsertCaseElement(caseNode, 'case_title', row.caseTitle || row.caseName);
  upsertCaseElement(caseNode, 'case_condition', row.caseCondition);
  upsertCaseElement(caseNode, 'case_step', row.caseStep);
  upsertCaseElement(caseNode, 'case_expected', row.caseExpected);
  return clone;
}

function upsertCaseElement(caseNode: CaseTreeNode, kind: CaseElementKind, title: string) {
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

function cryptoRandomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `node-${Math.random().toString(36).slice(2, 10)}`;
}
