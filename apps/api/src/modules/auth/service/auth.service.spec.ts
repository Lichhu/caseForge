import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { AppConfig } from "@config/app-config.types";
import { AuthService } from "./auth.service";
import { signAuthToken, verifyAuthToken } from "../util/auth-token.util";

const authConfig: AppConfig["auth"] = {
  appId: "764",
  ticketValidateUrl: "http://36.114.30.180:12001/api/ticket/validate",
  jwtSecret: "caseforge-test-secret-at-least-32-bytes",
  jwtIssuer: "caseforge",
  jwtAudience: "caseforge-web",
  sessionDurationMs: 7 * 24 * 60 * 60 * 1000,
  impersonationDurationMs: 8 * 60 * 60 * 1000,
  impersonationAdminUsers: ["system"],
  auditAdminUsers: ["system"],
  auditMaxQueryDays: 31,
  auditMaxExportRows: 100_000,
  auditRetentionDays: 180,
  auditArchiveRetentionDays: 730,
  auditSummaryIntervalMs: 300_000,
  auditPartitionIntervalMs: 21_600_000,
  auditExportDir: ".data/auth-audit-exports",
  auditExportRetentionDays: 7,
  auditExportWarnBytes: 5 * 1024 * 1024 * 1024,
  auditPartitionAheadMonths: 6,
  cookieName: "caseforge_auth",
  cookieSecure: false,
  ticketValidateTimeoutMs: 10_000,
};

const query = {
  ticket: "33114410320260814152508111",
  serverip: "33.114.4.103",
  urlport: "7001",
  socketport: "51005",
  urlpath: "/",
  appid: "764",
};

describe("AuthService", () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const service = new AuthService({
    get: (key: string) => (key === "auth" ? authConfig : undefined),
  } as unknown as ConfigService);

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("posts JSON to the ticket validation endpoint and issues a one-week JWT", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ body: { content: "wb11471" } }),
    });

    const result = await service.loginWithTicket(query);

    expect(fetchMock).toHaveBeenCalledWith(
      authConfig.ticketValidateUrl,
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(query),
      }),
    );
    expect(result.user.userName).toBe("wb11471");
    expect(result.cookieExpiresAt.getTime() - Date.now()).toBeGreaterThan(
      6.99 * 24 * 60 * 60 * 1000,
    );

    const claims = verifyAuthToken({
      token: result.token,
      secret: authConfig.jwtSecret,
      issuer: authConfig.jwtIssuer,
      audience: authConfig.jwtAudience,
    });
    expect(claims.userName).toBe("wb11471");
  });

  it("rejects a callback from a different app id", async () => {
    await expect(
      service.loginWithTicket({ ...query, appid: "999" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a successful response without a username", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await expect(service.loginWithTicket(query)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("issues an impersonation token that preserves the SYSTEM actor", () => {
    const actorToken = verifyAuthToken({
      token: signSystemToken(),
      secret: authConfig.jwtSecret,
      issuer: authConfig.jwtIssuer,
      audience: authConfig.jwtAudience,
    });

    const result = service.issueImpersonationSession(actorToken, "alice");
    const claims = verifyAuthToken({
      token: result.token,
      secret: authConfig.jwtSecret,
      issuer: authConfig.jwtIssuer,
      audience: authConfig.jwtAudience,
    });

    expect(claims.userName).toBe("alice");
    expect(claims.actorUserName).toBe("system");
    expect(claims.actorExpiresAt).toBe(actorToken.exp);
    expect(result.impersonatedBy).toBe("system");
    expect(result.canImpersonate).toBe(true);
  });

  it("restores the SYSTEM account without extending its original expiry", () => {
    const actorToken = verifyAuthToken({
      token: signSystemToken(),
      secret: authConfig.jwtSecret,
      issuer: authConfig.jwtIssuer,
      audience: authConfig.jwtAudience,
    });
    const impersonated = service.issueImpersonationSession(actorToken, "alice");
    const impersonatedClaims = verifyAuthToken({
      token: impersonated.token,
      secret: authConfig.jwtSecret,
      issuer: authConfig.jwtIssuer,
      audience: authConfig.jwtAudience,
    });

    const restored = service.issueRestoredSession(impersonatedClaims);
    const restoredClaims = verifyAuthToken({
      token: restored.token,
      secret: authConfig.jwtSecret,
      issuer: authConfig.jwtIssuer,
      audience: authConfig.jwtAudience,
    });

    expect(restoredClaims.userName).toBe("system");
    expect(restoredClaims.actorUserName).toBeUndefined();
    expect(restoredClaims.exp).toBeLessThanOrEqual(actorToken.exp);
  });
});

function signSystemToken() {
  return signAuthToken({
    userName: "system",
    secret: authConfig.jwtSecret,
    issuer: authConfig.jwtIssuer,
    audience: authConfig.jwtAudience,
    durationMs: authConfig.sessionDurationMs,
  }).token;
}
