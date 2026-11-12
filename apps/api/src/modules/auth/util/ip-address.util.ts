import { isIP } from "node:net";

/**
 * 将 IPv4 / IPv6 文本转换为 VARBINARY(16) 所需的二进制。
 * 非法地址返回 null，调用方按未知 IP 处理。
 */
export function ipToBuffer(value: string | null | undefined): Buffer | null {
  const ip = normalizeIp(value);
  if (!ip) return null;

  const version = isIP(ip);
  if (version === 4) {
    return Buffer.from(ip.split(".").map((part) => Number(part)));
  }
  if (version === 6) {
    return ipv6ToBuffer(ip);
  }
  return null;
}

/**
 * 将 VARBINARY(16) 还原为 IPv4 / IPv6 文本。
 * 兼容 MySQL INET6_ATON 产生的 4 字节和 16 字节形式。
 */
export function bufferToIp(value: Buffer | null | undefined): string | null {
  if (!value || value.length === 0) return null;
  if (value.length === 4) {
    return Array.from(value).join(".");
  }
  if (value.length === 16) {
    return bufferToIpv6(value);
  }
  return null;
}

/** 去除空白和 IPv6 方括号，保留合法地址文本。 */
export function normalizeIp(value: string | null | undefined): string | null {
  const ip = value?.trim().replace(/^\[|\]$/g, "");
  if (!ip) return null;
  return isIP(ip) ? ip.toLowerCase() : null;
}

function ipv6ToBuffer(ip: string): Buffer {
  const [head, tail] = ip.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const groups: number[] = [];

  for (const part of headParts) {
    groups.push(...parseIpv6Part(part));
  }
  if (ip.includes("::")) {
    const missing = 8 - groups.length - tailParts.reduce(
      (count, part) => count + parseIpv6Part(part).length,
      0,
    );
    for (let index = 0; index < missing; index += 1) {
      groups.push(0);
    }
  }
  for (const part of tailParts) {
    groups.push(...parseIpv6Part(part));
  }

  const buffer = Buffer.alloc(16);
  groups.slice(0, 8).forEach((group, index) => {
    buffer.writeUInt16BE(group, index * 2);
  });
  return buffer;
}

function parseIpv6Part(part: string): number[] {
  if (part.includes(".")) {
    const octets = part.split(".").map((value) => Number(value));
    return [((octets[0] ?? 0) << 8) | (octets[1] ?? 0), ((octets[2] ?? 0) << 8) | (octets[3] ?? 0)];
  }
  return [Number.parseInt(part || "0", 16)];
}

function bufferToIpv6(value: Buffer): string {
  const groups: number[] = [];
  for (let index = 0; index < 16; index += 2) {
    groups.push(value.readUInt16BE(index));
  }

  // IPv4 映射地址还原为更易读的 ::ffff:a.b.c.d
  const isIpv4Mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (isIpv4Mapped) {
    return `::ffff:${[groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".")}`;
  }

  let bestStart = -1;
  let bestLength = 0;
  let currentStart = -1;
  let currentLength = 0;
  groups.forEach((group, index) => {
    if (group === 0) {
      if (currentStart < 0) currentStart = index;
      currentLength += 1;
      if (currentLength > bestLength) {
        bestStart = currentStart;
        bestLength = currentLength;
      }
    } else {
      currentStart = -1;
      currentLength = 0;
    }
  });

  if (bestLength < 2) {
    return groups.map((group) => group.toString(16)).join(":");
  }
  const left = groups
    .slice(0, bestStart)
    .map((group) => group.toString(16))
    .join(":");
  const right = groups
    .slice(bestStart + bestLength)
    .map((group) => group.toString(16))
    .join(":");
  return `${left}::${right}`;
}
