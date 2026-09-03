/**
 * EarnRoom commercial policy freeze (Phase 8F).
 *
 * Single source of truth for the frozen commercial rules. Nothing here is
 * authoritative on money by itself — the server and the database perform the
 * arithmetic — but every implementation must agree with these values.
 */

/* ------------------------------------------------------------ platform fee */

/** 12% of the underlying storage price. */
export const PLATFORM_FEE_PERCENT = 12;

/** £5.00 floor, in integer pence. */
export const PLATFORM_FEE_MINIMUM_PENCE = 500;

/* -------------------------------------------------------- host payout hold */

/** Payout safety hold, in calendar days, after the storage start date. */
export const HOST_PAYOUT_HOLD_DAYS = 7;

export const HOST_PAYOUT_HOLD_HOURS = HOST_PAYOUT_HOLD_DAYS * 24;

/* ------------------------------------------- refund / chargeback liability */

/**
 * Under the current Stripe Connect configuration (platform-controlled Express
 * accounts, separate charges and transfers), refunds and chargebacks are taken
 * from the platform balance. EarnRoom therefore bears the loss.
 */
export const PLATFORM_BEARER_OF_REFUND_CHARGEBACK_LOSSES = true;

/* ------------------------------------------------------------------- VAT */

/** UK standard rate, recorded for future activation only. */
export const VAT_STANDARD_RATE = 20;

/**
 * VAT is NOT charged. No VAT is added to checkout, shown to renters, or stored
 * as charged, until the business's UK VAT treatment is formally confirmed.
 */
export const VAT_ACTIVE = false as boolean;

export const VAT_POLICY_STATUS = "pending_adviser_confirmation" as const;

export interface VatAssessment {
  active: boolean;
  /** Rate actually applied. Null while VAT is inactive — never 20 by default. */
  ratePercent: number | null;
  /** Amount actually charged, in integer pence. Zero while VAT is inactive. */
  amountPence: number;
  policyStatus: typeof VAT_POLICY_STATUS;
}

/**
 * The only place checkout asks about VAT. While VAT_ACTIVE is false this
 * always returns a zero, unrated assessment, so amounts sent to Stripe and
 * persisted on the booking are unchanged. A future activation replaces the
 * body of this function; callers do not change.
 */
export function assessVat(_taxableBasePence: number): VatAssessment {
  if (!VAT_ACTIVE) {
    return {
      active: false,
      ratePercent: null,
      amountPence: 0,
      policyStatus: VAT_POLICY_STATUS,
    };
  }
  // Future activation happens here, only after professional confirmation of
  // who the supplier is, which supply VAT applies to, and each host's status.
  throw new Error("VAT activation is not implemented; VAT policy is pending adviser confirmation");
}

/** Neutral host-facing note. Makes no legal conclusion about any host. */
export const HOST_VAT_NOTE =
  "VAT treatment may depend on your circumstances and the structure of the service. EarnRoom is not currently adding VAT to bookings while its VAT treatment is being finalised.";
