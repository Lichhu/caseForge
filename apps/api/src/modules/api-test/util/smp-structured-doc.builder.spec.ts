import {
  buildStructuredMarkdownFromSmp,
  buildFieldTableFromJsonBody,
  buildFieldTableFromSmpNodeLists,
} from "./smp-structured-doc.builder";
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
    serviceAttribute: "查询类",
    descript: "测试功能描述",
    businessRule: "测试业务规则",
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

describe("buildStructuredMarkdownFromSmp", () => {
  it("no longer writes 技术信息; profile falls back to smpData", () => {
    const callList = [makeCallItem({ socketWay: "TEP", messageType: "XML" })];
    const testList = [makeTestItem()];
    const md = buildStructuredMarkdownFromSmp(callList, testList);

    expect(extractApiDocSection(md, "技术信息")).toBe("");
    const readiness = assessDocReadiness(md, "tcp://33.114.5.56:60000", {
      callServiceList: callList,
      serviceTestList: testList,
    });
    expect(readiness.ok).toBe(true);
    expect(readiness.profile.transport).toBe("tcp");
    expect(readiness.profile.messageFormat).toBe("xml");
  });

  it("uses SMP requestBody as 示例报文", () => {
    const md = buildStructuredMarkdownFromSmp(
      [makeCallItem()],
      [makeTestItem()],
    );

    expect(extractApiDocSection(md, "示例报文")).toBe(NESTED_REQUEST_BODY);
  });

  it("keeps 示例报文 section (empty) when requestBody missing", () => {
    const md = buildStructuredMarkdownFromSmp([makeCallItem()], [{}]);
    expect(md).toContain("示例报文\n----");
    expect(extractApiDocSection(md, "示例报文")).toBe("");
  });

  it("keeps user-provided 示例报文 when SMP has no requestBody", () => {
    const md = buildStructuredMarkdownFromSmp([makeCallItem()], [{}], {
      existingExampleMessage: '{"user":"pasted"}',
    });
    expect(extractApiDocSection(md, "示例报文")).toBe('{"user":"pasted"}');
  });

  it("existing 示例报文 is not overwritten by SMP requestBody", () => {
    const md = buildStructuredMarkdownFromSmp(
      [makeCallItem()],
      [makeTestItem()],
      { existingExampleMessage: '{"user":"pasted"}' },
    );
    expect(extractApiDocSection(md, "示例报文")).toBe('{"user":"pasted"}');
  });

  it("includes 基础信息 / 服务信息 with fixed keys", () => {
    const md = buildStructuredMarkdownFromSmp(
      [makeCallItem()],
      [makeTestItem()],
    );

    const basicSection = extractApiDocSection(md, "基础信息");
    expect(getApiDocFieldValue(basicSection, "服务编码")).toBe("R53000080828");
    expect(getApiDocFieldValue(basicSection, "原服务交易码")).toBe(
      "PCBS03901001",
    );
    expect(getApiDocFieldValue(basicSection, "服务名称")).toBe("测试服务");
    expect(getApiDocFieldValue(basicSection, "服务属性")).toBe("查询类");

    const serviceSection = extractApiDocSection(md, "服务信息");
    expect(getApiDocFieldValue(serviceSection, "功能描述")).toBe(
      "测试功能描述",
    );
    expect(getApiDocFieldValue(serviceSection, "业务规则")).toBe(
      "测试业务规则",
    );
    expect(getApiDocFieldValue(serviceSection, "服务名称")).toBe("测试服务");
    expect(getApiDocFieldValue(serviceSection, "服务属性")).toBe("查询类");
  });

  it("keeps blank rows for missing 基础信息 / 服务信息 values", () => {
    const md = buildStructuredMarkdownFromSmp([{}], []);

    const basicSection = extractApiDocSection(md, "基础信息");
    expect(getApiDocFieldValue(basicSection, "服务编码")).toBe("");
    expect(getApiDocFieldValue(basicSection, "原服务交易码")).toBe("");
    expect(getApiDocFieldValue(basicSection, "服务名称")).toBe("");
    expect(getApiDocFieldValue(basicSection, "服务属性")).toBe("");

    const serviceSection = extractApiDocSection(md, "服务信息");
    expect(getApiDocFieldValue(serviceSection, "功能描述")).toBe("");
    expect(getApiDocFieldValue(serviceSection, "业务规则")).toBe("");
  });

  it("includes 请求报文 as JSON fallback table without 响应报文 section", () => {
    const md = buildStructuredMarkdownFromSmp(
      [makeCallItem()],
      [makeTestItem()],
    );

    const requestSection = extractApiDocSection(md, "请求报文");
    expect(requestSection).toContain("| 节点代码 | 是否必填 |");
    expect(requestSection).not.toContain("节点路径");
    expect(requestSection).toContain("| taskId | N |");
    expect(extractApiDocSection(md, "响应报文")).toBe("");
    expect(md).not.toContain("响应报文\n----");
  });

  it("merges head + body node lists into 7-column field table without 节点路径", () => {
    const md = buildStructuredMarkdownFromSmp(
      [
        makeCallItem({
          socketWay: "TEP",
          messageType: "XML",
          requestHeadList: [
            {
              nodeCode: "transaction_sn",
              nodeName: "交易流水号",
              nodeType: "单节点",
              dataType: "VARCHAR2",
              dataLength: "19",
              nodeUrl: "Transaction/Body/request/bizHeader",
              isNotNull: "Y",
              descBind: "交易序列号，可同msgId",
            },
          ],
          requestBodyList: [
            {
              nodeCode: "CUST_ID",
              nodeName: "客户号",
              dataType: "VARCHAR2",
              dataLength: "30",
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
      "| 节点代码 | 节点名称 | 节点类型 | 数据类型 | 长度 | 是否必填 | 描述 |",
    );
    expect(requestSection).toContain(
      "| transaction_sn | 交易流水号 | 单节点 | VARCHAR2 | 19 | Y | 交易序列号，可同msgId |",
    );
    expect(requestSection).toContain(
      "| CUST_ID | 客户号 |  | VARCHAR2 | 30 | Y |  |",
    );
    expect(requestSection).not.toContain("节点路径");
    expect(requestSection).not.toContain("taskId");
    expect(extractApiDocSection(md, "响应报文")).toBe("");
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
    const callList = [makeCallItem({ socketWay: "TEP", messageType: "XML" })];
    const testList = [makeTestItem()];
    const md = buildStructuredMarkdownFromSmp(callList, testList);
    const readiness = assessDocReadiness(
      md,
      "tcp://33.114.5.56:60000",
      { callServiceList: callList, serviceTestList: testList },
    );
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
      "| 节点代码 | 是否必填 |",
      "| custNo | N |",
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

  it("handles empty SMP data gracefully", () => {
    const md = buildStructuredMarkdownFromSmp([], []);
    expect(extractApiDocSection(md, "技术信息")).toBe("");
    expect(extractApiDocSection(md, "基础信息")).toContain("服务编码 |");
    expect(extractApiDocSection(md, "服务信息")).toContain("功能描述 |");
    expect(md).toContain("示例报文\n----");
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

  it("merges head and body lists into 7-column field table", () => {
    const table = buildFieldTableFromSmpNodeLists(requestHead, requestBody)!;
    expect(table).toContain(
      "| 节点代码 | 节点名称 | 节点类型 | 数据类型 | 长度 | 是否必填 | 描述 |",
    );
    expect(table).toContain(
      "| transaction_sn | 交易流水号 |  |  |  | Y |  |",
    );
    expect(table).toContain("| CUST_ID | 客户号 |  |  |  | Y |  |");
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
    const rows = table
      .split("\n")
      .filter((line) => line.includes("transaction_sn"));
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
  it("flattens nested JSON to leaf code rows", () => {
    const table = buildFieldTableFromJsonBody(NESTED_REQUEST_BODY);
    expect(table).not.toBeNull();
    expect(table).toContain("| 节点代码 | 是否必填 |");
    expect(table).toContain("| msgId | N |");
    expect(table).toContain("| serviceCode | N |");
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
    expect(table).toContain("| b | N |");
  });

  it("descends into first array element as template", () => {
    const table = buildFieldTableFromJsonBody({ list: [{ id: "1" }] });
    expect(table).toContain("| id | N |");
  });

  it("treats empty array as a leaf", () => {
    const table = buildFieldTableFromJsonBody({ items: [] });
    expect(table).toContain("| items | N |");
  });

  it("skips empty objects (no leaf)", () => {
    const table = buildFieldTableFromJsonBody({ bizHeader: {}, x: "1" });
    expect(table).toContain("| x | N |");
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

  it("dedupes identical leaf codes", () => {
    const table = buildFieldTableFromJsonBody({
      arr: [{ id: "1" }, { id: "2" }],
    })!;
    const occurrences = table.split("\n").filter((l) => l.includes("| id |"));
    expect(occurrences).toHaveLength(1);
  });
});
