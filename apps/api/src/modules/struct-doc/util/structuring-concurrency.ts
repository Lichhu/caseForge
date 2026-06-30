const DEFAULT_CONCURRENCY = 2;
const MAX_CONCURRENCY = 5;

let activeCount = 0;
const waitQueue: Array<() => void> = [];
const activeProjectIds = new Set<string>();
let slotReleaseHook: (() => void) | undefined;

/** 注册槽位释放回调（用于立刻拉起队列中的下一个结构化任务） */
export function setStructuringSlotReleaseHook(hook: (() => void) | undefined) {
  slotReleaseHook = hook;
}

/** 从环境变量读取结构化并发上限（保护 AI Chat） */
export function getStructuringConcurrency() {
  const raw = process.env.STRUCTURING_CONCURRENCY;
  const parsed = raw ? Number(raw) : DEFAULT_CONCURRENCY;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CONCURRENCY;
  }
  return Math.min(Math.floor(parsed), MAX_CONCURRENCY);
}

function releaseSlot() {
  activeCount = Math.max(0, activeCount - 1);
  const next = waitQueue.shift();
  if (next) {
    next();
    return;
  }
  slotReleaseHook?.();
}

function acquireSlot(limit: number) {
  if (activeCount < limit) {
    activeCount += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(() => {
      activeCount += 1;
      resolve();
    });
  });
}

/** 项目是否正在占用结构化执行槽（含 AI 调用阶段，不含排队） */
export function isStructuringSlotActive(projectId: string) {
  return activeProjectIds.has(projectId);
}

/** 在全局并发槽内执行一次结构化（跨项目共享，最多同时 2 个） */
export async function withStructuringSlot<T>(
  projectId: string,
  fn: () => Promise<T>,
) {
  const limit = getStructuringConcurrency();
  await acquireSlot(limit);
  activeProjectIds.add(projectId);
  try {
    return await fn();
  } finally {
    activeProjectIds.delete(projectId);
    releaseSlot();
  }
}
