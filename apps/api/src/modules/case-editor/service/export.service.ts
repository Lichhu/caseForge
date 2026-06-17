/**
 * 案例树导出服务：支持 JSON、Excel（xlsx）、XMind。
 */
import { Injectable } from "@nestjs/common";
import {
  CASE_NODE_KIND_LABELS,
  ensureCaseElementChildren,
  flattenCaseTreeToExcel,
  getCaseTitleOnly,
  isCaseLikeKind,
  simplifyRequirementTitleForDisplay,
} from "@case-forge/shared";
import type {
  CaseTreeNode,
  MindMapExtras,
  MindMapSummary,
} from "@case-forge/shared";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import {
  buildTestPlatformCaseExcel,
  readTestPlatformCaseExcelTemplate,
} from "../util/test-platform-case-excel.util";

/** XMind 打开所需的 1x1 占位缩略图 */
const XMIND_THUMBNAIL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAD0lEQVQ42mNkYPP9HwAFfwJ/ARkJQQAAAABJRU5ErkJggg==",
  "base64",
);

/** 案例树多格式导出服务 */
@Injectable()
export class ExportService {
  /** 导出为 JSON（含思维导图摘要等扩展数据） */
  toJson(tree: CaseTreeNode, mindMapExtras?: MindMapExtras) {
    return `${JSON.stringify({ tree, mindMapExtras }, null, 2)}\n`;
  }

  /** 下载空白测管平台测试案例 Excel 模板 */
  toExcelTemplate(): Buffer {
    return readTestPlatformCaseExcelTemplate();
  }

  /** 导出为测管平台测试案例 Excel（xlsx） */
  async toExcel(tree: CaseTreeNode, caseNodeIds?: string[]): Promise<Buffer> {
    let { rows } = flattenCaseTreeToExcel(tree);
    if (caseNodeIds?.length) {
      const selected = new Set(caseNodeIds);
      rows = rows.filter((row) => selected.has(row.caseNodeId));
    }
    return buildTestPlatformCaseExcel(rows);
  }

  /** 导出为 XMind 工作簿（XMind 2020+ 兼容结构，含摘要） */
  async toXmind(tree: CaseTreeNode, mindMapExtras?: MindMapExtras) {
    const summaryByParent = this.groupSummariesByParent(
      mindMapExtras?.summaries,
    );
    const sheetId = randomUUID();
    const sheet = {
      id: sheetId,
      class: "sheet",
      title: tree.title || "案例树",
      rootTopic: this.toXmindTopic(tree, summaryByParent),
      relationships: [] as unknown[],
      summaries: [] as unknown[],
      extensions: [] as unknown[],
    };
    const contentJson = [sheet];
    const zip = new JSZip();
    zip.file("content.json", JSON.stringify(contentJson, null, 2));
    zip.file("content.xml", this.buildXmindContentXml(sheet));
    zip.file(
      "metadata.json",
      JSON.stringify(
        {
          dataStructureVersion: "2",
          layoutEngineVersion: "4",
          creator: { name: "CaseForge", version: "0.1.0" },
        },
        null,
        2,
      ),
    );
    zip.file(
      "meta.xml",
      [
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
        '<meta xmlns="urn:xmind:xmap:xmlns:meta:2.0" version="2.0">',
        "  <Author>",
        "    <Name>CaseForge</Name>",
        "  </Author>",
        "</meta>",
      ].join("\n"),
    );
    zip.file(
      "manifest.json",
      JSON.stringify(
        {
          "file-entries": {
            "content.json": {},
            "content.xml": {},
            "metadata.json": {},
            "meta.xml": {},
            "manifest.json": {},
            "META-INF/manifest.xml": {},
            "Thumbnails/thumbnail.png": {},
          },
        },
        null,
        2,
      ),
    );
    zip.file(
      "META-INF/manifest.xml",
      [
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
        '<manifest xmlns="urn:xmind:xmap:xmlns:manifest:1.0">',
        '  <file-entry full-path="content.json" media-type="application/json"/>',
        '  <file-entry full-path="content.xml" media-type="application/vnd.xmind+xml"/>',
        '  <file-entry full-path="metadata.json" media-type="application/json"/>',
        '  <file-entry full-path="meta.xml" media-type="application/vnd.xmind+xml"/>',
        '  <file-entry full-path="manifest.json" media-type="application/json"/>',
        '  <file-entry full-path="Thumbnails/thumbnail.png" media-type="image/png"/>',
        "</manifest>",
      ].join("\n"),
    );
    zip.file("Thumbnails/thumbnail.png", XMIND_THUMBNAIL_PNG);
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  }

