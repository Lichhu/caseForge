import type { Request, Response } from "express";
import { AuthController } from "./auth.controller";
import type { AuthService } from "../service/auth.service";

describe("AuthController", () => {
  const authService = {
    cookieName: "caseforge_auth",
    cookieSecure: false,
    loginWithTicket: jest.fn(),
    readSession: jest.fn(),
  };
  const controller = new AuthController(authService as unknown as AuthService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sets an HttpOnly JWT cookie before redirecting to the platform", async () => {
    const expiresAt = new Date("2026-11-13T10:00:00.000Z");
    authService.loginWithTicket.mockResolvedValue({
      token: "signed-token",
      user: { userName: "wb11471" },
      expiresAt: expiresAt.toISOString(),
      cookieExpiresAt: expiresAt,
    });
    const response = {
      cookie: jest.fn(),
      redirect: jest.fn(),
    } as unknown as Response;

    await controller.ssoCallback(
      {
        ticket: "ticket",
        serverip: "33.114.4.103",
        urlport: "7001",
        socketport: "51005",
        urlpath: "/",
        appid: "764",
      },
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
  });

  it("returns the current session from the JWT cookie", () => {
    const session = {
      user: { userName: "wb11471" },
      expiresAt: "2026-11-13T10:00:00.000Z",
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
});
