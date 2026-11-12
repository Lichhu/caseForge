import {
  Body,
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
import type { AuthSession } from "@case-forge/shared";
import {
  ImpersonationTargetDto,
  ImpersonationUserQueryDto,
} from "@auth/dto/impersonation-target.dto";
import { AuthService } from "@auth/service/auth.service";
import { ImpersonationService } from "@auth/service/impersonation.service";
import { setAuthCookie } from "@auth/util/auth-cookie.util";

@ApiTags("auth")
@Controller("auth/impersonation")
export class ImpersonationController {
  constructor(
    private readonly authService: AuthService,
    private readonly impersonationService: ImpersonationService,
  ) {}

  @Get("users")
  @ApiOperation({ summary: "SYSTEM 账号搜索可切换用户" })
  listUsers(
    @Req() request: Request,
    @Query() query: ImpersonationUserQueryDto,
  ) {
    return this.impersonationService.listUsers(
      request.headers.cookie,
      query.keyword,
    );
  }

  @Post("switch")
  @HttpCode(200)
  @ApiOperation({ summary: "SYSTEM 账号切换为指定用户" })
  async switchUser(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: ImpersonationTargetDto,
  ): Promise<AuthSession> {
    const login = await this.impersonationService.switchUser(
      request.headers.cookie,
      dto,
      getClientIp(request),
      getUserAgent(request),
    );
    setAuthCookie(response, {
      cookieName: this.authService.cookieName,
      cookieSecure: this.authService.cookieSecure,
      login,
    });
    return toPublicSession(login);
  }

  @Post("exit")
  @HttpCode(200)
  @ApiOperation({ summary: "退出代登录并恢复 SYSTEM 账号" })
  async exitImpersonation(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSession> {
    const login = await this.impersonationService.exitImpersonation(
      request.headers.cookie,
      getClientIp(request),
      getUserAgent(request),
    );
    setAuthCookie(response, {
      cookieName: this.authService.cookieName,
      cookieSecure: this.authService.cookieSecure,
      login,
    });
    return toPublicSession(login);
  }
}

function toPublicSession(login: AuthSession): AuthSession {
  return {
    user: login.user,
    expiresAt: login.expiresAt,
    canImpersonate: login.canImpersonate,
    ...(login.impersonatedBy
      ? {
          impersonatedBy: login.impersonatedBy,
          impersonationStartedAt: login.impersonationStartedAt,
        }
      : {}),
  };
}

function getClientIp(request: Request) {
  return (
    request.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    request.socket.remoteAddress ||
    "-"
  );
}

function getUserAgent(request: Request) {
  return request.headers["user-agent"]?.toString() ?? null;
}
