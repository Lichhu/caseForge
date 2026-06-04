/**
 * 将案例树中的步骤/预期文本拆分为测管平台操作步骤行。
 */
export interface OperatingStepRow {
  step: string;
  expected: string;
}

function normalizeStepLine(line: string) {
  return line.replace(/^\d+[.、)\]]\s*/, "").trim();
}

function splitLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => normalizeStepLine(line.trim()))
    .filter(Boolean);
}

export function buildOperatingSteps(
  caseStep: string,
  caseExpected: string,
): OperatingStepRow[] {
  const steps = splitLines(caseStep);
  const expectations = splitLines(caseExpected);

  if (!steps.length && !expectations.length) {
    return [];
  }

  if (!steps.length) {
    return [
      {
        step: "执行测试",
        expected: expectations.join("\n") || caseExpected.trim(),
      },
    ];
  }

  const rowCount = Math.max(steps.length, expectations.length);
  return Array.from({ length: rowCount }, (_, index) => ({
    step: steps[index] ?? steps[steps.length - 1] ?? "",
    expected:
      expectations[index] ??
      expectations[expectations.length - 1] ??
      caseExpected.trim(),
  }));
}
