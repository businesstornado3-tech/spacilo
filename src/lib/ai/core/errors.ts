/**
 * AI errors.
 *
 * The orchestrator converts anything thrown into one of these, so surfaces
 * always get a user-safe message and a defined recovery path. Raw provider
 * text never reaches a user.
 */
export type AiErrorCode =
  | "disabled"
  | "invalid_input"
  | "payload_too_large"
  | "unsupported_media"
  | "prompt_injection"
  | "rate_limited"
  | "budget_exceeded"
  | "provider_unavailable"
  | "timeout"
  | "invalid_response"
  | "low_confidence"
  | "cancelled"
  | "unknown";

export type AiRecovery =
  | "retry"
  | "switch-provider"
  | "use-cache"
  | "queue"
  | "manual-entry"
  | "wait"
  | "none";

const MESSAGES: Record<AiErrorCode, string> = {
  disabled: "This EarnRoom AI feature is switched off at the moment.",
  invalid_input: "That request could not be read. Check the details and try again.",
  payload_too_large: "That upload is too large. Try fewer or smaller photos.",
  unsupported_media: "That file type is not supported. Use a JPEG, PNG or WebP photo.",
  prompt_injection: "That request contained instructions we cannot accept.",
  rate_limited: "You have made a lot of requests. Please wait a moment and try again.",
  budget_exceeded: "EarnRoom AI is busy right now. Please try again shortly.",
  provider_unavailable: "EarnRoom AI is unavailable right now. You can still continue by hand.",
  timeout: "That took too long. Try again with less to analyse.",
  invalid_response: "EarnRoom AI returned something we could not use. Please try again.",
  low_confidence: "EarnRoom AI is not confident here — please check the details yourself.",
  cancelled: "That request was cancelled.",
  unknown: "Something went wrong with EarnRoom AI. Please try again.",
};

const RECOVERY: Record<AiErrorCode, AiRecovery> = {
  disabled: "none",
  invalid_input: "none",
  payload_too_large: "manual-entry",
  unsupported_media: "none",
  prompt_injection: "none",
  rate_limited: "wait",
  budget_exceeded: "use-cache",
  provider_unavailable: "switch-provider",
  timeout: "retry",
  invalid_response: "switch-provider",
  low_confidence: "manual-entry",
  cancelled: "none",
  unknown: "retry",
};

const RETRYABLE: AiErrorCode[] = ["timeout", "provider_unavailable", "invalid_response", "unknown"];

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly retryable: boolean;
  readonly recovery: AiRecovery;
  /** Internal-only detail. Logged, never surfaced. */
  readonly detail?: string;

  constructor(code: AiErrorCode, detail?: string) {
    super(MESSAGES[code]);
    this.name = "AiError";
    this.code = code;
    this.retryable = RETRYABLE.includes(code);
    this.recovery = RECOVERY[code];
    if (detail !== undefined) this.detail = detail;
  }
}

export function isAiError(error: unknown): error is AiError {
  return error instanceof AiError;
}

/** Wraps anything thrown into the standard shape. */
export function toAiError(error: unknown): AiError {
  if (isAiError(error)) return error;
  if (error instanceof DOMException && error.name === "AbortError") return new AiError("cancelled");
  if (error instanceof Error && /abort/i.test(error.name)) return new AiError("cancelled");
  const detail = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out/i.test(detail)) return new AiError("timeout", detail);
  return new AiError("provider_unavailable", detail);
}

export function aiUserMessage(code: AiErrorCode): string {
  return MESSAGES[code];
}
