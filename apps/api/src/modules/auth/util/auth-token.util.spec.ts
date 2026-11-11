import {
  readCookie,
  signAuthToken,
  verifyAuthToken,
} from "./auth-token.util";

const secret = "caseforge-test-secret-at-least-32-bytes";
const issuer = "caseforge";
const audience = "caseforge-web";

describe("auth-token.util", () => {
  it("signs and verifies an HS256 JWT", () => {
    const signed = signAuthToken({
      userName: "wb11471",
      secret,
      issuer,
      audience,
      durationMs: 7 * 24 * 60 * 60 * 1000,
      nowMs: Date.UTC(2026, 10, 6, 10, 0, 0),
    });

    const claims = verifyAuthToken({
      token: signed.token,
      secret,
      issuer,
      audience,
      nowMs: Date.UTC(2026, 10, 6, 10, 5, 0),
    });

    expect(claims.userName).toBe("wb11471");
    expect(signed.expiresAt.getTime() - signed.issuedAt.getTime()).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
  });

  it("rejects a tampered token", () => {
    const signed = signAuthToken({
      userName: "wb11471",
      secret,
      issuer,
      audience,
      durationMs: 60_000,
    });
    const tampered = signed.token.replace(
      /\.([^.]+)$/,
      ".invalid-signature",
    );

    expect(() =>
      verifyAuthToken({
        token: tampered,
        secret,
        issuer,
        audience,
      }),
    ).toThrow();
  });

  it("rejects an expired token", () => {
    const nowMs = Date.UTC(2026, 10, 6, 10, 0, 0);
    const signed = signAuthToken({
      userName: "wb11471",
      secret,
      issuer,
      audience,
      durationMs: 60_000,
      nowMs,
    });

    expect(() =>
      verifyAuthToken({
        token: signed.token,
        secret,
        issuer,
        audience,
        nowMs: nowMs + 120_000,
      }),
    ).toThrow("JWT 已过期");
  });

  it("reads the named cookie only", () => {
    expect(
      readCookie(
        "theme=dark; caseforge_auth=header.payload.signature; other=value",
        "caseforge_auth",
      ),
    ).toBe("header.payload.signature");
  });
});
