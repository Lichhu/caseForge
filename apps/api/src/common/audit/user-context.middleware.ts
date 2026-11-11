import {
  Inject,
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { AuthService } from "@auth/service/auth.service";
import { RequestContext } from "./request-context";
import { extractAndRewriteUserNamePath } from "./user-name-path.util";

/** 校验本地 JWT Cookie，并将当前用户注入请求上下文。 */
@Injectable()
export class UserContextMiddleware implements NestMiddleware {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    if (isAuthRoute(req.originalUrl ?? req.url)) {
      return next();
    }

    (req as Request & { pathUserName?: string }).pathUserName ??=
      extractAndRewriteUserNamePath(req);

    try {
      const session = this.authService.readSession(req.headers.cookie);
      RequestContext.run(session.user.userName, () => next());
    } catch {
      next(new UnauthorizedException("登录状态无效或已过期"));
    }
  }
}

function isAuthRoute(url: string) {
  return /^\/api\/v1\/auth(?:\/|$)/.test(url.split("?")[0] ?? "");
}
