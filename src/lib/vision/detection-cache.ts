/**
 * Detection cache and timing telemetry.
 *
 * Two small concerns that both exist for the same reason: scans must feel
 * fast. Re-analysing an unchanged photo with an unchanged selection is pure
 * waste, and we cannot improve what we do not measure.
 *
 * The cache is per-session and in-memory only — photographs of someone's
 * belongings are never persisted here.
 */
import type { DetectedObject } from "./types";
import { selectionsSignature, type PhotoSelection } from "./selection";

export interface CacheKeyInput {
  photos: { id: string; sizeBytes: number; rotation: number }[];
  selections: PhotoSelection[];
  mode: string;
}

export function detectionCacheKey({ photos, selections, mode }: CacheKeyInput): string {
  const photoPart = photos
    .map((photo) => `${photo.id}:${photo.sizeBytes}:${photo.rotation}`)
    .sort()
    .join("|");
  return `${mode}#${photoPart}#${selectionsSignature(selections)}`;
}

const MAX_ENTRIES = 12;
const store = new Map<string, DetectedObject[]>();

export function readDetectionCache(key: string): DetectedObject[] | null {
  const hit = store.get(key);
  if (!hit) return null;
  // Refresh recency.
  store.delete(key);
  store.set(key, hit);
  return hit.map((object) => ({ ...object }));
}

export function writeDetectionCache(key: string, objects: DetectedObject[]): void {
  store.set(
    key,
    objects.map((object) => ({ ...object })),
  );
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function clearDetectionCache(): void {
  store.clear();
  spaceStore.clear();
}

/* ------------------------------------------------------------------ */
/* Room model cache (Phase 6V)                                         */
/* ------------------------------------------------------------------ */

/**
 * Analysing the same room photograph twice is pure waste. The validated room
 * model is kept per session, keyed by the photographs, the marked region and
 * the declared space type — so changing only the belongings re-uses the room,
 * and changing the room photo invalidates it.
 */
const spaceStore = new Map<string, unknown>();

export function spaceCacheKey(input: CacheKeyInput & { spaceType?: string }): string {
  return `space:${input.spaceType ?? ""}#${detectionCacheKey(input)}`;
}

export function readSpaceCache<T>(key: string): T | null {
  const hit = spaceStore.get(key);
  if (hit === undefined) return null;
  spaceStore.delete(key);
  spaceStore.set(key, hit);
  return hit as T;
}

export function writeSpaceCache(key: string, value: unknown): void {
  spaceStore.set(key, value);
  while (spaceStore.size > MAX_ENTRIES) {
    const oldest = spaceStore.keys().next().value;
    if (oldest === undefined) break;
    spaceStore.delete(oldest);
  }
}


/* ------------------------------------------------------------------ */
/* Timing                                                              */
/* ------------------------------------------------------------------ */

/** Target for first analytical result, in milliseconds. */
export const DETECTION_TARGET_MS = 15_000;

const timings = new Map<string, number[]>();

export function recordTiming(stage: string, ms: number): void {
  const list = timings.get(stage) ?? [];
  list.push(Math.max(0, Math.round(ms)));
  if (list.length > 50) list.shift();
  timings.set(stage, list);
}

export function percentile(stage: string, p: number): number | null {
  const list = timings.get(stage);
  if (!list || list.length === 0) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index] ?? null;
}

export function timingSummary(): Record<string, { count: number; p50: number; p95: number }> {
  const out: Record<string, { count: number; p50: number; p95: number }> = {};
  for (const [stage, list] of timings) {
    out[stage] = {
      count: list.length,
      p50: percentile(stage, 50) ?? 0,
      p95: percentile(stage, 95) ?? 0,
    };
  }
  return out;
}

export function clearTimings(): void {
  timings.clear();
}
