import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Repository } from "typeorm";
import type { TestPlatformSysUserEntity } from "@common/test-platform/entity/test-platform-sys-user.entity";
import type {
  AuthService,
  AuthSessionContext,
  LoginResult,
} from "./auth.service";
import type { AuthTokenClaims } from "../util/auth-token.util";
import type { AuthAuditService } from "./auth-audit.service";
import { ImpersonationService } from "./impersonation.service";

describe("ImpersonationService", () => {
  const readSessionContext = jest.fn<
    AuthSessionContext,
    [string | undefined]
  >();
  const issueImpersonationSession = jest.fn<
    LoginResult,
    [AuthTokenClaims, string]
  >();
  const issueRestoredSession = jest.fn<LoginResult, [AuthTokenClaims]>();
  const findOne = jest.fn();
  const getMany = jest.fn();
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany,
  };
  const createQueryBuilder = jest.fn(() => queryBuilder);
  const authService = {
    readSessionContext,
    issueImpersonationSession,
    issueRestoredSession,
    isImpersonationAdmin: (userName: string) => userName === "system",
  } as unknown as AuthService;
  const repo = {
    findOne,
    createQueryBuilder,
  } as unknown as Repository<TestPlatformSysUserEntity>;
  const recordStrict = jest.fn();
  const auditService = {
    recordStrict,
  } as unknown as AuthAuditService;
  const service = new ImpersonationService(authService, auditService, repo);

  beforeEach(() => {
    jest.clearAllMocks();
    recordStrict.mockResolvedValue(undefined);
  });

  it("rejects account switching for a non-admin actor", async () => {
    readSessionContext.mockReturnValue(
      sessionContext({
        userName: "alice",
      }),
    );

    await expect(
      service.switchUser(undefined, { userName: "bob" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findOne).not.toHaveBeenCalled();
  });

  it("rejects a missing or disabled target account", async () => {
    readSessionContext.mockReturnValue(sessionContext({ userName: "system" }));
    findOne.mockResolvedValue(null);

    await expect(
      service.switchUser(undefined, { userName: "alice" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lists active users but excludes other account-switch admins", async () => {
    readSessionContext.mockReturnValue(sessionContext({ userName: "system" }));
    getMany.mockResolvedValue([
      { userName: "system", nickName: "System" },
      { userName: "alice", nickName: "Alice" },
    ]);

    await expect(service.listUsers(undefined, "li")).resolves.toEqual([
      { userName: "alice", nickName: "Alice" },
    ]);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      "(user.userName LIKE :keyword OR user.nickName LIKE :keyword)",
      { keyword: "%li%" },
    );
  });

  it("switches to an active target while preserving SYSTEM as actor", async () => {
    const context = sessionContext({ userName: "system" });
    readSessionContext.mockReturnValue(context);
    findOne.mockResolvedValue({
      userName: "alice",
      nickName: "Alice",
      status: "0",
      delFlag: "0",
    });
    issueImpersonationSession.mockReturnValue(loginResult("alice", "system"));

    const result = await service.switchUser(
      undefined,
      { userName: "alice", reason: "排查问题" },
      "127.0.0.1",
    );

    expect(issueImpersonationSession).toHaveBeenCalledWith(
      context.claims,
      "alice",
    );
    expect(result.impersonatedBy).toBe("system");
    expect(recordStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "impersonation_start",
        actorUserName: "system",
        userName: "alice",
        reason: "排查问题",
      }),
    );
  });

  it("rejects exit when the current session is not impersonated", async () => {
    readSessionContext.mockReturnValue(sessionContext({ userName: "system" }));

    await expect(service.exitImpersonation(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("restores the original actor when exiting impersonation", async () => {
    const context = sessionContext({
      userName: "alice",
      actorUserName: "system",
      actorExpiresAt: 2_000_000_000,
      impersonationStartedAt: 1_999_999_000,
    });
    readSessionContext.mockReturnValue(context);
    issueRestoredSession.mockReturnValue(loginResult("system"));

    const result = await service.exitImpersonation(undefined);

    expect(issueRestoredSession).toHaveBeenCalledWith(context.claims);
    expect(result.user.userName).toBe("system");
    expect(recordStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "impersonation_exit",
        actorUserName: "system",
        userName: "alice",
      }),
    );
  });

  it("blocks account switching when the audit write fails", async () => {
    const context = sessionContext({ userName: "system" });
    readSessionContext.mockReturnValue(context);
    findOne.mockResolvedValue({
      userName: "alice",
      nickName: "Alice",
      status: "0",
      delFlag: "0",
    });
    issueImpersonationSession.mockReturnValue(loginResult("alice", "system"));
    recordStrict.mockRejectedValue(new Error("audit unavailable"));

    await expect(
      service.switchUser(undefined, { userName: "alice" }),
    ).rejects.toThrow("audit unavailable");
  });
});

function sessionContext(
  claims: Partial<AuthSessionContext["claims"]>,
): AuthSessionContext {
  const userName = claims.userName ?? "system";
  return {
    claims: {
      iss: "caseforge",
      aud: "caseforge-web",
      iat: 1_999_999_000,
      exp: 2_000_000_000,
      ...claims,
      sub: userName,
      userName,
    },
    session: {
      user: { userName },
      expiresAt: new Date(2_000_000_000 * 1000).toISOString(),
      canImpersonate: true,
      ...(claims.actorUserName ? { impersonatedBy: claims.actorUserName } : {}),
    },
  };
}

function loginResult(userName: string, impersonatedBy?: string): LoginResult {
  return {
    token: "signed-token",
    sessionId: "session-1",
    user: { userName },
    expiresAt: new Date(2_000_000_000 * 1000).toISOString(),
    canImpersonate: true,
    ...(impersonatedBy
      ? {
          impersonatedBy,
          impersonationStartedAt: new Date(1_999_999_000 * 1000).toISOString(),
        }
      : {}),
    cookieExpiresAt: new Date(2_000_000_000 * 1000),
  };
}
