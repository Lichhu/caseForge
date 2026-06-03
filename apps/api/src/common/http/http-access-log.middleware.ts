import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { RequestContext } from "../audit/request-context";

/** 记录 HTTP 请求：方法、路径、状态码、耗时、用户 */
@Injectable()
export class HttpAccessLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HTTP");

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const { method } = req;
    
    const rawPath = req.originalUrl || req.url;
    let path: string;
    try {
      path = decodeURIComponent(rawPath);
    } catch (error) {
      path = rawPath;
    } 

    const userName = RequestContext.getUserName();
    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)
        ?.split(",")[0]
        ?.trim() ||
      req.socket.remoteAddress ||
      "-";

    res.on("finish", () => {
      const durationMs = Date.now() - start;
      const status = res.statusCode;
      const contentLength = res.getHeader("content-length");
      const size =
        contentLength !== undefined && contentLength !== ""
          ? ` ${contentLength}b`
          : "";

      this.logger.verbose(
        `${method} ${path} ${status} ${durationMs}ms user=${userName} ip=${ip}${size}`,
      );
    });

    next();
  }
}
