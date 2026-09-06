/**
 * Self-hosted generation queue and GPU protection.
 *
 * A GPU worker is a finite, shared resource. Everything here is a pure decision
 * function so admission control can be tested without a worker present.
 */
import type { WorkerLimits } from "./worker-config";

export type VideoJobState =
  | "QUEUED"
  | "GENERATING"
  | "RENDERING"
  | "VALIDATING"
  | "READY"
  | "FAILED"
  | "CANCELLED";

export const ACTIVE_JOB_STATES: readonly VideoJobState[] = [
  "QUEUED",
  "GENERATING",
  "RENDERING",
  "VALIDATING",
];

export function isTerminal(state: VideoJobState): boolean {
  return state === "READY" || state === "FAILED" || state === "CANCELLED";
}

/** Legal state transitions. Anything else is a bug, not a status update. */
const TRANSITIONS: Record<VideoJobState, readonly VideoJobState[]> = {
  QUEUED: ["GENERATING", "CANCELLED", "FAILED"],
  GENERATING: ["RENDERING", "FAILED", "CANCELLED"],
  RENDERING: ["VALIDATING", "FAILED", "CANCELLED"],
  VALIDATING: ["READY", "FAILED"],
  READY: [],
  FAILED: ["QUEUED"],
  CANCELLED: ["QUEUED"],
};

export function mayTransition(from: VideoJobState, to: VideoJobState): boolean {
  return TRANSITIONS[from].includes(to);
}

export type QueueCounts = {
  running: number;
  queued: number;
  startedToday: number;
};

export type AdmissionDecision =
  | { admit: true; state: "GENERATING" | "QUEUED"; reason: string }
  | { admit: false; reason: string };

/**
 * Decides whether a new job may start immediately, must wait, or must be
 * refused. Refusal protects the GPU; queueing never silently drops work.
 */
export function admitJob(
  counts: QueueCounts,
  limits: WorkerLimits,
  request: { seconds: number; resolution: string },
): AdmissionDecision {
  if (request.seconds > limits.maxVideoSeconds) {
    return {
      admit: false,
      reason: `Requested ${request.seconds}s exceeds the worker's maximum of ${limits.maxVideoSeconds}s.`,
    };
  }
  if (!limits.allowedResolutions.includes(request.resolution)) {
    return {
      admit: false,
      reason: `${request.resolution} is above the configured maximum resolution for this worker.`,
    };
  }
  if (counts.startedToday >= limits.maxJobsPerDay) {
    return {
      admit: false,
      reason: `The worker's daily job limit (${limits.maxJobsPerDay}) has been reached.`,
    };
  }
  if (counts.running >= limits.maxConcurrentJobs) {
    if (counts.queued >= limits.maxQueueLength) {
      return {
        admit: false,
        reason: `The generation queue is full (${limits.maxQueueLength} waiting). Try again once a job finishes.`,
      };
    }
    return {
      admit: true,
      state: "QUEUED",
      reason: `The worker is busy, so this job is queued behind ${counts.running + counts.queued} other${counts.running + counts.queued === 1 ? "" : "s"}.`,
    };
  }
  return { admit: true, state: "GENERATING", reason: "The worker is free, so generation started." };
}

/** Higher runs first. Final quality outranks drafts; older jobs outrank newer. */
export function jobPriority(input: {
  tier: "draft" | "final";
  createdAt: number;
  now: number;
}): number {
  const base = input.tier === "final" ? 100 : 50;
  const ageMinutes = Math.max(0, (input.now - input.createdAt) / 60_000);
  return base + Math.min(50, Math.round(ageMinutes));
}

export function nextJob<T extends { tier: "draft" | "final"; createdAt: number; state: string }>(
  jobs: readonly T[],
  now: number,
): T | null {
  const waiting = jobs.filter((job) => job.state === "QUEUED");
  if (waiting.length === 0) return null;
  return [...waiting].sort(
    (a, b) =>
      jobPriority({ tier: b.tier, createdAt: b.createdAt, now }) -
      jobPriority({ tier: a.tier, createdAt: a.createdAt, now }),
  )[0]!;
}
