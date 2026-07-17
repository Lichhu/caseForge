/** 按项目串行化案例树合并写入，避免并发 generate 读同一版 run 导致后写覆盖先写 */
const chains = new Map<string, Promise<unknown>>();

export function withProjectCaseTreeMerge<T>(
  projectId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = chains.get(projectId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => fn());
  chains.set(projectId, next);
  return next.finally(() => {
    if (chains.get(projectId) === next) {
      chains.delete(projectId);
    }
  });
}
