/**
 * AI security.
 *
 * Every input is validated and sanitised before it reaches a provider:
 * oversized payloads, unsupported media, prompt injection and personal data
 * are all stopped here rather than in feature code.
 */
import { aiConfig } from "./config";
import { AiError } from "./errors";

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(the\s+)?(system|previous)\s+(prompt|instructions)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /\bsystem\s*:\s*/i,
  /\bdeveloper\s+mode\b/i,
  /reveal\s+(your\s+)?(system\s+)?(prompt|instructions)/i,
  /print\s+(your\s+)?(api\s+)?key/i,
  /<\s*\/?\s*(script|iframe)\b/i,
];

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE = /\b(?:\+?44|0)\s?\d[\d\s-]{7,12}\b/g;
const POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;

export interface SanitiseResult {
  text: string;
  /** True when personal data was removed. */
  redacted: boolean;
}

/** Detects instruction-hijacking attempts. Throws rather than guessing. */
export function assertNoPromptInjection(text: string): void {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) throw new AiError("prompt_injection", pattern.source);
  }
}

/** Removes control characters, collapses whitespace and enforces the size cap. */
export function sanitiseText(input: string, options: { redact?: boolean } = {}): SanitiseResult {
  const { maxInputChars, redactPii } = aiConfig().security;
  if (typeof input !== "string") throw new AiError("invalid_input", "expected string");
  if (input.length > maxInputChars) throw new AiError("payload_too_large", `${input.length} chars`);

  // eslint-disable-next-line no-control-regex
  let text = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  assertNoPromptInjection(text);

  const shouldRedact = options.redact ?? redactPii;
  if (!shouldRedact) return { text, redacted: false };

  const before = text;
  text = text
    .replace(EMAIL, "[email]")
    .replace(CARD, "[number]")
    .replace(PHONE, "[phone]")
    .replace(POSTCODE, "[postcode]");
  return { text, redacted: text !== before };
}

/** Redacts personal data from anything destined for a log line. */
export function redactForLog(value: string): string {
  return value
    .replace(EMAIL, "[email]")
    .replace(CARD, "[number]")
    .replace(PHONE, "[phone]")
    .replace(POSTCODE, "[postcode]");
}

export interface MediaDescriptor {
  mimeType: string;
  /** Decoded byte length, when known. */
  bytes?: number;
}

/** Validates an image batch against the configured media policy. */
export function assertMediaAllowed(media: MediaDescriptor[]): void {
  const { acceptedImageTypes, maxImagesPerRequest, maxPayloadBytes } = aiConfig().security;
  if (media.length > maxImagesPerRequest) {
    throw new AiError("payload_too_large", `${media.length} images`);
  }
  let total = 0;
  for (const item of media) {
    if (!acceptedImageTypes.includes(item.mimeType.toLowerCase())) {
      throw new AiError("unsupported_media", item.mimeType);
    }
    total += item.bytes ?? 0;
    if ((item.bytes ?? 0) > maxPayloadBytes) throw new AiError("payload_too_large");
  }
  if (total > maxPayloadBytes * media.length) throw new AiError("payload_too_large");
}

/** Parses provider JSON without ever throwing a raw syntax error at a user. */
export function parseAiJson<T = unknown>(raw: string): T {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new AiError("invalid_response", "provider returned malformed JSON");
  }
}
