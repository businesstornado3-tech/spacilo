/**
 * AI metrics.
 *
 * Rolling counters the platform can expose to an internal dashboard later:
 * latency, uptime, failure rate, cache efficiency, fallback usage, confidence,
 * volume, tokens and estimated spend. No personal data, ever.
 */
import { aiConfig } from "./config";
import { aiCacheStats } from "./cache";
import type { AiCapability } from "./types";

interface Counters {
  requests: number;
  successes: number;
  failures: number;
  cancelled: number;
  cacheHits: number;
  fallbacks: number;
  totalLatencyMs: number;
  totalConfidence: number;
  confidenceSamples: number;
  totalTokens: number;
  totalCostPence: number;
  lastAt: number;
}

function blank(): Counters {
  return {
    requests: 0,
    successes: 0,
    failures: 0,
    cancelled: 0,
    cacheHits: 0,
    fallbacks: 0,
    totalLatencyMs: 0,
    totalConfidence: 0,
    confidenceSamples: 0,
    totalTokens: 0,
    totalCostPence: 0,
    lastAt: 0,
  };
}

const byCapability = new Map<AiCapability, Counters>();
const byProvider = new Map<string, Counters>();
const daily = new Map<string, number>();
let overall = blank();

export interface AiMetricSample {
  capability: AiCapability;
  provider: string;
  success: boolean;
  cancelled?: boolean;
  latencyMs: number;
  confidence: number;
  cached: boolean;
  fallbackUsed: boolean;
  totalTokens: number;
  estimatedCostPence: number;
}

export function recordAiMetric(sample: AiMetricSample): void {
  for (const counters of [
    overall,
    get(byCapability, sample.capability),
    get(byProvider, sample.provider),
  ]) {
    counters.requests += 1;
    counters.lastAt = Date.now();
    if (sample.cancelled) counters.cancelled += 1;
    else if (sample.success) counters.successes += 1;
    else counters.failures += 1;
    if (sample.cached) counters.cacheHits += 1;
    if (sample.fallbackUsed) counters.fallbacks += 1;
    counters.totalLatencyMs += sample.latencyMs;
    if (sample.confidence > 0) {
      counters.totalConfidence += sample.confidence;
      counters.confidenceSamples += 1;
    }
    counters.totalTokens += sample.totalTokens;
    counters.totalCostPence += sample.estimatedCostPence;
  }
  const day = new Date().toISOString().slice(0, 10);
  daily.set(day, (daily.get(day) ?? 0) + 1);
}

export interface AiMetricsSnapshot {
  requests: number;
  successRate: number;
  failureRate: number;
  averageLatencyMs: number;
  averageConfidence: number;
  cacheHitRate: number;
  fallbackRate: number;
  totalTokens: number;
  estimatedSpendPence: number;
  /** Straight-line projection from today's spend. */
  projectedMonthlyPence: number;
  budgetPence: number;
  requestsToday: number;
  lastAt: number;
}

function snapshotOf(counters: Counters): AiMetricsSnapshot {
  const { requests } = counters;
  const today = new Date().toISOString().slice(0, 10);
  return {
    requests,
    successRate: requests ? counters.successes / requests : 1,
    failureRate: requests ? counters.failures / requests : 0,
    averageLatencyMs: requests ? Math.round(counters.totalLatencyMs / requests) : 0,
    averageConfidence: counters.confidenceSamples
      ? counters.totalConfidence / counters.confidenceSamples
      : 0,
    cacheHitRate: requests ? counters.cacheHits / requests : 0,
    fallbackRate: requests ? counters.fallbacks / requests : 0,
    totalTokens: counters.totalTokens,
    estimatedSpendPence: Math.round(counters.totalCostPence),
    projectedMonthlyPence: Math.round(counters.totalCostPence * 30),
    budgetPence: aiConfig().cost.monthlyBudgetPence,
    requestsToday: daily.get(today) ?? 0,
    lastAt: counters.lastAt,
  };
}

export function aiMetrics(): AiMetricsSnapshot & { cache: ReturnType<typeof aiCacheStats> } {
  return { ...snapshotOf(overall), cache: aiCacheStats() };
}

export function aiMetricsByCapability(): Record<string, AiMetricsSnapshot> {
  const out: Record<string, AiMetricsSnapshot> = {};
  for (const [key, counters] of byCapability) out[key] = snapshotOf(counters);
  return out;
}

export function aiMetricsByProvider(): Record<string, AiMetricsSnapshot & { uptime: number }> {
  const out: Record<string, AiMetricsSnapshot & { uptime: number }> = {};
  for (const [key, counters] of byProvider) {
    const snapshot = snapshotOf(counters);
    out[key] = { ...snapshot, uptime: snapshot.successRate };
  }
  return out;
}

/** True when projected spend has passed the configured ceiling. */
export function isOverBudget(): boolean {
  const snapshot = snapshotOf(overall);
  return snapshot.projectedMonthlyPence > snapshot.budgetPence;
}

export function resetAiMetrics(): void {
  overall = blank();
  byCapability.clear();
  byProvider.clear();
  daily.clear();
}

function get<K>(map: Map<K, Counters>, key: K): Counters {
  const existing = map.get(key);
  if (existing) return existing;
  const created = blank();
  map.set(key, created);
  return created;
}
