import type { CaseGenerateJobEntity } from "../entity/case-generate-job.entity";

/** 无历史样本时的默认单次生成耗时（秒） */
export const DEFAULT_CASE_GENERATE_RUN_SECONDS = 120;

const MIN_RUN_SECONDS = 30;
const MAX_RUN_SECONDS = 600;

export function resolveAverageRunSeconds(jobs: CaseGenerateJobEntity[]) {
  const durations = jobs
    .map((job) => {
      if (!job.startedAt || !job.finishedAt) {
        return null;
      }
      const seconds = (job.finishedAt.getTime() - job.startedAt.getTime()) / 1000;
      if (!Number.isFinite(seconds) || seconds < MIN_RUN_SECONDS) {
        return null;
      }
      return Math.min(seconds, MAX_RUN_SECONDS);
    })
    .filter((value): value is number => value !== null);

  if (!durations.length) {
    return DEFAULT_CASE_GENERATE_RUN_SECONDS;
  }

  durations.sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  if (durations.length % 2 === 0) {
    return Math.round((durations[mid - 1] + durations[mid]) / 2);
  }
  return Math.round(durations[mid]);
}

export function estimateWaitSeconds(
  queueIndex: number,
  concurrency: number,
  averageRunSeconds: number,
) {
  if (queueIndex <= 0) {
    return 0;
  }
  return Math.ceil(queueIndex / Math.max(1, concurrency)) * averageRunSeconds;
}

export function estimateRemainingSeconds(
  startedAt: Date,
  averageRunSeconds: number,
  now = Date.now(),
) {
  const elapsed = Math.max(0, Math.floor((now - startedAt.getTime()) / 1000));
  return Math.max(15, averageRunSeconds - elapsed);
}
