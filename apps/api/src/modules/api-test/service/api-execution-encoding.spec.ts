import {
  buildEncodedHttpBody,
  encodeQueryComponent,
} from "./api-execution.service";

describe("HTTP transport encoding", () => {
  it("encodes request bodies and query values using the selected charset", () => {
    expect(
      Buffer.from(
        buildEncodedHttpBody({ method: "POST", body: "中" }, "UTF-8")!,
      ),
    ).toEqual(Buffer.from([0xe4, 0xb8, 0xad]));
    expect(
      Buffer.from(buildEncodedHttpBody({ method: "POST", body: "中" }, "GBK")!),
    ).toEqual(Buffer.from([0xd6, 0xd0]));
    expect(encodeQueryComponent("中", "UTF-8")).toBe("%E4%B8%AD");
    expect(encodeQueryComponent("中", "GBK")).toBe("%D6%D0");
  });
});
