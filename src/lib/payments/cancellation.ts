/**
 * Cancellation & refund policy (Prompt 13).
 *
 * Project Stow's commercial policy lives here, versioned, in exactly one
 * place. The database repeats these rules inside `cancel_booking`, which is
 * the authority; this module keeps them testable and lets the UI explain
 * itself without inventing its own arithmetic.
 *
 * Everything is integer pence. Nothing here talks to Stripe and nothing here
 * decides money on its own — it describes what the server already decided.
 */
import type { Tables } from "@/integrations/supabase/types";

export type BookingRefund = Tables<"booking_refunds">;
export type BookingCancellation = Tables<"booking_cancellations">;
export type HostBalanceAdjustment = Tables<"host_balance_adjustments">;

export type RefundStatus = BookingRefund["status"];
export type RefundInitiator = BookingRefund["initiated_by"];
export type CancellationResolution = BookingCancellation["financial_resolution_state"];

/**
 * Bump this identifier whenever the commercial policy below changes. Existing
 * bookings keep the version they were cancelled under, so history never
 * silently re-prices.
 */
export const CANCELLATION_POLICY_VERSION = "PROJECT_STOW_CANCELLATION_POLICY_V1";

/* ------------------------------------------------------------- policy */

export type CancellationOutcome =
  /** Nothing was paid, so there is nothing to refund. */
  | "cancelled_unpaid"
  /** Pre-start: storage and service fee are both refunded in full. */
  | "refund_initiated"
  /** Post-start: no automatic refund, a human decision is required. */
  | "review_required"
  /** A cancellation already exists for this booking. */
  | "already_requested";

export interface RefundSplit {
  storageRefundPence: number;
  serviceFeeRefundPence: number;
  totalRefundPence: number;
}

export const ZERO_REFUND: RefundSplit = {
  storageRefundPence: 0,
  serviceFeeRefundPence: 0,
  totalRefundPence: 0,
};

export interface CancellationSubject {
  status: string;
  /** ISO date (YYYY-MM-DD) the storage period begins. */
  startDate: string;
  /** Amounts snapshotted at payment time — never recalculated from pricing. */
  paid: {
    storageAmountPence: number;
    serviceFeeAmountPence: number;
    refundedStoragePence: number;
    refundedServiceFeePence: number;
  } | null;
}

