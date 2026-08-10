import type { AiCasePlanItem } from "@case-forge/shared";
import {
  assembleCaseRequest,
  mapCasePlanToPayload,
} from "./api-case-assembler.util";
import {
  assessDocReadiness,
  buildFieldCatalogSummary,
  resolveCanonicalDoc,
} from "./api-canonical-doc.util";

const SAMPLE_DOC = [
  "基础信息",
  "----",
  "原服务交易码|TEST001",
  "服务URL|32.114.71.6:60030",
  "",
  "技术信息",
  "----",
  "通讯方式|Socket",
  "报文类型|XML",
  "报文编码|UTF-8",
  "",
  "请求报文",
  "----",
  "| 节点路径 | 节点代码 | 是否必填 |",
  "| --- | --- | --- |",
  "| Transaction/Header/sysHeader/msgId | msgId | Y |",
  "| Transaction/Body/request/bizHeader/pageNum | pageNum | N |",
  "| Transaction/Body/request/bizBody/custNo | custNo | Y |",
  "| Transaction/Body/request/bizBody/loanAmt | loanAmt | N |",
].join("\n");

const SAMPLE_DOC_JSON = [
  "基础信息",
  "----",
  "原服务交易码|PCBS03901001",
  "服务URL|32.114.71.6:60030",
  "",
  "技术信息",
  "----",
  "通讯方式|Socket",
  "报文类型|JSON",
  "报文编码|UTF-8",
  "",
  "请求报文",
  "----",
  "| 节点路径 | 节点代码 | 是否必填 |",
  "| --- | --- | --- |",
  "| Transaction/Header/sysHeader/msgId | msgId | Y |",
  "| Transaction/Body/request/bizHeader/pageNum | pageNum | N |",
  "| Transaction/Body/request/bizBody/custNo | custNo | Y |",
  "| Transaction/Body/request/bizBody/loanAmt | loanAmt | N |",
].join("\n");

const FAKE_ENDPOINT = {
  id: "ep-1",
  name: "贷款申请",
  method: "TCP",
  path: "32.114.71.6:60030",
  requestNotes: "",
  responseNotes: "",
} as any;

describe("resolveCanonicalDoc", () => {
  it("returns structured markdown when present", () => {
    expect(resolveCanonicalDoc(SAMPLE_DOC)).toBe(SAMPLE_DOC);
  });

  it("builds from endpoint notes when doc is empty (no ## prefix, ---- separator)", () => {
    const doc = resolveCanonicalDoc("", "req notes");
    expect(doc).toContain("请求报文\n----");
    expect(doc).toContain("req notes");
    expect(doc).not.toContain("## 请求报文");
  });

  it("produces extractable sections when built from endpoint notes", () => {
    const doc = resolveCanonicalDoc("", "req notes content");
    const { extractApiDocSection } = require("./api-doc.parser");
    const requestSection = extractApiDocSection(doc, "请求报文");
    expect(requestSection).toBe("req notes content");
  });
});

describe("assessDocReadiness", () => {
  it("passes for a well-formed TCP/XML doc", () => {
    const result = assessDocReadiness(SAMPLE_DOC);
    expect(result.ok).toBe(true);
    expect(result.fieldCount).toBeGreaterThan(0);
    expect(result.profile.transport).toBe("tcp");
    expect(result.profile.messageFormat).toBe("xml");
  });

  it("fails when no request fields", () => {
    const result = assessDocReadiness("基础信息\n----\n| 字段 | 值 |");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("请求报文");
  });

  it("passes TCP when serviceURL empty but endpointPath provided", () => {
    const docWithoutUrl = SAMPLE_DOC.replace(
      "服务URL|32.114.71.6:60030",
      "服务URL|",
    );
    const result = assessDocReadiness(docWithoutUrl, "tcp://33.114.5.56:60000");
    expect(result.ok).toBe(true);
  });

  it("fails TCP when serviceURL empty and no endpointPath", () => {
    const docWithoutUrl = SAMPLE_DOC.replace(
      "服务URL|32.114.71.6:60030",
      "服务URL|",
    );
    const result = assessDocReadiness(docWithoutUrl);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("服务URL");
  });

  it("documents the vacuous truth issue: empty array .every() is true", () => {
    const endpoints: { ok: boolean }[] = [];
    const allOk = endpoints.every((r) => r.ok);
    expect(allOk).toBe(true);
  });
});

