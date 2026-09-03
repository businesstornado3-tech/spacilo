/**
 * EarnRoom service fee (Prompt 11).
 *
 * The renter pays the agreed monthly storage price PLUS a EarnRoom service
 * fee. The host's storage entitlement is never reduced by the fee.
 *
 *   service fee = max(£5.00, 12% of the storage price)
 *
 * All arithmetic is integer pence. Nothing here is authoritative on its own —
 * the database repeats the same calculation in `stow_service_fee_pence` and the
 * server never trusts an amount supplied by the browser. This module exists so
 * the UI can show the same figures before checkout starts.
 */

/** 12% expressed in basis points. */
import { brand } from "@/config/brand";
import { PLATFORM_FEE_MINIMUM_PENCE, PLATFORM_FEE_PERCENT } from "@/config/commercial";

export const SERVICE_FEE_RATE_BPS = PLATFORM_FEE_PERCENT * 100;

/** £5.00 floor, in pence. */
export const SERVICE_FEE_MINIMUM_PENCE = PLATFORM_FEE_MINIMUM_PENCE;

export const PAYMENT_CURRENCY = "GBP";

export interface FeeRule {
  rateBps: number;
  minimumPence: number;
}

export const CURRENT_FEE_RULE: FeeRule = {
  rateBps: SERVICE_FEE_RATE_BPS,
  minimumPence: SERVICE_FEE_MINIMUM_PENCE,
};

/**
 * Integer-only percentage, rounded half up, mirroring the SQL:
 *   ((storage * bps) + 5000) / 10000
 */
export function percentageOfPence(storagePence: number, rateBps: number): number {
  if (!Number.isInteger(storagePence) || !Number.isInteger(rateBps)) {
    throw new Error("Fee arithmetic requires integer pence and integer basis points");
  }
  return Math.floor((storagePence * rateBps + 5000) / 10000);
}

export function serviceFeePence(storagePence: number, rule: FeeRule = CURRENT_FEE_RULE): number {
  return Math.max(rule.minimumPence, percentageOfPence(storagePence, rule.rateBps));
}

export interface FeeBreakdown {
  storageAmountPence: number;
  serviceFeeAmountPence: number;
  renterTotalAmountPence: number;
  serviceFeeRateBps: number;
  serviceFeeMinimumPence: number;
  currency: string;
}

/** Full first-month breakdown for a given storage price. */
export function feeBreakdown(
  storagePence: number,
  rule: FeeRule = CURRENT_FEE_RULE,
  currency: string = PAYMENT_CURRENCY,
): FeeBreakdown {
  if (storagePence < 0) {
    throw new Error("Storage amount cannot be negative");
  }
  const serviceFeeAmountPence = serviceFeePence(storagePence, rule);
  return {
    storageAmountPence: storagePence,
    serviceFeeAmountPence,
    renterTotalAmountPence: storagePence + serviceFeeAmountPence,
    serviceFeeRateBps: rule.rateBps,
    serviceFeeMinimumPence: rule.minimumPence,
    currency,
  };
}

/**
 * The label shown on the payment. Storage is priced for the whole booked
 * period by the pricing engine, so this is no longer a monthly instalment.
 */
export const FIRST_MONTH_LABEL = "Storage period";

export const FIRST_MONTH_NOTE = `This payment covers the whole storage period you booked plus the ${brand.name} service fee. Extending later is priced separately and only after the host agrees.`;

export const SERVICE_FEE_NOTE = `The ${brand.name} service fee covers running the platform. It isn't insurance, tax or a deposit.`;
