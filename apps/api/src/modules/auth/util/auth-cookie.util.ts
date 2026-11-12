import type { Response } from "express";
import type { LoginResult } from "@auth/service/auth.service";

export function setAuthCookie(
  response: Response,
  options: {
    cookieName: string;
    cookieSecure: boolean;
    login: LoginResult;
  },
) {
  response.cookie(options.cookieName, options.login.token, {
    httpOnly: true,
    secure: options.cookieSecure,
    sameSite: "lax",
    path: "/",
    expires: options.login.cookieExpiresAt,
  });
}

export function clearAuthCookie(
  response: Response,
  options: {
    cookieName: string;
    cookieSecure: boolean;
  },
) {
  response.clearCookie(options.cookieName, {
    httpOnly: true,
    secure: options.cookieSecure,
    sameSite: "lax",
    path: "/",
  });
}