describe("checkDocReadiness integration", () => {
  it("returns ok=false when no doc exists", () => {
    const doc = resolveCanonicalDoc("", "");
    const result = assessDocReadiness(doc);
    expect(result.ok).toBe(false);
  });

  it("returns ok=false for SMP fallback doc with JSON requestNotes (not a field table)", () => {
    const doc = resolveCanonicalDoc(
      "",
      '{"Transaction":{"Body":{"request":{"bizBody":{"custNo":"Y"}}}}}',
    );
    const result = assessDocReadiness(doc);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("请求报文");
  });

  it("returns ok=true for well-formed SMP fallback with field table in requestNotes", () => {
    const requestNotes = [
      "| 节点路径 | 节点代码 | 是否必填 |",
      "| --- | --- | --- |",
      "| Transaction/Body/request/bizBody/custNo | custNo | Y |",
    ].join("\n");
    const doc = resolveCanonicalDoc("", requestNotes);
    const result = assessDocReadiness(doc, "32.114.71.6:60030");
    expect(result.ok).toBe(true);
    expect(result.fieldCount).toBeGreaterThan(0);
  });
});

describe("buildFieldCatalogSummary", () => {
  it("lists all fields with path, code, required", () => {
    const summary = buildFieldCatalogSummary(SAMPLE_DOC);
    expect(summary).toContain("custNo");
    expect(summary).toContain("loanAmt");
    expect(summary).toContain("pageNum");
    expect(summary).toContain("Transaction/Body/request/bizBody/custNo");
  });
});

describe("assembleCaseRequest (XML, no example message)", () => {
  const profile = {
    transport: "tcp" as const,
    messageFormat: "xml" as const,
    encoding: "UTF-8",
  };

  it("builds full XML scaffold with bodyOverrides (node path keys)", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-核心成功",
      caseDesc: "标准二-正向",
      caseType: "正",
      priority: "高",
      bodyOverrides: {
        "Transaction/Body/request/bizBody/custNo": "1234567890",
        "Transaction/Body/request/bizBody/loanAmt": "50000",
      },
    };

    const { request, body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC,
      transactionCode: "TEST001",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    expect(typeof body).toBe("string");
    expect(body as string).toContain("<Transaction>");
    expect(body as string).toContain("<custNo>1234567890</custNo>");
    expect(body as string).toContain("<loanAmt>50000</loanAmt>");
    expect(request.transport).toBe("tcp");
    expect(request.framing).toBeDefined();
  });

  it("handles empty bodyOverrides for negative case", () => {
    const plan: AiCasePlanItem = {
      caseName: "反向-必填缺失",
      caseDesc: "custNo 为空",
      caseType: "反",
      priority: "中",
      bodyOverrides: {
        "Transaction/Body/request/bizBody/custNo": "",
      },
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC,
      transactionCode: "TEST001",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    expect(body as string).toMatch(/<custNo\s*\/?>/);
  });
});

