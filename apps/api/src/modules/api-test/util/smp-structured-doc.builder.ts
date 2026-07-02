/**
 * @file 从 SMP 数据构建结构化接口文档（structuredMarkdown）
 *
 * SMP 同步时调用 buildStructuredMarkdownFromSmp，将 socketWay / messageType 等
 * 字段写入「技术信息」段，使 parseApiTechnicalProfile 能正确识别 transport / messageFormat。
 */
import type {
  SmpCallServiceInfoItem,
  SmpMessageFieldItem,
  SmpTestInfoItem,
} from "../service/smp-client.service";
import { API_DOC_SECTION_SEPARATOR } from "./api-doc-format.const";

/** socketWay → 通讯方式标签（写入技术信息段） */
export function mapSocketWayLabel(socketWay: string): string {
  const v = (socketWay || "").trim().toUpperCase();
  if (!v) return "HTTP";
  if (v === "HTTP") return "HTTP";
  if (v === "TEP") return "Socket";
  if (v === "TCP") return "Socket";
  if (v.includes("SOCKET")) return "Socket";
  return v;
}

/** messageType → 报文类型标签 */
export function mapMessageTypeLabel(messageType: string): string {
  const v = (messageType || "").trim().toUpperCase();
  if (!v) return "JSON";
  if (v.includes("XML")) return "XML";
  if (v.includes("JSON")) return "JSON";
  if (v.includes("SOAP")) return "SOAP";
  if (v.includes("TEXT")) return "TEXT";
  return v;
}

/**
 * 从 SMP callServiceList + serviceTestList 构建结构化接口文档。
 *
 * 输出格式与 Excel 结构化文档一致：
 *   技术信息\n----\n通讯方式|Socket\n报文类型|XML\n...
 *   基础信息\n----\n服务URL|32.114.71.6:60030\n...
 *   请求报文\n----\n（requestHeadList + requestBodyList 字段表）
 *   响应报文\n----\n（responseHeadList + responseBodyList 字段表）
 */
export function buildStructuredMarkdownFromSmp(
  callServiceList: SmpCallServiceInfoItem[],
  serviceTestList: SmpTestInfoItem[],
): string {
  const callItem = (callServiceList[0] ?? {}) as SmpCallServiceInfoItem;
  const testItem = (serviceTestList[0] ?? {}) as SmpTestInfoItem;

  const sections: string[] = [];

  /* ── 技术信息 ── */
  const techLines: string[] = [];
  techLines.push(`通讯方式|${mapSocketWayLabel(callItem.socketWay || "")}`);
  techLines.push(
    `报文类型|${mapMessageTypeLabel(callItem.messageType || testItem.requestMessageType || "")}`,
  );
  techLines.push(
    `报文编码|${callItem.messageCoding || testItem.requestEncoding || "UTF-8"}`,
  );
  if (callItem.maxMessageSize) {
    techLines.push(`最大报文大小|${callItem.maxMessageSize}`);
  }
  if (callItem.callMethod) {
    techLines.push(`调用模式|${callItem.callMethod}`);
  }
  if (callItem.headId) {
    techLines.push(`业务头标示|${callItem.headId}`);
  }
  sections.push(
    `技术信息\n${API_DOC_SECTION_SEPARATOR}\n${techLines.join("\n")}`,
  );

  /* ── 基础信息 ── */
  const basicLines: string[] = [];
  const serviceUrl = (testItem.requestUrl || "").trim();
  if (serviceUrl) {
    basicLines.push(`服务URL|${serviceUrl}`);
  }
  if (callItem.tranCode) {
    basicLines.push(`原服务交易码|${callItem.tranCode}`);
  }
  if (callItem.serviceCname) {
    basicLines.push(`服务名称|${callItem.serviceCname}`);
  }
  if (callItem.serviceCode) {
    basicLines.push(`服务代码|${callItem.serviceCode}`);
  }
  if (basicLines.length) {
    sections.push(
      `基础信息\n${API_DOC_SECTION_SEPARATOR}\n${basicLines.join("\n")}`,
    );
  }

  /* ── 请求报文 ── */
  const requestSection =
    buildFieldTableFromSmpNodeLists(
      callItem.requestHeadList,
      callItem.requestBodyList,
    ) ??
    buildFieldTableFromJsonBody(testItem.requestBody) ??
    formatSmpBody(testItem.requestBody);
  if (requestSection) {
    sections.push(`请求报文\n${API_DOC_SECTION_SEPARATOR}\n${requestSection}`);
  }

  /* ── 响应报文 ── */
  const responseSection =
    buildFieldTableFromSmpNodeLists(
      callItem.responseHeadList,
      callItem.responseBodyList,
    ) ??
    buildFieldTableFromJsonBody(testItem.responseBody) ??
    formatSmpBody(testItem.responseBody);
  if (responseSection) {
    sections.push(`响应报文\n${API_DOC_SECTION_SEPARATOR}\n${responseSection}`);
  }

  return sections.join("\n\n");
}

