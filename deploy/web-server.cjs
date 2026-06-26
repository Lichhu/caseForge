/**
 * CaseForge 前端生产静态服务（无 Nginx）
 *
 * - Gzip 压缩（compression）
 * - /assets 带 hash 资源一年强缓存
 * - index.html / SPA 路由不缓存
 * - /api、/docs 反代到 NestJS API（Node 原生 http，无额外依赖）
 *
 * 环境变量：
 *   PORT         监听端口，默认 8080
 *   API_TARGET   后端地址，默认 http://127.0.0.1:34550
 *   DIST_DIR     前端 dist 目录，默认 ../apps/web/dist
 */
const express = require("express");
const compression = require("compression");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8080);
const API_TARGET = process.env.API_TARGET || "http://127.0.0.1:34550";
const DIST_DIR = path.resolve(
  __dirname,
  process.env.DIST_DIR || "../apps/web/dist",
);
const API_ORIGIN = new URL(API_TARGET);
const PROXY_TIMEOUT_MS = 300_000;

if (!fs.existsSync(path.join(DIST_DIR, "index.html"))) {
  console.error(
    `[caseforge-web] 未找到 ${path.join(DIST_DIR, "index.html")}，请先执行 pnpm --filter @case-forge/web build`,
  );
  process.exit(1);
}

function createApiProxy(prefix) {
  return (req, res) => {
    const upstreamPath = `${prefix}${req.url}`;
    const headers = { ...req.headers, host: API_ORIGIN.host };
    delete headers.connection;

    const options = {
      hostname: API_ORIGIN.hostname,
      port: API_ORIGIN.port || (API_ORIGIN.protocol === "https:" ? 443 : 80),
      method: req.method,
      path: upstreamPath,
      headers,
      timeout: PROXY_TIMEOUT_MS,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on("timeout", () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("后端 API 响应超时");
      }
    });

    proxyReq.on("error", (err) => {
      console.error("[caseforge-web] API 反代失败:", err.message);
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("后端 API 不可用，请检查 caseforge-api 是否已启动");
      }
    });

    req.pipe(proxyReq);
  };
}

const app = express();
app.disable("x-powered-by");
app.use(compression());

app.use("/api", createApiProxy("/api"));
app.use("/docs", createApiProxy("/docs"));

app.use(
  "/assets",
  express.static(path.join(DIST_DIR, "assets"), {
    maxAge: "365d",
    immutable: true,
    setHeaders(res) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  }),
);

app.use(
  express.static(DIST_DIR, {
    index: false,
    maxAge: 0,
    setHeaders(res, filePath) {
      if (path.basename(filePath) === "index.html") {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  }),
);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "caseforge-web" });
});

app.get("*", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[caseforge-web] http://0.0.0.0:${PORT}  dist=${DIST_DIR}  api=${API_TARGET}`,
  );
});
