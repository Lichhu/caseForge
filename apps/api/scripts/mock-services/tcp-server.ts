/**
 * Socket / TCP Mock 服务：
 * - 支持 length-prefix 请求/响应，也支持不带头部的 raw 模式
 * - 按请求报文内容匹配 fixture
 * - 响应编码支持 GBK / UTF-8，与 CaseForge 的 TCP 执行配置保持一致
 */
import { createServer, type Server, type Socket } from "node:net";
import {
  decodeText,
  errorMessage,
  framePayload,
  loadFixtures,
  matchFixture,
  requestPreview,
  serializeBodyToBuffer,
  type FramingConfig,
  type LoadedFixture,
  type TcpMockOptions,
} from "./shared";

const DEFAULT_FRAMING: FramingConfig = { type: "length-prefix", width: 4 };
const RAW_IDLE_FLUSH_MS = 50;

export interface RunningTcpMock {
  server: Server;
  close: () => Promise<void>;
}

export async function startTcpMockServer(
  options: TcpMockOptions,
): Promise<RunningTcpMock> {
  const requestFraming =
    options.requestFraming === undefined
      ? DEFAULT_FRAMING
      : options.requestFraming;
  const responseFraming =
    options.responseFraming === undefined
      ? requestFraming
      : options.responseFraming;
  const encoding = options.encoding ?? "GBK";
  const sockets = new Set<Socket>();

  // raw 模式下客户端会先发送 FIN，再等待响应；必须允许半开连接
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    sockets.add(socket);
    socket.setNoDelay(true);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", (error) => {
      console.warn(`[mock:tcp] 连接异常：${errorMessage(error)}`);
    });

    let buffer = Buffer.alloc(0);
    let draining = false;
    let rawTimer: NodeJS.Timeout | undefined;
    let rawHandled = false;
    const remote = `${socket.remoteAddress ?? "?"}:${socket.remotePort ?? "?"}`;

    const handle = async (bodyBuffer: Buffer, requestWidth: number) => {
      await handleRequest({
        socket,
        bodyBuffer,
        requestWidth,
        encoding,
        fixturesPath: options.fixtures,
        responseFraming,
        closeAfterResponse: options.closeAfterResponse ?? false,
        remote,
      });
    };

    const flushRaw = () => {
      if (rawHandled) return;
      rawHandled = true;
      if (rawTimer) {
        clearTimeout(rawTimer);
        rawTimer = undefined;
      }
      const body = buffer;
      buffer = Buffer.alloc(0);
      if (!body.length) return;
      void handle(body, 0);
    };

    const drainFrames = async () => {
      if (draining || !requestFraming) return;
      draining = true;
      try {
        while (buffer.length >= requestFraming.width) {
          const prefix = buffer
            .subarray(0, requestFraming.width)
            .toString("latin1");
          if (!/^\d+$/.test(prefix)) {
            console.warn(
              `[mock:tcp] ${remote} 长度前缀不是数字：${JSON.stringify(prefix)}；` +
                `请检查 requestFraming.width 是否与案例一致，或改用 null 走 raw 模式`,
            );
            socket.destroy();
            return;
          }
          const length = Number(prefix);
          const maxBytes = options.maxRequestBytes ?? 10 * 1024 * 1024;
          if (!Number.isFinite(length) || length > maxBytes) {
            console.warn(
              `[mock:tcp] ${remote} 请求长度 ${length} 超过上限 ${maxBytes}`,
            );
            socket.destroy();
            return;
          }
          if (buffer.length < requestFraming.width + length) return;
          const body = buffer.subarray(
            requestFraming.width,
            requestFraming.width + length,
          );
          buffer = buffer.subarray(requestFraming.width + length);
          await handle(body, requestFraming.width);
          if (socket.destroyed) return;
        }
      } finally {
        draining = false;
      }
    };

    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (requestFraming) {
        void drainFrames();
        return;
      }
      if (rawTimer) clearTimeout(rawTimer);
      rawTimer = setTimeout(flushRaw, RAW_IDLE_FLUSH_MS);
    });

    socket.on("end", () => {
      if (!requestFraming) {
        flushRaw();
        return;
      }
      if (buffer.length) {
        console.warn(
          `[mock:tcp] ${remote} 连接结束时仍有 ${buffer.length} 字节未组成完整帧`,
        );
      }
    });

    console.log(
      `[mock:tcp] 新连接 ${remote}，请求分帧：${requestFraming ? `${requestFraming.width} 字节长度前缀` : "raw"}，编码：${encoding}`,
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  console.log(
    `[mock:tcp] 已启动 ${options.host}:${options.port}，fixtures：${options.fixtures}`,
  );

  return {
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const socket of sockets) socket.destroy();
        sockets.clear();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

interface HandleRequestInput {
  socket: Socket;
  bodyBuffer: Buffer;
  requestWidth: number;
  encoding: string;
  fixturesPath: string;
  responseFraming: FramingConfig | null;
  closeAfterResponse: boolean;
  remote: string;
}

async function handleRequest(input: HandleRequestInput) {
  const started = Date.now();
  const body = decodeText(input.bodyBuffer, input.encoding);
  let fixtures: LoadedFixture[];
  try {
    fixtures = loadFixtures(input.fixturesPath);
  } catch (error) {
    console.error(`[mock:tcp] 读取 fixture 失败：${errorMessage(error)}`);
    input.socket.destroy();
    return;
  }

  const { hit, requestPreview: preview } = matchFixture(fixtures, { body });
  if (!hit) {
    const available = fixtures.map(({ fixture }) => fixture.name).join("、");
    console.warn(
      `[mock:tcp] ${input.remote} 未匹配到 fixture；可用：${available || "无"}\n` +
        `           请求报文：${preview}`,
    );
    const message = `<MockServerError>未匹配到 fixture，请检查 match.bodyIncludes / match.bodyRegex</MockServerError>`;
    const payload = serializeBodyToBuffer(message, input.encoding);
    const framed = buildResponse(
      payload,
      input.responseFraming,
      input.requestWidth,
    );
    input.socket.end(framed);
    return;
  }

  const { fixture } = hit;
  const delayMs = Math.max(0, Number(fixture.response.delayMs) || 0);
  if (delayMs) await delay(delayMs);

  const responseEncoding = fixture.response.encoding ?? input.encoding;
  const payload = serializeBodyToBuffer(
    fixture.response.body,
    responseEncoding,
  );
  const framing =
    fixture.response.framing === undefined
      ? input.responseFraming
      : fixture.response.framing;
  const response = buildResponse(payload, framing, input.requestWidth);
  // raw 模式下客户端已经结束写方向，响应写完后要主动关闭，否则对端可能一直等
  const close =
    fixture.response.close ??
    (input.requestWidth === 0 ? true : input.closeAfterResponse);

  if (close) {
    input.socket.end(response);
  } else {
    input.socket.write(response);
  }
  console.log(
    `[mock:tcp] ${input.remote} -> ${fixture.name} ` +
      `(${payload.length} bytes, ${Date.now() - started}ms, ${framing ? "length-prefix" : "raw"})`,
  );
}

function buildResponse(
  payload: Buffer,
  framing: FramingConfig | null,
  requestWidth: number,
): Buffer {
  if (!framing) return payload;
  const width = Number(framing.width) || requestWidth || 4;
  return framePayload(payload, width);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