describe("assembleCaseRequest (JSON/TCP, no example message)", () => {
  const profile = {
    transport: "tcp" as const,
    messageFormat: "json" as const,
    encoding: "UTF-8",
  };

  it("builds full Transaction JSON envelope with bodyOverrides (node path keys)", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-核心成功",
      caseDesc: "标准二-正向",
      caseType: "正",
      priority: "高",
      bodyOverrides: {
        "Transaction/Body/request/bizBody/custNo": "1234567890",
        "Transaction/Body/request/bizBody/loanAmt": "50000",
      },
    };

    const { request, body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_JSON,
      transactionCode: "PCBS03901001",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    expect(body).toBeInstanceOf(Object);
    const txn = (body as any).Transaction;
    expect(txn).toBeDefined();
    expect(txn.Header.sysHeader).toBeDefined();
    expect(txn.Header.sysHeader.msgId).toBeTruthy();
    expect(txn.Header.sysHeader.operation).toBe("PCBS03901001");
    expect(txn.Body.request.bizHeader).toBeDefined();
    expect(txn.Body.request.bizHeader.pageNum).toBe("1");
    expect(txn.Body.request.bizBody.custNo).toBe("1234567890");
    expect(txn.Body.request.bizBody.loanAmt).toBe("50000");
    expect(request.transport).toBe("tcp");
    expect(request.framing).toBeDefined();
    expect(request.framing?.type).toBe("length-prefix");
  });

  it("handles empty bodyOverrides for negative case", () => {
    const plan: AiCasePlanItem = {
      caseName: "反向-必填缺失",
      caseDesc: "custNo 为空",
      caseType: "反",
      priority: "中",
      bodyOverrides: {
        "Transaction/Body/request/bizBody/custNo": "",
      },
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_JSON,
      transactionCode: "PCBS03901001",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    const bizBody = (body as any).Transaction.Body.request.bizBody;
    expect(bizBody.custNo).toBe("");
  });

  it("routes bodyOverrides pageNum to bizHeader (not bizBody)", () => {
    const plan: AiCasePlanItem = {
      caseName: "反向-非法分页",
      caseDesc: "pageNum=-1",
      caseType: "反",
      priority: "中",
      bodyOverrides: {
        "Transaction/Body/request/bizHeader/pageNum": "-1",
      },
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_JSON,
      transactionCode: "PCBS03901001",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    const txn = (body as any).Transaction;
    expect(txn.Body.request.bizHeader.pageNum).toBe("-1");
    expect(txn.Body.request.bizBody.pageNum).toBeUndefined();
  });

  it("routes bodyOverrides msgId to sysHeader", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-自定义msgId",
      caseDesc: "改 msgId",
      caseType: "正",
      priority: "高",
      bodyOverrides: {
        "Transaction/Header/sysHeader/msgId": "CUSTOM_TRACE_ID",
      },
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_JSON,
      transactionCode: "PCBS03901001",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    const txn = (body as any).Transaction;
    expect(txn.Header.sysHeader.msgId).toBe("CUSTOM_TRACE_ID");
  });
});

describe("mapCasePlanToPayload", () => {
  it("produces a complete ApiTestCasePayload (XML)", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-默认",
      caseDesc: "标准二-正向-核心成功路径",
      caseType: "正",
      priority: "高",
      bodyOverrides: {
        "Transaction/Body/request/bizBody/custNo": "1234567890",
      },
    };

    const payload = mapCasePlanToPayload(
      plan,
      FAKE_ENDPOINT,
      "TEST001",
      0,
      { transport: "tcp", messageFormat: "xml", encoding: "UTF-8" },
      SAMPLE_DOC,
    );

    expect(payload.title).toBe("正向-默认");
    expect(payload.caseNo).toBe("TEST001-001");
    expect(payload.polarity).toBe("positive");
    expect(payload.priority).toBe("P0");
    expect(payload.request.transport).toBe("tcp");
    expect(payload.metadata?.source).toBe("ai");
    expect(payload.metadata?.inferredFields).toContain("body");
    expect(payload.metadata?.bodyOverrides).toEqual({
      "Transaction/Body/request/bizBody/custNo": "1234567890",
    });
  });

  it("produces a complete ApiTestCasePayload (JSON)", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-JSON",
      caseDesc: "标准二-正向",
      caseType: "正",
      priority: "高",
      bodyOverrides: {
        "Transaction/Body/request/bizBody/custNo": "1234567890",
        "Transaction/Body/request/bizBody/loanAmt": "50000",
      },
    };

    const payload = mapCasePlanToPayload(
      plan,
      FAKE_ENDPOINT,
      "PCBS03901001",
      0,
      { transport: "tcp", messageFormat: "json", encoding: "UTF-8" },
      SAMPLE_DOC_JSON,
    );

    expect(payload.title).toBe("正向-JSON");
    expect(payload.caseNo).toBe("PCBS03901001-001");
    expect(payload.metadata?.inferredFields).toContain("custNo");
    expect(payload.metadata?.inferredFields).toContain("loanAmt");
    expect(payload.metadata?.bodyOverrides).toEqual({
      "Transaction/Body/request/bizBody/custNo": "1234567890",
      "Transaction/Body/request/bizBody/loanAmt": "50000",
    });
  });

  it("assigns negative polarity for 反 case", () => {
    const plan: AiCasePlanItem = {
      caseName: "反向-非法分页",
      caseDesc: "pageNum=-1",
      caseType: "反",
      priority: "低",
      bodyOverrides: {
        "Transaction/Body/request/bizHeader/pageNum": "-1",
      },
    };

    const payload = mapCasePlanToPayload(
      plan,
      FAKE_ENDPOINT,
      "TEST001",
      1,
      { transport: "tcp", messageFormat: "xml", encoding: "UTF-8" },
      SAMPLE_DOC,
    );

    expect(payload.polarity).toBe("negative");
    expect(payload.priority).toBe("P2");
  });

  it("buildExpectedFromPlan uses default template (no plan.assertions)", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-断言",
      caseDesc: "结构化断言",
      caseType: "正",
      priority: "高",
      bodyOverrides: {
        "Transaction/Body/request/bizBody/custNo": "123",
      },
    };

    const payload = mapCasePlanToPayload(
      plan,
      FAKE_ENDPOINT,
      "TEST001",
      0,
      { transport: "tcp", messageFormat: "xml", encoding: "UTF-8" },
      SAMPLE_DOC,
    );

    expect(payload.expected.assertions).toBeDefined();
    expect(payload.expected.assertions!.length).toBeGreaterThan(0);
  });

  it("keeps unknown bodyOverrides keys (warn but not drop)", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-含非法key",
      caseDesc: "AI 输出了文档不存在的字段",
      caseType: "正",
      priority: "高",
      bodyOverrides: {
        "Transaction/Body/request/bizBody/custNo": "1234567890",
        "Transaction/Body/request/bizBody/customerNo": "should-be-kept",
      },
    };

    const payload = mapCasePlanToPayload(
      plan,
      FAKE_ENDPOINT,
      "TEST001",
      0,
      { transport: "tcp", messageFormat: "json", encoding: "UTF-8" },
      SAMPLE_DOC_JSON,
    );

    expect(payload.metadata?.bodyOverrides).toHaveProperty(
      "Transaction/Body/request/bizBody/customerNo",
    );
  });
});

