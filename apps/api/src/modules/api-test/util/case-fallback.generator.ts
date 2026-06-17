import type { ApiTestCasePayload } from "@case-forge/shared";
import type { ApiEndpointEntity } from "../entity/api-endpoint.entity";
import {
  buildCaseRequestFromProfile,
  buildDefaultExpected,
  parseApiTechnicalProfile,
} from "./api-doc-technical-profile.util";
import { buildTransactionXmlScaffold } from "./api-xml-request-template.util";

export function buildFallbackCasesForEndpoint(
  endpoint: ApiEndpointEntity,
  transactionCode?: string,
  structuredDoc?: string,
): ApiTestCasePayload[] {
  const code = transactionCode || endpoint.name;
  const doc = structuredDoc ?? "";
  const profile = parseApiTechnicalProfile(doc);
  const isHttp = profile.transport === "http";
  const positiveBody =
    profile.messageFormat === "json"
      ? {}
      : profile.messageFormat === "xml"
        ? buildTransactionXmlScaffold({
            structuredDoc: doc,
            transactionCode: code,
          })
        : "";
  const negativeBody =
    profile.messageFormat === "json"
      ? {}
      : profile.messageFormat === "xml"
        ? buildTransactionXmlScaffold({
            structuredDoc: doc,
            transactionCode: code,
          })
        : "";

  const positive: ApiTestCasePayload = {
    title: `${endpoint.name} - 正向`,
    caseNo: `${code}-001`,
    description: isHttp
      ? `验证 ${endpoint.method} ${endpoint.path} 正常返回`
      : `验证 ${profile.transport.toUpperCase()} 接口正常返回`,
    remark: "",
    transactionCode: code,
    owner: "",
    priority: "P0",
    polarity: "positive",
    enabled: true,
    status: "ready",
    preconditions: isHttp
      ? ["已选择有效执行环境", "Token 已配置"]
      : ["已选择有效执行环境", "TCP 连接地址已配置"],
    request: buildCaseRequestFromProfile(endpoint, profile, positiveBody),
    expected: buildDefaultExpected(profile, "positive"),
    metadata: { source: "ai", inferredFields: ["body"] },
  };

  const negative: ApiTestCasePayload = {
    title: `${endpoint.name} - 反向缺参`,
    caseNo: `${code}-002`,
    description: isHttp
      ? `验证 ${endpoint.method} ${endpoint.path} 参数缺失时的错误响应`
      : `验证 ${profile.transport.toUpperCase()} 接口参数缺失时的错误响应`,
    remark: "",
    transactionCode: code,
    owner: "",
    priority: "P1",
    polarity: "negative",
    enabled: true,
    status: "ready",
    preconditions: ["已选择有效执行环境"],
    request: buildCaseRequestFromProfile(endpoint, profile, negativeBody),
    expected: buildDefaultExpected(profile, "negative"),
    metadata: { source: "ai" },
  };

  return [positive, negative];
}
