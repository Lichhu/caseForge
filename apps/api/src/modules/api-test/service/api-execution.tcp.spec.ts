import iconv from "iconv-lite";
import { createServer, type Server, type Socket } from "node:net";
import {
  buildTcpPayload,
  sendTcpPayload,
} from "@api-test/service/api-execution.service";
import type { ApiCaseRequest } from "@case-forge/shared";

/**
 * TCP 长度前缀协议回归测试。
 *
 * 模拟真实网关行为（与可通的 C# 客户端 `{0:d8}` 协议一致）：
 * 请求/响应均为「8 位补零长度前缀 + 报文体」，且网关应答后**不关闭连接**。
 * 修复前 sendTcpPayload 只在对端关闭连接时 resolve，导致 30s 超时。
 */

const FRAMING = { type: "length-prefix" as const, width: 8, encoding: "GBK" };

function makeRequest(body: string): ApiCaseRequest {
  return { method: "", path: "", body } as ApiCaseRequest;
}

function frame(body: string, encoding: string): Buffer {
  const bytes = iconv.encode(body, encoding);
  const prefix = String(bytes.length).padStart(8, "0");
  return Buffer.concat([Buffer.from(prefix, "latin1"), bytes]);
}

const openSockets: Socket[] = [];

function startServer(
  onSocket: (socket: Socket) => void,
  options?: { allowHalfOpen?: boolean },
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer(
      { allowHalfOpen: options?.allowHalfOpen ?? false },
      onSocket,
    );
    server.on("connection", (socket) => openSockets.push(socket));
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("无法获取测试服务端口");
      }
      resolve({ server, port: address.port });
    });
  });
}

describe("buildTcpPayload", () => {
  it('生成与 C# string.Format("{0:d8}") 一致的 8 位补零前缀（GBK 字节长度）', () => {
    const body = "<Request><Name>中文</Name></Request>";
    const payload = buildTcpPayload(makeRequest(body), "GBK", FRAMING);
    const gbkBytes = iconv.encode(body, "GBK");
    const expectedPrefix = String(gbkBytes.length).padStart(8, "0");
    expect(payload.subarray(0, 8).toString("latin1")).toBe(expectedPrefix);
    expect(payload.subarray(8).equals(gbkBytes)).toBe(true);
  });

  it("未配置 framing 时不加前缀", () => {
    const body = "<Request/>";
    const payload = buildTcpPayload(makeRequest(body), "UTF-8");
    expect(payload.toString("utf8")).toBe(body);
  });
});

describe("sendTcpPayload", () => {
  const servers: Server[] = [];

  afterEach(() => {
    for (const socket of openSockets.splice(0)) socket.destroy();
    for (const server of servers.splice(0)) server.close();
  });

  async function startGateway(
    responseBody: string,
    options?: { chunked?: boolean; closeAfterReply?: boolean },
  ) {
    const { server, port } = await startServer((socket) => {
      let received = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        received = Buffer.concat([received, chunk]);
        if (received.length < 8) return;
        const declared = Number(received.subarray(0, 8).toString("latin1"));
        if (!Number.isFinite(declared) || received.length < 8 + declared) {
          return;
        }
        const reply = frame(responseBody, "GBK");
        if (options?.chunked) {
          socket.write(reply.subarray(0, 10));
          setTimeout(() => {
            socket.write(reply.subarray(10));
            if (options?.closeAfterReply) socket.end();
          }, 300);
        } else {
          socket.write(reply);
          if (options?.closeAfterReply) socket.end();
        }
      });
    });
    servers.push(server);
    return port;
  }

  it("网关应答后不关闭连接时也能立即返回（原 30s 超时 bug）", async () => {
    const responseBody =
      "<Transaction><Ret>0</Ret><Msg>成功</Msg></Transaction>";
    const port = await startGateway(responseBody);
    const payload = buildTcpPayload(
      makeRequest("<Request><No>1</No></Request>"),
      "GBK",
      FRAMING,
    );
    const started = Date.now();
    const result = await sendTcpPayload(
      "127.0.0.1",
      port,
      payload,
      "GBK",
      FRAMING,
    );
    expect(Date.now() - started).toBeLessThan(3000);
    expect(result).toContain(responseBody);
  });

  it("响应分块慢发时按长度前缀收满才返回，不截断", async () => {
    const responseBody =
      "<Transaction><Msg>分块响应中文内容</Msg></Transaction>";
    const port = await startGateway(responseBody, { chunked: true });
    const payload = buildTcpPayload(makeRequest("<Request/>"), "GBK", FRAMING);
    const result = await sendTcpPayload(
      "127.0.0.1",
      port,
      payload,
      "GBK",
      FRAMING,
    );
    expect(result).toContain(responseBody);
  });

  it("未配置 framing 时走半关闭并在对端关闭后返回", async () => {
    const responseBody = "PLAIN-RESPONSE";
    const { server, port } = await startServer(
      (socket) => {
        socket.resume();
        socket.on("end", () => {
          socket.end(Buffer.from(responseBody, "utf8"));
        });
      },
      { allowHalfOpen: true },
    );
    servers.push(server);
    const payload = buildTcpPayload(makeRequest("PING"), "UTF-8");
    const result = await sendTcpPayload("127.0.0.1", port, payload, "UTF-8");
    expect(result).toBe(responseBody);
  });

  it("网关响应无长度前缀但以 </Transaction> 结尾时立即返回", async () => {
    const responseBody = "<Transaction><Ret>0</Ret></Transaction>";
    const { server, port } = await startServer((socket) => {
      let received = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        received = Buffer.concat([received, chunk]);
        if (received.length < 8) return;
        const declared = Number(received.subarray(0, 8).toString("latin1"));
        if (received.length < 8 + declared) return;
        socket.write(iconv.encode(responseBody, "GBK"));
      });
    });
    servers.push(server);
    const payload = buildTcpPayload(makeRequest("<Request/>"), "GBK", FRAMING);
    const started = Date.now();
    const result = await sendTcpPayload(
      "127.0.0.1",
      port,
      payload,
      "GBK",
      FRAMING,
    );
    expect(Date.now() - started).toBeLessThan(3000);
    expect(result).toContain(responseBody);
  });

  it("连接不上时报连接超时/网络错误而不是挂死", async () => {
    await expect(
      sendTcpPayload("127.0.0.1", 1, Buffer.from("x"), "UTF-8", FRAMING),
    ).rejects.toThrow();
  });
});
