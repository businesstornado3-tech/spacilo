/**
 * Price commitment boundary (Prompt 23, items 14–15).
 *
 * The browser never states a price. `stow_request_price_state` prices the
 * request from the live listing on the server; `create_booking_from_request`
 * refuses to commit when that authoritative price no longer matches the price
 * the renter reviewed, raising `PRICE_CHANGED`. Everything here is pure
 * interpretation of what the server said — no arithmetic on money beyond
 * reading integer pence the server already computed.
 */
export type PriceCommitmentState = "unchanged" | "price_changed" | "unavailable";

export interface RequestPriceState {
  state: PriceCommitmentState;
  currency: string;
  /** Price the renter last reviewed (integer pence). */
  reviewedStorageAmountPence: number | null;
  reviewedTotalAmountPence: number | null;
  /** Authoritative price right now (integer pence). */
  currentStorageAmountPence: number | null;
  currentServiceFeePence: number | null;
  currentTotalAmountPence: number | null;
  serviceFeeRateBps: number | null;
  serviceFeeMinimumPence: number | null;
  durationDays: number | null;
  pricingVersion: string | null;
  cancellationPolicyVersion: string | null;
  priceReviewedAt: string | null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Normalises the RPC payload. Unknown shapes degrade to "unavailable". */
export function parseRequestPriceState(payload: unknown): RequestPriceState {
  const row = (payload ?? {}) as Record<string, unknown>;
  const raw = text(row["state"]);
  const state: PriceCommitmentState =
    raw === "unchanged" || raw === "price_changed" ? raw : "unavailable";
  return {
    state,
    currency: text(row["currency"]) ?? "GBP",
    reviewedStorageAmountPence: integer(row["reviewedStorageAmountPence"]),
    reviewedTotalAmountPence: integer(row["reviewedTotalAmountPence"]),
    currentStorageAmountPence: integer(row["currentStorageAmountPence"]),
    currentServiceFeePence: integer(row["currentServiceFeePence"]),
    currentTotalAmountPence: integer(row["currentTotalAmountPence"]),
    serviceFeeRateBps: integer(row["serviceFeeRateBps"]),
    serviceFeeMinimumPence: integer(row["serviceFeeMinimumPence"]),
    durationDays: integer(row["durationDays"]),
    pricingVersion: text(row["pricingVersion"]),
    cancellationPolicyVersion: text(row["cancellationPolicyVersion"]),
    priceReviewedAt: text(row["priceReviewedAt"]),
  };
}

/** True when the server refused to commit because the price moved. */
export function isPriceChangedError(error: unknown): boolean {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message.includes("PRICE_CHANGED");
}

/** The bounded detail the server attaches to a PRICE_CHANGED refusal. */
export function priceChangeDetail(error: unknown): RequestPriceState | null {
  if (!isPriceChangedError(error)) return null;
  const details = (error as { details?: unknown }).details;
  if (typeof details !== "string") return null;
  try {
    return parseRequestPriceState(JSON.parse(details));
  } catch {
    return null;
  }
}

export type CommitDecision =
  | { kind: "commit" }
  | { kind: "re_review"; direction: "higher" | "lower" }
  | { kind: "blocked"; reason: "unavailable" };

/**
 * Deterministic gate for the "Create booking" action. A changed price never
 * commits silently in either direction.
 */
export function commitDecision(price: RequestPriceState | null | undefined): CommitDecision {
  if (!price) return { kind: "commit" }; // nothing known yet — the server still gates.
  if (price.state === "unavailable") return { kind: "blocked", reason: "unavailable" };
  if (price.state === "unchanged") return { kind: "commit" };
  const current = price.currentStorageAmountPence ?? 0;
  const reviewed = price.reviewedStorageAmountPence ?? 0;
  return { kind: "re_review", direction: current > reviewed ? "higher" : "lower" };
}

export const PRICE_REVIEW_COPY = {
  higher:
    "The price for these dates has gone up since you reviewed it. Nothing has been charged. Review the new price below to continue, or go back and message the host.",
  lower:
    "The price for these dates has gone down since you reviewed it. Nothing has been charged. Review the new price below to continue at the lower price.",
  unavailable:
    "We can't price these dates right now because the listing has changed or been unpublished. Nothing has been charged.",
  reviewedCta: "I've reviewed the new price",
  frozen:
    "Once you create the booking, this price is frozen. Later changes to the listing don't change it.",
} as const;
