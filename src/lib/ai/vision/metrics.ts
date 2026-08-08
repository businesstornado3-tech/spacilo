/**
 * Vision metrics.
 *
 * Operational visibility for the vision stack: how often each backend is used,
 * how long it takes, how confident it is, how often it falls back and how
 * often a person corrects it. Nothing user-identifying is recorded — a metric
 * row knows a backend, a stage and a number, never who uploaded what.
 */
export interface VisionRunMetric {
  backendId: string;
  vendor: string;
  photoCount: number;
  instanceCount: number;
  latencyMs: number;
  confidence: number;
  fallbackUsed: boolean;
  failed: boolean;
  at: number;
}

export interface VisionMetricsSnapshot {
  runs: number;
  failures: number;
  fallbacks: number;
  averageLatencyMs: number;
  averageConfidence: number;
  averageInstances: number;
  /** Runs per backend id, most used first. */
  byBackend: Array<{ backendId: string; runs: number; failures: number; averageLatencyMs: number }>;
  corrections: number;
  /** Classes people correct most often — the retraining shortlist. */
  topCorrectedClasses: Array<{ classKey: string; count: number }>;
}

const MAX_ROWS = 200;

const runs: VisionRunMetric[] = [];
const corrections = new Map<string, number>();

export function recordVisionRun(metric: VisionRunMetric): void {
  runs.push(metric);
  if (runs.length > MAX_ROWS) runs.splice(0, runs.length - MAX_ROWS);
}

export function recordCorrectionMetric(classKey: string): void {
  corrections.set(classKey, (corrections.get(classKey) ?? 0) + 1);
}

export function resetVisionMetrics(): void {
  runs.length = 0;
  corrections.clear();
}

const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

export function visionMetrics(): VisionMetricsSnapshot {
  const byBackend = new Map<string, { runs: number; failures: number; latency: number[] }>();
  for (const run of runs) {
    const entry = byBackend.get(run.backendId) ?? { runs: 0, failures: 0, latency: [] };
    entry.runs += 1;
    if (run.failed) entry.failures += 1;
    entry.latency.push(run.latencyMs);
    byBackend.set(run.backendId, entry);
  }

  return {
    runs: runs.length,
    failures: runs.filter((run) => run.failed).length,
    fallbacks: runs.filter((run) => run.fallbackUsed).length,
    averageLatencyMs: Math.round(mean(runs.map((run) => run.latencyMs))),
    averageConfidence: Math.round(mean(runs.map((run) => run.confidence)) * 100) / 100,
    averageInstances: Math.round(mean(runs.map((run) => run.instanceCount)) * 10) / 10,
    byBackend: [...byBackend.entries()]
      .map(([backendId, entry]) => ({
        backendId,
        runs: entry.runs,
        failures: entry.failures,
        averageLatencyMs: Math.round(mean(entry.latency)),
      }))
      .sort((a, b) => b.runs - a.runs),
    corrections: [...corrections.values()].reduce((sum, count) => sum + count, 0),
    topCorrectedClasses: [...corrections.entries()]
      .map(([classKey, count]) => ({ classKey, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}
