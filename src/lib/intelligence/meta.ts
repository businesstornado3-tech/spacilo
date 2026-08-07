/**
 * Shared metadata helper.
 *
 * Every provider stamps its output the same way, so a stored result can always
 * be traced back to the engine and contract that produced it.
 */
import { CONTRACT_VERSION, type IntelligenceMeta } from "./contracts";

export function buildMeta(
  provider: { id: string; model: string },
  startedAt: number,
): IntelligenceMeta {
  const now = Date.now();
  return {
    provider: provider.id,
    model: provider.model,
    contractVersion: CONTRACT_VERSION,
    producedAt: now,
    latencyMs: Math.max(0, now - startedAt),
  };
}

/** Rejects with the standard cancellation error when the caller aborts. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new IntelligenceErrorRef("cancelled");
  }
}

// Imported lazily to keep this module free of cycles at type level.
import { IntelligenceError as IntelligenceErrorRef } from "./errors";