/**
 * 把 SMP 服务调用信息中的 head/body 字段 list 组装成文档字段表。
 * nodeUrl 为父路径，nodeCode 为叶子字段名，完整路径为 `{nodeUrl}/{nodeCode}`。
 */
export function buildFieldTableFromSmpNodeLists(
  headList?: SmpMessageFieldItem[],
  bodyList?: SmpMessageFieldItem[],
): string | null {
  const items = [...(headList ?? []), ...(bodyList ?? [])];
  if (!items.length) return null;

  const seen = new Set<string>();
  const lines = ["| 节点路径 | 节点代码 | 是否必填 |"];
  for (const item of items) {
    const code = (item.nodeCode || "").trim();
    if (!code) continue;
    const path = buildSmpNodePath(item);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    lines.push(`| ${path} | ${code} | ${mapSmpIsNotNull(item.isNotNull)} |`);
  }

  return lines.length > 1 ? lines.join("\n") : null;
}

function buildSmpNodePath(item: SmpMessageFieldItem): string {
  const code = (item.nodeCode || "").trim();
  const nodeUrl = (item.nodeUrl || "").trim().replace(/\/+$/, "");
  if (!code) return "";
  if (!nodeUrl) return code;
  if (nodeUrl === code || nodeUrl.endsWith(`/${code}`)) return nodeUrl;
  return `${nodeUrl}/${code}`;
}

function mapSmpIsNotNull(value?: string): "Y" | "N" {
  const v = (value || "").trim().toUpperCase();
  return v === "Y" || v === "是" ? "Y" : "N";
}

/**
 * 把 SMP requestBody / responseBody 的 JSON 报文体展开成字段表。
 *
 * SMP 的报文体是嵌套 JSON（形如 `{Transaction:{Header:{sysHeader:{...}},Body:{request:{bizBody:{...}}}}}`），
 * 递归展开为叶子节点，输出 `| 节点路径 | 节点代码 | 是否必填 |` 表格。
 * 节点路径与既有 Excel 文档一致（用 `/` 分隔，含 sysHeader/bizHeader/bizBody），
 * 使 sectionPathPrefix 能正确归组。
 *
 * 注意：故意不输出 `| --- |` 分隔行——parseApiDocMessageFields 无需分隔行即可解析，
 * 且分隔行会被误解析成 code="---" 的幻影字段。
 *
 * @returns 字段表文本；当报文体非 JSON（如 XML 原文）或无叶子字段时返回 null，由调用方回退原文本。
 */
export function buildFieldTableFromJsonBody(body: unknown): string | null {
  let parsed: unknown;
  if (body !== null && typeof body === "object") {
    parsed = body;
  } else if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) return null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
  } else {
    return null;
  }

  const rows: Array<{ path: string; code: string }> = [];
  flattenJsonToFields(parsed, "", rows);
  if (!rows.length) return null;

  const seen = new Set<string>();
  const lines = ["| 节点路径 | 节点代码 | 是否必填 |"];
  for (const row of rows) {
    if (seen.has(row.path)) continue;
    seen.add(row.path);
    lines.push(`| ${row.path} | ${row.code} | N |`);
  }
  return lines.join("\n");
}

/** 递归展开 JSON 为叶子字段行（路径用 / 分隔，code 取叶子键名）。 */
function flattenJsonToFields(
  value: unknown,
  basePath: string,
  rows: Array<{ path: string; code: string }>,
): void {
  const leafCode = () => basePath.split("/").filter(Boolean).pop() ?? "";

  if (value === null || value === undefined) {
    const code = leafCode();
    if (code) rows.push({ path: basePath, code });
    return;
  }

  if (Array.isArray(value)) {
    // 数组：以首元素为模板展开；空数组视为叶子。
    if (value.length === 0) {
      const code = leafCode();
      if (code) rows.push({ path: basePath, code });
      return;
    }
    flattenJsonToFields(value[0], basePath, rows);
    return;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    // 空对象（如 bizHeader:{}）无叶子，跳过。
    for (const [key, child] of entries) {
      flattenJsonToFields(child, basePath ? `${basePath}/${key}` : key, rows);
    }
    return;
  }

  // 基础类型叶子
  const code = leafCode();
  if (code) rows.push({ path: basePath, code });
}

function formatSmpBody(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  const str = String(value).trim();
  if (!str) return undefined;
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}
