import { BadRequestException } from "@nestjs/common";
import {
  normalizeBusinessCode,
  normalizeOptionalDisplayText,
  normalizeRequiredDisplayText,
  normalizeRequirementCode,
} from "./input-validation.util";

describe("input-validation.util", () => {
  it("trims valid display text", () => {
    expect(
      normalizeRequiredDisplayText("  数字人民币新增一键绑卡  ", "需求名", 120),
    ).toBe("数字人民币新增一键绑卡");
  });

  it("rejects dangerous symbol characters in display text", () => {
    expect(() =>
      normalizeRequiredDisplayText("<script>alert(1)</script>", "需求名", 120),
    ).toThrow("需求名仅支持中英文、数字、空格及常用标点");
  });

  it("rejects control characters in display text", () => {
    expect(() =>
      normalizeOptionalDisplayText("版本\u0000一", "需求版本", 255),
    ).toThrow(BadRequestException);
  });

  it("treats null optional values as empty strings", () => {
    expect(normalizeOptionalDisplayText(null, "应用名称", 255)).toBe("");
  });

  it("normalizes and validates requirement codes", () => {
    expect(normalizeRequirementCode(" xq2026-0818-01 ")).toBe("XQ2026-0818-01");
    expect(() => normalizeRequirementCode("XQ2026<script>")).toThrow(
      "需求编号格式必须为",
    );
  });

  it("limits codes to letters, numbers and separators", () => {
    expect(normalizeBusinessCode("PCBS03901001-001", "案例编号", 64)).toBe(
      "PCBS03901001-001",
    );
    expect(() => normalizeBusinessCode("A/B", "案例编号", 64)).toThrow(
      "仅支持字母、数字",
    );
  });
});
