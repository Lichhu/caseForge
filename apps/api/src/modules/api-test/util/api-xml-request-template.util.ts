import { minifyXml, prettyPrintXml } from "@case-forge/shared";
import { extractApiDocSection, getApiDocFieldValue } from "./api-doc.parser";
export interface ApiDocMessageField {
  path: string;
  code: string;
  required: boolean;
}

interface XmlDocMeta {
  transactionCode: string;
  serviceCd: string;
  clientCd: string;
  serverCd: string;
  orgCode: string;
}

const SYS_HEADER_FIELDS = [
  "msgId",
  "msgDate",
  "msgTime",
  "serviceCd",
  "operation",
  "clientCd",
  "serverCd",
  "bizId",
  "bizType",
  "orgCode",
  "resCode",
  "resText",
  "bizResCode",
  "bizResText",
  "ver",
  "authId",
  "authPara",
  "authContext",
  "pinIndex",
  "pinValue",
] as const;

const BIZ_HEADER_FIELDS = [
  "pageNum",
  "pageSize",
  "tranCode",
  "tranNbr",
] as const;

function indent(level: number) {
  return "\t".repeat(level);
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function xmlTag(name: string, value?: string, selfClose = false) {
  if (selfClose || value === undefined) {
    return `<${name}/>`;
  }
  if (!value) {
    return `<${name}/>`;
  }
  return `<${name}>${escapeXml(value)}</${name}>`;
}

function sectionPathPrefix(path: string) {
  if (path.includes("/sysHeader/")) return "sysHeader";
  if (path.includes("/bizHeader/")) return "bizHeader";
  if (path.includes("/bizBody/")) return "bizBody";
  if (path.endsWith("/bizBody")) return "bizBody";
  if (path.endsWith("/bizHeader")) return "bizHeader";
  if (path.includes("/sysHeader")) return "sysHeader";
  return "bizBody";
}

function fieldCodeFromPath(path: string, fallbackCode: string) {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] || fallbackCode;
}

/** 解析「请求报文」表字段行 */
export function parseApiDocMessageFields(
  sectionText: string,
): ApiDocMessageField[] {
  const lines = sectionText
    .split("\n")
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .filter((cells) => cells.some((cell) => cell));

  if (!lines.length) return [];

  const header = lines[0];
  const pathIndex = header.findIndex((cell) => cell.includes("节点路径"));
  const codeIndex = header.findIndex((cell) => cell.includes("节点代码"));
  const requiredIndex = header.findIndex((cell) => cell.includes("是否必填"));

  const fields: ApiDocMessageField[] = [];
  for (const cells of lines.slice(1)) {
    const path = cells[pathIndex >= 0 ? pathIndex : 0] ?? "";
    const code =
      cells[codeIndex >= 0 ? codeIndex : 1] ?? fieldCodeFromPath(path, "");
    if (!path && !code) continue;

    const requiredText = (cells[requiredIndex] ?? "").toUpperCase();
    fields.push({
      path: path || `Transaction/Body/request/bizBody/${code}`,
      code: code || fieldCodeFromPath(path, ""),
      required: requiredText === "Y" || requiredText === "是",
    });
  }
  return fields.filter((field) => field.code);
}

function extractXmlDocMeta(
  structuredDoc: string,
  transactionCode: string,
): XmlDocMeta {
  const basic = extractApiDocSection(structuredDoc, "基础信息");
  const service = extractApiDocSection(structuredDoc, "服务信息");
  const technical = extractApiDocSection(structuredDoc, "技术信息");

  return {
    transactionCode:
      getApiDocFieldValue(basic, "原服务交易码").trim() || transactionCode,
    serviceCd:
      getApiDocFieldValue(basic, "服务代码").trim() ||
      getApiDocFieldValue(service, "服务代码").trim() ||
      getApiDocFieldValue(technical, "业务头标示").trim(),
    clientCd: getApiDocFieldValue(technical, "客户端代码").trim() || "003",
    serverCd: getApiDocFieldValue(technical, "服务端代码").trim() || "121",
    orgCode: getApiDocFieldValue(technical, "机构代码").trim() || "01224",
  };
}

