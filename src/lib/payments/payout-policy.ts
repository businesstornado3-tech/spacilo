/**
 * Host payout policy (Prompt 12) — the single place the release rule lives.
 *
 * Project Stow takes the whole renter payment. The service fee stays with the
 * platform; the host's storage entitlement is HELD and only later transferred
 * to the host's Stripe connected account.
 *
 * Release rule: storage start date (UTC midnight) + PAYOUT_RELEASE_DELAY_HOURS.
 * The database repeats this in `stow_payout_eligible_at`, which is the
 * authority. This module mirrors it so the rule is testable and the UI can
 * explain itself without inventing its own policy.
 *
 * Everything here is integer pence. Nothing here decides money on its own.
 */
import type { Tables } from "@/integrations/supabase/types";

export type HostEarning = Tables<"host_earnings">;
export type HostPayoutAccount = Tables<"host_payout_accounts">;
export type HostEarningStatus = HostEarning["status"];
export type HostPayoutStatus = HostPayoutAccount["status"];

/** Safety delay after the storage start date before funds may be released. */
export const PAYOUT_RELEASE_DELAY_HOURS = 24;

export const PAYOUT_CURRENCY = "GBP";

/** UTC midnight of the start date plus the configured delay. */
export function payoutEligibleAt(
  startDate: string,
  delayHours: number = PAYOUT_RELEASE_DELAY_HOURS,
): Date {
  const base = new Date(`${startDate.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) throw new Error("Invalid storage start date");
  return new Date(base.getTime() + delayHours * 3_600_000);
}

/**
 * The host earns the SNAPSHOTTED storage amount. Never the checkout total,
 * never the total minus a freshly recalculated fee.
 */
export function hostEntitlementPence(payment: {
  storage_amount_pence: number;
  service_fee_amount_pence: number;
}): number {
  if (!Number.isInteger(payment.storage_amount_pence)) {
    throw new Error("Host entitlement requires integer pence");
  }
  return payment.storage_amount_pence;
}

/* ------------------------------------------------------ payout readiness */

export interface StripeAccountFacts {
  payouts_enabled: boolean;
  details_submitted: boolean;
  charges_enabled?: boolean;
  transfers_capability: string | null;
  disabled_reason: string | null;
  currently_due: string[];
}

/**
 * Mirrors `upsert_host_payout_account`. Readiness comes from Stripe's own
 * account state — never from the host merely returning from the onboarding
 * redirect.
 */
export function payoutReadiness(facts: StripeAccountFacts | null): HostPayoutStatus {
  if (!facts) return "not_started";
  if (facts.payouts_enabled && facts.transfers_capability === "active") return "ready";
  if (facts.disabled_reason) return "restricted";
  if (!facts.details_submitted) return "incomplete";
  if (facts.currently_due.length > 0) return "incomplete";
  return "pending_verification";
}

export const PAYOUT_STATUS_LABEL: Record<HostPayoutStatus, string> = {
  not_started: "Not set up",
  incomplete: "Setup incomplete",
  pending_verification: "Verification pending",
  restricted: "Payouts restricted",
  ready: "Ready for payouts",
};

export const PAYOUT_STATUS_NOTE: Record<HostPayoutStatus, string> = {
  not_started: "Set up payouts with Stripe so we can send your earnings.",
  incomplete: "Stripe still needs a few details before you can be paid.",
  pending_verification: "Stripe is reviewing your details. We'll update this automatically.",
  restricted: "Stripe has restricted payouts on your account. Open Stripe to resolve it.",
  ready: "Stripe can receive your earnings.",
};

export const isPayoutReady = (account: HostPayoutAccount | null | undefined): boolean =>
  Boolean(account && account.status === "ready" && account.payouts_enabled);

/* -------------------------------------------------------- release checks */

export type TransferRejection =
  | "not_eligible_yet"
  | "already_transferred"
  | "in_flight"
  | "booking_not_confirmed"
  | "payment_not_succeeded"
  | "refunded"
  | "blocked"
  | "no_entitlement"
  | "payout_account_not_ready"
  | "currency_mismatch";

export interface TransferDecision {
  allowed: boolean;
  reason?: TransferRejection;
}

export interface TransferContext {
  earning: Pick<
    HostEarning,
    | "status"
    | "eligible_at"
    | "stripe_transfer_id"
    | "host_entitlement_pence"
    | "refunded_storage_pence"
    | "reversed_amount_pence"
    | "currency"
  >;
  bookingStatus: string;
  paymentStatus: string;
  account: HostPayoutAccount | null;
  now?: Date;
}

/**
 * Every condition that must hold before money leaves the platform balance.
 * The database enforces the same set inside `claim_host_earnings_for_transfer`.
 */
export function transferDecision(ctx: TransferContext): TransferDecision {
  const { earning, account } = ctx;
  const now = ctx.now ?? new Date();

  if (earning.stripe_transfer_id) return { allowed: false, reason: "already_transferred" };
  if (earning.status === "transferred") return { allowed: false, reason: "already_transferred" };
  if (earning.status === "transferring") return { allowed: false, reason: "in_flight" };
  if (earning.status === "blocked") return { allowed: false, reason: "blocked" };
  if (earning.status === "reversed" || earning.status === "partially_reversed") {
    return { allowed: false, reason: "refunded" };
  }
  if (earning.refunded_storage_pence > 0 || earning.reversed_amount_pence > 0) {
    return { allowed: false, reason: "refunded" };
  }
  if (earning.host_entitlement_pence <= 0) return { allowed: false, reason: "no_entitlement" };
  if (ctx.bookingStatus !== "confirmed") return { allowed: false, reason: "booking_not_confirmed" };
  if (ctx.paymentStatus !== "succeeded") return { allowed: false, reason: "payment_not_succeeded" };
  if (new Date(earning.eligible_at).getTime() > now.getTime()) {
    return { allowed: false, reason: "not_eligible_yet" };
  }
  if (!isPayoutReady(account)) return { allowed: false, reason: "payout_account_not_ready" };
  if (earning.currency.toUpperCase() !== PAYOUT_CURRENCY) {
    return { allowed: false, reason: "currency_mismatch" };
  }
  return { allowed: true };
}

/* ------------------------------------------------------------ idempotency */

/**
 * Deterministic per earning — a retry MUST reuse the same key so Stripe
 * returns the original transfer rather than creating a second one.
 */
export const transferIdempotencyKey = (earningId: string): string =>
  `project-stow-host-transfer:${earningId}`;

/** Non-sensitive reconciliation metadata only. No address, no renter data. */
export function transferMetadata(earning: HostEarning): Record<string, string> {
  return {
    earning_id: earning.id,
    booking_id: earning.booking_id,
    payment_id: earning.payment_id,
    host_user_id: earning.host_user_id,
    fee_rule_version: `bps:${earning.service_fee_rate_bps}|min:${earning.service_fee_minimum_pence}`,
    period_index: String(earning.period_index),
  };
}

/* --------------------------------------------------------------- display */

export const EARNING_STATUS_LABEL: Record<HostEarningStatus, string> = {
  pending: "Pending",
  eligible: "Ready to release",
  transferring: "Releasing",
  transferred: "Sent to your Stripe account",
  reversed: "Reversed",
  partially_reversed: "Partly reversed",
  blocked: "On hold",
};

export interface EarningsSummary {
  pendingPence: number;
  eligiblePence: number;
  transferredPence: number;
  adjustedPence: number;
  blockedPence: number;
}

/** Summary figures for the host dashboard, in integer pence. */
export function summariseEarnings(
  earnings: HostEarning[],
  now: Date = new Date(),
): EarningsSummary {
  const summary: EarningsSummary = {
    pendingPence: 0,
    eligiblePence: 0,
    transferredPence: 0,
    adjustedPence: 0,
    blockedPence: 0,
  };
  for (const e of earnings) {
    const amount = e.host_entitlement_pence;
    switch (e.status) {
      case "transferred":
        summary.transferredPence += amount;
        break;
      case "blocked":
        summary.blockedPence += amount;
        break;
      case "reversed":
      case "partially_reversed":
        summary.adjustedPence += amount - e.reversed_amount_pence;
        break;
      case "transferring":
        summary.eligiblePence += amount;
        break;
      default:
        if (new Date(e.eligible_at).getTime() <= now.getTime()) summary.eligiblePence += amount;
        else summary.pendingPence += amount;
    }
  }
  return summary;
}

/* ------------------------------------------------------ holds (Prompt 13) */

/**
 * Neutral host-facing explanation for why an earning is held. Never exposes
 * Stripe identifiers, dispute reasons or renter details. Returns null when
 * nothing is holding the earning back.
 */
export function earningHoldNote(
  earning: Pick<
    Tables<"host_earnings">,
    "hold_refund" | "hold_dispute" | "hold_review"
  >,
  /** True once the refund ledger says nothing is still in flight. */
  refundSettled = false,
): string | null {
  if (earning.hold_dispute) {
    return "A payment for this booking is being queried with the card provider. We'll release anything still due once it's settled.";
  }
  if (earning.hold_refund && !refundSettled) {
    return "A refund for this booking is being processed, so this earning is paused until it completes.";
  }
  if (earning.hold_review) {
    return "This booking was cancelled after storage had started, so we're reviewing what's due.";
  }
  return null;
}

/* ------------------------------------------- final refund reconciliation */

export interface RefundLedgerEntry {
  status: string;
  storage_refund_pence: number;
}

export interface RefundSettlement {
  /** A refund is still in flight with Stripe. */
  pending: boolean;
  /** At least one refund has actually settled. */
  settled: boolean;
  storagePence: number;
}

/**
 * Reads the persisted refund ledger for a booking. Never infers success from
 * the booking merely being cancelled.
 */
export function refundSettlement(refunds: RefundLedgerEntry[] | null | undefined): RefundSettlement {
  const rows = refunds ?? [];
  return {
    pending: rows.some((r) => r.status === "pending"),
    settled: rows.some((r) => r.status === "succeeded"),
    storagePence: rows
      .filter((r) => r.status === "succeeded")
      .reduce((total, r) => total + r.storage_refund_pence, 0),
  };
}

/**
 * Final host-facing state once a refund has completed. Returns null while a
 * refund is still pending, or when no refund settled — in those cases the
 * normal status/hold wording applies.
 */
export function earningRefundOutcome(
  earning: Pick<Tables<"host_earnings">, "host_entitlement_pence" | "hold_dispute">,
  settlement: RefundSettlement,
): { label: string; note: string } | null {
  if (earning.hold_dispute) return null;
  if (settlement.pending || !settlement.settled || settlement.storagePence <= 0) return null;
  if (earning.host_entitlement_pence <= 0) {
    return {
      label: "Refunded",
      note: "This booking was cancelled and fully refunded. No earnings are due for this booking.",
    };
  }
  return {
    label: "Partly refunded",
    note: "This booking was partly refunded, so your earnings for it have been reduced. The remaining amount follows the normal release schedule.",
  };
}
