/**
 * 测管平台需求编号：项目名称或需求编号中需包含 XQXXXX-XXXX-XX 格式。
 */
const PROJECT_CODE_PATTERN = /XQ\d{4}-\d{4}-\d{2}/i;

export function extractProjectCodeFromText(text: string): string | undefined {
  const match = text.match(PROJECT_CODE_PATTERN);
  return match?.[0]?.toUpperCase();
}

export function resolveProjectRequirementCode(input: {
  title?: string | null;
  requirementNo?: string | null;
}): string | undefined {
  if (input.requirementNo?.trim()) {
    const fromRequirement =
      extractProjectCodeFromText(input.requirementNo) ??
      input.requirementNo.trim();
    if (PROJECT_CODE_PATTERN.test(fromRequirement)) {
      return fromRequirement.toUpperCase();
    }
  }
  if (input.title?.trim()) {
    return extractProjectCodeFromText(input.title);
  }
  return undefined;
}

export function isValidProjectRequirementCode(code: string): boolean {
  return PROJECT_CODE_PATTERN.test(code);
}
