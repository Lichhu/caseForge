/**
 * @file 从 SMP 数据构建结构化接口文档（structuredMarkdown）
 *
 * 输出格式与 Excel 结构化文档一致，统一为基础信息 / 服务信息 / 请求报文 /
 * 示例报文四个分区。不再写入「技术信息」段：AI 生成时由
 * resolveApiTechnicalProfile 从 smpData 兜底解析通讯方式 / 报文类型，
 * 与上传来源保持一致，生成弹窗中也可手动调整。
 */
import type {
  SmpCallServiceInfoItem,
  SmpMessageFieldItem,
  SmpTestInfoItem,
} from "../service/smp-client.service";
import { API_DOC_SECTION_SEPARATOR } from "./api-doc-format.const";

/**
 * 从 SMP callServiceList + serviceTestList 构建结构化接口文档。
 *
 * 输出格式与 Excel 结构化文档一致：
 *   基础信息\n----\n服务编码|R53000080828\n...
 *   服务信息\n----\n功能描述|...\n...
 *   请求报文\n----\n（requestBodyList 字段表）
 *   示例报文\n----\n（serviceTestList 的 requestBody）
 *
 * 基础信息 / 服务信息的四个键值行即使值为空也始终保留，
 * 前端会据此留空白输入框供使用人补充。
 */
export function buildStructuredMarkdownFromSmp(
  callServiceList: SmpCallServiceInfoItem[],
  serviceTestList: SmpTestInfoItem[],
  options?: { existingExampleMessage?: string },
): string {
  const callItem = (callServiceList[0] ?? {}) as SmpCallServiceInfoItem;
  const testItem = (serviceTestList[0] ?? {}) as SmpTestInfoItem;

  const sections: string[] = [];

  /* ── 基础信息（不输出表头行，前端展示时自动补「服务属性 | 属性值」表头） ── */
  const basicLines = [
    `服务编码 | ${cleanCell(callItem.serviceCode)}`,
    `原服务交易码 | ${cleanCell(callItem.tranCode)}`,
    `服务名称 | ${cleanCell(callItem.serviceCname)}`,
    `服务属性 | ${cleanCell(callItem.serviceAttribute)}`,
  ];
  sections.push(
    `基础信息\n${API_DOC_SECTION_SEPARATOR}\n${basicLines.join("\n")}`,
  );

  /* ── 服务信息 ── */
  const serviceLines = [
    `功能描述 | ${cleanCell(callItem.descript)}`,
    `业务规则 | ${cleanCell(callItem.businessRule)}`,
    `服务名称 | ${cleanCell(callItem.serviceCname)}`,
    `服务属性 | ${cleanCell(callItem.serviceAttribute)}`,
  ];
  sections.push(
    `服务信息\n${API_DOC_SECTION_SEPARATOR}\n${serviceLines.join("\n")}`,
  );

  /* ── 请求报文 ── */
  const requestSection =
    buildFieldTableFromSmpNodeLists(callItem.requestBodyList) ??
    buildFieldTableFromJsonBody(testItem.requestBody) ??
    formatSmpBody(testItem.requestBody);
  if (requestSection) {
    sections.push(
      `请求报文\n${API_DOC_SECTION_SEPARATOR}\n${requestSection}`,
    );
  }

  /* ── 示例报文（始终输出该段，且不覆盖）──
   * 已有内容（使用人补填或此前同步的）原样保留，不被服管 requestBody 覆盖；
   * 仅当已有为空（如首次同步）时才取服管 requestBody。
   * 其他分区则始终以服管最新数据覆盖。 */
  const exampleBody =
    (options?.existingExampleMessage ?? "").trim() ||
    (testItem.requestBody ?? "").trim();
  sections.push(
    `示例报文\n${API_DOC_SECTION_SEPARATOR}\n${exampleBody}`,
  );

  return sections.join("\n\n");
}

function cleanCell(value?: string): string {
  return (value ?? "").trim();
}

/**
 * 把 SMP 服务调用信息中的 head/body 字段 list 组装成文档字段表。
 * nodeUrl 作为父路径单独输出，nodeCode 作为叶子字段名；完整路径仅用于行去重。
 */
export function buildFieldTableFromSmpNodeLists(
  headList?: SmpMessageFieldItem[],
  bodyList?: SmpMessageFieldItem[],
): string | null {
  const items = [...(headList ?? []), ...(bodyList ?? [])];
  if (!items.length) return null;

  const seen = new Set<string>();
  const lines = [
    "| 节点路径 | 节点代码 | 节点名称 | 节点类型 | 数据类型 | 长度 | 是否必填 | 描述 |",
  ];
  for (const item of items) {
    const code = (item.nodeCode || "").trim();
    if (!code) continue;
    const parentPath = buildSmpNodeParentPath(item);
    const fullPath = parentPath ? `${parentPath}/${code}` : code;
    if (seen.has(fullPath)) continue;
    seen.add(fullPath);
    lines.push(
      `| ${[
        parentPath,
        code,
        cleanCell(item.nodeName),
        cleanCell(item.nodeType),
        cleanCell(item.dataType),
        cleanCell(item.dataLength),
        mapSmpIsNotNull(item.isNotNull),
        cleanCell(item.descBind),
      ].join(" | ")} |`,
    );
  }

  return lines.length > 1 ? lines.join("\n") : null;
}

function buildSmpNodeParentPath(item: SmpMessageFieldItem): string {
  const code = (item.nodeCode || "").trim();
  const nodeUrl = (item.nodeUrl || "").trim().replace(/\/+$/, "");
  if (!nodeUrl) return "";
  if (nodeUrl === code) return "";
  return nodeUrl.endsWith(`/${code}`)
    ? nodeUrl.slice(0, -(code.length + 1))
    : nodeUrl;
}

function mapSmpIsNotNull(value?: string): "Y" | "N" {
  const v = (value || "").trim().toUpperCase();
  return v === "Y" || v === "是" ? "Y" : "N";
}

/**
 * 把 SMP requestBody / responseBody 的 JSON 报文体展开成字段表。
 *
 * SMP 的报文体是嵌套 JSON（形如 `{Transaction:{Header:{sysHeader:{...}},Body:{request:{bizBody:{...}}}}}`），
 * 递归展开为叶子节点，输出 `| 节点代码 | 是否必填 |` 表格（不输出节点路径列）。
 * 叶子代码与既有 Excel 文档的节点代码一致，使 AI 生成与字段目录能正确消费。
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
  const lines = ["| 节点代码 | 是否必填 |"];
  for (const row of rows) {
    if (seen.has(row.code)) continue;
    seen.add(row.code);
    lines.push(`| ${row.code} | N |`);
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
