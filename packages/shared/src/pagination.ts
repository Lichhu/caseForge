/** 统一分页每页条数选项 */
export const CASE_FORGE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export type CaseForgePageSize = (typeof CASE_FORGE_PAGE_SIZE_OPTIONS)[number];

export const DEFAULT_CASE_FORGE_PAGE_SIZE: CaseForgePageSize = 10;

export const MIN_CASE_FORGE_PAGE_SIZE: CaseForgePageSize = 10;

/** 供 Ant Design Pagination 使用的字符串选项 */
export function caseForgePageSizeOptionLabels(): string[] {
  return CASE_FORGE_PAGE_SIZE_OPTIONS.map(String);
}

export function normalizeCaseForgePageSize(value?: number | null): CaseForgePageSize {
  if (value == null || Number.isNaN(Number(value))) {
    return DEFAULT_CASE_FORGE_PAGE_SIZE;
  }
  const n = Number(value);
  return (CASE_FORGE_PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
    ? (n as CaseForgePageSize)
    : DEFAULT_CASE_FORGE_PAGE_SIZE;
}

export function shouldShowCaseForgePagination(total: number): boolean {
  return total > MIN_CASE_FORGE_PAGE_SIZE;
}