const SAMPLE_DOC_WITH_EXAMPLE = [
  "基础信息",
  "----",
  "原服务交易码|TEST001",
  "服务URL|32.114.71.6:60030",
  "",
  "技术信息",
  "----",
  "通讯方式|Socket",
  "报文类型|XML",
  "报文编码|UTF-8",
  "",
  "请求报文",
  "----",
  "| 节点路径 | 节点代码 | 是否必填 |",
  "| --- | --- | --- |",
  "| Transaction/Header/sysHeader/msgId | msgId | Y |",
  "| Transaction/Body/request/bizHeader/interfaceId | interfaceId | N |",
  "| Transaction/Body/request/bizBody/custNo | custNo | Y |",
  "| Transaction/Body/request/bizBody/loanAmt | loanAmt | N |",
  "",
  "示例报文",
  "----",
  [
    "<Transaction>",
    "  <Header>",
    "    <sysHeader>",
    "      <msgId>OLD_MSG_ID</msgId>",
    "      <msgDate>20250101</msgDate>",
    "      <msgTime>12:00:00.000</msgTime>",
    "      <operation>TEST001</operation>",
    "    </sysHeader>",
    "  </Header>",
    "  <Body>",
    "    <request>",
    "      <bizHeader>",
    "        <interfaceId>IF001</interfaceId>",
    "        <pageNum>1</pageNum>",
    "      </bizHeader>",
    "      <bizBody>",
    "        <custNo>999999</custNo>",
    "        <loanAmt>10000</loanAmt>",
    "      </bizBody>",
    "    </request>",
    "  </Body>",
    "</Transaction>",
  ].join("\n"),
].join("\n");

