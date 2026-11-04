import { BadRequestException } from "@nestjs/common";
import {
  BUSINESS_CODE_PATTERN,
  REQUIREMENT_CODE_PATTERN,
  validateDisplayText,
  validateLongText,
} from "@case-forge/shared";

export function normalizeRequiredDisplayText(
  value: string | null | undefined,
  label: string,
  maxLength: number,
) {
  const issue = validateDisplayText(value, {
    label,
    maxLength,
    required: true,
  });
  if (issue) throw new BadRequestException(issue);
  return String(value).trim();
}

export function normalizeOptionalDisplayText(
  value: string | null | undefined,
  label: string,
  maxLength: number,
) {
  if (value === undefined) return undefined;
  if (value === null) return "";
  const issue = validateDisplayText(value, {
    label,
    maxLength,
    required: false,
  });
  if (issue) throw new BadRequestException(issue);
  return String(value).trim();
}

export function normalizeRequiredLongText(
  value: string | null | undefined,
  label: string,
  maxLength: number,
) {
  const issue = validateLongText(value, {
    label,
    maxLength,
    required: true,
  });
  if (issue) throw new BadRequestException(issue);
  return String(value).trim();
}

export function normalizeOptionalLongText(
  value: string | null | undefined,
  label: string,
  maxLength: number,
) {
  if (value === undefined) return undefined;
  if (value === null) return "";
  const issue = validateLongText(value, {
    label,
    maxLength,
    required: false,
  });
  if (issue) throw new BadRequestException(issue);
  return String(value).trim();
}

export function normalizeRequirementCode(value: string | null | undefined) {
  const code = String(value ?? "")
    .trim()
    .toUpperCase();
  if (!code) throw new BadRequestException("需求编号不能为空");
  if (!REQUIREMENT_CODE_PATTERN.test(code)) {
    throw new BadRequestException(
      "需求编号格式必须为 XQxxxx-xxxx-xx，例如 XQ2026-0818-01",
    );
  }
  return code;
}

export function normalizeBusinessCode(
  value: string | null | undefined,
  label: string,
  maxLength: number,
) {
  const code = String(value ?? "").trim();
  if (!code) throw new BadRequestException(`${label}不能为空`);
  if (Array.from(code).length > maxLength) {
    throw new BadRequestException(`${label}不能超过 ${maxLength} 个字符`);
  }
  if (!BUSINESS_CODE_PATTERN.test(code)) {
    throw new BadRequestException(
      `${label}仅支持字母、数字、点、下划线和连字符`,
    );
  }
  return code;
}

export function normalizeOptionalBusinessCode(
  value: string | null | undefined,
  label: string,
  maxLength: number,
) {
  if (value === undefined) return undefined;
  if (value === null) return "";
  const code = String(value).trim();
  if (!code) return "";
  return normalizeBusinessCode(code, label, maxLength);
}
