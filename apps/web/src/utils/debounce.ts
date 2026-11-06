/** 防抖：连续触发时只执行最后一次 */
export function debounce<T extends (...args: never[]) => void>(fn: T, waitMs: number) {
  let timer: number | undefined;
  return (...args: Parameters<T>) => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, waitMs);
  };
}
