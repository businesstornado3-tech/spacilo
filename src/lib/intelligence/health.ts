/**
 * Intelligence health and diagnostics.
 *
 * Rolling per-slot statistics so a surface can honestly say "Spacilo AI is
 * ready", "working" or "unavailable" instead of guessing. Counters only — no
 * request contents are ever retained.
 */
import type { ProviderSlot } from "./providers";

export type IntelligenceStatus = "ready" | "processing" | "degraded" | "unavailable";

export interface ProviderHealth {
  slot: ProviderSlot;
  provider: string;
  status: IntelligenceStatus;
  /** Mean latency in milliseconds across recorded runs. */
  latencyMs: number;
  successRate: number;
  runs: number;
  lastRunAt: number | null;
}

interface Stats {
  provider: string;
  runs: number;
  successes: number;
  totalMs: number;
  lastRunAt: number | null;
  inFlight: number;
}

const stats = new Map<ProviderSlot, Stats>();

function statsFor(slot: ProviderSlot, provider: string): Stats {
  const existing = stats.get(slot);
  if (existing && existing.provider === provider) return existing;
  const fresh: Stats = { provider, runs: 0, successes: 0, totalMs: 0, lastRunAt: null, inFlight: 0 };
  stats.set(slot, fresh);
  return fresh;
}

export function markProcessing(slot: ProviderSlot, provider: string): void {
  statsFor(slot, provider).inFlight += 1;
}

export function recordOutcome(
  slot: ProviderSlot,
  provider: string,
  success: boolean,
  durationMs: number,
): void {
  const entry = statsFor(slot, provider);
  entry.runs += 1;
  if (success) entry.successes += 1;
  entry.totalMs += durationMs;
  entry.lastRunAt = Date.now();
  entry.inFlight = Math.max(0, entry.inFlight - 1);
}

function statusFor(entry: Stats): IntelligenceStatus {
  if (entry.inFlight > 0) return "processing";
  if (entry.runs === 0) return "ready";
  const rate = entry.successes / entry.runs;
  if (rate === 0) return "unavailable";
  if (rate < 0.8) return "degraded";
  return "ready";
}

export function providerHealth(slot: ProviderSlot, provider: string): ProviderHealth {
  const entry = statsFor(slot, provider);
  return {
    slot,
    provider,
    status: statusFor(entry),
    latencyMs: entry.runs === 0 ? 0 : Math.round(entry.totalMs / entry.runs),
    successRate: entry.runs === 0 ? 1 : Math.round((entry.successes / entry.runs) * 100) / 100,
    runs: entry.runs,
    lastRunAt: entry.lastRunAt,
  };
}

/** Worst status across the platform — what a status chip should display. */
export function overallStatus(all: ProviderHealth[]): IntelligenceStatus {
  if (all.some((entry) => entry.status === "unavailable")) return "unavailable";
  if (all.some((entry) => entry.status === "processing")) return "processing";
  if (all.some((entry) => entry.status === "degraded")) return "degraded";
  return "ready";
}

export function resetHealth(): void {
  stats.clear();
}
