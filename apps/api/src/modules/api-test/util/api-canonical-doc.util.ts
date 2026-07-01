import type { ApiTechnicalProfile } from "@case-forge/shared";
import { extractApiDocSection, getApiDocFieldValue } from "./api-doc.parser";
import { parseApiDocMessageFields } from "./api-xml-request-template.util";
import { parseApiTechnicalProfile } from "./api-doc-technical-profile.util";

export interface DocReadinessResult {
  ok: boolean;
  message: string;
  fieldCount: number;
  profile: ApiTechnicalProfile;
}

export function resolveCanonicalDoc(
  structuredMarkdown: string,
  endpointRequestNotes?: string,
  endpointResponseNotes?: string,
): string {
  const doc = structuredMarkdown.trim();
  if (doc) return doc;

  const lines = ["技术信息", "----"];
  if (endpointRequestNotes?.trim()) {
    lines.push("请求报文", "----", endpointRequestNotes.trim());
  }
  if (endpointResponseNotes?.trim()) {
    lines.push("响应报文", "----", endpointResponseNotes.trim());
  }
  return lines.join("\n");
}

export function assessDocReadiness(
  canonicalDoc: string,
  endpointPath?: string,
): DocReadinessResult {
  const profile = parseApiTechnicalProfile(canonicalDoc);

  const requestSection = extractApiDocSection(canonicalDoc, "请求报文");
  const fields = parseApiDocMessageFields(requestSection);

  if (!fields.length) {
    return {
      ok: false,
      message: "文档「请求报文」段未解析到字段，请检查文档格式或补充字段表",
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

  const lines = fields.map(
    (f) => `| ${f.code} | ${f.path} | ${f.required ? "Y" : "N"} |`,
  );

  return [
    "| 节点代码 | 节点路径 | 必填 |",
    "| --- | --- | --- |",
    ...lines,
  ].join("\n");
}
