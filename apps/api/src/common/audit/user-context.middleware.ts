import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { RequestContext, resolveUserNameFromRequest } from "./request-context";
import { extractAndRewriteUserNamePath } from "./user-name-path.util";

/** 从路径 / 请求头 / query 解析用户名，重写路径并注入请求上下文 */
@Injectable()
export class UserContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const pathUserName =
      (req as Request & { pathUserName?: string }).pathUserName ??
      extractAndRewriteUserNamePath(req);
    const userName = resolveUserNameFromRequest({
      path: pathUserName,
      header: req.headers["x-user-name"],
      query: req.query.userName as string | string[] | undefined,
    });
    RequestContext.run(userName, () => next());
  }
}
