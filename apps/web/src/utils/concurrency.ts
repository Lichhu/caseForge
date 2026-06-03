/** 限制并发执行异步任务，避免同时打满 AI 工作流 */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
  onTaskSettled?: (index: number, result: PromiseSettledResult<T>) => void,
): Promise<PromiseSettledResult<T>[]> {
  if (!tasks.length) {
    return [];
  }
  const concurrency = Math.max(1, Math.min(limit, tasks.length));
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= tasks.length) {
        return;
      }
      try {
        const value = await tasks[current]();
        const settled: PromiseSettledResult<T> = { status: 'fulfilled', value };
        results[current] = settled;
        onTaskSettled?.(current, settled);
      } catch (reason) {
        const settled: PromiseSettledResult<T> = { status: 'rejected', reason };
        results[current] = settled;
        onTaskSettled?.(current, settled);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

export function readGenerateConcurrency(
  raw: string | undefined,
  fallback = 2,
  max = 4,
) {
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}
