import {
  extractLongRequestFieldPaths,
  loadLargePayloadBase64,
  parseDeclaredLength,
} from "./api-case-large-payload.util";

describe("large payload asset", () => {
  it("loads the bundled 1MB base64 payload", () => {
    const payload = loadLargePayloadBase64();
    expect(payload.length).toBeGreaterThanOrEqual(1_000_000);
    expect(payload).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });
});

describe("extractLongRequestFieldPaths", () => {
  const markdown = [
    "请求报文",
    "----",
    "节点路径 | 节点代码 | 节点名称 | 节点类型 | 数据类型 | 长度 | 是否必填 | 描述",
    "Transaction/Body/request/bizHeader | transaction_sn | 交易流水号 | 单节点 | VARCHAR2 | 19 | Y | ",
    "Transaction/Body/request/bizBody | CUST_ID | 客户号 | 单节点 | VARCHAR2 | 30 | Y | ",
    "Transaction/Body/request/bizBody | PHOTO_BASE64 | 影像_base64 | 单节点 | CLOB | 200000 | N | ",
    "Transaction/Body/request/bizBody | RANGE_FIELD | 区间字段 | 单节点 | VARCHAR2 | 1-150000 | N | ",
    "",
    "示例报文",
    "----",
    "{}",
  ].join("\n");

  it("returns only fields whose declared length exceeds the threshold", () => {
    expect(extractLongRequestFieldPaths(markdown)).toEqual([
      "Transaction/Body/request/bizBody/PHOTO_BASE64",
      "Transaction/Body/request/bizBody/RANGE_FIELD",
    ]);
  });

  it("respects a custom threshold and deduplicates paths", () => {
    const duplicated = markdown.replace(
      "RANGE_FIELD | 区间字段",
      "PHOTO_BASE64 | 影像_base64",
    );
    expect(extractLongRequestFieldPaths(duplicated, 20)).toEqual([
      "Transaction/Body/request/bizBody/CUST_ID",
      "Transaction/Body/request/bizBody/PHOTO_BASE64",
    ]);
  });

  it("returns empty list when the request table is missing", () => {
    expect(extractLongRequestFieldPaths("基础信息\n----\n服务名称 | x")).toEqual(
      [],
    );
  });
});

describe("parseDeclaredLength", () => {
  it("takes the max number of range cells", () => {
    expect(parseDeclaredLength("1-150000")).toBe(150000);
    expect(parseDeclaredLength("30")).toBe(30);
    expect(parseDeclaredLength("")).toBeNull();
    expect(parseDeclaredLength("-")).toBeNull();
  });
});
