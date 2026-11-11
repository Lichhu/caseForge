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
import { AuthService } from "@auth/service/auth.service";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 接收统一认证平台回调，校验票据后设置 HttpOnly JWT Cookie。 */
  @Get("sso/callback")
  @ApiOperation({ summary: "统一认证回调" })
  async ssoCallback(
    @Query() query: SsoCallbackQueryDto,
    @Res() response: Response,
  ) {
    const login = await this.authService.loginWithTicket(query);
    response.cookie(this.authService.cookieName, login.token, {
      httpOnly: true,
      secure: this.authService.cookieSecure,
      sameSite: "lax",
      path: "/",
      expires: login.cookieExpiresAt,
    });
    return response.redirect(302, "/case-forge");
  }

  /** 查询当前登录用户和本地 JWT 过期时间。 */
  @Get("me")
  @ApiOperation({ summary: "查询当前登录用户" })
  getCurrentUser(@Req() request: Request) {
    return this.authService.readSession(request.headers.cookie);
  }

  /** 清除 CaseForge 本地 JWT Cookie。 */
  @Post("logout")
  @HttpCode(200)
  @ApiOperation({ summary: "退出当前登录" })
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(this.authService.cookieName, {
      httpOnly: true,
      secure: this.authService.cookieSecure,
      sameSite: "lax",
      path: "/",
    });
    return { success: true };
  }
}
