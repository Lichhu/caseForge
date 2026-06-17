import type { ScenarioLibraryItem } from '@/api/client';

export function isEnabledFlag(value: unknown) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
  }
  return Boolean(value);
}

export function buildEnabledScenarios(scenarios: ScenarioLibraryItem[]) {
  return scenarios
    .filter((scenario) => isEnabledFlag(scenario.isActive))
    .map((scenario) => ({
      ...scenario,
      prompts: (scenario.prompts ?? []).filter((prompt) => isEnabledFlag(prompt.isActive)),
    }));
}

export function collectSelectablePromptIds(scenarios: ScenarioLibraryItem[]) {
  return buildEnabledScenarios(scenarios).flatMap((scenario) =>
    scenario.prompts.map((prompt) => prompt.id),
  );
}

export function filterSelectablePromptIds(
  scenarios: ScenarioLibraryItem[],
  promptIds: string[],
) {
  const allowed = new Set(collectSelectablePromptIds(scenarios));
  return promptIds.filter((id) => allowed.has(id));
}

export function promptLabel(
  prompt: { content?: string; name?: string },
  mode: 'preview' | 'full' = 'preview',
) {
  const content = prompt.content?.trim() || '';
  if (mode === 'full') {
    return content || '（未填写提示词内容）';
  }
  if (!content) {
    return '（未填写提示词内容）';
  }
  const singleLine = content.replace(/\s+/g, ' ');
  return singleLine.length > 120 ? `${singleLine.slice(0, 120)}…` : singleLine;
}

export function normalizeScenarioLibraryItem(
  scenario: ScenarioLibraryItem,
): ScenarioLibraryItem {
  return {
    ...scenario,
    isActive: isEnabledFlag(scenario.isActive),
    prompts: (scenario.prompts ?? []).map((prompt) => ({
      ...prompt,
      isActive: isEnabledFlag(prompt.isActive),
    })),
  };
}

function applyPromptListInPlace(
  local: ScenarioLibraryItem['prompts'],
  saved: ScenarioLibraryItem['prompts'],
) {
  saved.forEach((savedPrompt, index) => {
    if (local[index]) {
      Object.assign(local[index], savedPrompt);
      return;
    }
    local.push({ ...savedPrompt });
  });
  if (local.length > saved.length) {
    local.splice(saved.length);
  }
}

export function applyScenarioLibraryItemInPlace(
  target: ScenarioLibraryItem,
  saved: ScenarioLibraryItem,
) {
  target.name = saved.name;
  target.description = saved.description;
  target.category = saved.category;
  target.isActive = saved.isActive;
  if (saved.prompts !== undefined) {
    applyPromptListInPlace(target.prompts, saved.prompts);
  }
}
