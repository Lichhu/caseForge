import {
  buildStructuredMarkdownFromSmp,
  buildFieldTableFromJsonBody,
  buildFieldTableFromSmpNodeLists,
  mapSocketWayLabel,
  mapMessageTypeLabel,
} from "./smp-structured-doc.builder";
import { parseApiTechnicalProfile } from "./api-doc-technical-profile.util";
import { extractApiDocSection, getApiDocFieldValue } from "./api-doc.parser";
import { assessDocReadiness } from "./api-canonical-doc.util";
import { parseApiDocMessageFields } from "./api-xml-request-template.util";
import type {
  SmpCallServiceInfoItem,
  SmpMessageFieldItem,
  SmpTestInfoItem,
} from "../service/smp-client.service";

function makeCallItem(
  overrides?: Partial<SmpCallServiceInfoItem>,
): SmpCallServiceInfoItem {
  return {
    socketWay: "HTTP",
    messageType: "JSON",
    messageCoding: "UTF-8",
    callMethod: "同步",
    maxMessageSize: "10K",
    headId: "H53000010660",
    serviceCname: "测试服务",
    serviceCode: "R53000080828",
    tranCode: "PCBS03901001",
    ...overrides,
  };
}

const NESTED_REQUEST_BODY = JSON.stringify({
  Transaction: {
    Header: { sysHeader: { msgId: "", serviceCd: "", operation: "op" } },
    Body: {
      request: {
        bizBody: { taskId: "T1", serviceCode: "R1", reqCode: "XQ1" },
        bizHeader: {},
      },
    },
  },
});

const NESTED_RESPONSE_BODY = JSON.stringify({
  Transaction: {
    Header: { sysHeader: { bizResCode: "000000", bizResText: "成功" } },
    Body: { response: { bizBody: { amount: "100" }, bizHeader: {} } },
  },
});

function makeTestItem(overrides?: Partial<SmpTestInfoItem>): SmpTestInfoItem {
  return {
    requestUrl: "tcp://33.114.5.56:60000",
    requestBody: NESTED_REQUEST_BODY,
    responseBody: NESTED_RESPONSE_BODY,
    requestEncoding: "UTF-8",
    requestMessageType: "JSON",
    ...overrides,
  };
}

describe("mapSocketWayLabel", () => {
  it("maps HTTP → HTTP", () => {
    expect(mapSocketWayLabel("HTTP")).toBe("HTTP");
  });

  it("maps TEP → Socket", () => {
    expect(mapSocketWayLabel("TEP")).toBe("Socket");
  });

  it("maps TCP → Socket", () => {
    expect(mapSocketWayLabel("TCP")).toBe("Socket");
  });

  it("maps empty → HTTP (default)", () => {
    expect(mapSocketWayLabel("")).toBe("HTTP");
  });
});

describe("mapMessageTypeLabel", () => {
  it("maps JSON → JSON", () => {
    expect(mapMessageTypeLabel("JSON")).toBe("JSON");
  });

  it("maps XML → XML", () => {
    expect(mapMessageTypeLabel("XML")).toBe("XML");
  });

  it("maps ESB标准XML → XML", () => {
    expect(mapMessageTypeLabel("ESB标准XML")).toBe("XML");
  });

  it("maps empty → JSON (default)", () => {
    expect(mapMessageTypeLabel("")).toBe("JSON");
  });
});

