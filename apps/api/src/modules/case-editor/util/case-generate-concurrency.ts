/**
 * 案例生成全局并发控制（单 API 进程内内存队列）
 *
 * 所有用户的 AI 案例生成共享同一组槽位，防止同时打满 AI Chat 接口。
 * 环境变量 CASE_GENERATE_CONCURRENCY：同时进行的 AI 调用数，默认 2，最大 32。
 *
 * 注意：多实例部署时每个实例各自计数，总并发 = 实例数 × limit。
 */

const DEFAULT_CONCURRENCY = 2;
const MAX_CONCURRENCY = 32;

/** 当前占用的槽位数 */
let activeCount = 0;
/** 等待槽位的任务队列（FIFO） */
const waitQueue: Array<() => void> = [];
const slotReleaseHooks = new Set<() => void>();

/** 注册槽位释放回调（用于立刻拉起队列中的下一个生成任务） */
export function registerCaseGenerateSlotReleaseHook(hook: () => void) {
  slotReleaseHooks.add(hook);
  return () => slotReleaseHooks.delete(hook);
}

/** 单队列兼容：覆盖全部槽位释放回调 */
export function setCaseGenerateSlotReleaseHook(hook: (() => void) | undefined) {
  slotReleaseHooks.clear();
  if (hook) {
    slotReleaseHooks.add(hook);
  }
}

/** 当前占用的槽位数 */
export function getCaseGenerateActiveCount() {
  return activeCount;
}

/** 当前等待槽位的任务数 */
export function getCaseGenerateWaitingCount() {
  return waitQueue.length;
}

/** 从环境变量读取案例生成并发上限 */
export function getCaseGenerateConcurrency() {
  const raw = process.env.CASE_GENERATE_CONCURRENCY;
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
  }
  for (const hook of slotReleaseHooks) {
    hook();
  }
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

/**
 * 在全局并发槽内执行一次案例生成（单条 testPoint 占一槽，直到 AI 返回）
 *
 * 用法：withCaseGenerateSlot(() => generateCasesInternal(...))
 */
export async function withCaseGenerateSlot<T>(fn: () => Promise<T>) {
  const limit = getCaseGenerateConcurrency();
  await acquireSlot(limit);
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}
