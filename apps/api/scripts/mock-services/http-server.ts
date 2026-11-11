/**
 * HTTP Mock 服务：
 * - 按 method/path/query/header/body 匹配 fixture
 * - 返回配置的 status、headers、body
 * - 默认监听 127.0.0.1，避免误暴露到局域网
 */
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  decodeText,
  encodeText,
  errorMessage,
  loadFixtures,
  matchFixture,
  normalizeHeaders,
  serializeBodyToBuffer,
  type HttpMockOptions,
} from "./shared";

const MAX_REQUEST_BYTES = 10 * 1024 * 1024;

export interface RunningHttpMock {
  server: Server;
  close: () => Promise<void>;
}

export async function startHttpMockServer(
  options: HttpMockOptions,
): Promise<RunningHttpMock> {
  const server = createServer((request, response) => {
    void handleRequest(request, response, options).catch((error) => {
      console.error(`[mock:http] 处理请求失败：${errorMessage(error)}`);
      if (!response.headersSent) {
        response.writeHead(500, {
          "content-type": "application/json; charset=utf-8",
        });
      }
      response.end(
        JSON.stringify({
          error: "Mock 服务处理失败",
          message: errorMessage(error),
        }),
      );
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  console.log(
    `[mock:http] 已启动 http://${options.host}:${options.port}，fixtures：${options.fixtures}`,
  );

  return {
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: HttpMockOptions,
) {
  const started = Date.now();
  const method = (request.method ?? "GET").toUpperCase();
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? `${options.host}:${options.port}`}`,
  );

  if (url.pathname === "/_mock/health") {
    const fixtures = loadFixtures(options.fixtures);
    sendJson(response, 200, {
      ok: true,
      service: "caseforge-http-mock",
      fixtures: fixtures.length,
      fixturePath: options.fixtures,
    });
    return;
  }

  if (url.pathname === "/_mock/fixtures") {
    const fixtures = loadFixtures(options.fixtures);
    sendJson(
      response,
      200,
      fixtures.map(({ fixture, file }) => ({
        name: fixture.name,
        file,
        match: fixture.match ?? null,
        response: {
          status: fixture.response.status ?? 200,
          delayMs: fixture.response.delayMs ?? 0,
        },
      })),
    );
    return;
  }

  const bodyBuffer = await readRequestBody(request);
  const body = decodeText(bodyBuffer, options.encoding);
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  const fixtures = loadFixtures(options.fixtures);
  const { hit, requestPreview } = matchFixture(fixtures, {
    method,
    path: url.pathname,
    query,
    headers: normalizeHeaders(request.headers),
    body,
  });

  if (!hit) {
    const available = fixtures.map(({ fixture }) => fixture.name).join("、");
    console.warn(
      `[mock:http] ${method} ${url.pathname} 未匹配到 fixture；可用：${available || "无"}\n` +
        `           请求报文：${requestPreview}`,
    );
    sendJson(response, 404, {
      error: "未匹配到 Mock fixture",
      method,
      path: url.pathname,
      available: fixtures.map(({ fixture }) => fixture.name),
      hint: "检查 fixture 的 match.method / match.path / match.bodyIncludes",
    });
    return;
  }

  const { fixture } = hit;
  const delayMs = Math.max(0, Number(fixture.response.delayMs) || 0);
  if (delayMs) {
    await delay(delayMs);
  }

  const responseEncoding =
    fixture.response.encoding ?? options.encoding ?? "utf8";
  const responseBody = serializeBodyToBuffer(
    fixture.response.body,
    responseEncoding,
  );
  const headers = normalizeResponseHeaders(fixture.response.headers);
  if (!headers["content-type"]) {
    headers["content-type"] =
      typeof fixture.response.body === "string"
        ? "text/plain; charset=utf-8"
        : "application/json; charset=utf-8";
  }
  headers["content-length"] = String(responseBody.length);
  headers["x-caseforge-mock-fixture"] = encodeHeaderValue(fixture.name);

  response.writeHead(fixture.response.status ?? 200, headers);
  response.end(responseBody);
  console.log(
    `[mock:http] ${method} ${url.pathname} -> ${fixture.name} ` +
      `(${fixture.response.status ?? 200}, ${Date.now() - started}ms)`,
  );
}

function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(new Error(`请求体超过 ${MAX_REQUEST_BYTES} 字节`));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function normalizeResponseHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

/** header 值只允许 ASCII；fixture 名称含中文时做一次编码 */
function encodeHeaderValue(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : encodeURIComponent(value);
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  const payload = encodeText(JSON.stringify(body, null, 2), "utf8");
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(payload.length),
  });
  response.end(payload);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
