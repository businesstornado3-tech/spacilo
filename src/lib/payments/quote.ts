/**
 * Cancellation quote — presentation of a SERVER-OWNED decision (Prompt 17).
 *
 * `get_booking_cancellation_quote` is the only thing that decides whether
 * cancellation is allowed and what money moves. This module parses that
 * response and turns it into words. It deliberately contains no arithmetic
 * that could disagree with the database, and the quote is recomputed inside
 * `cancel_booking` when the cancellation is actually submitted — the screen a
 * user sees is informational only.
 */

export type CancellationCategory =
  /** Storage has not started: full refund of everything still unrefunded. */
  | "pre_start"
  /** Storage is under way: this is an early termination, not a cancellation. */
  | "early_termination"
  /** Finished bookings are never cancelled through the normal flow. */
  | "completed"
  /** A cancellation already exists. */
  | "cancelled";

export interface CancellationQuote {
  allowed: boolean;
  rejection: string | null;
  role: "renter" | "host";
  category: CancellationCategory;
  bookingStatus: string;
  storageStarted: boolean;
  currency: string;
  policyVersion: string;
  storagePaidPence: number;
  serviceFeePaidPence: number;
  extensionStoragePaidPence: number;
  extensionServiceFeePaidPence: number;
  refundableStoragePence: number;
  refundableServiceFeePence: number;
  totalRefundPence: number;
  hostEarningsPence: number;
  hostEarningsAfterPence: number;
}

const int = (record: Record<string, unknown>, key: string): number => {
  const value = Number(record[key] ?? 0);
  return Number.isFinite(value) ? Math.trunc(value) : 0;
};

const CATEGORIES: CancellationCategory[] = [
  "pre_start",
  "early_termination",
  "completed",
  "cancelled",
];

export function parseCancellationQuote(raw: unknown): CancellationQuote {
  const record = (raw ?? {}) as Record<string, unknown>;
  const category = String(record["category"] ?? "pre_start");
  return {
    allowed: record["allowed"] === true,
    rejection: typeof record["rejection"] === "string" ? record["rejection"] : null,
    role: record["role"] === "host" ? "host" : "renter",
    category: (CATEGORIES as string[]).includes(category)
      ? (category as CancellationCategory)
      : "pre_start",
    bookingStatus: String(record["booking_status"] ?? ""),
    storageStarted: record["storage_started"] === true,
    currency: String(record["currency"] ?? "GBP"),
    policyVersion: String(record["policy_version"] ?? ""),
    storagePaidPence: int(record, "storage_paid_pence"),
    serviceFeePaidPence: int(record, "service_fee_paid_pence"),
    extensionStoragePaidPence: int(record, "extension_storage_paid_pence"),
    extensionServiceFeePaidPence: int(record, "extension_service_fee_paid_pence"),
    refundableStoragePence: int(record, "refundable_storage_pence"),
    refundableServiceFeePence: int(record, "refundable_service_fee_pence"),
    totalRefundPence: int(record, "total_refund_pence"),
    hostEarningsPence: int(record, "host_earnings_pence"),
    hostEarningsAfterPence: int(record, "host_earnings_after_pence"),
  };
}

/** True when the booking should offer "End storage early" instead of cancel. */
export const isEarlyTermination = (quote: CancellationQuote | null | undefined): boolean =>
  quote?.category === "early_termination";

/** True when the quote includes money paid for an applied extension. */
export const includesExtension = (quote: CancellationQuote): boolean =>
  quote.extensionStoragePaidPence + quote.extensionServiceFeePaidPence > 0;

export const ACTIVE_ADJUSTMENT_COPY =
  "Any refund or payment adjustment will be handled separately.";

export const EARLY_TERMINATION_INTRO =
  "Storage has already started. Ending the booking early does not remove the existing handover record.";
