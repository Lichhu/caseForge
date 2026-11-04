/**
 * 创建/编辑类表单的统一输入边界。
 *
 * 展示名称允许中英文、数字、空格和常用业务标点，拒绝控制字符、
 * HTML/脚本符号及其它不可见字符；长文本只限制长度和控制字符，
 * 避免误伤正常的需求说明、报文示例和代码片段。
 */

export const REQUIREMENT_CODE_PATTERN = /^XQ\d{4}-\d{4}-\d{2}$/i;
export const BUSINESS_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const SAFE_LANGUAGE_IDENTIFIER_PATTERN = /^[\p{L}_][\p{L}\p{N}_]*$/u;

const DISPLAY_NAME_CHARACTERS = String.raw`\p{L}\p{N}\p{Zs}\-_./·,，.。:：;；!！?？()（）【】\[\]《》〈〉「」『』“”‘’…—～~、+&＋＆#＃%％`;
export const SAFE_DISPLAY_NAME_PATTERN = new RegExp(
  `^[${DISPLAY_NAME_CHARACTERS}]+$`,
  "u",
);
export const SAFE_DISPLAY_NAME_CHARACTER_PATTERN = new RegExp(
  `^[${DISPLAY_NAME_CHARACTERS}]$`,
  "u",
);

export const DISPLAY_NAME_HINT = "仅支持中英文、数字、空格及常用标点";
export const CONTROL_CHARACTER_HINT = "不能包含控制字符";

export const INPUT_LIMITS = {
  requirementCode: 64,
  requirementName: 120,
  requirementVersion: 255,
  applicationName: 255,
  projectTitle: 120,
  projectDescription: 800,
  environmentName: 120,
  environmentServiceName: 120,
  serverAddress: 1024,
  environmentRemark: 500,
  servicePropertyName: 120,
  servicePropertyDescription: 1000,
  databaseConnectionName: 128,
  databaseHost: 255,
  databaseName: 128,
  databaseUsername: 128,
  databasePassword: 512,
  caseName: 255,
  caseNo: 64,
  caseOwner: 255,
  caseText: 4000,
  stepName: 255,
  transactionCode: 128,
  transactionName: 256,
  transactionDescription: 2000,
  scenarioName: 120,
  promptName: 120,
  promptContent: 4000,
  systemName: 120,
  featureModule: 120,
  testPoint: 120,
  testPointDescription: 4000,
  dataFunctionName: 64,
  dataFunctionDescription: 500,
  scriptRequirement: 2000,
  exampleMessage: 2 * 1024 * 1024,
  executionSetName: 255,
  executionSetDescription: 2000,
  runSetName: 255,
} as const;

export interface TextValidationOptions {
  label: string;
  maxLength: number;
  required?: boolean;
}

function lengthOf(value: string) {
  return Array.from(value).length;
}

function overLimit(value: string, maxLength: number) {
  return lengthOf(value) > maxLength;
}

function hasControlCharacters(value: string) {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

function requiredLabel(options: TextValidationOptions) {
  return options.required === false
    ? `${options.label}不能超过 ${options.maxLength} 个字符`
    : `${options.label}不能为空`;
}

/** 校验名称/标题类短文本；返回可直接展示给用户的中文错误。 */
export function validateDisplayText(
  value: string | null | undefined,
  options: TextValidationOptions,
): string | null {
  const text = (value ?? "").trim();
  if (!text) {
    return options.required === false ? null : requiredLabel(options);
  }
  if (overLimit(text, options.maxLength)) {
    return `${options.label}不能超过 ${options.maxLength} 个字符`;
  }
  if (hasControlCharacters(text) || !SAFE_DISPLAY_NAME_PATTERN.test(text)) {
    return `${options.label}${DISPLAY_NAME_HINT}`;
  }
  return null;
}

/** 校验说明、备注等长文本；允许换行和正常代码标点。 */
export function validateLongText(
  value: string | null | undefined,
  options: TextValidationOptions,
): string | null {
  const text = value ?? "";
  const trimmed = text.trim();
  if (!trimmed) {
    return options.required === false ? null : requiredLabel(options);
  }
  if (overLimit(text, options.maxLength)) {
    return `${options.label}不能超过 ${options.maxLength} 个字符`;
  }
  if (hasControlCharacters(text)) {
    return `${options.label}${CONTROL_CHARACTER_HINT}`;
  }
  return null;
}

/** 输入框即时处理：移除名称字段不支持的字符并截断长度。 */
export function normalizeDisplayTextInput(value: string, maxLength: number) {
  return Array.from(value)
    .filter(
      (character) =>
        character !== "\n" &&
        character !== "\r" &&
        SAFE_DISPLAY_NAME_CHARACTER_PATTERN.test(character),
    )
    .join("")
    .slice(0, maxLength);
}

/** 输入框即时处理：移除长文本控制字符并截断长度。 */
export function normalizeLongTextInput(value: string, maxLength: number) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, maxLength);
}

/** 业务编号只保留字母、数字和常见分隔符，并限制长度。 */
export function normalizeBusinessCodeInput(value: string, maxLength: number) {
  return value.replace(/[^A-Za-z0-9._-]/g, "").slice(0, maxLength);
}

/** 函数名/参数名输入：仅保留中英文、数字和下划线。 */
export function normalizeLanguageIdentifierInput(
  value: string,
  maxLength: number,
) {
  return Array.from(value)
    .filter((character) => /^[\p{L}\p{N}_]$/u.test(character))
    .join("")
    .slice(0, maxLength);
}
