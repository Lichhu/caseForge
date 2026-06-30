export interface ParsedServerAddress {
  transport: "http" | "tcp";
  baseUrl?: string;
  host?: string;
  port?: number;
  serverAddress: string;
}

/** 解析服务器地址：支持 http(s):// 与 socket2://host:port */
export function parseServerAddress(address: string): ParsedServerAddress {
  const trimmed = address.trim();
  if (!trimmed) {
    return { transport: "http", serverAddress: "" };
  }

  if (/^socket2?:\/\//i.test(trimmed)) {
    const raw = trimmed.replace(/^socket2?:\/\//i, "");
    const [host, portStr] = raw.split(":");
    const port = Number(portStr);
    return {
      transport: "tcp",
      host: host?.trim(),
      port: Number.isFinite(port) ? port : undefined,
      serverAddress: trimmed,
    };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const baseUrl = `${url.origin}${url.pathname}`.replace(/\/$/, "");
      return { transport: "http", baseUrl, serverAddress: trimmed };
    } catch {
      return { transport: "http", baseUrl: trimmed, serverAddress: trimmed };
    }
  }

  if (/^[\w.-]+:\d+$/.test(trimmed)) {
    const [host, portStr] = trimmed.split(":");
    const port = Number(portStr);
    return {
      transport: "tcp",
      host,
      port: Number.isFinite(port) ? port : undefined,
      serverAddress: `socket2://${trimmed}`,
    };
  }

  return { transport: "http", baseUrl: trimmed, serverAddress: trimmed };
}

export function formatServerAddress(input: {
  serverAddress?: string | null;
  transport?: string | null;
  baseUrl?: string | null;
  host?: string | null;
  port?: number | null;
}): string {
  if (input.serverAddress?.trim()) return input.serverAddress.trim();
  if (input.transport === "tcp" && input.host && input.port) {
    return `socket2://${input.host}:${input.port}`;
  }
  if (input.baseUrl?.trim()) return input.baseUrl.trim();
  return "";
}

export function applyParsedServerAddress<
  T extends {
    serverAddress?: string;
    transport?: "http" | "tcp";
    baseUrl?: string;
    host?: string;
    port?: number;
  },
>(target: T, address: string): T {
  const parsed = parseServerAddress(address);
  target.serverAddress = parsed.serverAddress;
  target.transport = parsed.transport;
  if (parsed.transport === "http") {
    target.baseUrl = parsed.baseUrl;
    target.host = undefined;
    target.port = undefined;
  } else {
    target.host = parsed.host;
    target.port = parsed.port;
    target.baseUrl = undefined;
  }
  return target;
}
