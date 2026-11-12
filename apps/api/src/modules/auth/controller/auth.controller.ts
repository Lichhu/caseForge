import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { SsoCallbackQueryDto } from "@auth/dto/sso-callback-query.dto";
import {
  AuthService,
  getAuthFailureCode,
  type AuthSessionContext,
  type LoginResult,
} from "@auth/service/auth.service";
import { AuthAuditService } from "@auth/service/auth-audit.service";
import { clearAuthCookie, setAuthCookie } from "@auth/util/auth-cookie.util";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuthAuditService,
  ) {}

  /** 接收统一认证平台回调，校验票据后设置 HttpOnly JWT Cookie。 */
  @Get("sso/callback")
  @ApiOperation({ summary: "统一认证回调" })
  async ssoCallback(
    @Query() query: SsoCallbackQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    let login: LoginResult;
    try {
      login = await this.authService.loginWithTicket(query);
    } catch (error) {
      await this.auditService.record({
        eventType: "login_failure",
        clientIp: getClientIp(request),
        sourceApp: "sso",
        userAgent: getUserAgent(request),
        failureCode: getAuthFailureCode(error),
        reason: errorMessage(error).slice(0, 200),
        metadata: { appId: query.appid },
      });
      throw error;
    }

    await this.auditService.record({
      eventType: "login_success",
      userName: login.user.userName,
      actorUserName: login.user.userName,
      sessionId: login.sessionId,
      clientIp: getClientIp(request),
      sourceApp: "sso",
      userAgent: getUserAgent(request),
      metadata: { appId: query.appid },
    });
    setAuthCookie(response, {
      cookieName: this.authService.cookieName,
      cookieSecure: this.authService.cookieSecure,
      login,
    });
    return response.redirect(302, "/case-forge");
  }

  /** 查询当前登录用户和本地 JWT 过期时间。 */
  @Get("me")
  @ApiOperation({ summary: "查询当前登录用户" })
  getCurrentUser(@Req() request: Request) {
    return this.authService.readSession(request.headers.cookie);
  }

  /** 清除 CaseForge 本地 JWT Cookie，并记录退出审计。 */
  @Post("logout")
  @HttpCode(200)
  @ApiOperation({ summary: "退出当前登录" })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    let context: AuthSessionContext | undefined;
    try {
      context = this.authService.readSessionContext(request.headers.cookie);
    } catch {
      context = undefined;
    }

    if (context) {
      await this.auditService.record({
        eventType: "logout",
        userName: context.session.user.userName,
        actorUserName:
          context.session.impersonatedBy ?? context.session.user.userName,
        sessionId: context.claims.jti ?? null,
        clientIp: getClientIp(request),
        sourceApp: context.session.impersonatedBy ? "impersonation" : "local-jwt",
        userAgent: getUserAgent(request),
      });
    }

    clearAuthCookie(response, {
      cookieName: this.authService.cookieName,
      cookieSecure: this.authService.cookieSecure,
    });
    return { success: true };
  }
}

/** 优先使用代理链首个地址，与访问日志保持一致。 */
export function getClientIp(request: Request) {
  return (
    request.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    request.socket.remoteAddress ||
    "-"
  );
}

function getUserAgent(request: Request) {
  return request.headers["user-agent"]?.toString() ?? null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
