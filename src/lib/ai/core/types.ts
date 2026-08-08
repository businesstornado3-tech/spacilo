/**
 * Spacilo AI — shared contracts (Phase 6A).
 *
 * Everything that crosses the AI boundary uses these shapes. Feature code
 * consumes `AiResponse` and nothing else: never a vendor payload, never a
 * free-form string that has to be parsed by the caller.
 */

/** Logical AI capabilities the platform exposes. One per feature service. */
export type AiCapability =
  | "vision"
  | "space-analysis"
  | "inventory"
  | "planner"
  | "recommendations"
  | "pricing"
  | "search"
  | "assistant"
  // Phase 6B — applied intelligence across the marketplace.
  | "suitability"
  | "ranking"
  | "host-pricing"
  | "listing-quality"
  | "description"
  | "nl-search"
  | "booking-assistant"
  | "trust-summary"
  | "inventory-assistant"
  | "seasonal"
  | "notifications"
  | "host-insights"
  | "fraud"
  | "message-assist"
  | "help-search";

export const AI_CAPABILITIES: AiCapability[] = [
  "vision",
  "space-analysis",
  "inventory",
  "planner",
  "recommendations",
  "pricing",
  "search",
  "assistant",
  "suitability",
  "ranking",
  "host-pricing",
  "listing-quality",
  "description",
  "nl-search",
  "booking-assistant",
  "trust-summary",
  "inventory-assistant",
  "seasonal",
  "notifications",
  "host-insights",
  "fraud",
  "message-assist",
  "help-search",
];

/** Provider families. A capability is served by exactly one kind. */
export type AiProviderKind = "vision" | "llm" | "embedding" | "ocr" | "image-analysis" | "local";

export const AI_PROVIDER_KINDS: AiProviderKind[] = [
  "vision",
  "llm",
  "embedding",
  "ocr",
  "image-analysis",
  "local",
];

export type AiPriority = "high" | "normal" | "low";

/** Standard explanation attached to every decision the platform makes. */
export interface AiExplanation {
  /** One plain-English sentence: why this result. */
  reason: string;
  /** 0–1. Mirrors the response confidence unless a service narrows it. */
  confidence: number;
  /** The facts the reason rests on. */
  factors: AiExplanationFactor[];
  /** Other options considered, best first. */
  alternatives: AiAlternative[];
}

export interface AiExplanationFactor {
  label: string;
  detail: string;
  /** −1…1. Negative weights argue against the result. */
  weight: number;
}

export interface AiAlternative {
  label: string;
  reason: string;
  confidence: number;
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Estimated cost in pence — never floating-point currency downstream. */
  estimatedCostPence: number;
}

export interface AiWarning {
  code: string;
  message: string;
}

export interface AiErrorPayload {
  code: string;
  /** Always user-safe. Raw provider text never reaches this field. */
  message: string;
  retryable: boolean;
}

/** The single response envelope every AI call returns. */
export interface AiResponse<T> {
  requestId: string;
  success: boolean;
  capability: AiCapability;
  provider: string;
  model: string;
  promptId?: string;
  promptVersion?: string;
  confidence: number;
  processingMs: number;
  usage: AiUsage;
  cached: boolean;
  attempts: number;
  fallbackUsed: boolean;
  degraded: boolean;
  result: T | null;
  explanation?: AiExplanation;
  warnings: AiWarning[];
  errors: AiErrorPayload[];
}

/** Context handed to a provider for one execution. */
export interface AiProviderContext {
  requestId: string;
  capability: AiCapability;
  attempt: number;
  signal?: AbortSignal;
  /** Report 0–1 progress for queued/long work. */
  onProgress?: (fraction: number) => void;
}

/** What a provider returns. The orchestrator builds the envelope from it. */
export interface AiProviderOutput<T> {
  result: T;
  confidence?: number;
  usage?: Partial<AiUsage>;
  warnings?: AiWarning[];
  explanation?: AiExplanation;
}

/**
 * A pluggable provider. Vendor SDKs live behind this and nowhere else, so a
 * swap is a registration change rather than a refactor.
 */
export interface AiProvider<I = unknown, O = unknown> {
  readonly id: string;
  readonly kind: AiProviderKind;
  readonly model: string;
  /** True when the implementation calls out to a third-party service. */
  readonly remote: boolean;
  readonly capabilities: readonly AiCapability[];
  run(input: I, context: AiProviderContext): Promise<AiProviderOutput<O>>;
  /** Optional streaming path. Absent means the capability buffers instead. */
  stream?(input: I, context: AiProviderContext): AsyncIterable<AiStreamChunk<O>>;
}

export interface AiStreamChunk<T> {
  /** Incremental text for progressive rendering. */
  delta?: string;
  /** Present on the final chunk. */
  result?: T;
  done: boolean;
}
