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
  type AuthTokenClaims,
} from "@auth/util/auth-token.util";

export interface LoginResult extends AuthSession {
  token: string;
  cookieExpiresAt: Date;
  /** 当前 JWT 的会话 ID（jti），用于审计串联。 */
  sessionId: string;
}

/** 带稳定失败码的登录异常，供审计记录和前端提示使用。 */
export interface AuthFailureException {
  failureCode: string;
}

export class InvalidAppIdException
  extends ForbiddenException
  implements AuthFailureException
{
  readonly failureCode = "invalid_app_id";
}

export class TicketValidateUnavailableException
  extends BadGatewayException
  implements AuthFailureException
{
  readonly failureCode = "ticket_validate_unavailable";
}

export class TicketInvalidException
  extends UnauthorizedException
  implements AuthFailureException
{
  readonly failureCode = "ticket_invalid";
}

export class InvalidUserNameException
  extends UnauthorizedException
  implements AuthFailureException
{
  readonly failureCode = "invalid_user_name";
}

export class InvalidTicketResponseException
  extends BadGatewayException
  implements AuthFailureException
{
  readonly failureCode = "ticket_validate_invalid_response";
}

export class SessionExpiredException
  extends UnauthorizedException
  implements AuthFailureException
{
  readonly failureCode = "session_expired";
}

export class AuthNotConfiguredException
  extends ServiceUnavailableException
  implements AuthFailureException
{
  readonly failureCode = "auth_not_configured";
}

/** 从登录异常中提取稳定失败码，未知异常统一返回 unknown。 */
export function getAuthFailureCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "failureCode" in error &&
    typeof (error as AuthFailureException).failureCode === "string"
  ) {
    return (error as AuthFailureException).failureCode;
  }
  return "unknown";
}

