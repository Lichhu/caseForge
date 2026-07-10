import type { ApiTechnicalProfile } from "@case-forge/shared";
import { extractApiDocSection, getApiDocFieldValue } from "./api-doc.parser";
import { parseApiDocMessageFields } from "./api-xml-request-template.util";
import { resolveApiTechnicalProfile } from "./api-doc-technical-profile.util";

/** SMP 兜底数据形状（避免与 entity 强耦合） */
export interface DocReadinessSmpData {
  callServiceList?: unknown[];
  serviceTestList?: unknown[];
}

export interface DocReadinessResult {
  ok: boolean;
  message: string;
  fieldCount: number;
  profile: ApiTechnicalProfile;
}

export function resolveCanonicalDoc(
  structuredMarkdown: string,
  endpointRequestNotes?: string,
): string {
  const doc = structuredMarkdown.trim();
  if (doc) return doc;

  const lines = ["技术信息", "----"];
  if (endpointRequestNotes?.trim()) {
    lines.push("请求报文", "----", endpointRequestNotes.trim());
  }
  return lines.join("\n");
}

export function assessDocReadiness(
  canonicalDoc: string,
  endpointPath?: string,
  smpData?: DocReadinessSmpData | null,
): DocReadinessResult {
  const profile = resolveApiTechnicalProfile(canonicalDoc, { smpData });

  const requestSection = extractApiDocSection(canonicalDoc, "请求报文");
  const fields = parseApiDocMessageFields(requestSection);
  const exampleMessage = extractExampleMessage(canonicalDoc);

  if (!fields.length && !exampleMessage) {
    return {
      ok: false,
      message:
        "文档「请求报文」段未解析到字段，且无示例报文，请检查文档格式或补充字段表/示例报文",
      fieldCount: 0,
      profile,
    };
  }

  if (profile.transport === "tcp") {
    const basicSection = extractApiDocSection(canonicalDoc, "基础信息");
    const serviceUrl = getApiDocFieldValue(basicSection, "服务URL").trim();
    if (!serviceUrl && !endpointPath) {
      return {
        ok: false,
        message:
          "TCP 接口缺少「服务URL」，请在文档基础信息中补充或设置接口路径",
        fieldCount: fields.length,
        profile,
      };
    }
  }

  return {
    ok: true,
    message: "文档就绪",
    fieldCount: fields.length,
    profile,
  };
}

export function buildFieldCatalogSummary(canonicalDoc: string): string {
  const requestSection = extractApiDocSection(canonicalDoc, "请求报文");
  const fields = parseApiDocMessageFields(requestSection);

  if (!fields.length) return "（无字段）";

  const header = [
    "节点路径",
    "节点代码",
    "节点名称",
    "数据类型",
    "必填",
    "描述",
    "码值",
  ];
  const separator = header.map(() => "---").join(" | ");

  const lines = fields.map((f) =>
    [
      f.path,
      f.code,
      f.name ?? "",
      f.dataType ?? "",
      f.required ? "Y" : "N",
      f.description ?? "",
      f.codeValues ?? "",
    ].join(" | "),
  );

  return [
    `| ${header.join(" | ")} |`,
    `| ${separator} |`,
    ...lines.map((l) => `| ${l} |`),
  ].join("\n");
}

export function extractExampleMessage(structuredDoc: string): string {
  return extractApiDocSection(structuredDoc, "示例报文").trim();
}

export function hasExampleMessage(structuredDoc: string): boolean {
  return Boolean(extractExampleMessage(structuredDoc));
}
