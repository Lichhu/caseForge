import { randomUUID } from "node:crypto";
import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { RequestContext } from "@common/audit/request-context";

const REQUEST_ID_HEADER = "x-request-id";
const MAX_REQUEST_ID_LENGTH = 128;

/**
 * 为每个请求生成/透传全局请求 ID，写入响应头和异步上下文。
 * 优先使用上游 X-Request-Id，非法值由后端重新生成 UUID。
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = normalizeRequestId(req.headers[REQUEST_ID_HEADER]) ??
      randomUUID();
    (req as Request & { requestId?: string }).requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    RequestContext.run(
      RequestContext.getUserName(),
      () => next(),
      undefined,
      requestId,
    );
  }
}

export function normalizeRequestId(
  value: string | string[] | undefined,
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const requestId = raw?.trim();
  if (
    !requestId ||
    requestId.length > MAX_REQUEST_ID_LENGTH ||
    !/^[A-Za-z0-9._:-]+$/.test(requestId)
  ) {
    return undefined;
  }
  return requestId;
}