function formatMsgTime(date: Date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

function sampleTraceId(clientCd: string) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const time = now.toTimeString().slice(0, 8).replaceAll(":", "");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${clientCd.padStart(3, "0")}${date}${time}${ms}0000001`;
}

function groupFieldsBySection(fields: ApiDocMessageField[]) {
  const grouped: Record<
    "sysHeader" | "bizHeader" | "bizBody",
    ApiDocMessageField[]
  > = {
    sysHeader: [],
    bizHeader: [],
    bizBody: [],
  };

  for (const field of fields) {
    grouped[sectionPathPrefix(field.path)].push(field);
  }
  return grouped;
}

function buildSectionXml(
  section: "sysHeader" | "bizHeader" | "bizBody",
  fields: ApiDocMessageField[],
  values: Record<string, string | undefined>,
  fallbackFields: readonly string[],
  baseLevel: number,
) {
  const orderedCodes = [
    ...new Set([...fields.map((field) => field.code), ...fallbackFields]),
  ];

  const lines = orderedCodes.map((code) => {
    const value = values[code];
    return `${indent(baseLevel + 1)}${xmlTag(code, value)}`;
  });

  return [
    `${indent(baseLevel)}<${section}>`,
    ...lines,
    `${indent(baseLevel)}</${section}>`,
  ].join("\n");
}

function buildSysHeaderValues(meta: XmlDocMeta, traceId: string) {
  const now = new Date();
  return {
    msgId: traceId,
    msgDate: now.toISOString().slice(0, 10),
    msgTime: formatMsgTime(now),
    serviceCd: meta.serviceCd,
    operation: meta.transactionCode,
    clientCd: meta.clientCd,
    serverCd: meta.serverCd,
    bizId: "3",
    bizType: "1",
    orgCode: meta.orgCode,
    ver: "100100100",
  } satisfies Record<string, string | undefined>;
}

function buildBizHeaderValues(meta: XmlDocMeta, traceId: string) {
  return {
    pageNum: "1",
    pageSize: "20",
    tranCode: meta.transactionCode,
    tranNbr: traceId,
  } satisfies Record<string, string | undefined>;
}

/** 按 ESB 标准生成完整 Transaction 请求 XML 骨架 */
export function buildTransactionXmlScaffold(input: {
  structuredDoc: string;
  transactionCode: string;
  bizBodyValues?: Record<string, string | undefined>;
  compact?: boolean;
}) {
  const meta = extractXmlDocMeta(input.structuredDoc, input.transactionCode);
  const requestSection = extractApiDocSection(input.structuredDoc, "请求报文");
  const fields = parseApiDocMessageFields(requestSection);
  const grouped = groupFieldsBySection(fields);
  const traceId = sampleTraceId(meta.clientCd);
  const sysHeaderValues = {
    ...buildSysHeaderValues(meta, traceId),
    ...Object.fromEntries(
      grouped.sysHeader.map((field) => [
        field.code,
        input.bizBodyValues?.[field.code],
      ]),
    ),
  };
  const bizHeaderValues = {
    ...buildBizHeaderValues(meta, traceId),
    ...Object.fromEntries(
      grouped.bizHeader.map((field) => [
        field.code,
        input.bizBodyValues?.[field.code],
      ]),
    ),
  };
  const bizBodyValues = {
    ...Object.fromEntries(grouped.bizBody.map((field) => [field.code, ""])),
    ...input.bizBodyValues,
  };

  const sysHeader = buildSectionXml(
    "sysHeader",
    grouped.sysHeader,
    sysHeaderValues,
    SYS_HEADER_FIELDS,
    2,
  );
  const bizHeader = buildSectionXml(
    "bizHeader",
    grouped.bizHeader,
    bizHeaderValues,
    BIZ_HEADER_FIELDS,
    3,
  );
  const bizBody = buildSectionXml(
    "bizBody",
    grouped.bizBody,
    bizBodyValues,
    grouped.bizBody.length
      ? grouped.bizBody.map((field) => field.code)
      : Object.keys(bizBodyValues),
    3,
  );

  const xml = [
    "<Transaction>",
    `${indent(1)}<Header>`,
    sysHeader,
    `${indent(1)}</Header>`,
    `${indent(1)}<Body>`,
    `${indent(2)}<request>`,
    bizHeader,
    bizBody,
    `${indent(2)}</request>`,
    `${indent(1)}</Body>`,
    "</Transaction>",
  ].join("\n");

  if (input.compact) {
    return minifyXml(xml);
  }
  return `${xml}\n`;
}

export { minifyXml, prettyPrintXml };

export function buildXmlProtocolScaffoldExample(
  structuredDoc: string,
  transactionCode: string,
) {
  const xml = buildTransactionXmlScaffold({
    structuredDoc,
    transactionCode,
    bizBodyValues: { cstNo: "1234567890" },
    compact: true,
  });
  return xml.slice(0, 500) + (xml.length > 500 ? "..." : "");
}

export function buildXmlGuidanceExtra(
  structuredDoc: string,
  transactionCode: string,
) {
  const requestSection = extractApiDocSection(structuredDoc, "请求报文");
  const fields = parseApiDocMessageFields(requestSection);
  const bizBodyFields = fields
    .filter((field) => sectionPathPrefix(field.path) === "bizBody")
    .map((field) => field.code);
  const example = buildTransactionXmlScaffold({
    structuredDoc,
    transactionCode,
    bizBodyValues: Object.fromEntries(
      (bizBodyFields.length ? bizBodyFields.slice(0, 2) : ["cstNo"]).map(
        (code) => [
          code,
          code === "pageNum" || code === "pageSize" ? "1" : "样例值",
        ],
      ),
    ),
  });

  return [
    "",
    "### ESB XML 报文骨架（TCP/XML 必读）",
    "",
    "完整请求须包含三层，**禁止只输出 bizBody**：",
    "1. `Transaction/Header/sysHeader`：系统头（msgId、serviceCd、operation 等）",
    "2. `Transaction/Body/request/bizHeader`：业务头（pageNum、pageSize、tranCode、tranNbr）",
    "3. `Transaction/Body/request/bizBody`：业务体（文档「请求报文」表中的业务字段）",
    "",
    "字段联动规则：",
    "- `msgId` 与 `tranNbr` 使用同一流水号",
    "- `operation` 与 `tranCode` 均取交易码",
    "- 请求中 `resCode`/`resText`/`bizResCode`/`bizResText` 留空",
    "- 仅修改 `bizBody` 中被测字段，其余头字段保持合法默认值",
    "- 分页类反向案例可改 `bizHeader.pageNum` / `bizHeader.pageSize`",
    "",
    bizBodyFields.length
      ? `当前文档 bizBody 字段：${bizBodyFields.join("、")}`
      : "bizBody 字段以文档「请求报文」表为准",
    "",
    "紧凑示例（TCP 发送时可压成单行；案例存储建议保留缩进美化格式）：",
    `\`${example}\``,
    "",
    "案例 `requestBody` 请输出 **Tab 缩进的美化 XML**（与 ESB 报文示例一致），空节点用 `<field/>` 自闭合。",
    "响应断言字段：优先使用 `sysHeader/bizResCode`、`sysHeader/bizResText`，",
    "或 `sysHeader/resCode`、`sysHeader/resText`，**不要编造 retCode/retMsg**（除非文档明确）。",
  ].join("\n");
}
