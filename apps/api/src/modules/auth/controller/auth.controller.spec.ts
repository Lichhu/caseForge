import type { Request, Response } from "express";
import { AuthController } from "./auth.controller";
import type { AuthService } from "../service/auth.service";
import type { AuthAuditService } from "../service/auth-audit.service";

describe("AuthController", () => {
  const authService = {
    cookieName: "caseforge_auth",
    cookieSecure: false,
    loginWithTicket: jest.fn(),
    readSession: jest.fn(),
    readSessionContext: jest.fn(),
  };
  const auditService = {
    record: jest.fn(),
  };
  const controller = new AuthController(
    authService as unknown as AuthService,
    auditService as unknown as AuthAuditService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    auditService.record.mockResolvedValue(undefined);
  });

  it("sets an HttpOnly JWT cookie before redirecting to the platform", async () => {
    const expiresAt = new Date("2026-11-13T10:00:00.000Z");
    authService.loginWithTicket.mockResolvedValue({
      token: "signed-token",
      sessionId: "a5f5d2a0-4f4e-4c31-9c1c-0b1d1c7f3a11",
      user: { userName: "wb11471" },
      expiresAt: expiresAt.toISOString(),
      canImpersonate: false,
      canAudit: false,
      cookieExpiresAt: expiresAt,
    });
    const response = {
      cookie: jest.fn(),
      redirect: jest.fn(),
    } as unknown as Response;
    const request = {
      headers: { "user-agent": "jest" },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as Request;

    await controller.ssoCallback(
      {
        ticket: "ticket",
        serverip: "33.114.4.103",
        urlport: "7001",
        socketport: "51005",
        urlpath: "/",
        appid: "764",
      },
      request,
      response,
    );

    expect(response.cookie).toHaveBeenCalledWith(
      "caseforge_auth",
      "signed-token",
      {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      },
    );
    expect(response.redirect).toHaveBeenCalledWith(302, "/case-forge");
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "login_success",
        userName: "wb11471",
        sessionId: "a5f5d2a0-4f4e-4c31-9c1c-0b1d1c7f3a11",
      }),
    );
  });

  it("records a login failure with a stable code", async () => {
    const failure = Object.assign(new Error("票据无效"), {
      failureCode: "ticket_invalid",
    });
    authService.loginWithTicket.mockRejectedValue(failure);
    const response = {
      cookie: jest.fn(),
      redirect: jest.fn(),
    } as unknown as Response;
    const request = {
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as Request;

    await expect(
      controller.ssoCallback(
        {
          ticket: "ticket",
          serverip: "33.114.4.103",
          urlport: "7001",
          socketport: "51005",
          urlpath: "/",
          appid: "764",
        },
        request,
        response,
      ),
    ).rejects.toBe(failure);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "login_failure",
        failureCode: "ticket_invalid",
      }),
    );
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it("returns the current session from the JWT cookie", () => {
    const session = {
      user: { userName: "wb11471" },
      expiresAt: "2026-11-13T10:00:00.000Z",
      canImpersonate: false,
    };
    authService.readSession.mockReturnValue(session);
    const request = {
      headers: { cookie: "caseforge_auth=signed-token" },
    } as unknown as Request;

    expect(controller.getCurrentUser(request)).toEqual(session);
    expect(authService.readSession).toHaveBeenCalledWith(
      "caseforge_auth=signed-token",
    );
  });

  it("records logout before clearing the cookie", async () => {
    authService.readSessionContext.mockReturnValue({
      session: {
        user: { userName: "alice" },
        expiresAt: "2026-11-13T10:00:00.000Z",
        canImpersonate: false,
      },
      claims: { jti: "session-1", userName: "alice" },
    });
    const response = {
      clearCookie: jest.fn(),
    } as unknown as Response;
    const request = {
      headers: { cookie: "caseforge_auth=signed-token" },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as Request;

    await controller.logout(request, response);

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "logout",
        userName: "alice",
        sessionId: "session-1",
      }),
    );
    expect(response.clearCookie).toHaveBeenCalled();
  });
});
