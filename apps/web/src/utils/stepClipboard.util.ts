import type { ApiCaseStep } from "@case-forge/shared";

/** 步骤剪贴板（步骤库复制 → 案例步骤列表粘贴，共用同一 key） */
export const STEP_CLIPBOARD_KEY = "caseforge:api-step-clipboard";

export function copyStepToClipboard(step: ApiCaseStep) {
  localStorage.setItem(STEP_CLIPBOARD_KEY, JSON.stringify(step));
}

export function readStepFromClipboard(): ApiCaseStep | null {
  try {
    const raw = localStorage.getItem(STEP_CLIPBOARD_KEY);
    if (!raw) return null;
    const step = JSON.parse(raw) as ApiCaseStep;
    if (!step || typeof step !== "object" || !step.request) return null;
    return step;
  } catch {
    return null;
  }
}
