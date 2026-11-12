import { BadRequestException } from "@nestjs/common";
import {
  decodeAuthAuditCursor,
  encodeAuthAuditCursor,
} from "./auth-audit-cursor.util";

describe("auth-audit-cursor.util", () => {
  it("round-trips occurredAt and id", () => {
    const occurredAt = new Date("2026-11-12T10:20:30.456Z");
    const encoded = encodeAuthAuditCursor({
      occurredAt,
      id: "0b3f8d10-14f0-4c5a-9f5e-4b1a8f2d3c11",
    });

    expect(decodeAuthAuditCursor(encoded)).toEqual({
      occurredAt,
      id: "0b3f8d10-14f0-4c5a-9f5e-4b1a8f2d3c11",
    });
  });

  it("rejects malformed cursors", () => {
    expect(() => decodeAuthAuditCursor("not-a-cursor")).toThrow(
      BadRequestException,
    );
  });
});
