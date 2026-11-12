import type { NextFunction, Request, Response } from "express";
import { RequestContext } from "@common/audit/request-context";
import {
  normalizeRequestId,
  RequestIdMiddleware,
} from "./request-id.middleware";

describe("RequestIdMiddleware", () => {
  const middleware = new RequestIdMiddleware();

  it("accepts safe upstream request ids", () => {
    expect(normalizeRequestId("trace-123_abc.def:1")).toBe(
      "trace-123_abc.def:1",
    );
    expect(normalizeRequestId(["first-id", "second-id"])).toBe("first-id");
  });

  it("rejects unsafe or oversized request ids", () => {
    expect(normalizeRequestId(undefined)).toBeUndefined();
    expect(normalizeRequestId("has space")).toBeUndefined();
    expect(normalizeRequestId("x".repeat(129))).toBeUndefined();
  });

  it("writes the request id to the response header and async context", () => {
    const setHeader = jest.fn();
    const request = {
      headers: { "x-request-id": "upstream-trace-1" },
    } as unknown as Request;
    const response = { setHeader } as unknown as Response;
    const next = jest.fn(() => {
      expect(RequestContext.getRequestId()).toBe("upstream-trace-1");
    }) as unknown as NextFunction;

    middleware.use(request, response, next);

    expect(setHeader).toHaveBeenCalledWith("X-Request-Id", "upstream-trace-1");
    expect(next).toHaveBeenCalled();
    expect(RequestContext.getRequestId()).toBeUndefined();
  });

  it("generates a UUID when the upstream header is missing", () => {
    const setHeader = jest.fn();
    const request = { headers: {} } as unknown as Request;
    const response = { setHeader } as unknown as Response;
    const next = jest.fn() as unknown as NextFunction;

    middleware.use(request, response, next);

    const generated = setHeader.mock.calls[0][1] as string;
    expect(generated).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
