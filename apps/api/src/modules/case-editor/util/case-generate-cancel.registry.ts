/**
 * ��������ȡ���ۣ��������ڴ棬���־û���
 *
 * �������û������ֹͣ����
 * - registerCaseGenerate�����ɿ�ʼʱ��¼��ȡ����Ӧ���˵�ʲô״̬��
 * - cancelCaseGenerate����� cancelled��generateCasesInternal �� shouldAbort ���֪
 * - revert��cancelGenerateCases �� DB ״̬д�� revertStatus
 *
 * ˢ��ҳ�桢�����������д��� registry������������ registry ��ա�
 */

import type { TestPointInstructEntity } from "@dynamic-instruct/entity/test-point-instruct.entity";

type InstructStatus = TestPointInstructEntity["status"];

interface GenerateSlot {
  cancelled: boolean;
  /** ȡ��ʱ�ָ����Ķ�ָ̬��״̬���ѱ༭ �� �ٱ༭�� */
  revertStatus: InstructStatus;
}

const slots = new Map<string, GenerateSlot>();

function slotKey(projectId: string, testPointId: string) {
  return `${projectId}:${testPointId}`;
}

/** ��������ʼʱ�Ǽǣ�revertStatus ȡ�Ե�ǰ DB ״̬ */
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

/** �û��㡸ֹͣ��ʱ���ã���ֱ�Ӹ� DB���� cancelGenerateCases ͳһ revert�� */
export function cancelCaseGenerate(projectId: string, testPointId: string) {
  const slot = slots.get(slotKey(projectId, testPointId));
  if (slot) {
    slot.cancelled = true;
  }
  return slot;
}

export function isCaseGenerateCancelled(
  projectId: string,
  testPointId: string,
) {
  return slots.get(slotKey(projectId, testPointId))?.cancelled ?? false;
}

export function getCaseGenerateRevertStatus(
  projectId: string,
  testPointId: string,
): InstructStatus | undefined {
  return slots.get(slotKey(projectId, testPointId))?.revertStatus;
}

/** �������ɽ������ɹ�/ʧ��/ȡ�����������ڴ�� */
export function clearCaseGenerateSlot(projectId: string, testPointId: string) {
  slots.delete(slotKey(projectId, testPointId));
}