describe("buildStructuredMarkdownFromSmp", () => {
  it("generates 技术信息 with Socket + XML for TEP/XML SMP data", () => {
    const md = buildStructuredMarkdownFromSmp(
      [makeCallItem({ socketWay: "TEP", messageType: "XML" })],
      [makeTestItem()],
    );

    const techSection = extractApiDocSection(md, "技术信息");
    expect(getApiDocFieldValue(techSection, "通讯方式")).toBe("Socket");
    expect(getApiDocFieldValue(techSection, "报文类型")).toBe("XML");
    expect(getApiDocFieldValue(techSection, "报文编码")).toBe("UTF-8");
    expect(getApiDocFieldValue(techSection, "最大报文大小")).toBe("10K");
    expect(getApiDocFieldValue(techSection, "调用模式")).toBe("同步");
  });

  it("generates 技术信息 with HTTP + JSON for HTTP/JSON SMP data", () => {
    const md = buildStructuredMarkdownFromSmp(
      [makeCallItem({ socketWay: "HTTP", messageType: "JSON" })],
      [makeTestItem({ requestUrl: "http://example.com/api" })],
    );

    const techSection = extractApiDocSection(md, "技术信息");
    expect(getApiDocFieldValue(techSection, "通讯方式")).toBe("HTTP");
    expect(getApiDocFieldValue(techSection, "报文类型")).toBe("JSON");
  });

  it("includes 基础信息 with 服务URL and 交易码", () => {
    const md = buildStructuredMarkdownFromSmp(
      [makeCallItem()],
      [makeTestItem({ requestUrl: "32.114.71.6:60030" })],
    );

    const basicSection = extractApiDocSection(md, "基础信息");
    expect(getApiDocFieldValue(basicSection, "服务URL")).toBe(
      "32.114.71.6:60030",
    );
    expect(getApiDocFieldValue(basicSection, "原服务交易码")).toBe(
      "PCBS03901001",
    );
  });

  it("includes 请求报文 and 响应报文 as field tables", () => {
    const md = buildStructuredMarkdownFromSmp(
      [makeCallItem()],
      [makeTestItem()],
    );

    const requestSection = extractApiDocSection(md, "请求报文");
    expect(requestSection).toContain("| 节点路径 | 节点代码 | 是否必填 |");
    expect(requestSection).toContain(
      "| Transaction/Body/request/bizBody/taskId | taskId | N |",
    );
    const responseSection = extractApiDocSection(md, "响应报文");
    expect(responseSection).toContain("bizResCode");
  });

  it("prefers callService node lists over testInfo JSON bodies", () => {
    const md = buildStructuredMarkdownFromSmp(
      [
        makeCallItem({
          socketWay: "TEP",
          messageType: "XML",
          requestHeadList: [
            {
              nodeCode: "transaction_sn",
              nodeUrl: "Transaction/Body/request/bizHeader",
              isNotNull: "Y",
            },
          ],
          requestBodyList: [
            {
              nodeCode: "CUST_ID",
              nodeUrl: "Transaction/Body/request/bizBody",
              isNotNull: "Y",
            },
          ],
          responseBodyList: [
            {
              nodeCode: "FINA_AMT",
              nodeUrl: "Transaction/Body/response/bizBody",
              isNotNull: "N",
            },
          ],
        }),
      ],
      [makeTestItem()],
    );

    const requestSection = extractApiDocSection(md, "请求报文");
    expect(requestSection).toContain(
      "| Transaction/Body/request/bizHeader/transaction_sn | transaction_sn | Y |",
    );
    expect(requestSection).toContain(
      "| Transaction/Body/request/bizBody/CUST_ID | CUST_ID | Y |",
    );
    expect(requestSection).not.toContain("taskId");

    const responseSection = extractApiDocSection(md, "响应报文");
    expect(responseSection).toContain(
      "| Transaction/Body/response/bizBody/FINA_AMT | FINA_AMT | N |",
    );
  });

  it("does NOT emit --- separator row (avoids phantom field)", () => {
    const md = buildStructuredMarkdownFromSmp(
      [makeCallItem()],
      [makeTestItem()],
    );
    const requestSection = extractApiDocSection(md, "请求报文");
    expect(requestSection).not.toContain("| --- |");
    const fields = parseApiDocMessageFields(requestSection);
    expect(fields.some((f) => f.code === "---")).toBe(false);
  });

  it("generated doc passes assessDocReadiness for TEP/XML SMP data", () => {
    const md = buildStructuredMarkdownFromSmp(
      [makeCallItem({ socketWay: "TEP", messageType: "XML" })],
      [makeTestItem()],
    );
    const readiness = assessDocReadiness(md);
    expect(readiness.ok).toBe(true);
    expect(readiness.fieldCount).toBeGreaterThan(0);
    expect(readiness.profile.transport).toBe("tcp");
    expect(readiness.profile.messageFormat).toBe("xml");
  });

  it("assessDocReadiness uses smpData fallback when doc profile is default", () => {
    // 模拟未刷新的旧数据：文档只有字段表、无「技术信息」段
    const legacyDoc = [
      "请求报文",
      "----",
      "| 节点路径 | 节点代码 | 是否必填 |",
      "| Transaction/Body/request/bizBody/custNo | custNo | N |",
      "",
      "基础信息",
      "----",
      "服务URL|32.114.5.56:60000",
    ].join("\n");
    const readiness = assessDocReadiness(legacyDoc, undefined, {
      callServiceList: [{ socketWay: "TEP", messageType: "XML" }],
    });
    expect(readiness.profile.transport).toBe("tcp");
    expect(readiness.profile.messageFormat).toBe("xml");
  });

  it("falls back to raw text when requestBody is XML (not JSON)", () => {
    const xml = "<Transaction><Body>x</Body></Transaction>";
    const md = buildStructuredMarkdownFromSmp(
      [makeCallItem()],
      [makeTestItem({ requestBody: xml })],
    );
    const requestSection = extractApiDocSection(md, "请求报文");
    expect(requestSection).toContain("<Transaction>");
  });

  it("parseApiTechnicalProfile reads Socket + XML from generated doc", () => {
    const md = buildStructuredMarkdownFromSmp(
      [makeCallItem({ socketWay: "TEP", messageType: "XML" })],
      [makeTestItem()],
    );

    const profile = parseApiTechnicalProfile(md);
    expect(profile.transport).toBe("tcp");
    expect(profile.messageFormat).toBe("xml");
    expect(profile.encoding).toBe("UTF-8");
    expect(profile.invocationMode).toBe("同步");
    expect(profile.maxMessageSize).toBe("10K");
  });

  it("parseApiTechnicalProfile reads HTTP + JSON from generated doc", () => {
    const md = buildStructuredMarkdownFromSmp(
      [makeCallItem({ socketWay: "HTTP", messageType: "JSON" })],
      [makeTestItem()],
    );

    const profile = parseApiTechnicalProfile(md);
    expect(profile.transport).toBe("http");
    expect(profile.messageFormat).toBe("json");
  });

  it("falls back to testInfo.requestMessageType when callItem.messageType is empty", () => {
    const md = buildStructuredMarkdownFromSmp(
      [makeCallItem({ messageType: undefined })],
      [makeTestItem({ requestMessageType: "ESB标准XML" })],
    );

    const techSection = extractApiDocSection(md, "技术信息");
    expect(getApiDocFieldValue(techSection, "报文类型")).toBe("XML");
  });

  it("handles empty SMP data gracefully", () => {
    const md = buildStructuredMarkdownFromSmp([], []);
    const techSection = extractApiDocSection(md, "技术信息");
    expect(getApiDocFieldValue(techSection, "通讯方式")).toBe("HTTP");
    expect(getApiDocFieldValue(techSection, "报文类型")).toBe("JSON");
  });
});

