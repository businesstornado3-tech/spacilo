/**
 * Central AI configuration.
 *
 * Every timeout, retry limit, cache duration, cost ceiling and provider choice
 * lives here. No magic values anywhere else in the AI layer.
 */
import type { AiCapability, AiProviderKind } from "./types";

export interface AiCapabilityConfig {
  kind: AiProviderKind;
  /** Provider ids, most preferred first. Later entries are fallbacks. */
  providers: string[];
  timeoutMs: number;
  retries: number;
  cacheTtlMs: number;
  /** Below this the response is flagged as low confidence. */
  minConfidence: number;
  /** Long work is queued instead of awaited inline. */
  queued: boolean;
}

export interface AiRateLimitConfig {
  perUserPerMinute: number;
  perIpPerMinute: number;
  perCapabilityPerMinute: number;
  perProviderPerMinute: number;
}

export interface AiSecurityConfig {
  /** Largest single text input, in characters. */
  maxInputChars: number;
  /** Largest single binary payload, in bytes. */
  maxPayloadBytes: number;
  maxImagesPerRequest: number;
  acceptedImageTypes: string[];
  /** Strip emails, phone numbers and full postcodes before a provider sees them. */
  redactPii: boolean;
}

export interface AiCostConfig {
  /** Pence per 1,000 tokens, by model id. Unknown models use `default`. */
  pencePerThousandTokens: Record<string, number>;
  /** Soft ceiling for the current process. Exceeding it degrades to cache. */
  monthlyBudgetPence: number;
}

export interface AiQueueConfig {
  concurrency: number;
  maxAttempts: number;
  backoffMs: number;
  /** Jobs older than this are dropped from history. */
  historyMs: number;
}

export interface AiConfig {
  version: string;
  capabilities: Record<AiCapability, AiCapabilityConfig>;
  rateLimit: AiRateLimitConfig;
  security: AiSecurityConfig;
  cost: AiCostConfig;
  queue: AiQueueConfig;
  cache: { enabled: boolean; maxEntries: number };
  logging: { enabled: boolean; maxEntries: number; verbose: boolean };
}

const MINUTE = 60_000;

const DEFAULT_CONFIG: AiConfig = {
  version: "ai-config-1",
  capabilities: {
    vision: {
      kind: "vision",
      providers: ["spacilo-vision", "spacilo-vision-mock"],
      timeoutMs: 45_000,
      retries: 1,
      cacheTtlMs: 30 * MINUTE,
      minConfidence: 0.55,
      queued: true,
    },
    "space-analysis": {
      kind: "image-analysis",
      providers: ["spacilo-space", "spacilo-space-mock"],
      timeoutMs: 45_000,
      retries: 1,
      cacheTtlMs: 30 * MINUTE,
      minConfidence: 0.5,
      queued: true,
    },
    inventory: {
      kind: "local",
      providers: ["spacilo-inventory"],
      timeoutMs: 20_000,
      retries: 1,
      cacheTtlMs: 15 * MINUTE,
      minConfidence: 0.5,
      queued: false,
    },
    planner: {
      kind: "local",
      providers: ["spacilo-planner"],
      timeoutMs: 30_000,
      retries: 1,
      cacheTtlMs: 10 * MINUTE,
      minConfidence: 0.5,
      queued: true,
    },
    recommendations: {
      kind: "local",
      providers: ["spacilo-recommendations"],
      timeoutMs: 20_000,
      retries: 1,
      cacheTtlMs: 10 * MINUTE,
      minConfidence: 0.5,
      queued: false,
    },
    pricing: {
      kind: "local",
      providers: ["spacilo-pricing"],
      timeoutMs: 15_000,
      retries: 2,
      cacheTtlMs: 60 * MINUTE,
      minConfidence: 0.5,
      queued: false,
    },
    search: {
      kind: "embedding",
      providers: ["spacilo-search"],
      timeoutMs: 15_000,
      retries: 1,
      cacheTtlMs: 6 * 60 * MINUTE,
      minConfidence: 0.4,
      queued: false,
    },
    assistant: {
      kind: "llm",
      providers: ["spacilo-assistant"],
      timeoutMs: 30_000,
      retries: 1,
      cacheTtlMs: 5 * MINUTE,
      minConfidence: 0.5,
      queued: false,
    },
  },
  rateLimit: {
    perUserPerMinute: 30,
    perIpPerMinute: 60,
    perCapabilityPerMinute: 240,
    perProviderPerMinute: 240,
  },
  security: {
    maxInputChars: 8_000,
    maxPayloadBytes: 8 * 1024 * 1024,
    maxImagesPerRequest: 12,
    acceptedImageTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
    redactPii: true,
  },
  cost: {
    pencePerThousandTokens: { default: 0.2 },
    monthlyBudgetPence: 50_000,
  },
  queue: { concurrency: 2, maxAttempts: 3, backoffMs: 400, historyMs: 30 * MINUTE },
  cache: { enabled: true, maxEntries: 200 },
  logging: { enabled: true, maxEntries: 250, verbose: false },
};

let current: AiConfig = clone(DEFAULT_CONFIG);

function clone(config: AiConfig): AiConfig {
  return JSON.parse(JSON.stringify(config)) as AiConfig;
}

export function aiConfig(): AiConfig {
  return current;
}

export function capabilityConfig(capability: AiCapability): AiCapabilityConfig {
  return current.capabilities[capability];
}

/** Deep-ish merge for start-up or per-environment overrides. */
export function configureAi(patch: DeepPartial<AiConfig>): AiConfig {
  current = merge(clone(current) as unknown as Record<string, unknown>, patch) as AiConfig;
  return current;
}

export function resetAiConfig(): void {
  current = clone(DEFAULT_CONFIG);
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K];
};

function merge(base: Record<string, unknown>, patch: unknown): unknown {
  if (patch === undefined || patch === null) return base;
  if (typeof patch !== "object" || Array.isArray(patch)) return patch;
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const existing = base[key];
    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
      base[key] = merge(existing as Record<string, unknown>, value);
    } else {
      base[key] = value;
    }
  }
  return base;
}