  private groupSummariesByParent(summaries?: MindMapSummary[]) {
    const map = new Map<string, MindMapSummary[]>();
    for (const item of summaries || []) {
      const list = map.get(item.parent) || [];
      list.push(item);
      map.set(item.parent, list);
    }
    return map;
  }

  private toXmindTopic(
    node: CaseTreeNode,
    summaryByParent: Map<string, MindMapSummary[]>,
    requirementTitle?: string,
  ): Record<string, unknown> {
    const topic: Record<string, unknown> = {
      id: node.id,
      class: "topic",
      title: this.resolveXmindTopicTitle(node, requirementTitle),
      structureClass: "org.xmind.ui.logic.right",
    };
    const kindLabel = this.resolveKindLabel(node.kind);
    if (kindLabel) {
      topic.labels = [kindLabel];
    }
    const notes = this.buildTopicNotes(node);
    if (notes) {
      topic.notes = notes;
    }
    const nextRequirement =
      node.kind === "requirement"
        ? simplifyRequirementTitleForDisplay(node.title)
        : requirementTitle;
    const children: Record<string, unknown[]> = {};
    const childNodes = isCaseLikeKind(node.kind)
      ? ensureCaseElementChildren(
          node,
          this.resolveXmindTopicTitle(node, requirementTitle),
        )
      : node.children ?? [];
    if (childNodes.length) {
      children.attached = childNodes.map((child) =>
        this.toXmindTopic(child, summaryByParent, nextRequirement),
      );
    }
    this.applyXmindSummariesToTopic(
      topic,
      node,
      children,
      summaryByParent.get(node.id),
    );
    if (Object.keys(children).length) {
      topic.children = children;
    }
    return topic;
  }

  /** 案例节点导出标题取「案例标题」子节点文案，不再使用「案例详情 [正/反]」 */
  private resolveXmindTopicTitle(
    node: CaseTreeNode,
    requirementTitle?: string,
  ): string {
    if (isCaseLikeKind(node.kind)) {
      return getCaseTitleOnly(node, requirementTitle) || "未命名案例";
    }
    return node.title || "未命名节点";
  }

  /**
   * XMind 概要（大括号摘要）需同时写入：
   * - topic.summaries：range 为 "(start,end)"，topicId 指向概要节点
   * - children.summary：概要文本节点（含 attributedTitle）
   */
  private applyXmindSummariesToTopic(
    topic: Record<string, unknown>,
    node: CaseTreeNode,
    children: Record<string, unknown[]>,
    items?: MindMapSummary[],
  ) {
    if (!items?.length) {
      return;
    }
    const childCount = node.children?.length || 0;
    const summaryTopics: Record<string, unknown>[] = [];
    const summaryMeta: Record<string, unknown>[] = [];

    for (const item of items) {
      const end = Math.min(item.end, Math.max(childCount - 1, 0));
      const start = Math.min(item.start, end);
      const title = item.label || "摘要";
      summaryTopics.push({
        id: item.id,
        class: "topic",
        title,
        attributedTitle: [{ text: title }],
      });
      summaryMeta.push({
        id: randomUUID(),
        range: `(${start},${end})`,
        topicId: item.id,
      });
    }

    children.summary = summaryTopics;
    topic.children = children;
    topic.summaries = summaryMeta;
  }

  private resolveKindLabel(kind: CaseTreeNode["kind"]) {
    const label = CASE_NODE_KIND_LABELS[kind];
    return label?.trim() || undefined;
  }

  private buildTopicNotes(node: CaseTreeNode) {
    const metaLines = [
      node.metadata?.caseNature ? `案例性质：${node.metadata.caseNature}` : "",
      node.metadata?.priority ? `优先级：${node.metadata.priority}` : "",
      node.metadata?.caseType ? `类型：${node.metadata.caseType}` : "",
      node.metadata?.source ? `来源：${node.metadata.source}` : "",
    ].filter(Boolean);
    if (!metaLines.length) {
      return undefined;
    }
    const content = metaLines.join("\n");
    return {
      plain: { content },
      realHTML: { content: `<p>${this.escapeXml(content)}</p>` },
    };
  }

