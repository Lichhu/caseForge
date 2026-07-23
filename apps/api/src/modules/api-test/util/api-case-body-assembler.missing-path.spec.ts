import { assembleBodyFromExample } from "./api-case-body-assembler.util";

describe("assembleBodyFromExample missing paths", () => {
  it("preserves data functions from the XML example against overrides", () => {
    const result = assembleBodyFromExample({
      exampleMessage:
        "<Transaction><Header><msgId>${MSG($.Transaction.Header.clientCd)}</msgId><clientCd>003</clientCd></Header></Transaction>",
      overrides: { "Transaction/Header/msgId": "generated-value" },
      messageFormat: "xml",
      refreshDynamicHeaders: true,
    });
    expect(result.body).toContain(
      "<msgId>${MSG($.Transaction.Header.clientCd)}</msgId>",
    );
  });

  it("preserves data functions from the JSON example against overrides", () => {
    const result = assembleBodyFromExample({
      exampleMessage:
        '{"Transaction":{"Header":{"sysHeader":{"msgId":"${MSG($.Transaction.Header.sysHeader.clientCd)}","clientCd":"003"}}}}',
      overrides: { "Transaction/Header/sysHeader/msgId": "generated-value" },
      messageFormat: "json",
      refreshDynamicHeaders: true,
    });
    expect(result.body).toContain(
      "${MSG($.Transaction.Header.sysHeader.clientCd)}",
    );
  });
  it("creates missing JSON channel path", () => {
    const result = assembleBodyFromExample({
      exampleMessage: '{"Transaction":{}}',
      overrides: {
        "Transaction/Header/sysHeader/clientCd": "520",
        "Transaction/Header/sysHeader/serviceCd": "R001",
      },
      messageFormat: "json",
      createMissingPaths: true,
    });
    expect(JSON.parse(result.body)).toMatchObject({
      Transaction: {
        Header: { sysHeader: { clientCd: "520", serviceCd: "R001" } },
      },
    });
  });

  it("creates missing XML channel nodes", () => {
    const result = assembleBodyFromExample({
      exampleMessage: "<Transaction><Header></Header></Transaction>",
      overrides: { "Transaction/Header/sysHeader/clientCd": "520" },
      messageFormat: "xml",
      createMissingPaths: true,
    });
    expect(result.body).toContain(
      "<sysheader><clientcd>520</clientcd></sysheader>",
    );
  });

  it("updates XML by full path without changing a same-name sibling", () => {
    const result = assembleBodyFromExample({
      exampleMessage:
        "<Transaction><Header><sysHeader><msgId>header</msgId></sysHeader></Header><Body><request><bizHeader><msgId>body</msgId></bizHeader><bizBody><size>10</size><start>1</start></bizBody></request></Body></Transaction>",
      overrides: {
        "Transaction/Body/request/bizHeader/msgId": "new-body",
        "Transaction/Body/request/bizBody/size": "20",
        "Transaction/Body/request/bizBody/start": "10",
      },
      messageFormat: "xml",
    });
    expect(result.body).toContain("<msgId>header</msgId>");
    expect(result.body).toContain("<msgId>new-body</msgId>");
    expect(result.body).toContain("<size>20</size>");
    expect(result.body).toContain("<start>10</start>");
  });

  it("matches XML paths case-insensitively without creating duplicate bizBody", () => {
    const result = assembleBodyFromExample({
      exampleMessage:
        "<Transaction><Body><request><bizBody><CUST_ID>old</CUST_ID></bizBody></request></Body></Transaction>",
      overrides: {
        "transaction/body/request/bizbody/cust_id": "new",
      },
      messageFormat: "xml",
      createMissingPaths: true,
    });

    expect(result.body).toContain("<CUST_ID>new</CUST_ID>");
    expect(result.body.match(/<bizbody>/gi)).toHaveLength(1);
  });

  it("appends missing TEXT key-value fields", () => {
    const result = assembleBodyFromExample({
      exampleMessage: "amount=1",
      overrides: { "Transaction/Header/sysHeader/clientCd": "520" },
      messageFormat: "text",
      createMissingPaths: true,
    });
    expect(result.body).toBe("amount=1\nclientCd=520");
  });
});
