/**
 * Guest SpaceFit — hard limits and validation.
 *
 * Pure module: no network, no database, no secrets. Both the browser (for
 * instant feedback) and the server (as the authority) import these limits, so
 * a client that skips validation still hits the same wall server-side.
 *
 * A guest is deliberately given LESS than an authenticated user. Everything in
 * `GUEST_WITHHELD` requires an account, and no guest action ever writes to the
 * canonical marketplace tables.
 */

export const GUEST_SPACEFIT_VERSION = "guest-spacefit-v1";

/** Session lifetime. Deliberately short — this is a preview, not storage. */
export const GUEST_SESSION_TTL_MINUTES = 120;

/** Guest uploads are deleted from private storage as soon as analysis ends. */
export const GUEST_IMAGE_RETENTION_MINUTES = 0;

/** Guest results (never images) live only as long as the session. */
export const GUEST_RESULT_RETENTION_MINUTES = GUEST_SESSION_TTL_MINUTES;

/** Guests get fewer photos than the authenticated flows (10 renter / 8 host). */
export const MAX_GUEST_PHOTOS = 4;

/** 8 MB per image, after the client downscales. */
export const MAX_GUEST_IMAGE_BYTES = 8 * 1024 * 1024;

/** Total bytes accepted in a single guest analysis request. */
export const MAX_GUEST_REQUEST_BYTES = 20 * 1024 * 1024;

/** Strict allowlist — anything else is refused before it reaches the model. */
export const GUEST_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type GuestMimeType = (typeof GUEST_ALLOWED_MIME_TYPES)[number];

/** Scans allowed per guest session, ever. */
export const MAX_RUNS_PER_GUEST_SESSION = 3;

/** Network-level throttling, applied per hashed IP over a rolling window. */
export const GUEST_IP_WINDOW_MINUTES = 60;
export const MAX_GUEST_SESSIONS_PER_IP = 10;
export const MAX_GUEST_RUNS_PER_IP = 15;

/** Only one analysis may be in flight per session. */
export const GUEST_IN_FLIGHT_SECONDS = 120;

/** Hard ceiling on a guest provider call. */
export const GUEST_PROVIDER_TIMEOUT_MS = 45_000;

/** Guests get a single attempt — no retries against a paid model. */
export const GUEST_PROVIDER_ATTEMPTS = 1;

/** Items a guest may keep in the local preview before we ask them to sign up. */
export const MAX_GUEST_PREVIEW_ITEMS = 40;

export type GuestKind = "renter" | "host";

/**
 * Capabilities intentionally withheld from anonymous visitors. Referenced by
 * the UI copy and by tests, so the boundary can never drift silently.
 */
export const GUEST_WITHHELD = [
  "save_canonical_inventory",
  "save_spacefit_history",
  "create_storage_request",
  "message_host",
  "book_space",
  "make_payment",
  "create_space_listing",
  "host_verified_measurements",
  "publish_listing",
  "receive_requests",
  "host_earnings",
  "account_dashboard",
] as const;

export type GuestWithheldCapability = (typeof GUEST_WITHHELD)[number];

export function isGuestCapabilityWithheld(capability: string): boolean {
  return (GUEST_WITHHELD as readonly string[]).includes(capability);
}

export function isAllowedGuestMime(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return (GUEST_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType.toLowerCase().trim());
}

export interface GuestUploadCandidate {
  mimeType: string;
  /** Decoded byte length of the image. */
  byteLength: number;
}

export type GuestValidationCode =
  "no_photos" | "too_many_photos" | "unsupported_type" | "file_too_large" | "request_too_large";

export interface GuestValidation {
  ok: boolean;
  code: GuestValidationCode | null;
  message: string | null;
}

const OK: GuestValidation = { ok: true, code: null, message: null };

const fail = (code: GuestValidationCode, message: string): GuestValidation => ({
  ok: false,
  code,
  message,
});

/** Authoritative upload check. The server runs this on every guest request. */
export function validateGuestUpload(files: GuestUploadCandidate[]): GuestValidation {
  if (files.length === 0) return fail("no_photos", "Add at least one photo to scan.");
  if (files.length > MAX_GUEST_PHOTOS) {
    return fail(
      "too_many_photos",
      `You can scan up to ${MAX_GUEST_PHOTOS} photos without an account.`,
    );
  }

  let total = 0;
  for (const file of files) {
    if (!isAllowedGuestMime(file.mimeType)) {
      return fail(
        "unsupported_type",
        "That file isn't a supported image (JPEG, PNG, WebP or HEIC).",
      );
    }
    if (file.byteLength <= 0 || file.byteLength > MAX_GUEST_IMAGE_BYTES) {
      return fail("file_too_large", "Each photo needs to be under 8 MB.");
    }
    total += file.byteLength;
  }

  if (total > MAX_GUEST_REQUEST_BYTES) {
    return fail(
      "request_too_large",
      "Those photos are too large together. Try fewer or smaller ones.",
    );
  }

  return OK;
}

/** Decoded byte length of a base64 payload, without allocating the buffer. */
export function base64ByteLength(base64: string): number {
  const clean = base64.replace(/[\r\n]/g, "");
  if (clean.length === 0) return 0;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

export function guestSessionExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + GUEST_SESSION_TTL_MINUTES * 60_000);
}

export function isGuestSessionExpired(
  session: { expires_at: string | Date },
  now: Date = new Date(),
): boolean {
  const expires =
    session.expires_at instanceof Date ? session.expires_at : new Date(session.expires_at);
  return !(expires.getTime() > now.getTime());
}

export type GuestClaimRejection =
  "not_found" | "expired" | "already_claimed_by_other" | "no_result";

export type GuestClaimDecision =
  { ok: true; idempotent: boolean } | { ok: false; reason: GuestClaimRejection };

/**
 * Pure claim policy. Claiming is possession-based (an unguessable reference),
 * one-time, idempotent for the original claimant, and never transferable.
 */
export function decideGuestClaim(
  session:
    | {
        expires_at: string | Date;
        status: string;
        result: unknown;
        claimed_by: string | null;
      }
    | null
    | undefined,
  userId: string,
  now: Date = new Date(),
): GuestClaimDecision {
  if (!session) return { ok: false, reason: "not_found" };
  if (session.claimed_by && session.claimed_by !== userId) {
    return { ok: false, reason: "already_claimed_by_other" };
  }
  if (isGuestSessionExpired(session, now)) return { ok: false, reason: "expired" };
  if (!session.result) return { ok: false, reason: "no_result" };
  return { ok: true, idempotent: session.claimed_by === userId };
}

export const GUEST_CLAIM_MESSAGES: Record<GuestClaimRejection, string> = {
  not_found: "We couldn't find that scan. You can run a new one at any time.",
  expired: "That preview has expired. Scans are kept for two hours only — please scan again.",
  already_claimed_by_other: "That scan belongs to a different account.",
  no_result: "That scan didn't finish. Please try scanning again.",
};

export const GUEST_PREVIEW_DISCLAIMER =
  "This is a preview. SpaceFit AI estimates from photos and can be wrong — you review and correct everything, and nothing is saved until you create an account.";
