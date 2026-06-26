/**
 * 案例生成 prompt 中需求总结（requirementContext）的字符预算。
 * 留出余量给 promote-skill 模板、测试要点与场景约束。
 */
export const DEFAULT_REQUIREMENT_CONTEXT_MAX_CHARS = 12_000;

/** 按字符预算裁剪需求总结，优先保留开头（需求概述与靠前模块通常更重要）。 */
export function truncateRequirementContext(
  text: string,
  maxChars = DEFAULT_REQUIREMENT_CONTEXT_MAX_CHARS,
): string {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length <= maxChars) {
    return trimmed;
  }

  const suffix = "\n\n...(需求总结已按字符预算截断，后续模块略)";
  const budget = Math.max(0, maxChars - suffix.length);
  return `${trimmed.slice(0, budget).trimEnd()}${suffix}`;
}
