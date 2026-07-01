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
  "",
  "响应报文",
  "----",
  "| 节点路径 | 节点代码 | 是否必填 |",
  "| --- | --- | --- |",
  "| Transaction/Header/sysHeader/bizResCode | bizResCode | Y |",
  "| Transaction/Header/sysHeader/bizResText | bizResText | N |",
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
  "",
  "响应报文",
  "----",
  "| 节点路径 | 节点代码 | 是否必填 |",
  "| --- | --- | --- |",
  "| Transaction/Header/sysHeader/bizResCode | bizResCode | Y |",
  "| Transaction/Header/sysHeader/bizResText | bizResText | N |",
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
    const doc = resolveCanonicalDoc("", "req notes", "resp notes");
    expect(doc).toContain("请求报文\n----");
    expect(doc).toContain("req notes");
    expect(doc).not.toContain("## 请求报文");
  });

  it("produces extractable sections when built from endpoint notes", () => {
    const doc = resolveCanonicalDoc(
      "",
      "req notes content",
      "resp notes content",
    );
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
    const doc = resolveCanonicalDoc("", "", "");
    const result = assessDocReadiness(doc);
    expect(result.ok).toBe(false);
  });

  it("returns ok=false for SMP fallback doc with JSON requestNotes (not a field table)", () => {
    const doc = resolveCanonicalDoc(
      "",
      '{"Transaction":{"Body":{"request":{"bizBody":{"custNo":"Y"}}}}}',
      "",
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
    const responseNotes = [
      "| 节点路径 | 节点代码 | 是否必填 |",
      "| --- | --- | --- |",
      "| Transaction/Header/sysHeader/bizResCode | bizResCode | Y |",
    ].join("\n");
    const doc = resolveCanonicalDoc("", requestNotes, responseNotes);
    const result = assessDocReadiness(doc, "32.114.71.6:60030");
    expect(result.ok).toBe(true);
    expect(result.fieldCount).toBeGreaterThan(0);
  });
});

describe("buildFieldCatalogSummary", () => {
  it("lists all fields with code, path, required", () => {
    const summary = buildFieldCatalogSummary(SAMPLE_DOC);
    expect(summary).toContain("custNo");
    expect(summary).toContain("loanAmt");
    expect(summary).toContain("pageNum");
  });
});

describe("assembleCaseRequest (XML)", () => {
  const profile = {
    transport: "tcp" as const,
    messageFormat: "xml" as const,
    encoding: "UTF-8",
  };

  it("builds full XML scaffold with bodyOverrides", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-核心成功",
      caseDesc: "标准二-正向",
      caseType: "正",
      priority: "高",
      bodyOverrides: { custNo: "1234567890", loanAmt: "50000" },
      expectedResult: "bizResCode=000000",
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
      bodyOverrides: { custNo: "" },
      expectedResult: "bizResCode 非 000000",
    };

    const { body } = assembleCaseRequest({
      canonicalDoc: SAMPLE_DOC,
      transactionCode: "TEST001",
      profile,
      endpoint: FAKE_ENDPOINT,
      plan,
    });

    expect(body as string).toContain("<custNo/>");
  });
});

describe("assembleCaseRequest (JSON/TCP)", () => {
  const profile = {
    transport: "tcp" as const,
    messageFormat: "json" as const,
    encoding: "UTF-8",
  };

  it("builds full Transaction JSON envelope with bodyOverrides", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-核心成功",
      caseDesc: "标准二-正向",
      caseType: "正",
      priority: "高",
      bodyOverrides: { custNo: "1234567890", loanAmt: "50000" },
      expectedResult: "bizResCode=000000",
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
      bodyOverrides: { custNo: "" },
      expectedResult: "bizResCode 非 000000",
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
      bodyOverrides: { pageNum: "-1" },
      expectedResult: "bizResCode 非 000000",
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
      bodyOverrides: { msgId: "CUSTOM_TRACE_ID" },
      expectedResult: "bizResCode=000000",
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
      bodyOverrides: { custNo: "1234567890" },
      expectedResult: "响应报文 bizResCode=000000",
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
    expect(payload.metadata?.bodyOverrides).toEqual({ custNo: "1234567890" });
  });

  it("produces a complete ApiTestCasePayload (JSON)", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-JSON",
      caseDesc: "标准二-正向",
      caseType: "正",
      priority: "高",
      bodyOverrides: { custNo: "1234567890", loanAmt: "50000" },
      expectedResult: "bizResCode=000000",
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
      custNo: "1234567890",
      loanAmt: "50000",
    });
  });

  it("assigns negative polarity for 反 case", () => {
    const plan: AiCasePlanItem = {
      caseName: "反向-非法分页",
      caseDesc: "pageNum=-1",
      caseType: "反",
      priority: "低",
      bodyOverrides: { pageNum: "-1" },
      expectedResult: "bizResCode 非 000000，提示分页参数非法",
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

  it("wires plan.assertions into bodyAssertions", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-断言",
      caseDesc: "结构化断言",
      caseType: "正",
      priority: "高",
      bodyOverrides: { custNo: "123" },
      expectedResult: "成功",
      assertions: [
        { type: "contains", expected: "bizResCode" },
        { type: "contains", expected: "000000" },
      ],
    };

    const payload = mapCasePlanToPayload(
      plan,
      FAKE_ENDPOINT,
      "TEST001",
      0,
      { transport: "tcp", messageFormat: "xml", encoding: "UTF-8" },
      SAMPLE_DOC,
    );

    expect(payload.expected.bodyAssertions).toHaveLength(2);
    expect(payload.expected.bodyAssertions![0].expected).toBe("bizResCode");
    expect(payload.expected.bodyAssertions![1].expected).toBe("000000");
  });

  it("drops unknown bodyOverrides keys not in field catalog", () => {
    const plan: AiCasePlanItem = {
      caseName: "正向-含非法key",
      caseDesc: "AI 输出了文档不存在的字段",
      caseType: "正",
      priority: "高",
      bodyOverrides: { custNo: "1234567890", customerNo: "should-be-dropped" },
      expectedResult: "bizResCode=000000",
    };

    const payload = mapCasePlanToPayload(
      plan,
      FAKE_ENDPOINT,
      "TEST001",
      0,
      { transport: "tcp", messageFormat: "json", encoding: "UTF-8" },
      SAMPLE_DOC_JSON,
    );

    expect(payload.metadata?.bodyOverrides).toEqual({ custNo: "1234567890" });
    expect(payload.metadata?.bodyOverrides).not.toHaveProperty("customerNo");
  });

  it("drops unknown headerOverrides keys not in field catalog", () => {
    const plan: AiCasePlanItem = {
      caseName: "反向-含非法header key",
      caseDesc: "AI 输出了文档不存在的 header 字段",
      caseType: "反",
      priority: "中",
      bodyOverrides: { custNo: "123" },
      headerOverrides: { pageNum: "-1", fakeField: "should-be-dropped" },
      expectedResult: "bizResCode 非 000000",
    };

    const payload = mapCasePlanToPayload(
      plan,
      FAKE_ENDPOINT,
      "PCBS03901001",
      0,
      { transport: "tcp", messageFormat: "json", encoding: "UTF-8" },
      SAMPLE_DOC_JSON,
    );

    const txn = (payload.request.body as any).Transaction;
    expect(txn.Body.request.bizHeader.pageNum).toBe("-1");
    expect(txn.Body.request.bizHeader).not.toHaveProperty("fakeField");
  });
});
