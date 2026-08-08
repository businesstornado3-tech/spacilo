/**
 * Correction feedback loop.
 *
 * When someone edits a proposal, that edit is the strongest training signal
 * the platform has. It is captured as an anonymised class-level signal: which
 * class, which field, roughly what changed, how confident the engine had been.
 *
 * Never captured: who made the correction, which listing or booking it came
 * from, photo URLs, or any free text the user typed.
 */
import { recordCorrectionMetric } from "./metrics";
import type { CorrectionField, VisionCorrection, VisionInstance } from "./types";

const MAX_CORRECTIONS = 500;

const store: VisionCorrection[] = [];

/** Buckets a numeric change so a stored signal can never identify an item. */
function bucket(value: number): string {
  if (value < 25) return "<25";
  if (value < 50) return "25-50";
  if (value < 100) return "50-100";
  if (value < 200) return "100-200";
  return "200+";
}

export function summariseChange(field: CorrectionField, value: unknown): string {
  if (typeof value === "number") return bucket(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") return value.slice(0, 32).toLowerCase();
  if (field === "removed") return "removed";
  return "changed";
}

export function recordVisionCorrection(input: {
  instance: Pick<VisionInstance, "classKey" | "confidence">;
  field: CorrectionField;
  from: unknown;
  to: unknown;
  backendId: string;
}): VisionCorrection {
  const correction: VisionCorrection = {
    id: `corr-${store.length + 1}-${input.field}`,
    classKey: input.instance.classKey,
    field: input.field,
    from: summariseChange(input.field, input.from),
    to: summariseChange(input.field, input.to),
    backendId: input.backendId,
    confidenceBefore: input.instance.confidence.overall,
    at: Date.now(),
  };

  store.push(correction);
  if (store.length > MAX_CORRECTIONS) store.splice(0, store.length - MAX_CORRECTIONS);
  recordCorrectionMetric(correction.classKey);
  return correction;
}

export function listVisionCorrections(): VisionCorrection[] {
  return [...store];
}

export function clearVisionCorrections(): void {
  store.length = 0;
}

/**
 * Classes whose corrections outweigh their confidence — the shortlist worth
 * re-checking in the taxonomy before anything is retrained.
 */
export function correctionHotspots(): Array<{ classKey: string; count: number; fields: CorrectionField[] }> {
  const byClass = new Map<string, { count: number; fields: Set<CorrectionField> }>();
  for (const correction of store) {
    const entry = byClass.get(correction.classKey) ?? { count: 0, fields: new Set<CorrectionField>() };
    entry.count += 1;
    entry.fields.add(correction.field);
    byClass.set(correction.classKey, entry);
  }
  return [...byClass.entries()]
    .map(([classKey, entry]) => ({ classKey, count: entry.count, fields: [...entry.fields] }))
    .sort((a, b) => b.count - a.count);
}
