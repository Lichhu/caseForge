const DEFAULT_TIMEOUT_MINUTES = 10;
const DEFAULT_MAX_PLANNED_CHUNKS = 12;

/** 结构化任务最长执行时间（毫秒），可通过 STRUCTURING_TIMEOUT_MINUTES 配置 */
export function getStructuringTimeoutMs(chunkCount = 1) {
  const raw = process.env.STRUCTURING_TIMEOUT_MINUTES;
  const minutes = raw ? Number(raw) : DEFAULT_TIMEOUT_MINUTES;
  const baseMinutes =
    !Number.isFinite(minutes) || minutes <= 0
      ? DEFAULT_TIMEOUT_MINUTES
      : minutes;
  const extraPerChunk = Number(
    process.env.STRUCTURING_TIMEOUT_EXTRA_MINUTES_PER_CHUNK ?? 5,
  );
  const extraMinutes =
    chunkCount > 1 && Number.isFinite(extraPerChunk) && extraPerChunk > 0
      ? (chunkCount - 1) * extraPerChunk
      : 0;
  return (baseMinutes + extraMinutes) * 60000;
}

export function getStructuringMaxPlannedChunks() {
  const raw = process.env.STRUCTURING_MAX_PLANNED_CHUNKS;
  const parsed = raw ? Number(raw) : DEFAULT_MAX_PLANNED_CHUNKS;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_PLANNED_CHUNKS;
  }
  return Math.floor(parsed);
}

export function getStructuringTimeoutMinutes(chunkCount = 1) {
  return Math.round(getStructuringTimeoutMs(chunkCount) / 60000);
}

export function buildStructuringTimeoutMessage(chunkCount = 1) {
  return `结构化超时（已超过 ${getStructuringTimeoutMinutes(chunkCount)} 分钟），请重新点击「结构化」`;
}

/** 服务重启时中断的后台任务提示 */
export function buildStructuringInterruptedMessage() {
  return "服务重启导致结构化任务中断，请重新点击「结构化」";
}

/** 用户主动取消结构化 */
export function buildStructuringCancelledMessage() {
  return "已取消结构化，请重新点击「结构化」";
}

/** processing 且开始时间缺失或已超过时限（未指定分段数时使用最大预估分段） */
export function isStructuringTimedOut(
  structuringStartedAt?: Date | null,
  nowMs = Date.now(),
  chunkCount?: number,
) {
  const timeoutMs = getStructuringTimeoutMs(
    chunkCount ?? getStructuringMaxPlannedChunks(),
  );
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
