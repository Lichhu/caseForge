/**
 * @file 将 case-skill 输出的 Markdown 无序列表解析为六级案例树
 */
import { randomUUID } from "node:crypto";
import type { CaseNodeKind, CaseTreeNode } from "@case-forge/shared";
import { extractCasePolarity, sanitizeCaseTitleText } from "@case-forge/shared";

interface ListNode {
  title: string;
  children: ListNode[];
}

const LABEL_KIND: Record<string, CaseNodeKind> = {
  案例标题: "case_title",
  前置条件: "case_condition",
  测试步骤: "case_step",
  预期结果: "case_expected",
};

function parseMarkdownList(markdown: string): ListNode[] {
  const roots: ListNode[] = [];
  const stack: { level: number; node: ListNode }[] = [];

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.replace(/\t/g, "  ");
    const match = line.match(/^(\s*)([-*+])\s+(.+)$/);
    if (!match) {
      continue;
    }

    const indent = match[1].length;
    const level = Math.floor(indent / 2);
    const title = match[3].trim();
    if (!title) {
      continue;
    }

    const node: ListNode = { title, children: [] };
    while (stack.length && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    if (!stack.length) {
      roots.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }
    stack.push({ level, node });
  }

  return roots;
}

function isCaseDetailTitle(title: string) {
  return /案例详情\s*\[(正向|反向)/.test(title);
}

function isLabelTitle(title: string) {
  const normalized = title.replace(/[:：]\s*$/, "").trim();
  return normalized in LABEL_KIND;
}

function labelKind(title: string): CaseNodeKind {
  const normalized = title.replace(/[:：]\s*$/, "").trim();
  return LABEL_KIND[normalized] || "case_title";
}

function inferKind(title: string, parentKind?: CaseNodeKind): CaseNodeKind {
  if (isCaseDetailTitle(title)) {
    return "case";
  }
  if (isLabelTitle(title)) {
    return labelKind(title);
  }

  switch (parentKind) {
    case undefined:
    case "root":
      return "system";
    case "system":
      return "module";
    case "module":
      return "requirement";
    case "requirement":
      return isCaseDetailTitle(title) ? "case" : "requirement";
    case "case":
      return "case_title";
    case "case_title":
      return "case_title";
    case "case_condition":
      return "case_condition";
    case "case_step":
      return "case_step";
    case "case_expected":
      return "case_expected";
    default:
      return parentKind || "requirement";
  }
}

function toCaseTreeNode(node: ListNode, parentKind?: CaseNodeKind): CaseTreeNode {
  if (isLabelTitle(node.title)) {
    const kind = labelKind(node.title);
    const content = node.children[0];
    if (content && node.children.length === 1) {
      return {
        id: randomUUID(),
        title: content.title,
        kind,
        children: [],
      };
    }
    const merged = [node.title, ...node.children.map((child) => child.title)]
      .join("\n")
      .replace(/^[^:：]+[:：]\s*/, "")
      .trim();
    return {
      id: randomUUID(),
      title: merged || node.title,
      kind,
      children: [],
    };
  }

  const kind = inferKind(node.title, parentKind);
  const children = node.children.map((child) => toCaseTreeNode(child, kind));

  if (kind === "case") {
    return normalizeCaseDetailNode({
      id: randomUUID(),
      title: node.title.match(/案例详情\s*\[[^\]]+\]/)?.[0] || node.title,
      kind: "case",
      children,
    });
  }

  return {
    id: randomUUID(),
    title: node.title,
    kind,
    children,
  };
}

function normalizeCaseChildNode(child: ListNode): CaseTreeNode {
  if (isLabelTitle(child.title)) {
    const kind = labelKind(child.title);
    const content = child.children[0];
    return {
      id: randomUUID(),
      title: content?.title?.trim() || child.title,
      kind,
      children: [],
    };
  }
  return toCaseTreeNode(child, "case");
}

function normalizeCaseDetailNode(caseNode: CaseTreeNode): CaseTreeNode {
  const polarity = extractCasePolarity(caseNode.title) || "正向";
  const caseNodeTitle = `案例详情 [${polarity}]`;
  const byKind = new Map<CaseNodeKind, CaseTreeNode>();
  const orderedKinds: CaseNodeKind[] = [
    "case_title",
    "case_condition",
    "case_step",
    "case_expected",
  ];

  for (const child of caseNode.children || []) {
    if (isCaseDetailTitle(child.title)) {
      continue;
    }
    const listChild: ListNode = {
      title: child.title,
      children: (child.children || []).map((item) => ({
        title: item.title,
        children: [],
      })),
    };
    const normalized = normalizeCaseChildNode(listChild);
    if (orderedKinds.includes(normalized.kind)) {
      byKind.set(normalized.kind, normalized);
    }
  }

  const children = orderedKinds
    .map((kind) => byKind.get(kind))
    .filter((item): item is CaseTreeNode => Boolean(item));

  if (!children.length && caseNode.children?.length) {
    return {
      ...caseNode,
      title: caseNodeTitle,
      children: caseNode.children,
    };
  }

  const titleNode = children.find((item) => item.kind === "case_title");
  if (titleNode) {
    titleNode.title = sanitizeCaseTitleText(titleNode.title) || titleNode.title;
  }

  return {
    ...caseNode,
    title: caseNodeTitle,
    children,
  };
}

/**
 * 解析 case-skill Markdown 列表为案例树（自动补 root）
 */
export function parseCaseSkillMarkdown(
  markdown: string,
  rootTitle: string,
): CaseTreeNode | null {
  const normalized = markdown
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!normalized) {
    return null;
  }

  const roots = parseMarkdownList(normalized);
  if (!roots.length) {
    return null;
  }

  return {
    id: randomUUID(),
    title: rootTitle.trim() || "测试案例",
    kind: "root",
    children: roots.map((node) => toCaseTreeNode(node, "root")),
  };
}