describe("assembleCaseRequest (XML, with example message)", () => {
  const profile = {
    transport: "tcp" as const,
    messageFormat: "xml" as const,
    encoding: "UTF-8",
  };

  it("uses example message as base, applies bodyOverrides by node path", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-覆盖custNo",
      caseDesc: "标准二-正向",
      caseType: "正",
      priority: "高",
      bodyOverrides: {
        "Transaction/Body/request/bizBody/custNo": "1234567890",
        "Transaction/Body/request/bizBody/loanAmt": "50000",
      },
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_WITH_EXAMPLE,
      transactionCode: "TEST001",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    const xml = body as string;
    expect(xml).toContain("<custNo>1234567890</custNo>");
    expect(xml).toContain("<loanAmt>50000</loanAmt>");
    expect(xml).toContain("<interfaceId>IF001</interfaceId>");
    expect(xml).toContain("<pageNum>1</pageNum>");
  });

  it("refreshes msgId dynamically, not keeping OLD_MSG_ID", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-动态header",
      caseDesc: "msgId刷新",
      caseType: "正",
      priority: "高",
      bodyOverrides: {},
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_WITH_EXAMPLE,
      transactionCode: "TEST001",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    const xml = body as string;
    expect(xml).not.toContain("OLD_MSG_ID");
    expect(xml).toMatch(/<msgId>[^<]+<\/msgId>/);
  });

  it("preserves bizHeader custom fields from example", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-保留bizHeader",
      caseDesc: "验证示例报文bizHeader字段保留",
      caseType: "正",
      priority: "高",
      bodyOverrides: {
        "Transaction/Body/request/bizBody/custNo": "NEW_CUST",
      },
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_WITH_EXAMPLE,
      transactionCode: "TEST001",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    const xml = body as string;
    expect(xml).toContain("<interfaceId>IF001</interfaceId>");
    expect(xml).toContain("<custNo>NEW_CUST</custNo>");
  });
});

const SAMPLE_DOC_JSON_WITH_EXAMPLE = [
  "基础信息",
  "----",
  "原服务交易码|idc_SNYF0001",
  "服务URL|32.114.71.6:60030",
  "",
  "技术信息",
  "----",
  "通讯方式|Socket",
  "报文类型|JSON",
  "报文编码|UTF-8",
  "",
  "请求报文",
  "----",
  "| 节点路径 | 节点代码 | 是否必填 |",
  "| --- | --- | --- |",
  "| Transaction/Body/request/bizBody/model | model | Y |",
  "| Transaction/Body/request/bizBody/org_code | org_code | Y |",
  "",
  "示例报文",
  "----",
  JSON.stringify(
    {
      Transaction: {
        Header: {
          sysHeader: {
            msgId: "OLD_MSG_ID",
            msgDate: "20250101",
            msgTime: "12:00:00.000",
            operation: "idc_SNYF0001",
          },
        },
        Body: {
          request: {
            bizHeader: { interfaceId: "idc_SNYF0001", ver: "1" },
            bizBody: { model: "3", org_code: "041" },
          },
        },
      },
    },
    null,
    2,
  ),
].join("\n");

describe("assembleCaseRequest (JSON, with example message)", () => {
  const profile = {
    transport: "tcp" as const,
    messageFormat: "json" as const,
    encoding: "UTF-8",
  };

  it("applies bodyOverrides with full node path", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-覆盖model",
      caseDesc: "标准二-正向",
      caseType: "正",
      priority: "高",
      bodyOverrides: {
        "Transaction/Body/request/bizBody/model": "5",
      },
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_JSON_WITH_EXAMPLE,
      transactionCode: "idc_SNYF0001",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    const parsed = JSON.parse(body as string);
    expect(parsed.Transaction.Body.request.bizBody.model).toBe("5");
    expect(parsed.Transaction.Body.request.bizBody.org_code).toBe("041");
  });

  it("merges case-insensitive override paths into existing JSON nodes", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-覆盖大小写不一致路径",
      caseDesc: "bizbody 应合并到 bizBody",
      caseType: "正",
      priority: "高",
      bodyOverrides: {
        "Transaction/Body/request/bizbody/model": "5",
      },
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_JSON_WITH_EXAMPLE,
      transactionCode: "idc_SNYF0001",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    const parsed = JSON.parse(body as string);
    expect(parsed.Transaction.Body.request.bizBody.model).toBe("5");
    expect(parsed.Transaction.Body.request.bizbody).toBeUndefined();
  });

  it("falls back to last-segment match when AI returns short key", () => {
    const plan: AiCasePlanItem = {
      caseName: "反向-model非数字",
      caseDesc: "model=abc",
      caseType: "反",
      priority: "中",
      bodyOverrides: {
        model: "abc",
      },
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_JSON_WITH_EXAMPLE,
      transactionCode: "idc_SNYF0001",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    const parsed = JSON.parse(body as string);
    expect(parsed.Transaction.Body.request.bizBody.model).toBe("abc");
  });

  it("sets empty string for required field missing case", () => {
    const plan: AiCasePlanItem = {
      caseName: "反向-必填缺失",
      caseDesc: "model和org_code为空",
      caseType: "反",
      priority: "中",
      bodyOverrides: {
        model: "",
        org_code: "",
      },
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_JSON_WITH_EXAMPLE,
      transactionCode: "idc_SNYF0001",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    const parsed = JSON.parse(body as string);
    expect(parsed.Transaction.Body.request.bizBody.model).toBe("");
    expect(parsed.Transaction.Body.request.bizBody.org_code).toBe("");
  });

  it("refreshes msgId dynamically", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-动态header",
      caseDesc: "msgId刷新",
      caseType: "正",
      priority: "高",
      bodyOverrides: {},
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_JSON_WITH_EXAMPLE,
      transactionCode: "idc_SNYF0001",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    const parsed = JSON.parse(body as string);
    expect(parsed.Transaction.Header.sysHeader.msgId).not.toBe("OLD_MSG_ID");
    expect(parsed.Transaction.Header.sysHeader.msgId).toBeTruthy();
  });
});

