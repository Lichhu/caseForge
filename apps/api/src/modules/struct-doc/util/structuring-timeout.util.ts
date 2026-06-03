const DEFAULT_TIMEOUT_MINUTES = 10;

/** 结构化任务最长执行时间（毫秒），可通过 STRUCTURING_TIMEOUT_MINUTES 配置 */
export function getStructuringTimeoutMs() {
  const raw = process.env.STRUCTURING_TIMEOUT_MINUTES;
  const minutes = raw ? Number(raw) : DEFAULT_TIMEOUT_MINUTES;
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_TIMEOUT_MINUTES * 60000;
  }
  return minutes * 60000;
}

export function getStructuringTimeoutMinutes() {
  return Math.round(getStructuringTimeoutMs() / 60000);
}

export function buildStructuringTimeoutMessage() {
  return `结构化超时（已超过 ${getStructuringTimeoutMinutes()} 分钟），请重新点击「结构化」`;
}

/** 服务重启时中断的后台任务提示 */
export function buildStructuringInterruptedMessage() {
  return "服务重启导致结构化任务中断，请重新点击「结构化」";
}

/** 用户主动取消结构化 */
export function buildStructuringCancelledMessage() {
  return "已取消结构化，请重新点击「结构化」";
}

/** processing 且开始时间缺失或已超过时限 */
export function isStructuringTimedOut(
  structuringStartedAt?: Date | null,
  nowMs = Date.now(),
) {
  const timeoutMs = getStructuringTimeoutMs();
  if (!structuringStartedAt) {
    return true;
  }
  return nowMs - structuringStartedAt.getTime() > timeoutMs;
}

/** 与 DB datetime（秒级）对齐，避免毫秒精度导致任务被误判为已过期 */
export function isSameStructuringTaskStart(
  dbStartedAt: Date,
  taskStartedAt: Date,
) {
  return (
    Math.floor(dbStartedAt.getTime() / 1000) ===
    Math.floor(taskStartedAt.getTime() / 1000)
  );
}
