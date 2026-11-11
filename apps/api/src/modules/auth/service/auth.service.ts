import {
  BadGatewayException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { getAppConfig } from "@config/app-config.util";
import type { AppConfig } from "@config/app-config.types";
import type { AuthSession } from "@case-forge/shared";
import { SsoCallbackQueryDto } from "@auth/dto/sso-callback-query.dto";
import {
  readCookie,
  signAuthToken,
  verifyAuthToken,
} from "@auth/util/auth-token.util";

export interface LoginResult extends AuthSession {
  token: string;
  cookieExpiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly authConfig: AppConfig["auth"];

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.authConfig = getAppConfig(configService).auth;
  }

  get cookieName() {
    return this.authConfig.cookieName;
  }

  get cookieSecure() {
    return this.authConfig.cookieSecure;
  }

  /** 使用统一认证票据换取用户名，并签发本地 JWT。 */
  async loginWithTicket(query: SsoCallbackQueryDto): Promise<LoginResult> {
    this.assertConfigured();
    if (query.appid !== this.authConfig.appId) {
      throw new ForbiddenException("统一认证应用标识不匹配");
    }

    let response: Response;
    try {
      response = await fetch(this.authConfig.ticketValidateUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          ticket: query.ticket,
          serverip: query.serverip,
          urlport: query.urlport,
          socketport: query.socketport,
          urlpath: query.urlpath,
          appid: query.appid,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(this.authConfig.ticketValidateTimeoutMs),
      });
    } catch (error) {
      this.logger.warn(
        `统一认证票据校验请求失败: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      throw new BadGatewayException("统一认证校验服务暂不可用");
    }

    if (!response.ok) {
      this.logger.warn(`统一认证票据校验返回 HTTP ${response.status}`);
      throw new UnauthorizedException("统一认证票据无效或已过期");
    }

    const data = await this.readValidateResponse(response);
    const userName =
      typeof data?.body?.content === "string" ? data?.body?.content.trim() : "";
    if (!isValidUserName(userName)) {
      throw new UnauthorizedException("统一认证未返回有效用户信息");
    }

    const signed = signAuthToken({
      userName,
      secret: this.authConfig.jwtSecret,
      issuer: this.authConfig.jwtIssuer,
      audience: this.authConfig.jwtAudience,
      durationMs: this.authConfig.sessionDurationMs,
    });
    return {
      token: signed.token,
      user: { userName },
      expiresAt: signed.expiresAt.toISOString(),
      cookieExpiresAt: signed.expiresAt,
    };
  }

  /** 从请求 Cookie 中读取并校验本地登录态。 */
  readSession(cookieHeader: string | undefined): AuthSession {
    const token = readCookie(cookieHeader, this.authConfig.cookieName);
    if (!token) {
      throw new UnauthorizedException("当前未登录");
    }

    try {
      const claims = verifyAuthToken({
        token,
        secret: this.authConfig.jwtSecret,
        issuer: this.authConfig.jwtIssuer,
        audience: this.authConfig.jwtAudience,
      });
      return {
        user: { userName: claims.userName },
        expiresAt: new Date(claims.exp * 1000).toISOString(),
      };
    } catch {
      throw new UnauthorizedException("登录状态无效或已过期");
    }
  }

  private assertConfigured() {
    if (
      !this.authConfig.appId ||
      !this.authConfig.ticketValidateUrl ||
      !Number.isFinite(this.authConfig.sessionDurationMs) ||
      this.authConfig.sessionDurationMs <= 0 ||
      !Number.isFinite(this.authConfig.ticketValidateTimeoutMs) ||
      this.authConfig.ticketValidateTimeoutMs <= 0
    ) {
      throw new ServiceUnavailableException("统一认证配置不完整");
    }
    if (Buffer.byteLength(this.authConfig.jwtSecret, "utf8") < 32) {
      throw new ServiceUnavailableException(
        "AUTH_JWT_SECRET 至少需要配置 32 字节",
      );
    }
  }

  private async readValidateResponse(
    response: Response,
  ): Promise<Record<string, any>> {
    try {
      const data = (await response.json()) as any;
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("响应不是对象");
      }
      return data as Record<string, any>;
    } catch {
      throw new BadGatewayException("统一认证校验响应格式无效");
    }
  }
}

function isValidUserName(userName: string) {
  return (
    userName.length > 0 &&
    userName.length <= 255 &&
    !/[\u0000-\u001f\u007f]/.test(userName)
  );
}