const SAMPLE_DOC_JSON_WITH_ARRAY_EXAMPLE = [
  "基础信息",
  "----",
  "原服务交易码|syncSytWorkOrder",
  "服务URL|32.114.71.6:60030",
  "",
  "技术信息",
  "----",
  "通讯方式|HTTP",
  "报文类型|JSON",
  "报文编码|UTF-8",
  "",
  "请求报文",
  "----",
  "| 节点路径 | 节点代码 | 是否必填 |",
  "| --- | --- | --- |",
  "| Transaction/Body/request/bizBody/workOrderId | workOrderId | Y |",
  "| Transaction/Body/request/bizBody/data/terminalList | deviceModelName | Y |",
  "| Transaction/Body/request/bizBody/data/deviceModelName | deviceModelName | Y |",
  "",
  "示例报文",
  "----",
  JSON.stringify({
    Transaction: {
      Header: { sysHeader: { msgId: "OLD_MSG_ID", operation: "syncSytWorkOrder" } },
      Body: {
        request: {
          bizHeader: { data: null },
          bizBody: {
            workOrderId: "afecaf68ffac46fd8882e80a308c6175d",
            data: {
              terminalList: [
                { termId: "56000570", deviceModel: "000003", deviceModelName: "V8" },
                { termId: "56000571", deviceModel: "000004", deviceModelName: "V9" },
              ],
            },
          },
        },
      },
    },
  }),
].join("\n");