export const storageHasStarted = (startDate: string, now: Date = new Date()): boolean => {
  const start = new Date(`${startDate.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new Error("Invalid storage start date");
  const today = new Date(
    `${now.toISOString().slice(0, 10)}T00:00:00.000Z`,
  );
  return start.getTime() <= today.getTime();
};

export interface CancellationDecision {
  outcome: CancellationOutcome;
  refund: RefundSplit;
  resolution: CancellationResolution;
  policyVersion: string;
  /** True when the host's not-yet-transferred entitlement drops to zero. */
  removesHostEntitlement: boolean;
}

/**
 * Policy A/B/C/D. Pre-start cancellations by EITHER party refund 100% of the
 * storage amount AND 100% of the Project Stow service fee. Post-start
 * cancellations are never auto-priced.
 */
export function cancellationDecision(
  booking: CancellationSubject,
  now: Date = new Date(),
): CancellationDecision {
  const base = { policyVersion: CANCELLATION_POLICY_VERSION };

  if (!booking.paid) {
    return {
      ...base,
      outcome: "cancelled_unpaid",
      refund: ZERO_REFUND,
      resolution: "not_required",
      removesHostEntitlement: true,
    };
  }

  if (storageHasStarted(booking.startDate, now)) {
    return {
      ...base,
      outcome: "review_required",
      refund: ZERO_REFUND,
      resolution: "review_required",
      removesHostEntitlement: false,
    };
  }

  const storageRefundPence = Math.max(
    booking.paid.storageAmountPence - booking.paid.refundedStoragePence,
    0,
  );
  const serviceFeeRefundPence = Math.max(
    booking.paid.serviceFeeAmountPence - booking.paid.refundedServiceFeePence,
    0,
  );
  const totalRefundPence = storageRefundPence + serviceFeeRefundPence;

  return {
    ...base,
    outcome: "refund_initiated",
    refund: { storageRefundPence, serviceFeeRefundPence, totalRefundPence },
    resolution: totalRefundPence > 0 ? "refund_pending" : "refunded",
    removesHostEntitlement: true,
  };
}

/* ---------------------------------------------------------- eligibility */

export type CancellationRejection =
  | "not_authenticated"
  | "not_a_party"
  | "booking_missing"
  | "already_cancelled"
  | "completed";

export interface CancellationEligibility {
  allowed: boolean;
  reason?: CancellationRejection;
  role?: "renter" | "host";
}

/** Ownership is resolved server-side; this mirrors it for the UI. */
export function cancellationEligibility(
  booking: { renter_id: string; host_id: string; status: string } | null | undefined,
  callerId: string | null | undefined,
): CancellationEligibility {
  if (!callerId) return { allowed: false, reason: "not_authenticated" };
  if (!booking) return { allowed: false, reason: "booking_missing" };

  const role =
    booking.renter_id === callerId ? "renter" : booking.host_id === callerId ? "host" : null;
  if (!role) return { allowed: false, reason: "not_a_party" };
  if (booking.status === "cancelled") return { allowed: false, reason: "already_cancelled", role };
  if (booking.status === "completed") return { allowed: false, reason: "completed", role };
  return { allowed: true, role };
}

/* ------------------------------------------------------ refund invariants */

export interface RefundCaps {
  storageAmountPence: number;
  serviceFeeAmountPence: number;
  alreadyRefundedStoragePence: number;
  alreadyRefundedServiceFeePence: number;
}

export type RefundViolation =
  | "not_integer"
  | "negative"
  | "components_do_not_sum"
  | "exceeds_storage"
  | "exceeds_service_fee"
  | "exceeds_amount_paid";

/**
 * Every internally initiated refund must satisfy these before Stripe is
 * called. `total = storage + fee`, and no cumulative component may exceed what
 * was actually charged.
 */
export function validateRefund(split: RefundSplit, caps: RefundCaps): RefundViolation | null {
  const values = [split.storageRefundPence, split.serviceFeeRefundPence, split.totalRefundPence];
  if (values.some((v) => !Number.isInteger(v))) return "not_integer";
  if (values.some((v) => v < 0)) return "negative";
  if (split.totalRefundPence !== split.storageRefundPence + split.serviceFeeRefundPence) {
    return "components_do_not_sum";
  }
  if (split.storageRefundPence + caps.alreadyRefundedStoragePence > caps.storageAmountPence) {
    return "exceeds_storage";
  }
  if (
    split.serviceFeeRefundPence + caps.alreadyRefundedServiceFeePence >
    caps.serviceFeeAmountPence
  ) {
    return "exceeds_service_fee";
  }
  const paid = caps.storageAmountPence + caps.serviceFeeAmountPence;
  const cumulative =
    caps.alreadyRefundedStoragePence + caps.alreadyRefundedServiceFeePence + split.totalRefundPence;
  if (cumulative > paid) return "exceeds_amount_paid";
  return null;
}

/**
 * Host entitlement after a refund. ONLY the storage portion reduces it — the
 * Project Stow service fee is platform revenue and is never taken from the
 * host's storage earnings.
 */
export function hostEntitlementAfterRefund(
  grossStoragePence: number,
  cumulativeStorageRefundPence: number,
): number {
  return Math.max(grossStoragePence - cumulativeStorageRefundPence, 0);
}

/* --------------------------------------------------------- idempotency */

/**
 * Deterministic per internal refund record. A retried endpoint call, or a
 * retry after a Stripe timeout, reuses this key so Stripe replays the original
 * refund object instead of creating a second one.
 */
export const refundIdempotencyKey = (refundId: string): string =>
  `project-stow-refund:${refundId}`;

/* -------------------------------------------------------------- display */

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  pending: "Refund processing",
  succeeded: "Refunded",
  failed: "Refund needs attention",
  cancelled: "Refund cancelled",
};

export const RESOLUTION_LABEL: Record<CancellationResolution, string> = {
  not_required: "Cancelled",
  refund_pending: "Refund processing",
  refunded: "Refunded",
  review_required: "Cancellation under review",
  resolved: "Resolved",
};

export const POST_START_REVIEW_COPY =
  "Cancellation requires review because your storage period has already started. We'll be in touch — no refund amount has been decided yet.";

export const REFUND_PROCESSING_COPY =
  "Your refund has been sent to Stripe. It usually reaches your bank within 5–10 working days.";

export const REFUND_TIMING_COPY = "Refund timing depends on your bank.";

/** Neutral host-facing wording. Never exposes Stripe identifiers. */
export const EARNING_HOLD_COPY =
  "This earning is temporarily on hold while a payment issue is resolved.";

/* ------------------------------------------ cumulative refundable amount */

/** The payment fields the refundable calculation needs. */
export interface RefundablePayment {
  status: string;
  storage_amount_pence: number;
  service_fee_amount_pence: number;
  refunded_storage_pence?: number | null;
  refunded_service_fee_pence?: number | null;
}

export interface RefundableSummary {
  /** Aggregate snapshot across the booking, for `cancellationDecision`. */
  paid: NonNullable<CancellationSubject["paid"]> | null;
  /** How many payments still have something left to refund. */
  refundablePaymentCount: number;
  /** How many of those still carry an unrefunded service fee. */
  refundableFeeCount: number;
}

/**
 * A booking can be paid by SEVERAL succeeded payments — the original booking
 * plus each paid extension, each its own Stripe payment intent. The refundable
 * amount is the sum of what remains unrefunded on all of them. Failed, expired,
 * cancelled and still-open attempts never count, and a payment that is already
 * fully refunded contributes nothing.
 */
export function refundableFromPayments(
  payments: RefundablePayment[] | null | undefined,
): RefundableSummary {
  const succeeded = (payments ?? []).filter((p) => p.status === "succeeded");
  if (succeeded.length === 0) {
    return { paid: null, refundablePaymentCount: 0, refundableFeeCount: 0 };
  }

  let storageAmountPence = 0;
  let serviceFeeAmountPence = 0;
  let refundedStoragePence = 0;
  let refundedServiceFeePence = 0;
  let refundablePaymentCount = 0;
  let refundableFeeCount = 0;

  for (const payment of succeeded) {
    const refundedStorage = Math.min(
      Math.max(payment.refunded_storage_pence ?? 0, 0),
      payment.storage_amount_pence,
    );
    const refundedFee = Math.min(
      Math.max(payment.refunded_service_fee_pence ?? 0, 0),
      payment.service_fee_amount_pence,
    );

    storageAmountPence += payment.storage_amount_pence;
    serviceFeeAmountPence += payment.service_fee_amount_pence;
    refundedStoragePence += refundedStorage;
    refundedServiceFeePence += refundedFee;

    const remainingStorage = payment.storage_amount_pence - refundedStorage;
    const remainingFee = payment.service_fee_amount_pence - refundedFee;
    if (remainingStorage + remainingFee > 0) refundablePaymentCount += 1;
    if (remainingFee > 0) refundableFeeCount += 1;
  }

  return {
    paid: {
      storageAmountPence,
      serviceFeeAmountPence,
      refundedStoragePence,
      refundedServiceFeePence,
    },
    refundablePaymentCount,
    refundableFeeCount,
  };
}

/** "service fee" / "service fees" — matches how many fees are being returned. */
export const serviceFeeNoun = (count: number): string =>
  count === 1 ? "service fee" : "service fees";
