import { BadRequestException } from "@nestjs/common";

/** 基于 (occurred_at, id) 的游标，避免大偏移量 OFFSET。 */
export interface AuthAuditCursor {
  occurredAt: Date;
  id: string;
}

export function encodeAuthAuditCursor(cursor: AuthAuditCursor): string {
  return Buffer.from(
    JSON.stringify({
      t: cursor.occurredAt.toISOString(),
      id: cursor.id,
    }),
    "utf8",
  ).toString("base64url");
}

export function decodeAuthAuditCursor(value: string): AuthAuditCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as { t?: unknown; id?: unknown };
    if (typeof parsed.t !== "string" || typeof parsed.id !== "string") {
      throw new Error("游标字段缺失");
    }
    const occurredAt = new Date(parsed.t);
    if (Number.isNaN(occurredAt.getTime()) || !parsed.id) {
      throw new Error("游标内容无效");
    }
    return { occurredAt, id: parsed.id };
  } catch {
    throw new BadRequestException("分页游标无效，请重新查询");
  }
}
