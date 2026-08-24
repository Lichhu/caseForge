import type {
  AiCasePlanItem,
  ApiCaseExpected,
  ApiCasePolarity,
  ApiCasePriority,
  ApiCaseRequest,
  ApiCaseStatus,
  ApiMessageFormat,
  ApiTechnicalProfile,
  ApiTestCasePayload,
} from "@case-forge/shared";
import {
  buildDefaultExpected as sharedBuildDefaultExpected,
  prettyPrintXml,
  unescapeLiteralXmlEscapes,
} from "@case-forge/shared";
import type { ApiEndpointEntity } from "@api-test/entity/api-endpoint.entity";
import { extractApiDocSection, getApiDocFieldValue } from "./api-doc.parser";
import { extractExampleMessage } from "./api-canonical-doc.util";
import {
  buildTransactionXmlScaffold,
  parseApiDocMessageFields,
  type ApiDocMessageField,
} from "./api-xml-request-template.util";
import {
  buildCaseRequestFromProfile,
  parseApiTechnicalProfile,
} from "./api-doc-technical-profile.util";
import {
  assembleBodyFromExample,
  extractPathsFromExample,
  normalizeOverridePath,
} from "./api-case-body-assembler.util";
import { Logger } from "@nestjs/common";

function sectionPathPrefix(
  path: string,
): "sysHeader" | "bizHeader" | "bizBody" {
  if (path.includes("/sysHeader/")) return "sysHeader";
  if (path.includes("/bizHeader/")) return "bizHeader";
  if (path.includes("/bizBody/")) return "bizBody";
  if (path.endsWith("/bizBody")) return "bizBody";
  if (path.endsWith("/bizHeader")) return "bizHeader";
  if (path.includes("/sysHeader")) return "sysHeader";
  return "bizBody";
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

function extractJsonDocMeta(structuredDoc: string, transactionCode: string) {
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
  "ver",
] as const;

const BIZ_HEADER_FIELDS = [
  "pageNum",
  "pageSize",
  "tranCode",
  "tranNbr",
] as const;

function buildSectionJson(
  fields: ApiDocMessageField[],
  values: Record<string, string | undefined>,
  fallbackFields: readonly string[],
): Record<string, unknown> {
  const orderedCodes = [
    ...new Set([...fields.map((f) => f.code), ...fallbackFields]),
  ];
  const result: Record<string, unknown> = {};
  for (const code of orderedCodes) {
    result[code] = values[code] ?? "";
  }
  return result;
}

function buildTransactionJsonScaffold(input: {
  structuredDoc: string;
  transactionCode: string;
  bizBodyValues: Record<string, string | undefined>;
}): Record<string, unknown> {
  const meta = extractJsonDocMeta(input.structuredDoc, input.transactionCode);
  const requestSection = extractApiDocSection(input.structuredDoc, "请求报文");
  const fields = parseApiDocMessageFields(requestSection);
  const grouped = groupFieldsBySection(fields);
  const traceId = sampleTraceId(meta.clientCd);

  const fieldCodeToSection = new Map<
    string,
    "sysHeader" | "bizHeader" | "bizBody"
  >();
  for (const field of fields) {
    fieldCodeToSection.set(field.code, sectionPathPrefix(field.path));
  }

  const routedOverrides = {
    sysHeader: {} as Record<string, string | undefined>,
    bizHeader: {} as Record<string, string | undefined>,
    bizBody: {} as Record<string, string | undefined>,
  };
  for (const [key, value] of Object.entries(input.bizBodyValues)) {
    const section = fieldCodeToSection.get(key);
    if (section === "sysHeader") {
      routedOverrides.sysHeader[key] = value;
    } else if (section === "bizHeader") {
      routedOverrides.bizHeader[key] = value;
    } else {
      routedOverrides.bizBody[key] = value;
    }
  }

  const sysHeaderValues: Record<string, string | undefined> = {
    msgId: traceId,
    msgDate: new Date().toISOString().slice(0, 10),
    msgTime: formatMsgTime(new Date()),
    serviceCd: meta.serviceCd,
    operation: meta.transactionCode,
    clientCd: meta.clientCd,
    serverCd: meta.serverCd,
    bizId: "3",
    bizType: "1",
    orgCode: meta.orgCode,
    ver: "100100100",
    ...routedOverrides.sysHeader,
  };

  const bizHeaderValues: Record<string, string | undefined> = {
    pageNum: "1",
    pageSize: "20",
    tranCode: meta.transactionCode,
    tranNbr: traceId,
    ...routedOverrides.bizHeader,
  };

  const bizBodyValues: Record<string, string | undefined> = {
    ...Object.fromEntries(grouped.bizBody.map((f) => [f.code, ""])),
    ...routedOverrides.bizBody,
  };

  const sysHeader = buildSectionJson(
    grouped.sysHeader,
    sysHeaderValues,
    SYS_HEADER_FIELDS,
  );
  const bizHeader = buildSectionJson(
    grouped.bizHeader,
    bizHeaderValues,
    BIZ_HEADER_FIELDS,
  );
  const bizBody = buildSectionJson(
    grouped.bizBody,
    bizBodyValues,
    grouped.bizBody.length
      ? grouped.bizBody.map((f) => f.code)
      : Object.keys(bizBodyValues),
  );

  return {
    Transaction: {
      Header: { sysHeader },
      Body: {
        request: {
          bizHeader,
          bizBody,
        },
      },
    },
  };
}

export function assembleCaseRequest(input: {
  canonicalDoc: string;
  transactionCode: string;
  profile: ApiTechnicalProfile;
  endpoint: ApiEndpointEntity;
  plan: AiCasePlanItem;
}): { request: ApiCaseRequest; body: unknown } {
  const overrides = input.plan.bodyOverrides ?? {};
  const exampleMessage = extractExampleMessage(input.canonicalDoc);

  let body: unknown;

  if (exampleMessage) {
    const { body: assembledBody, warnings } = assembleBodyFromExample({
      exampleMessage,
      overrides,
      messageFormat: input.profile.messageFormat,
      refreshDynamicHeaders: true,
    });

    for (const w of warnings) {
      assemblerLogger.warn(w);
    }

    if (
      input.profile.messageFormat === "xml" ||
      input.profile.messageFormat === "soap"
    ) {
      body = prettyPrintXml(unescapeLiteralXmlEscapes(assembledBody));
    } else {
      body = assembledBody;
    }
  } else if (
    input.profile.messageFormat === "xml" ||
    input.profile.messageFormat === "soap"
  ) {
    const scaffoldOverrides: Record<string, string | undefined> = {};
    for (const [path, value] of Object.entries(overrides)) {
      const segments = path.split("/").filter(Boolean);
      const lastSegment = segments[segments.length - 1];
      if (lastSegment) scaffoldOverrides[lastSegment] = value;
    }

    body = buildTransactionXmlScaffold({
      structuredDoc: input.canonicalDoc,
      transactionCode: input.transactionCode,
      bizBodyValues: scaffoldOverrides,
      compact: false,
    });
    body = prettyPrintXml(unescapeLiteralXmlEscapes(body as string));
  } else {
    const scaffoldOverrides: Record<string, string | undefined> = {};
    for (const [path, value] of Object.entries(overrides)) {
      const segments = path.split("/").filter(Boolean);
      const lastSegment = segments[segments.length - 1];
      if (lastSegment) scaffoldOverrides[lastSegment] = value;
    }

    body = buildTransactionJsonScaffold({
      structuredDoc: input.canonicalDoc,
      transactionCode: input.transactionCode,
      bizBodyValues: scaffoldOverrides,
    });
  }

  const request = buildCaseRequestFromProfile(
    input.endpoint,
    input.profile,
    body,
  );

  return { request, body };
}

function normalizePolarity(value?: string): ApiCasePolarity {
  const text = (value ?? "").trim();
  if (text === "反" || text.toLowerCase() === "negative") {
    return "negative";
  }
  return "positive";
}

function normalizePriority(value?: string): ApiCasePriority {
  const text = (value ?? "").trim();
  if (text === "高" || text.toUpperCase() === "P0") return "P0";
  if (text === "低" || text.toUpperCase() === "P2") return "P2";
  return "P1";
}

function normalizeStatus(value?: string): ApiCaseStatus {
  const text = (value ?? "ready").trim().toLowerCase();
  if (text === "draft" || text === "disabled") {
    return text;
  }
  return "ready";
}

function buildExpectedFromPlan(
  plan: AiCasePlanItem,
  polarity: ApiCasePolarity,
  profile: ApiTechnicalProfile,
): ApiCaseExpected {
  return sharedBuildDefaultExpected(
    profile.transport,
    profile.messageFormat,
    polarity,
  );
}

function inferBodyFields(body: unknown, messageFormat: ApiMessageFormat) {
  if (messageFormat === "json" && body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (obj.Transaction && typeof obj.Transaction === "object") {
      const txn = obj.Transaction as Record<string, unknown>;
      const txnBody = txn.Body as Record<string, unknown> | undefined;
      const req = txnBody?.request as Record<string, unknown> | undefined;
      const bizBody = req?.bizBody as Record<string, unknown> | undefined;
      return bizBody ? Object.keys(bizBody) : Object.keys(obj);
    }
    return Object.keys(obj);
  }
  if (typeof body === "string" && body.trim()) {
    return ["body"];
  }
  return [];
}

const assemblerLogger = new Logger("ApiCaseAssembler");

function sanitizePlanOverrides(
  plan: AiCasePlanItem,
  canonicalDoc: string,
  profile: ApiTechnicalProfile,
): void {
  if (!plan.bodyOverrides) return;

  const requestSection = extractApiDocSection(canonicalDoc, "请求报文");
  const fields = parseApiDocMessageFields(requestSection);
  const exampleMessage = extractExampleMessage(canonicalDoc);

  const validPaths = new Set(fields.map((f) => normalizeOverridePath(f.path)));

  if (exampleMessage) {
    const examplePaths = extractPathsFromExample(
      exampleMessage,
      profile.messageFormat,
    );
    for (const p of examplePaths) {
      validPaths.add(normalizeOverridePath(p));
    }
  }

  if (!validPaths.size) return;

  const unknownKeys = Object.keys(plan.bodyOverrides).filter((key) => {
    const normalized = normalizeOverridePath(key);
    return !validPaths.has(normalized);
  });

  for (const key of unknownKeys) {
    assemblerLogger.warn(
      `bodyOverrides key "${key}" not found in field catalog or example message; keeping (may be intentional for negative testing)`,
    );
  }
}

export function mapCasePlanToPayload(
  plan: AiCasePlanItem,
  endpoint: ApiEndpointEntity,
  transactionCode: string,
  index: number,
  profile: ApiTechnicalProfile,
  canonicalDoc: string,
  scenarioInfo?: {
    promptId?: string;
    scenarioName?: string;
    promptName?: string;
  },
): ApiTestCasePayload {
  const polarity = normalizePolarity(plan.caseType);
  const priority = normalizePriority(plan.priority);
  const status = normalizeStatus("ready");

  sanitizePlanOverrides(plan, canonicalDoc, profile);

  const { request, body } = assembleCaseRequest({
    canonicalDoc,
    transactionCode,
    profile,
    endpoint,
    plan,
  });

  const expected = buildExpectedFromPlan(plan, polarity, profile);

  const scenarioSuffix = scenarioInfo?.scenarioName
    ? `[${scenarioInfo.scenarioName}]`
    : "";

  const baseTitle =
    plan.caseName?.trim() || `${endpoint.name} - 案例${index + 1}`;
  const baseDesc = plan.caseDesc?.trim() || "";

  return {
    title: scenarioSuffix ? `${baseTitle}-${scenarioSuffix}` : baseTitle,
    caseNo:
      plan.caseNo?.trim() ||
      `${transactionCode}-${String(index + 1).padStart(3, "0")}`,
    description: scenarioSuffix
      ? `${baseDesc}（场景：${scenarioSuffix}）`
      : baseDesc,
    remark: plan.remark?.trim() || "",
    transactionCode,
    owner: "",
    priority,
    polarity,
    enabled: status !== "disabled",
    status,
    preconditions: [],
    request,
    expected,
    metadata: {
      source: "ai",
      inferredFields: inferBodyFields(body, profile.messageFormat),
      bodyOverrides: plan.bodyOverrides
        ? Object.fromEntries(
            Object.entries(plan.bodyOverrides).filter(
              ([, v]) => v !== undefined,
            ),
          )
        : undefined,
      promptId: scenarioInfo?.promptId,
      scenarioName: scenarioInfo?.scenarioName,
      promptName: scenarioInfo?.promptName,
    },
  };
}

export { parseApiTechnicalProfile };
