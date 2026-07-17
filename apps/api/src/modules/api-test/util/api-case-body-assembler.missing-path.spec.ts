import { assembleBodyFromExample } from "./api-case-body-assembler.util";

describe("assembleBodyFromExample missing paths", () => {
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
