import type { CaseGenerateJobEntity } from "../entity/case-generate-job.entity";

const DEFAULT_PER_USER_MAX = 2;
const MAX_PER_USER_MAX = 10;

/** 单用户同时 running 的任务上限（公平调度） */
export function getCaseGeneratePerUserMaxRunning() {
  const raw = process.env.CASE_GENERATE_PER_USER_MAX;
  const parsed = raw ? Number(raw) : DEFAULT_PER_USER_MAX;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PER_USER_MAX;
  }
  return Math.min(Math.floor(parsed), MAX_PER_USER_MAX);
}

export function normalizeJobUser(job: CaseGenerateJobEntity) {
  return job.createdBy?.trim() || "system";
}

export function buildRunningCountByUser(jobs: CaseGenerateJobEntity[]) {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const user = normalizeJobUser(job);
    counts.set(user, (counts.get(user) || 0) + 1);
  }
  return counts;
}

/** 每个用户队首任务（按 queuedAt 最早） */
export function buildQueuedHeadByUser(queuedJobs: CaseGenerateJobEntity[]) {
  const heads = new Map<string, CaseGenerateJobEntity>();
  for (const job of queuedJobs) {
    const user = normalizeJobUser(job);
    if (!heads.has(user)) {
      heads.set(user, job);
    }
  }
  return heads;
}

/**
 * 公平挑选下一条任务：优先 running 更少、且未达 perUserMax 的用户队首任务。
 * 若因 perUserMax 导致全局槽位闲置，则回退为全局 FIFO。
 */
export function pickFairQueuedJob(
  queuedJobs: CaseGenerateJobEntity[],
  runningByUser: Map<string, number>,
  perUserMax: number,
): CaseGenerateJobEntity | null {
  if (!queuedJobs.length) {
    return null;
  }

  const headsByUser = buildQueuedHeadByUser(queuedJobs);
  let best: CaseGenerateJobEntity | null = null;
  let bestRunning = Infinity;
  let bestQueuedAt = Infinity;

  for (const headJob of headsByUser.values()) {
    const user = normalizeJobUser(headJob);
    const running = runningByUser.get(user) || 0;
    if (running >= perUserMax) {
      continue;
    }
    const queuedAt = headJob.queuedAt.getTime();
    if (
      running < bestRunning ||
      (running === bestRunning && queuedAt < bestQueuedAt)
    ) {
      best = headJob;
      bestRunning = running;
      bestQueuedAt = queuedAt;
    }
  }

  if (best) {
    return best;
  }

  return queuedJobs[0] ?? null;
}

export function countUserQueuedAhead(
  job: CaseGenerateJobEntity,
  queuedJobs: CaseGenerateJobEntity[],
) {
  const user = normalizeJobUser(job);
  const jobTime = job.queuedAt.getTime();
  return queuedJobs.filter(
    (item) =>
      normalizeJobUser(item) === user && item.queuedAt.getTime() < jobTime,
  ).length;
}

export function countActiveUsers(jobs: CaseGenerateJobEntity[]) {
  return new Set(jobs.map((job) => normalizeJobUser(job))).size;
}

/** 公平调度下的等待时间估算 */
export function estimateFairWaitSeconds(input: {
  userQueuedAhead: number;
  concurrency: number;
  perUserMax: number;
  activeUsers: number;
  averageRunSeconds: number;
}) {
  const activeUsers = Math.max(1, input.activeUsers);
  const effectiveParallel = Math.max(
    1,
    Math.min(
      input.perUserMax,
      Math.floor(input.concurrency / activeUsers) || 1,
    ),
  );
  const rounds = Math.ceil((input.userQueuedAhead + 1) / effectiveParallel);
  return rounds * input.averageRunSeconds;
}
