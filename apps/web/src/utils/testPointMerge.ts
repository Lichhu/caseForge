import type { TestPointInstructionItem, TestPointSummaryItem } from '@/api/client';

const EMPTY_INSTRUCTION_FIELDS = {
  naturalText: '',
  isFull: true,
  isAppend: false,
  promptIds: [] as string[],
  prompts: [] as TestPointInstructionItem['prompts'],
};

export function toTestPointSummary(item: TestPointInstructionItem): TestPointSummaryItem {
  const {
    naturalText: _naturalText,
    isFull: _isFull,
    isAppend: _isAppend,
    promptIds: _promptIds,
    prompts: _prompts,
    ...summary
  } = item;
  return summary;
}

export function mergeTestPointInstruction(
  summary?: TestPointSummaryItem | null,
  detail?: TestPointInstructionItem | null,
): TestPointInstructionItem | null {
  if (!summary && !detail) {
    return null;
  }
  return {
    ...EMPTY_INSTRUCTION_FIELDS,
    ...(summary || {}),
    ...(detail || {}),
    naturalText: detail?.naturalText ?? EMPTY_INSTRUCTION_FIELDS.naturalText,
    isFull: detail?.isFull ?? EMPTY_INSTRUCTION_FIELDS.isFull,
    isAppend: detail?.isAppend ?? EMPTY_INSTRUCTION_FIELDS.isAppend,
    promptIds: detail?.promptIds ?? EMPTY_INSTRUCTION_FIELDS.promptIds,
    prompts: detail?.prompts ?? EMPTY_INSTRUCTION_FIELDS.prompts,
  } as TestPointInstructionItem;
}

export { DEFAULT_CASE_FORGE_PAGE_SIZE as DEFAULT_TEST_POINT_PAGE_SIZE } from '@case-forge/shared';
