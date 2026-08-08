/**
 * AI job queue and background workers.
 *
 * Long-running AI work never blocks a surface: it is submitted here, the
 * caller gets a job id and progress immediately, and a worker drains the queue
 * with priority ordering, retries, cancellation and failure recovery.
 */
import { aiConfig } from "./config";
import { AiError, toAiError } from "./errors";
import type { AiCapability, AiPriority } from "./types";

export type AiJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface AiJob<T = unknown> {
  id: string;
  capability: AiCapability;
  label: string;
  status: AiJobStatus;
  priority: AiPriority;
  progress: number;
  attempts: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  result?: T;
  errorCode?: string;
  errorMessage?: string;
}

export interface AiJobContext {
  jobId: string;
  attempt: number;
  signal: AbortSignal;
  report(progress: number): void;
}

interface Entry<T> {
  job: AiJob<T>;
  run: (context: AiJobContext) => Promise<T>;
  controller: AbortController;
  resolve: (job: AiJob<T>) => void;
}

const PRIORITY_ORDER: Record<AiPriority, number> = { high: 0, normal: 1, low: 2 };

const pending: Entry<unknown>[] = [];
const jobs = new Map<string, AiJob>();
const listeners = new Set<(job: AiJob) => void>();
const settlers = new Map<string, Array<(job: AiJob) => void>>();
let running = 0;
let sequence = 0;

export interface SubmitOptions {
  capability: AiCapability;
  label: string;
  priority?: AiPriority;
}

/** Submits work and returns the queued job immediately. */
export function submitAiJob<T>(
  options: SubmitOptions,
  run: (context: AiJobContext) => Promise<T>,
): AiJob<T> {
  sequence += 1;
  const job: AiJob<T> = {
    id: `job_${Date.now().toString(36)}_${sequence.toString(36)}`,
    capability: options.capability,
    label: options.label,
    status: "queued",
    priority: options.priority ?? "normal",
    progress: 0,
    attempts: 0,
    createdAt: Date.now(),
  };
  jobs.set(job.id, job as AiJob);
  const entry: Entry<T> = {
    job,
    run,
    controller: new AbortController(),
    resolve: () => {},
  };
  pending.push(entry as Entry<unknown>);
  pending.sort((a, b) => PRIORITY_ORDER[a.job.priority] - PRIORITY_ORDER[b.job.priority]);
  notify(job as AiJob);
  void drain();
  return job;
}

/** Resolves when the job reaches a terminal state. */
export function awaitAiJob<T>(jobId: string): Promise<AiJob<T>> {
  const job = jobs.get(jobId);
  if (!job) return Promise.reject(new AiError("invalid_input", "unknown job"));
  if (isTerminal(job.status)) return Promise.resolve(job as AiJob<T>);
  return new Promise((resolve) => {
    const list = settlers.get(jobId) ?? [];
    list.push((settled) => resolve(settled as AiJob<T>));
    settlers.set(jobId, list);
  });
}

export function cancelAiJob(jobId: string): boolean {
  const index = pending.findIndex((entry) => entry.job.id === jobId);
  if (index >= 0) {
    const [entry] = pending.splice(index, 1);
    if (entry) finish(entry.job, { status: "cancelled" });
    return true;
  }
  const active = activeControllers.get(jobId);
  if (active) {
    active.abort();
    return true;
  }
  return false;
}

export function getAiJob<T>(jobId: string): AiJob<T> | undefined {
  return jobs.get(jobId) as AiJob<T> | undefined;
}

export function listAiJobs(filter?: { status?: AiJobStatus; capability?: AiCapability }): AiJob[] {
  return [...jobs.values()].filter(
    (job) =>
      (!filter?.status || job.status === filter.status) &&
      (!filter?.capability || job.capability === filter.capability),
  );
}

export function onAiJobUpdate(listener: (job: AiJob) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function aiQueueStats(): { queued: number; running: number; total: number } {
  return { queued: pending.length, running, total: jobs.size };
}

export function resetAiQueue(): void {
  for (const controller of activeControllers.values()) controller.abort();
  activeControllers.clear();
  pending.length = 0;
  jobs.clear();
  settlers.clear();
  listeners.clear();
  running = 0;
}

const activeControllers = new Map<string, AbortController>();

async function drain(): Promise<void> {
  const { concurrency } = aiConfig().queue;
  while (running < concurrency && pending.length > 0) {
    const entry = pending.shift();
    if (!entry) break;
    running += 1;
    void execute(entry).finally(() => {
      running -= 1;
      prune();
      void drain();
    });
  }
}

async function execute(entry: Entry<unknown>): Promise<void> {
  const { maxAttempts, backoffMs } = aiConfig().queue;
  const { job } = entry;
  activeControllers.set(job.id, entry.controller);
  job.status = "running";
  job.startedAt = Date.now();
  notify(job);

  let lastError: AiError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (entry.controller.signal.aborted) {
      finish(job, { status: "cancelled" });
      activeControllers.delete(job.id);
      return;
    }
    job.attempts = attempt;
    try {
      const result = await entry.run({
        jobId: job.id,
        attempt,
        signal: entry.controller.signal,
        report: (progress) => {
          job.progress = Math.min(1, Math.max(0, progress));
          notify(job);
        },
      });
      finish(job, { status: "succeeded", result });
      activeControllers.delete(job.id);
      return;
    } catch (error) {
      lastError = toAiError(error);
      if (lastError.code === "cancelled") {
        finish(job, { status: "cancelled" });
        activeControllers.delete(job.id);
        return;
      }
      if (!lastError.retryable || attempt === maxAttempts) break;
      await delay(backoffMs * attempt);
    }
  }

  finish(job, {
    status: "failed",
    ...(lastError ? { errorCode: lastError.code, errorMessage: lastError.message } : {}),
  });
  activeControllers.delete(job.id);
}

function finish(
  job: AiJob,
  patch: { status: AiJobStatus; result?: unknown; errorCode?: string; errorMessage?: string },
): void {
  job.status = patch.status;
  job.finishedAt = Date.now();
  if (patch.status === "succeeded") {
    job.progress = 1;
    job.result = patch.result;
  }
  if (patch.errorCode) job.errorCode = patch.errorCode;
  if (patch.errorMessage) job.errorMessage = patch.errorMessage;
  notify(job);
  const waiting = settlers.get(job.id);
  if (waiting) {
    settlers.delete(job.id);
    for (const resolve of waiting) resolve(job);
  }
}

function notify(job: AiJob): void {
  for (const listener of [...listeners]) listener({ ...job });
}

function prune(): void {
  const cutoff = Date.now() - aiConfig().queue.historyMs;
  for (const [id, job] of jobs) {
    if (isTerminal(job.status) && (job.finishedAt ?? 0) < cutoff) jobs.delete(id);
  }
}

function isTerminal(status: AiJobStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
