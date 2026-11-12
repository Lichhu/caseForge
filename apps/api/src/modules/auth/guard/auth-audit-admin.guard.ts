import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../service/auth.service";

/**
 * 登录审计接口权限：仅 AUTH_AUDIT_ADMIN_USERS 中的账号可访问。
 * 每次查询和下载都重新校验，不依赖前端隐藏菜单。
 */
@Injectable()
export class AuthAuditAdminGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    try {
      const current = this.authService.readSessionContext(request.headers.cookie);
      const actorUserName =
        current.claims.actorUserName ?? current.claims.userName;
      if (!this.authService.isAuditAdmin(actorUserName)) {
        throw new ForbiddenException("当前账号无权查看登录审计");
      }
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException("登录状态无效或已过期");
    }
  }
}
