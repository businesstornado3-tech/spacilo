/**
 * AI logger.
 *
 * Structured, privacy-safe breadcrumbs for every AI request. Photos, free text
 * and identifiers never enter a log line — only ids, timing, usage and status.
 * Users never see these; diagnostics read the buffer.
 */
import { aiConfig } from "./config";
import { redactForLog } from "./security";
import type { AiCapability } from "./types";

export type AiLogStatus = "started" | "succeeded" | "failed" | "cached" | "queued" | "cancelled";

export interface AiLogEntry {
  requestId: string;
  at: number;
  capability: AiCapability;
  provider: string;
  model: string;
  status: AiLogStatus;
  latencyMs: number;
  totalTokens: number;
  estimatedCostPence: number;
  confidence: number;
  attempts: number;
  cached: boolean;
  fallbackUsed: boolean;
  errorCode?: string;
  /** Internal-only, already redacted. */
  detail?: string;
}

const buffer: AiLogEntry[] = [];
const listeners = new Set<(entry: AiLogEntry) => void>();

export function logAi(entry: Omit<AiLogEntry, "at">): void {
  const { logging } = aiConfig();
  if (!logging.enabled) return;
  const full: AiLogEntry = {
    ...entry,
    ...(entry.detail ? { detail: redactForLog(entry.detail).slice(0, 300) } : {}),
    at: Date.now(),
  };
  buffer.push(full);
  if (buffer.length > logging.maxEntries) buffer.shift();
  for (const listener of [...listeners]) listener(full);
  if (!logging.verbose) return;
  const line = `[spacilo-ai] ${full.capability}/${full.provider} ${full.status} ${full.latencyMs}ms`;
  if (full.status === "failed") console.error(line, { code: full.errorCode });
  else console.info(line);
}

export function onAiLog(listener: (entry: AiLogEntry) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function aiLogEntries(filter?: { capability?: AiCapability; status?: AiLogStatus }): AiLogEntry[] {
  return buffer.filter(
    (entry) =>
      (!filter?.capability || entry.capability === filter.capability) &&
      (!filter?.status || entry.status === filter.status),
  );
}

export function clearAiLog(): void {
  buffer.length = 0;
}