describe("buildFieldTableFromSmpNodeLists", () => {
  const requestHead: SmpMessageFieldItem[] = [
    {
      nodeCode: "transaction_sn",
      nodeName: "交易流水号",
      nodeUrl: "Transaction/Body/request/bizHeader",
      isNotNull: "Y",
    },
  ];
  const requestBody: SmpMessageFieldItem[] = [
    {
      nodeCode: "CUST_ID",
      nodeName: "客户号",
      nodeUrl: "Transaction/Body/request/bizBody",
      isNotNull: "Y",
    },
  ];

  it("merges head and body lists into field table", () => {
    const table = buildFieldTableFromSmpNodeLists(requestHead, requestBody)!;
    expect(table).toContain(
      "| Transaction/Body/request/bizHeader/transaction_sn | transaction_sn | Y |",
    );
    expect(table).toContain(
      "| Transaction/Body/request/bizBody/CUST_ID | CUST_ID | Y |",
    );
  });

  it("returns null when both lists are empty", () => {
    expect(buildFieldTableFromSmpNodeLists([], [])).toBeNull();
    expect(buildFieldTableFromSmpNodeLists()).toBeNull();
  });

  it("dedupes identical paths", () => {
    const duplicateHead: SmpMessageFieldItem[] = [
      {
        nodeCode: "transaction_sn",
        nodeUrl: "Transaction/Body/request/bizHeader",
        isNotNull: "Y",
      },
      {
        nodeCode: "transaction_sn",
        nodeUrl: "Transaction/Body/request/bizHeader",
        isNotNull: "N",
      },
    ];
    const table = buildFieldTableFromSmpNodeLists(duplicateHead)!;
    const rows = table.split("\n").filter((line) => line.includes("transaction_sn"));
    expect(rows).toHaveLength(1);
  });

  it("parsed fields pass assessDocReadiness", () => {
    const table = buildFieldTableFromSmpNodeLists(requestHead, requestBody)!;
    const doc = [
      "技术信息",
      "----",
      "通讯方式|Socket",
      "报文类型|XML",
      "",
      "基础信息",
      "----",
      "服务URL|32.114.71.6:60030",
      "",
      "请求报文",
      "----",
      table,
    ].join("\n");
    const readiness = assessDocReadiness(doc);
    expect(readiness.ok).toBe(true);
    expect(readiness.fieldCount).toBe(2);
  });
});