  private buildXmindContentXml(sheet: {
    id: string;
    title: string;
    rootTopic: Record<string, unknown>;
  }) {
    const rootIndent = "      ";
    const rootLabelsXml = this.buildTopicLabelsXml(sheet.rootTopic, rootIndent);
    const topicXml = this.buildXmindTopicXml(sheet.rootTopic, 2);
    return [
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
      '<xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0" xmlns:fo="http://www.w3.org/1999/XSL/Format" xmlns:svg="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink" modified-by="CaseForge" timestamp="' +
        Date.now() +
        '" version="2.0">',
      `  <sheet id="${sheet.id}" modified-by="CaseForge" timestamp="${Date.now()}" theme="theme-unified">`,
      `    <title>${this.escapeXml(sheet.title)}</title>`,
      `    <topic id="${String(sheet.rootTopic.id)}" modified-by="CaseForge" timestamp="${Date.now()}" structure-class="org.xmind.ui.logic.right">`,
      `      <title>${this.escapeXml(String(sheet.rootTopic.title || ""))}</title>`,
      rootLabelsXml,
      topicXml,
      "    </topic>",
      "  </sheet>",
      "</xmap-content>",
    ].join("\n");
  }

  private buildXmindTopicXml(
    topic: Record<string, unknown>,
    depth: number,
  ): string {
    const indent = " ".repeat(depth);
    const attached =
      (topic.children as { attached?: Record<string, unknown>[] } | undefined)
        ?.attached || [];
    const summary =
      (topic.children as { summary?: Record<string, unknown>[] } | undefined)
        ?.summary || [];
    const childTopics = [...attached, ...summary];
    if (!childTopics.length) {
      return "";
    }
    const lines = [`${indent}<children>`];
    if (attached.length) {
      lines.push(`${indent}  <topics type="attached">`);
      for (const child of attached) {
        lines.push(this.buildXmindTopicBlockXml(child, depth + 2));
      }
      lines.push(`${indent}  </topics>`);
    }
    if (summary.length) {
      lines.push(`${indent}  <topics type="summary">`);
      for (const child of summary) {
        lines.push(this.buildXmindTopicBlockXml(child, depth + 2));
      }
      lines.push(`${indent}  </topics>`);
    }
    lines.push(`${indent}</children>`);
    return lines.join("\n");
  }

  private buildXmindTopicBlockXml(
    topic: Record<string, unknown>,
    depth: number,
  ): string {
    const indent = " ".repeat(depth);
    const title = this.escapeXml(String(topic.title || ""));
    const id = String(topic.id || randomUUID());
    const labelsXml = this.buildTopicLabelsXml(topic, indent + "  ");
    const summariesXml = this.buildTopicSummariesXml(topic, indent + "  ");
    const childrenXml = this.buildXmindTopicXml(topic, depth + 1);
    return [
      `${indent}<topic id="${id}" modified-by="CaseForge" timestamp="${Date.now()}">`,
      `${indent}  <title>${title}</title>`,
      labelsXml,
      summariesXml,
      childrenXml,
      `${indent}</topic>`,
    ].join("\n");
  }

  private buildTopicLabelsXml(
    topic: Record<string, unknown>,
    indent: string,
  ): string {
    const labels = topic.labels as string[] | undefined;
    if (!labels?.length) {
      return "";
    }
    const lines = [`${indent}<labels>`];
    for (const label of labels) {
      if (!label?.trim()) {
        continue;
      }
      lines.push(`${indent}  <label>${this.escapeXml(label)}</label>`);
    }
    lines.push(`${indent}</labels>`);
    return lines.join("\n");
  }

  private buildTopicSummariesXml(
    topic: Record<string, unknown>,
    indent: string,
  ): string {
    const summaries = topic.summaries as
      | Array<{ id: string; topicId: string; range: string }>
      | undefined;
    if (!summaries?.length) {
      return "";
    }
    const lines = [`${indent}<summaries>`];
    for (const item of summaries) {
      lines.push(
        `${indent}  <summary id="${this.escapeXml(item.id)}" topic-id="${this.escapeXml(item.topicId)}" range="${this.escapeXml(item.range)}"/>`,
      );
    }
    lines.push(`${indent}</summaries>`);
    return lines.join("\n");
  }

  private escapeXml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
