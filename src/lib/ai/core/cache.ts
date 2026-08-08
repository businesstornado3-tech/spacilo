/**
 * AI cache.
 *
 * Repeat work is expensive and slow, so identical requests reuse a result for
 * a capability-configured window. Keys are content hashes: no photo bytes, no
 * free text and no identifiers are retained.
 */
import { aiConfig, capabilityConfig } from "./config";
import { isFlagEnabled } from "./flags";
import type { AiCapability } from "./types";

interface CacheEntry<T = unknown> {
  value: T;
  storedAt: number;
  expiresAt: number;
  hits: number;
}

const store = new Map<string, CacheEntry>();
let hits = 0;
let misses = 0;

/** Stable, non-reversible key for any serialisable input. */
export function aiCacheKey(capability: AiCapability, input: unknown): string {
  return `${capability}:${hash(stableStringify(input))}`;
}

export function readAiCache<T>(key: string): T | null {
  if (!isFlagEnabled("caching") || !aiConfig().cache.enabled) return null;
  const entry = store.get(key);
  if (!entry) {
    misses += 1;
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    misses += 1;
    return null;
  }
  entry.hits += 1;
  hits += 1;
  return entry.value as T;
}

export function writeAiCache<T>(key: string, capability: AiCapability, value: T): void {
  if (!isFlagEnabled("caching") || !aiConfig().cache.enabled) return;
  const ttl = capabilityConfig(capability).cacheTtlMs;
  if (ttl <= 0) return;
  const { maxEntries } = aiConfig().cache;
  if (store.size >= maxEntries) {
    const oldest = [...store.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt)[0];
    if (oldest) store.delete(oldest[0]);
  }
  const now = Date.now();
  store.set(key, { value, storedAt: now, expiresAt: now + ttl, hits: 0 });
}

/** Last-resort read used by degradation: returns an entry even once expired. */
export function readStaleAiCache<T>(key: string): T | null {
  const entry = store.get(key);
  return entry ? (entry.value as T) : null;
}

export function invalidateAiCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of [...store.keys()]) if (key.startsWith(prefix)) store.delete(key);
}

export function aiCacheStats(): { entries: number; hits: number; misses: number; hitRate: number } {
  const total = hits + misses;
  return { entries: store.size, hits, misses, hitRate: total ? hits / total : 0 };
}

export function resetAiCache(): void {
  store.clear();
  hits = 0;
  misses = 0;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/** FNV-1a — fast, dependency-free and non-reversible enough for cache keys. */
function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(36).padStart(7, "0") + text.length.toString(36);
}
