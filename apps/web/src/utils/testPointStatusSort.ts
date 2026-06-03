import type { TestPointInstructionItem } from '@/api/client';

/** 动态指令列表状态排序：生成失败 → 待编辑 → 已编辑/再编辑 → 生成中 → 生成完成 */
const STATUS_SORT_ORDER: Record<TestPointInstructionItem['status'], number> = {
  生成失败: 0,
  待编辑: 1,
  已编辑: 2,
  再编辑: 2,
  生成中: 3,
  生成完成: 4,
};

function getStatusSortOrder(status: TestPointInstructionItem['status']) {
  return STATUS_SORT_ORDER[status] ?? 99;
}

export function sortTestPointsByStatus<T extends TestPointInstructionItem>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const byStatus = getStatusSortOrder(a.status) - getStatusSortOrder(b.status);
    if (byStatus !== 0) {
      return byStatus;
    }
    const aTime = (a as T & { createdAt?: string }).createdAt;
    const bTime = (b as T & { createdAt?: string }).createdAt;
    if (aTime && bTime) {
      return new Date(aTime).getTime() - new Date(bTime).getTime();
    }
    return a.id.localeCompare(b.id);
  });
}
