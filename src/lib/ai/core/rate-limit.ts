/**
 * AI rate limiting.
 *
 * Sliding-window counters per user, per IP, per capability and per provider.
 * Nothing here blocks: a limited caller gets a structured "wait" response with
 * a retry hint, which is what surfaces show.
 */
import { aiConfig } from "./config";
import type { AiCapability } from "./types";

type Bucket = number[];

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

export interface RateLimitVerdict {
  allowed: boolean;
  /** Which scope tripped, when blocked. */
  scope?: "user" | "ip" | "capability" | "provider";
  retryAfterMs: number;
  remaining: number;
}

export interface RateLimitSubject {
  capability: AiCapability;
  provider: string;
  userKey?: string;
  ip?: string;
}

const ALLOWED: RateLimitVerdict = { allowed: true, retryAfterMs: 0, remaining: Number.MAX_SAFE_INTEGER };

/** Checks and consumes one slot in each applicable window. */
export function checkRateLimit(subject: RateLimitSubject): RateLimitVerdict {
  const limits = aiConfig().rateLimit;
  const scopes: Array<{ scope: RateLimitVerdict["scope"]; key: string; limit: number }> = [
    { scope: "capability", key: `cap:${subject.capability}`, limit: limits.perCapabilityPerMinute },
    { scope: "provider", key: `prov:${subject.provider}`, limit: limits.perProviderPerMinute },
  ];
  if (subject.userKey) {
    scopes.unshift({ scope: "user", key: `user:${subject.userKey}`, limit: limits.perUserPerMinute });
  }
  if (subject.ip) {
    scopes.unshift({ scope: "ip", key: `ip:${subject.ip}`, limit: limits.perIpPerMinute });
  }

  const now = Date.now();
  let remaining = Number.MAX_SAFE_INTEGER;

  for (const entry of scopes) {
    const hits = prune(entry.key, now);
    if (hits.length >= entry.limit) {
      const oldest = hits[0] ?? now;
      return {
        allowed: false,
        ...(entry.scope ? { scope: entry.scope } : {}),
        retryAfterMs: Math.max(0, oldest + WINDOW_MS - now),
        remaining: 0,
      };
    }
    remaining = Math.min(remaining, entry.limit - hits.length - 1);
  }

  for (const entry of scopes) prune(entry.key, now).push(now);
  return { ...ALLOWED, remaining };
}

/** Human-friendly wait message. Never exposes internals. */
export function rateLimitMessage(verdict: RateLimitVerdict): string {
  const seconds = Math.max(1, Math.ceil(verdict.retryAfterMs / 1000));
  return `You have made a lot of requests. Please try again in ${seconds} second${seconds === 1 ? "" : "s"}.`;
}

export function resetRateLimits(): void {
  buckets.clear();
}

function prune(key: string, now: number): Bucket {
  const bucket = buckets.get(key) ?? [];
  const cutoff = now - WINDOW_MS;
  let index = 0;
  while (index < bucket.length && bucket[index]! < cutoff) index += 1;
  const next = index > 0 ? bucket.slice(index) : bucket;
  buckets.set(key, next);
  return next;
}
