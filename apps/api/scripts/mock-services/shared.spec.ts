import {
  decodeText,
  encodeText,
  framePayload,
  matchFixture,
  type LoadedFixture,
} from "./shared";

function fixture(
  name: string,
  match: LoadedFixture["fixture"]["match"],
  body: string,
): LoadedFixture {
  return {
    file: `${name}.json`,
    fixture: { name, match, response: { body } },
  };
}

describe("mock-services shared", () => {
  it("matches the first fixture in file order", () => {
    const fixtures = [
      fixture("error", { bodyIncludes: "CIC024" }, "error"),
      fixture("success", { method: "POST", path: "/txn/demo" }, "success"),
    ];

    expect(
      matchFixture(fixtures, {
        method: "POST",
        path: "/txn/demo",
        body: "<request>CIC024</request>",
      }).hit?.fixture.name,
    ).toBe("error");
    expect(
      matchFixture(fixtures, {
        method: "POST",
        path: "/txn/demo",
        body: "<request>000000</request>",
      }).hit?.fixture.name,
    ).toBe("success");
  });

  it("does not match when a condition is absent", () => {
    const fixtures = [
      fixture("success", { method: "POST", path: "/txn/demo" }, "ok"),
    ];

    expect(
      matchFixture(fixtures, { method: "GET", path: "/txn/demo", body: "" })
        .hit,
    ).toBeUndefined();
  });

  it("prefixes payload length with the configured width", () => {
    expect(framePayload(Buffer.from("hello"), 4).toString("latin1")).toBe(
      "0005hello",
    );
  });

  it("round-trips GBK text", () => {
    const encoded = encodeText("交易成功", "GBK");
    expect(decodeText(encoded, "GBK")).toBe("交易成功");
  });
});
