/**
 * Standard intelligence errors.
 *
 * Providers throw these and nothing else. Callers can therefore always tell a
 * user something true and useful, and always have a fallback path — the
 * platform never leaves a surface with a spinner and no explanation.
 */
export type IntelligenceErrorCode =
  | "vision_failed"
  | "provider_offline"
  | "low_confidence"
  | "unsupported_image"
  | "analysis_timeout"
  | "dimension_unknown"
  | "not_supported"
  | "cancelled";

const MESSAGES: Record<IntelligenceErrorCode, string> = {
  vision_failed: "Spacilo AI could not read those photos. Try clearer, brighter shots.",
  provider_offline: "Spacilo AI is unavailable right now. You can still add things by hand.",
  low_confidence: "Spacilo AI is not confident enough here. Please check the details yourself.",
  unsupported_image: "That file type is not supported. Use a JPEG, PNG or WebP photo.",
  analysis_timeout: "That took too long to analyse. Try again with fewer photos.",
  dimension_unknown: "Measurements could not be estimated from these photos. Enter them by hand.",
  not_supported: "The active Spacilo AI provider does not offer this yet.",
  cancelled: "Analysis was cancelled.",
};

export class IntelligenceError extends Error {
  readonly code: IntelligenceErrorCode;
  /** True when retrying the same request could reasonably succeed. */
  readonly retryable: boolean;
  /** What the surface should do instead — always something. */
  readonly fallback: string;

  constructor(code: IntelligenceErrorCode, detail?: string) {
    super(detail ?? MESSAGES[code]);
    this.name = "IntelligenceError";
    this.code = code;
    this.retryable = code === "analysis_timeout" || code === "provider_offline";
    this.fallback = FALLBACKS[code];
  }
}

const FALLBACKS: Record<IntelligenceErrorCode, string> = {
  vision_failed: "manual-entry",
  provider_offline: "manual-entry",
  low_confidence: "human-review",
  unsupported_image: "retry-upload",
  analysis_timeout: "retry",
  dimension_unknown: "manual-entry",
  not_supported: "hide-feature",
  cancelled: "none",
};

export function isIntelligenceError(error: unknown): error is IntelligenceError {
  return error instanceof IntelligenceError;
}

/** Wraps anything thrown by a provider into the standard shape. */
export function toIntelligenceError(error: unknown): IntelligenceError {
  if (isIntelligenceError(error)) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new IntelligenceError("cancelled");
  }
  return new IntelligenceError("provider_offline", error instanceof Error ? error.message : undefined);
}

export function userMessageFor(code: IntelligenceErrorCode): string {
  return MESSAGES[code];
}
