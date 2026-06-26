import {
  decryptSecrets,
  encryptSecrets,
  maskSecret,
} from "@api-test/util/secret-crypto.util";

describe("secret-crypto.util", () => {
  describe("encryptSecrets / decryptSecrets", () => {
    it("加密后能原样解密（往返一致）", () => {
      const payload = { token: "super-secret-token", apiKey: "abc123" };
      const blob = encryptSecrets(payload);
      expect(typeof blob).toBe("string");
      expect(blob).not.toContain("super-secret-token");
      expect(decryptSecrets(blob)).toEqual(payload);
    });

    it("相同明文每次密文不同（随机 IV）", () => {
      const payload = { token: "same" };
      expect(encryptSecrets(payload)).not.toEqual(encryptSecrets(payload));
    });

    it("空 / null / undefined 输入解密为空对象", () => {
      expect(decryptSecrets(undefined)).toEqual({});
      expect(decryptSecrets(null)).toEqual({});
      expect(decryptSecrets("")).toEqual({});
    });

    it("密文被篡改时解密抛错（GCM 认证标签校验）", () => {
      const blob = encryptSecrets({ token: "x" });
      const tampered = Buffer.from(blob, "base64");
      tampered[tampered.length - 1] ^= 0xff;
      expect(() => decryptSecrets(tampered.toString("base64"))).toThrow();
    });
  });

  describe("maskSecret", () => {
    it("空字符串返回空", () => {
      expect(maskSecret("")).toBe("");
    });

    it("长度 <= 8 全部打码", () => {
      expect(maskSecret("12345678")).toBe("****");
      expect(maskSecret("abc")).toBe("****");
    });

    it("长度 > 8 保留首尾各 4 位", () => {
      expect(maskSecret("abcdefghijkl")).toBe("abcd****ijkl");
    });
  });
});
