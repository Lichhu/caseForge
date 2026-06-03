/**
 * @file 应用启动入口：创建 Nest 应用、全局管道、Swagger 与监听端口
 */
import "./register-paths";
import "reflect-metadata";
import { loadApiEnv } from "@config/load-env";
import { ValidationPipe, VersioningType } from "@nestjs/common";

loadApiEnv();
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { extractAndRewriteUserNamePath } from "./common/audit/user-name-path.util";
import * as express from "express";
import { NextFunction, Request, Response } from "express";
/** 启动 CaseForge API 服务 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
  });

  // 在 Nest 路由匹配前剥离 /api/v1/:userName/ 前缀
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const pathUserName = extractAndRewriteUserNamePath(req);
    if (pathUserName) {
      (req as Request & { pathUserName?: string }).pathUserName = pathUserName;
    }
    next();
  });

  // 设置请求体大小限制 (例如 50MB)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.setGlobalPrefix("api");
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle("CaseForge API")
    .setDescription("智能案例生成平台 API")
    .setVersion("0.1.0")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  const port = Number(process.env.PORT || 34550);
  await app.listen(port, "0.0.0.0");
  console.log(`CaseForge API listening on http://localhost:${port}/api/v1`);
}

bootstrap();
