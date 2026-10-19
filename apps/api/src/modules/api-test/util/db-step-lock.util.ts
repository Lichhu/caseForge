/**
 * @file SQL 步骤占位锁：同一个资源名（默认数据库连接）同一时间只允许一个案例在跑
 *
 * 语义：
 * - 案例跑到第一个 SQL 步骤时开始占位，一直占到案例结束（成功、报错、超时都释放），
 *   这样从改开关到请求跑完这段时间不会被别的案例插进来改掉。
 * - 锁带最长持有时间（默认 10 分钟），到点自动释放，避免异常路径把库锁死。
 * - 排队有等待上限（默认 5 分钟），等不到直接报错，不让人无限干等。
 *
 * 注意：锁在单进程内存里，服务重启即清空；多实例部署时各实例不互斥。
 */
import { BadRequestException, Logger } from "@nestjs/common";

const logger = new Logger("DbStepLock");

/** 最长持有时间：10 分钟 */
const DEFAULT_HOLD_TIMEOUT_MS = 10 * 60 * 1000;
/** 排队等待上限：5 分钟 */
const DEFAULT_WAIT_TIMEOUT_MS = 5 * 60 * 1000;

export interface DbStepLockResource {
  /** 资源名，默认取数据库连接 id */
  key: string;
  /** 报错文案里展示的名字，如连接名 */
  label?: string;
}

export interface DbStepLockOptions {
  waitTimeoutMs?: number;
  holdTimeoutMs?: number;
}

interface Waiter {
  holderId: string;
  resolve: () => void;
  timer: NodeJS.Timeout;
}

interface LockHolder {
  holderId: string;
  holdTimeoutMs: number;
  leaseTimer?: NodeJS.Timeout;
  waiters: Waiter[];
}

const holders = new Map<string, LockHolder>();
let seq = 0;

function labelOf(resource: DbStepLockResource) {
  return resource.label?.trim() || resource.key;
}

/** 超过持有上限自动释放，避免释放路径遗漏或服务异常导致永久占用 */
function startLease(key: string, holder: LockHolder) {
  holder.leaseTimer = setTimeout(() => {
    if (holders.get(key) !== holder) return;
    logger.warn(`SQL 步骤占位超过 ${holder.holdTimeoutMs}ms 自动释放：${key}`);
    handOver(key, holder);
  }, holder.holdTimeoutMs);
  holder.leaseTimer.unref?.();
}

/** 把位子交给下一个排队者；没人排队就释放占位 */
function handOver(key: string, holder: LockHolder) {
  if (holder.leaseTimer) clearTimeout(holder.leaseTimer);
  const next = holder.waiters.shift();
  if (!next) {
    holders.delete(key);
    return;
  }
  clearTimeout(next.timer);
  const nextHolder: LockHolder = {
    holderId: next.holderId,
    holdTimeoutMs: holder.holdTimeoutMs,
    waiters: holder.waiters,
  };
  holders.set(key, nextHolder);
  startLease(key, nextHolder);
  next.resolve();
}

async function acquireOne(
  resource: DbStepLockResource,
  options: DbStepLockOptions,
): Promise<() => void> {
  const key = resource.key;
  const holdTimeoutMs = options.holdTimeoutMs ?? DEFAULT_HOLD_TIMEOUT_MS;
  const waitTimeoutMs = options.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const holderId = `h${++seq}`;
  const release = () => {
    const holder = holders.get(key);
    if (!holder || holder.holderId !== holderId) return;
    handOver(key, holder);
  };
  const current = holders.get(key);
  if (!current) {
    const holder: LockHolder = { holderId, holdTimeoutMs, waiters: [] };
    holders.set(key, holder);
    startLease(key, holder);
    return release;
  }
  await new Promise<void>((resolve, reject) => {
    const waiter: Waiter = {
      holderId,
      resolve,
      timer: setTimeout(() => {
        const position = current.waiters.indexOf(waiter);
        if (position >= 0) current.waiters.splice(position, 1);
        reject(
          new BadRequestException(
            `资源「${labelOf(resource)}」正被其它案例占用，已等待 ${Math.round(
              waitTimeoutMs / 1000,
            )} 秒仍未释放，请稍后重试`,
          ),
        );
      }, waitTimeoutMs),
    };
    waiter.timer.unref?.();
    current.waiters.push(waiter);
  });
  return release;
}

/**
 * 案例级占位会话：按需一次性抢多个资源（按 key 排序，避免互相等待），
 * 案例结束（成功、报错、超时）时统一释放。
 */
export class DbStepLockSession {
  private releases: Array<() => void> = [];
  private acquired = false;

  constructor(private readonly options: DbStepLockOptions = {}) {}

  get locked() {
    return this.acquired;
  }

  async acquire(resources: DbStepLockResource[]) {
    if (this.acquired || !resources.length) return;
    this.acquired = true;
    const ordered = [...resources].sort((a, b) => a.key.localeCompare(b.key));
    try {
      for (const resource of ordered)
        this.releases.push(await acquireOne(resource, this.options));
    } catch (error) {
      await this.release();
      throw error;
    }
  }

  async release() {
    const releases = this.releases;
    this.releases = [];
    this.acquired = false;
    for (const release of releases.reverse()) {
      try {
        release();
      } catch {
        // 单个资源释放失败不影响其余资源，避免把已占用的位子一起漏掉
      }
    }
  }
}

export function createDbStepLockSession(options: DbStepLockOptions = {}) {
  return new DbStepLockSession(options);
}

/** 单次占用，执行完立刻释放（单步调试 SQL 步骤用） */
export async function withDbStepLock<T>(
  resource: DbStepLockResource,
  fn: () => Promise<T>,
  options: DbStepLockOptions = {},
): Promise<T> {
  const release = await acquireOne(resource, options);
  try {
    return await fn();
  } finally {
    release();
  }
}

/** 当前占位状态，便于排查和测试 */
export function getDbStepLockState() {
  return [...holders.entries()].map(([key, holder]) => ({
    key,
    holderId: holder.holderId,
    waiting: holder.waiters.length,
  }));
}

/** 测试用：清空所有占位 */
export function resetDbStepLocksForTest() {
  for (const holder of holders.values()) {
    if (holder.leaseTimer) clearTimeout(holder.leaseTimer);
    for (const waiter of holder.waiters) clearTimeout(waiter.timer);
  }
  holders.clear();
  seq = 0;
}
