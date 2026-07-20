import { assembleBodyFromExample } from "./api-case-body-assembler.util";

describe("assembleBodyFromExample missing paths", () => {
  it("preserves data functions from the XML example against overrides", () => {
    const result = assembleBodyFromExample({
      exampleMessage: "<Transaction><Header><msgId>${MSG($.Transaction.Header.clientCd)}</msgId><clientCd>003</clientCd></Header></Transaction>",
      overrides: { "Transaction/Header/msgId": "generated-value" },
      messageFormat: "xml",
      refreshDynamicHeaders: true,
    });
    expect(result.body).toContain("<msgId>${MSG($.Transaction.Header.clientCd)}</msgId>");
  });

  it("preserves data functions from the JSON example against overrides", () => {
    const result = assembleBodyFromExample({
      exampleMessage: '{"Transaction":{"Header":{"sysHeader":{"msgId":"${MSG($.Transaction.Header.sysHeader.clientCd)}","clientCd":"003"}}}}',
      overrides: { "Transaction/Header/sysHeader/msgId": "generated-value" },
      messageFormat: "json",
      refreshDynamicHeaders: true,
    });
    expect(result.body).toContain("${MSG($.Transaction.Header.sysHeader.clientCd)}");
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
      "<sysHeader><clientCd>520</clientCd></sysHeader>",
    );
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
