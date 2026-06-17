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

export function collectDefaultPromptIds(scenarios: ScenarioLibraryItem[]) {
  return buildEnabledScenarios(scenarios).flatMap((scenario) =>
    scenario.prompts
      .filter((prompt) => isEnabledFlag(prompt.isDefault))
      .map((prompt) => prompt.id),
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

export function promptDisplayName(prompt: { content?: string; name?: string }) {
  const name = prompt.name?.trim();
  if (name) {
    return name;
  }
  const content = prompt.content?.trim() || '';
  if (!content) {
    return '未命名提示词';
  }
  const firstLine = content.split('\n').find((line) => line.trim())?.trim() ?? content;
  return firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine;
}

export function promptPreviewText(
  prompt: { content?: string; name?: string },
  maxLength = 100,
) {
  const content = prompt.content?.trim() || '';
  if (!content) {
    return '（未填写提示词内容）';
  }
  const singleLine = content.replace(/\s+/g, ' ');
  return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength)}…` : singleLine;
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
