import { createHmac, timingSafeEqual } from "node:crypto";

export interface AuthTokenClaims {
  sub: string;
  userName: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export interface SignAuthTokenInput {
  userName: string;
  secret: string;
  issuer: string;
  audience: string;
  nowMs?: number;
  durationMs: number;
}

export interface SignedAuthToken {
  token: string;
  issuedAt: Date;
  expiresAt: Date;
}

export interface VerifyAuthTokenInput {
  token: string;
  secret: string;
  issuer: string;
  audience: string;
  nowMs?: number;
  clockSkewSeconds?: number;
}

/** 签发仅使用 HS256 的本地登录 JWT。 */
export function signAuthToken(input: SignAuthTokenInput): SignedAuthToken {
  assertJwtSecret(input.secret);
  const nowMs = input.nowMs ?? Date.now();
  const issuedAtSeconds = Math.floor(nowMs / 1000);
  const expiresAtSeconds = issuedAtSeconds + Math.ceil(input.durationMs / 1000);
  if (!Number.isFinite(input.durationMs) || input.durationMs <= 0) {
    throw new Error("JWT 有效期必须大于 0");
  }

  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    sub: input.userName,
    userName: input.userName,
    iss: input.issuer,
    aud: input.audience,
    iat: issuedAtSeconds,
    exp: expiresAtSeconds,
  } satisfies AuthTokenClaims);
  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", input.secret)
    .update(signingInput)
    .digest("base64url");

  return {
    token: `${signingInput}.${signature}`,
    issuedAt: new Date(issuedAtSeconds * 1000),
    expiresAt: new Date(expiresAtSeconds * 1000),
  };
}

/** 校验 HS256 JWT 的签名、固定声明和有效期。 */
export function verifyAuthToken(input: VerifyAuthTokenInput): AuthTokenClaims {
  assertJwtSecret(input.secret);
  const parts = input.token.split(".");
  if (parts.length !== 3) {
    throw new Error("JWT 格式错误");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJsonObject(encodedHeader);
  if (header.alg !== "HS256" || header.typ !== "JWT") {
    throw new Error("不支持的 JWT 头部");
  }

  const expectedSignature = createHmac("sha256", input.secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const actualSignature = decodeBase64Url(encodedSignature);
  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    throw new Error("JWT 签名无效");
  }

  const payload = decodeJsonObject(encodedPayload);
  const sub = payload.sub;
  const userName = payload.userName;
  const issuer = payload.iss;
  const audience = payload.aud;
  const issuedAt = payload.iat;
  const expiresAt = payload.exp;
  if (
    typeof sub !== "string" ||
    typeof userName !== "string" ||
    sub !== userName ||
    typeof issuer !== "string" ||
    typeof audience !== "string" ||
    !Number.isInteger(issuedAt) ||
    !Number.isInteger(expiresAt)
  ) {
    throw new Error("JWT 声明无效");
  }
  if (issuer !== input.issuer || audience !== input.audience) {
    throw new Error("JWT 签发方或受众无效");
  }

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const clockSkewSeconds = input.clockSkewSeconds ?? 30;
  if ((issuedAt as number) > nowSeconds + clockSkewSeconds) {
    throw new Error("JWT 签发时间无效");
  }
  if ((expiresAt as number) <= nowSeconds - clockSkewSeconds) {
    throw new Error("JWT 已过期");
  }

  return {
    sub,
    userName,
    iss: issuer,
    aud: audience,
    iat: issuedAt as number,
    exp: expiresAt as number,
  };
}

/** 从 Cookie 请求头中读取指定 Cookie。 */
export function readCookie(
  cookieHeader: string | undefined,
  cookieName: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    const name = entry.slice(0, separator).trim();
    if (name !== cookieName) continue;
    const rawValue = entry.slice(separator + 1).trim();
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }
  return undefined;
}

function assertJwtSecret(secret: string) {
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("AUTH_JWT_SECRET 至少需要 32 字节");
  }
}

function encodeJson(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJsonObject(segment: string): Record<string, unknown> {
  const value = JSON.parse(decodeBase64Url(segment).toString("utf8")) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JWT 内容不是对象");
  }
  return value as Record<string, unknown>;
}

function decodeBase64Url(segment: string): Buffer {
  if (!segment || !/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw new Error("JWT Base64URL 编码无效");
  }
  return Buffer.from(segment, "base64url");
}
