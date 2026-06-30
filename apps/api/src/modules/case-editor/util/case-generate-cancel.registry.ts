/**
 * 案例生成取消槽（进程内内存，不持久化）
 *
 * 仅用于用户点击「停止」：
 * - registerCaseGenerate：生成开始时记录「取消后应回退到什么状态」
 * - cancelCaseGenerate：标记 cancelled，generateCasesInternal 内 shouldAbort 会感知
 * - revert：cancelGenerateCases 把 DB 状态写回 revertStatus
 *
 * 刷新页面、关浏览器不会写这个 registry；服务重启后 registry 清空。
 */

import type { TestPointInstructEntity } from "@dynamic-instruct/entity/test-point-instruct.entity";

type InstructStatus = TestPointInstructEntity["status"];

interface GenerateSlot {
  cancelled: boolean;
  /** 取消时恢复到的动态指令状态（已编辑 或 再编辑） */
  revertStatus: InstructStatus;
}

const slots = new Map<string, GenerateSlot>();

function slotKey(projectId: string, testPointId: string) {
  return `${projectId}:${testPointId}`;
}

/** 生成任务开始时登记；revertStatus 取自当前 DB 状态 */
export function registerCaseGenerate(
  projectId: string,
  testPointId: string,
  revertStatus: InstructStatus,
) {
  slots.set(slotKey(projectId, testPointId), {
    cancelled: false,
    revertStatus,
  });
}

/** 用户点「停止」时调用，不直接改 DB（由 cancelGenerateCases 统一 revert） */
export function cancelCaseGenerate(projectId: string, testPointId: string) {
  const slot = slots.get(slotKey(projectId, testPointId));
  if (slot) {
    slot.cancelled = true;
  }
  return slot;
}

export function isCaseGenerateCancelled(projectId: string, testPointId: string) {
  return slots.get(slotKey(projectId, testPointId))?.cancelled ?? false;
}

export function getCaseGenerateRevertStatus(
  projectId: string,
  testPointId: string,
): InstructStatus | undefined {
  return slots.get(slotKey(projectId, testPointId))?.revertStatus;
}

/** 单条生成结束（成功/失败/取消）后清理内存槽 */
export function clearCaseGenerateSlot(projectId: string, testPointId: string) {
  slots.delete(slotKey(projectId, testPointId));
}