describe("assembleCaseRequest (JSON, object array fields)", () => {
  const profile = {
    transport: "http" as const,
    messageFormat: "json" as const,
    encoding: "UTF-8",
  };

  it("缺失案例：空字符串覆盖从所有数组元素中删除该字段", () => {
    const plan: AiCasePlanItem = {
      caseName: "缺失必填字段 deviceModelName",
      caseDesc: "terminalList 内所有元素删除 deviceModelName",
      caseType: "反",
      priority: "中",
      bodyOverrides: {
        "Transaction/Body/request/bizBody/data/terminalList/deviceModelName": "",
      },
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_JSON_WITH_ARRAY_EXAMPLE,
      transactionCode: "syncSytWorkOrder",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    const parsed = JSON.parse(body as string);
    const list = parsed.Transaction.Body.request.bizBody.data.terminalList;
    expect(list).toHaveLength(2);
    for (const item of list) {
      expect(item).not.toHaveProperty("deviceModelName");
      expect(item.termId).toBeTruthy();
      expect(item.deviceModel).toBeTruthy();
    }
  });

  it("非空覆盖写入所有数组元素", () => {
    const plan: AiCasePlanItem = {
      caseName: "非法 deviceModelName",
      caseDesc: "terminalList 内所有元素覆盖 deviceModelName",
      caseType: "反",
      priority: "中",
      bodyOverrides: {
        "Transaction/Body/request/bizBody/data/terminalList/deviceModelName": "INVALID",
      },
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_JSON_WITH_ARRAY_EXAMPLE,
      transactionCode: "syncSytWorkOrder",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    const parsed = JSON.parse(body as string);
    const list = parsed.Transaction.Body.request.bizBody.data.terminalList;
    expect(list[0].deviceModelName).toBe("INVALID");
    expect(list[1].deviceModelName).toBe("INVALID");
  });

  it("AI 只给短 key 时回退匹配也对所有数组元素删除", () => {
    const plan: AiCasePlanItem = {
      caseName: "缺失 deviceModelName（短key）",
      caseDesc: "回退匹配删除数组内字段",
      caseType: "反",
      priority: "中",
      bodyOverrides: {
        deviceModelName: "",
      },
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_JSON_WITH_ARRAY_EXAMPLE,
      transactionCode: "syncSytWorkOrder",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    const parsed = JSON.parse(body as string);
    const list = parsed.Transaction.Body.request.bizBody.data.terminalList;
    for (const item of list) {
      expect(item).not.toHaveProperty("deviceModelName");
    }
  });

  it("目录路径跳过数组节点时也能命中数组内字段（空值全元素删除）", () => {
    const plan: AiCasePlanItem = {
      caseName: "缺失必填字段 deviceModelName（目录路径）",
      caseDesc: "目录路径 .../data/deviceModelName 跳过 terminalList 数组节点",
      caseType: "反",
      priority: "中",
      bodyOverrides: {
        "Transaction/Body/request/bizBody/data/deviceModelName": "",
      },
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_JSON_WITH_ARRAY_EXAMPLE,
      transactionCode: "syncSytWorkOrder",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    const parsed = JSON.parse(body as string);
    const bizBody = parsed.Transaction.Body.request.bizBody;
    expect(bizBody.workOrderId).toBeTruthy();
    const list = bizBody.data.terminalList;
    expect(list).toHaveLength(2);
    for (const item of list) {
      expect(item).not.toHaveProperty("deviceModelName");
      expect(item.termId).toBeTruthy();
    }
  });

  it("目录路径跳过数组节点且非空值时写入所有数组元素", () => {
    const plan: AiCasePlanItem = {
      caseName: "非法 deviceModelName（目录路径）",
      caseDesc: "跳过数组节点的路径覆盖所有元素",
      caseType: "反",
      priority: "中",
      bodyOverrides: {
        "Transaction/Body/request/bizBody/data/deviceModelName": "INVALID",
      },
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_JSON_WITH_ARRAY_EXAMPLE,
      transactionCode: "syncSytWorkOrder",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    const parsed = JSON.parse(body as string);
    const list = parsed.Transaction.Body.request.bizBody.data.terminalList;
    expect(list[0].deviceModelName).toBe("INVALID");
    expect(list[1].deviceModelName).toBe("INVALID");
  });

  it("非数组字段的缺失案例仍置空字符串", () => {
    const plan: AiCasePlanItem = {
      caseName: "缺失 workOrderId",
      caseDesc: "标量字段置空",
      caseType: "反",
      priority: "中",
      bodyOverrides: {
        "Transaction/Body/request/bizBody/workOrderId": "",
      },
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC_JSON_WITH_ARRAY_EXAMPLE,
      transactionCode: "syncSytWorkOrder",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    const parsed = JSON.parse(body as string);
    expect(parsed.Transaction.Body.request.bizBody.workOrderId).toBe("");
  });
});

describe("assessDocReadiness with example message only", () => {
  it("passes when no field table but has example message", () => {
    const docWithOnlyExample = [
      "基础信息",
      "----",
      "原服务交易码|TEST001",
      "服务URL|32.114.71.6:60030",
      "",
      "技术信息",
      "----",
      "通讯方式|Socket",
      "报文类型|XML",
      "报文编码|UTF-8",
      "",
      "示例报文",
      "----",
      "<Transaction><Body><request><bizBody><custNo>123</custNo></bizBody></request></Body></Transaction>",
    ].join("\n");

    const result = assessDocReadiness(docWithOnlyExample);
    expect(result.ok).toBe(true);
  });
});
