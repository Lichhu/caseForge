import { TestPointInstructStatus } from "@dynamic-instruct/entity/test-point-instruct.entity";

/** 动态指令列表状态排序：生成失败 → 待编辑 → 已编辑/再编辑 → 生成中 → 生成完成 */
const STATUS_SORT_ORDER: Record<TestPointInstructStatus, number> = {
  生成失败: 0,
  待编辑: 1,
  已编辑: 2,
  再编辑: 2,
  生成中: 3,
  生成完成: 4,
};

export function getTestPointStatusSortOrder(
  status: TestPointInstructStatus | string,
) {
  return STATUS_SORT_ORDER[status as TestPointInstructStatus] ?? 99;
}

export function compareTestPointsByStatus<
  T extends { status: string; createdAt?: Date | string },
>(a: T, b: T) {
  const byStatus =
    getTestPointStatusSortOrder(a.status) -
    getTestPointStatusSortOrder(b.status);
  if (byStatus !== 0) {
    return byStatus;
  }
  const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return aTime - bTime;
}