export interface AuthSessionContext {
  session: AuthSession;
  claims: AuthTokenClaims;
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
      throw new InvalidAppIdException("统一认证应用标识不匹配");
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
      throw new TicketValidateUnavailableException("统一认证校验服务暂不可用");
    }

    if (!response.ok) {
      this.logger.warn(`统一认证票据校验返回 HTTP ${response.status}`);
      throw new TicketInvalidException("统一认证票据无效或已过期");
    }

    const data = await this.readValidateResponse(response);
    const userName =
      typeof data?.body?.content === "string" ? data?.body?.content.trim() : "";
    if (!isValidUserName(userName)) {
      throw new InvalidUserNameException("统一认证未返回有效用户信息");
    }

    return this.issueSession(userName);
  }

  /** 从请求 Cookie 中读取并校验本地登录态。 */
  readSession(cookieHeader: string | undefined): AuthSession {
    return this.readSessionContext(cookieHeader).session;
  }

  /** 读取登录会话及完整签名声明，供代登录流程保留原始操作人。 */
  readSessionContext(cookieHeader: string | undefined): AuthSessionContext {
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
        session: this.toSession(claims),
        claims,
      };
    } catch {
      throw new UnauthorizedException("登录状态无效或已过期");
    }
  }

  /** 为指定用户签发短期代登录 JWT，并保留原始操作人。 */
  issueImpersonationSession(
    actorClaims: AuthTokenClaims,
    targetUserName: string,
  ): LoginResult {
    this.assertConfigured();
    const actorUserName = actorClaims.actorUserName ?? actorClaims.userName;
    if (!this.canImpersonateUser(actorUserName)) {
      throw new ForbiddenException("当前账号无权切换登录身份");
    }

    const actorExpiresAtSeconds = actorClaims.actorExpiresAt ?? actorClaims.exp;
    const remainingActorMs = getRemainingSessionMs(actorExpiresAtSeconds);
    const durationMs = Math.min(
      this.authConfig.impersonationDurationMs,
      remainingActorMs,
    );
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new SessionExpiredException("原始登录状态已过期");
    }

    return this.issueSession(targetUserName, {
      durationMs,
      actorUserName,
      actorExpiresAtSeconds,
      impersonationStartedAtSeconds:
        actorClaims.impersonationStartedAt ?? Math.floor(Date.now() / 1000),
    });
  }

  /** 结束代登录并恢复原始账号的剩余登录态。 */
  issueRestoredSession(claims: AuthTokenClaims): LoginResult {
    this.assertConfigured();
    if (!claims.actorUserName) {
      throw new UnauthorizedException("当前不是代登录状态");
    }
    if (!this.canImpersonateUser(claims.actorUserName)) {
      throw new ForbiddenException("原始账号无权退出代登录");
    }

    const actorExpiresAtSeconds = claims.actorExpiresAt ?? claims.exp;
    const remainingActorMs = getRemainingSessionMs(actorExpiresAtSeconds);
    if (!Number.isFinite(remainingActorMs) || remainingActorMs <= 0) {
      throw new SessionExpiredException("原始登录状态已过期");
    }

    return this.issueSession(claims.actorUserName, {
      durationMs: remainingActorMs,
    });
  }

  private issueSession(
    userName: string,
    impersonation?: {
      durationMs: number;
      actorUserName?: string;
      actorExpiresAtSeconds?: number;
      impersonationStartedAtSeconds?: number;
    },
  ): LoginResult {
    const signed = signAuthToken({
      userName,
      secret: this.authConfig.jwtSecret,
      issuer: this.authConfig.jwtIssuer,
      audience: this.authConfig.jwtAudience,
      durationMs:
        impersonation?.durationMs ?? this.authConfig.sessionDurationMs,
      actorUserName: impersonation?.actorUserName,
      actorExpiresAtSeconds: impersonation?.actorExpiresAtSeconds,
      impersonationStartedAtSeconds:
        impersonation?.impersonationStartedAtSeconds,
    });
    return {
      token: signed.token,
      sessionId: signed.sessionId,
      user: { userName },
      expiresAt: signed.expiresAt.toISOString(),
      canImpersonate: this.canImpersonateUser(
        impersonation?.actorUserName ?? userName,
      ),
      canAudit: this.canAuditUser(impersonation?.actorUserName ?? userName),
      ...(impersonation?.actorUserName
        ? {
            impersonatedBy: impersonation.actorUserName,
            impersonationStartedAt: new Date(
              (impersonation.impersonationStartedAtSeconds ??
                Math.floor(Date.now() / 1000)) * 1000,
            ).toISOString(),
          }
        : {}),
      cookieExpiresAt: signed.expiresAt,
    };
  }

  private toSession(claims: AuthTokenClaims): AuthSession {
    return {
      user: { userName: claims.userName },
      expiresAt: new Date(claims.exp * 1000).toISOString(),
      canImpersonate: this.canImpersonateUser(
        claims.actorUserName ?? claims.userName,
      ),
      canAudit: this.canAuditUser(claims.actorUserName ?? claims.userName),
      ...(claims.actorUserName
        ? {
            impersonatedBy: claims.actorUserName,
            impersonationStartedAt: new Date(
              (claims.impersonationStartedAt ?? claims.iat) * 1000,
            ).toISOString(),
          }
        : {}),
    };
  }

  private canImpersonateUser(userName: string) {
    return this.authConfig.impersonationAdminUsers.includes(userName);
  }

  isImpersonationAdmin(userName: string) {
    return this.canImpersonateUser(userName);
  }

  /** 是否允许查看和导出登录审计。与代登录管理员配置分离。 */
  isAuditAdmin(userName: string) {
    return this.canAuditUser(userName);
  }

  private canAuditUser(userName: string) {
    return this.authConfig.auditAdminUsers.includes(userName);
  }

  private assertConfigured() {
    if (
      !this.authConfig.appId ||
      !this.authConfig.ticketValidateUrl ||
      !Number.isFinite(this.authConfig.sessionDurationMs) ||
      this.authConfig.sessionDurationMs <= 0 ||
      !Number.isFinite(this.authConfig.impersonationDurationMs) ||
      this.authConfig.impersonationDurationMs <= 0 ||
      !Number.isFinite(this.authConfig.ticketValidateTimeoutMs) ||
      this.authConfig.ticketValidateTimeoutMs <= 0
    ) {
      throw new AuthNotConfiguredException("统一认证配置不完整");
    }
    if (Buffer.byteLength(this.authConfig.jwtSecret, "utf8") < 32) {
      throw new AuthNotConfiguredException(
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
      throw new InvalidTicketResponseException("统一认证校验响应格式无效");
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

function getRemainingSessionMs(expiresAtSeconds: number) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return (expiresAtSeconds - nowSeconds) * 1000;
}
