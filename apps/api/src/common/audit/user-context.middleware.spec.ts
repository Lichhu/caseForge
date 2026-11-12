import { UnauthorizedException } from "@nestjs/common";
import { UserContextMiddleware } from "./user-context.middleware";
import type { AuthService } from "@auth/service/auth.service";

describe("UserContextMiddleware", () => {
  const readSession = jest.fn();
  const authService = { readSession } as unknown as AuthService;
  const middleware = new UserContextMiddleware(authService);

  beforeEach(() => {
    readSession.mockReset();
  });

  function run(
    headers: Record<string, string> = {},
    url = "/api/v1/requirement-platform/requirements",
  ) {
    const next = jest.fn();
    middleware.use(
      { headers, query: {}, url, originalUrl: url } as never,
      {} as never,
      next,
    );
    return next;
  }

  it("rejects requests without an identity", () => {
    readSession.mockImplementation(() => {
      throw new Error("no session");
    });
    const next = run();
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedException));
  });

  it("does not trust a client-supplied username header", () => {
    readSession.mockImplementation(() => {
      throw new Error("no session");
    });
    const next = run({ "x-user-name": "attacker" });

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedException));
    expect(readSession).toHaveBeenCalledWith(undefined);
  });

  it("accepts a valid JWT cookie", () => {
    readSession.mockReturnValue({
      user: { userName: "1471" },
      expiresAt: "2026-11-13T00:00:00.000Z",
    });
    const next = run({ cookie: "caseforge_auth=valid-token" });
    expect(next).toHaveBeenCalledWith();
    expect(readSession).toHaveBeenCalledWith("caseforge_auth=valid-token");
  });

  it("keeps the original actor while running as the impersonated user", () => {
    readSession.mockReturnValue({
      user: { userName: "alice" },
      expiresAt: "2026-11-13T00:00:00.000Z",
      canImpersonate: true,
      impersonatedBy: "system",
    });
    const next = jest.fn(() => {
      const { RequestContext } = jest.requireActual("./request-context");
      expect(RequestContext.getUserName()).toBe("alice");
      expect(RequestContext.getActorUserName()).toBe("system");
    });

    middleware.use(
      {
        headers: { cookie: "caseforge_auth=valid-token" },
        query: {},
        url: "/api/v1/case-forge",
        originalUrl: "/api/v1/case-forge",
      } as never,
      {} as never,
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });

  it("keeps authentication routes public", () => {
    const next = run({}, "/api/v1/auth/sso/callback?ticket=ticket-value");
    expect(next).toHaveBeenCalledWith();
    expect(readSession).not.toHaveBeenCalled();
  });

  it("rewrites user-scoped generation config routes", () => {
    readSession.mockReturnValue({
      user: { userName: "alice" },
      expiresAt: "2026-11-13T00:00:00.000Z",
    });
    const request = {
      headers: {},
      query: {},
      url: "/api/v1/alice/api-generation-config/service-properties",
      originalUrl: "/api/v1/alice/api-generation-config/service-properties",
    };
    const next = jest.fn();
    middleware.use(request as never, {} as never, next);

    expect(request.url).toBe(
      "/api/v1/api-generation-config/service-properties",
    );
    expect(next).toHaveBeenCalledWith();
  });
});
