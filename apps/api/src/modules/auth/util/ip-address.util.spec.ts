import { bufferToIp, ipToBuffer, normalizeIp } from "./ip-address.util";

describe("ip-address.util", () => {
  it("round-trips IPv4 addresses through VARBINARY(16)", () => {
    const buffer = ipToBuffer("192.168.1.10");
    expect(buffer).toEqual(Buffer.from([192, 168, 1, 10]));
    expect(bufferToIp(buffer)).toBe("192.168.1.10");
  });

  it("round-trips IPv6 addresses through VARBINARY(16)", () => {
    const buffer = ipToBuffer("2001:db8::1");
    expect(buffer).toHaveLength(16);
    expect(bufferToIp(buffer)).toBe("2001:db8::1");
  });

  it("normalizes bracketed IPv6 input and rejects invalid values", () => {
    expect(normalizeIp("[2001:DB8::1]")).toBe("2001:db8::1");
    expect(normalizeIp("999.1.1.1")).toBeNull();
    expect(ipToBuffer("not-an-ip")).toBeNull();
  });

  it("formats IPv4-mapped IPv6 addresses readably", () => {
    const buffer = ipToBuffer("::ffff:10.0.0.8");
    expect(bufferToIp(buffer)).toBe("::ffff:10.0.0.8");
  });
});