describe("buildFieldTableFromJsonBody", () => {
  it("flattens nested JSON to field rows with / paths", () => {
    const table = buildFieldTableFromJsonBody(NESTED_REQUEST_BODY);
    expect(table).not.toBeNull();
    expect(table).toContain("| 节点路径 | 节点代码 | 是否必填 |");
    expect(table).toContain(
      "| Transaction/Header/sysHeader/msgId | msgId | N |",
    );
    expect(table).toContain(
      "| Transaction/Body/request/bizBody/serviceCode | serviceCode | N |",
    );
  });

  it("field paths group correctly into sysHeader / bizBody", () => {
    const table = buildFieldTableFromJsonBody(NESTED_REQUEST_BODY)!;
    const fields = parseApiDocMessageFields(table);
    const codes = fields.map((f) => f.code);
    expect(codes).toContain("msgId");
    expect(codes).toContain("taskId");
    expect(codes).not.toContain("---");
  });

  it("accepts an already-parsed object", () => {
    const table = buildFieldTableFromJsonBody({ a: { b: "1" } });
    expect(table).toContain("| a/b | b | N |");
  });

  it("descends into first array element as template", () => {
    const table = buildFieldTableFromJsonBody({ list: [{ id: "1" }] });
    expect(table).toContain("| list/id | id | N |");
  });

  it("treats empty array as a leaf", () => {
    const table = buildFieldTableFromJsonBody({ items: [] });
    expect(table).toContain("| items | items | N |");
  });

  it("skips empty objects (no leaf)", () => {
    const table = buildFieldTableFromJsonBody({ bizHeader: {}, x: "1" });
    expect(table).toContain("| x | x | N |");
    expect(table).not.toContain("bizHeader");
  });

  it("returns null for non-JSON string (e.g. XML)", () => {
    expect(buildFieldTableFromJsonBody("<xml/>")).toBeNull();
  });

  it("returns null for empty / nullish input", () => {
    expect(buildFieldTableFromJsonBody("")).toBeNull();
    expect(buildFieldTableFromJsonBody(null)).toBeNull();
    expect(buildFieldTableFromJsonBody(undefined)).toBeNull();
  });

  it("dedupes identical paths", () => {
    const table = buildFieldTableFromJsonBody({
      arr: [{ id: "1" }, { id: "2" }],
    })!;
    const occurrences = table.split("\n").filter((l) => l.includes("arr/id"));
    expect(occurrences).toHaveLength(1);
  });
});
