/**
 * Payment history — the renter-facing read model over the payments ledger.
 *
 * A booking's CURRENT period is mutable (an extension moves the end date).
 * A PAYMENT is immutable history: its amount, its service fee and the exact
 * dates it bought never change afterwards. Everything here derives from the
 * stored payment rows; nothing is recomputed from the booking's current dates
 * and no cumulative figure is stored anywhere else.
 *
 * Only `succeeded` payments count towards any total. Attempts that failed,
 * expired, were cancelled or are still awaiting payment are history too, but
 * they are never money the renter paid.
 */
import type { Tables } from "@/integrations/supabase/types";

export type PaymentRow = Tables<"payments">;

export type PaymentKind = "original" | "extension";

/** Human wording for internal period labels — never show the raw value. */
export const PAYMENT_PERIOD_LABEL: Record<string, string> = {
  first_month: "Original booking",
  original: "Original booking",
  extension: "Extension",
};

export const paymentPeriodLabel = (raw: string | null | undefined): string => {
  const key = (raw ?? "").trim();
  return PAYMENT_PERIOD_LABEL[key] ?? PAYMENT_PERIOD_LABEL[key.toLowerCase()] ?? "Storage period";
};

/** An extension payment is the one that references the change request it buys. */
export const paymentKind = (payment: Pick<PaymentRow, "change_request_id">): PaymentKind =>
  payment.change_request_id ? "extension" : "original";

export const paymentKindLabel = (payment: Pick<PaymentRow, "change_request_id">): string =>
  paymentKind(payment) === "extension"
    ? PAYMENT_PERIOD_LABEL["extension"]!
    : PAYMENT_PERIOD_LABEL["original"]!;

export interface BookingPeriodFallback {
  start_date: string;
  end_date: string;
}

export interface PaymentHistoryEntry {
  id: string;
  kind: PaymentKind;
  label: string;
  /** The dates this payment bought — immutable, never the booking's current dates. */
  periodStart: string | null;
  periodEnd: string | null;
  storagePence: number;
  serviceFeePence: number;
  totalPence: number;
  paidAt: string | null;
  reference: string | null;
  storageLabel: string;
  /** Money returned to the renter for THIS payment, from the refund ledger. */
  refundedStoragePence: number;
  refundedServiceFeePence: number;
  refundedTotalPence: number;
  /** True when every penny of this payment has been returned. */
  fullyRefunded: boolean;
  /** True when some, but not all, of this payment has been returned. */
  partiallyRefunded: boolean;
}

export interface PaymentTotals {
  storagePence: number;
  serviceFeePence: number;
  totalPence: number;
}

const ZERO: PaymentTotals = { storagePence: 0, serviceFeePence: 0, totalPence: 0 };

export const succeededPayments = (payments: PaymentRow[] | null | undefined): PaymentRow[] =>
  (payments ?? []).filter((payment) => payment.status === "succeeded");

/* Refunded amounts live on the payment row, written by the refund ledger. */
const refundedStorage = (p: PaymentRow): number => Math.max(0, p.refunded_storage_pence ?? 0);
const refundedServiceFee = (p: PaymentRow): number =>
  Math.max(0, p.refunded_service_fee_pence ?? 0);
const refundedTotal = (p: PaymentRow): number =>
  Math.max(0, p.refunded_total_pence ?? refundedStorage(p) + refundedServiceFee(p));

export interface StorageRefundSummary {
  /** Cumulative storage paid across every succeeded payment. */
  paidStoragePence: number;
  /** Cumulative storage returned by completed refunds. */
  refundedStoragePence: number;
  /** paid − refunded, never below zero. */
  netStoragePence: number;
  hasPayments: boolean;
  hasRefund: boolean;
  fullyRefunded: boolean;
  partiallyRefunded: boolean;
}

/**
 * Storage money for one booking: what was paid, what came back and what the
 * renter is actually out of pocket. Derived only from succeeded payments and
 * the refund amounts recorded against them.
 */
export function storageRefundSummary(
  payments: PaymentRow[] | null | undefined,
): StorageRefundSummary {
  const rows = succeededPayments(payments);
  const paid = rows.reduce((total, p) => total + p.storage_amount_pence, 0);
  const refunded = Math.min(
    paid,
    rows.reduce((total, p) => total + refundedStorage(p), 0),
  );
  return {
    paidStoragePence: paid,
    refundedStoragePence: refunded,
    netStoragePence: Math.max(0, paid - refunded),
    hasPayments: rows.length > 0,
    hasRefund: refunded > 0,
    fullyRefunded: paid > 0 && refunded >= paid,
    partiallyRefunded: refunded > 0 && refunded < paid,
  };
}

/** The refund recorded against the payment that bought a given extension. */
export function extensionRefund(
  payments: PaymentRow[] | null | undefined,
  changeRequestId: string,
): { refundedTotalPence: number; fullyRefunded: boolean; partiallyRefunded: boolean } | null {
  const row = succeededPayments(payments).find((p) => p.change_request_id === changeRequestId);
  if (!row) return null;
  const refunded = refundedTotal(row);
  if (refunded <= 0) return null;
  return {
    refundedTotalPence: refunded,
    fullyRefunded: refunded >= row.renter_total_amount_pence,
    partiallyRefunded: refunded < row.renter_total_amount_pence,
  };
}

function entryPeriod(
  payment: PaymentRow,
  fallback: BookingPeriodFallback | null,
): { start: string | null; end: string | null } {
  if (payment.period_start && payment.period_end) {
    return { start: payment.period_start, end: payment.period_end };
  }
  // Legacy rows written before periods were recorded. Only the ORIGINAL
  // payment can fall back to the booking's dates, and only when nothing has
  // extended it — an extension would already have moved the end date.
  if (paymentKind(payment) === "original" && fallback) {
    return { start: fallback.start_date, end: fallback.end_date };
  }

  return { start: payment.period_start, end: payment.period_end };
}

/**
 * Successful payments in the order they were bought, plus the totals they
 * reconcile to exactly.
 */
export function paymentHistory(
  payments: PaymentRow[] | null | undefined,
  fallback: BookingPeriodFallback | null = null,
): { entries: PaymentHistoryEntry[]; totals: PaymentTotals } {
  const rows = succeededPayments(payments).sort(
    (a, b) =>
      a.period_index - b.period_index ||
      new Date(a.succeeded_at ?? a.created_at).getTime() -
        new Date(b.succeeded_at ?? b.created_at).getTime(),
  );

  // If anything extended this booking, its current end date is no longer the
  // original payment's end date, so the legacy fallback must not be used.
  const extended = rows.some((row) => paymentKind(row) === "extension");
  const safeFallback = extended ? null : fallback;

  const entries = rows.map((payment): PaymentHistoryEntry => {
    const kind = paymentKind(payment);
    const period = entryPeriod(payment, safeFallback);
    return {
      id: payment.id,
      kind,
      label: paymentKindLabel(payment),
      periodStart: period.start,
      periodEnd: period.end,
      storagePence: payment.storage_amount_pence,
      serviceFeePence: payment.service_fee_amount_pence,
      totalPence: payment.renter_total_amount_pence,
      paidAt: payment.succeeded_at,
      reference: payment.stripe_payment_intent_id,
      storageLabel: kind === "extension" ? "Extra storage" : "Storage",
      refundedStoragePence: refundedStorage(payment),
      refundedServiceFeePence: refundedServiceFee(payment),
      refundedTotalPence: refundedTotal(payment),
      fullyRefunded:
        payment.renter_total_amount_pence > 0 &&
        refundedTotal(payment) >= payment.renter_total_amount_pence,
      partiallyRefunded:
        refundedTotal(payment) > 0 && refundedTotal(payment) < payment.renter_total_amount_pence,
    };
  });

  const totals = entries.reduce<PaymentTotals>(
    (sum, entry) => ({
      storagePence: sum.storagePence + entry.storagePence,
      serviceFeePence: sum.serviceFeePence + entry.serviceFeePence,
      totalPence: sum.totalPence + entry.totalPence,
    }),
    { ...ZERO },
  );

  return { entries, totals };
}

/** Cumulative storage the renter has actually paid for a booking, in pence. */
export const paidStoragePence = (payments: PaymentRow[] | null | undefined): number =>
  succeededPayments(payments).reduce((total, p) => total + p.storage_amount_pence, 0);

/** Groups payments by booking so a list view can read one query. */
export function paymentsByBooking(
  payments: PaymentRow[] | null | undefined,
): Record<string, PaymentRow[]> {
  const grouped: Record<string, PaymentRow[]> = {};
  for (const payment of payments ?? []) {
    (grouped[payment.booking_id] ??= []).push(payment);
  }
  return grouped;
}

/* ------------------------------------------------------------ host side */

export type EarningRow = Pick<
  Tables<"host_earnings">,
  | "booking_id"
  | "period_label"
  | "period_start"
  | "period_end"
  | "gross_storage_amount_pence"
  | "host_entitlement_pence"
>;

/** Human label for an earning row — maps internal period labels. */
export const earningPeriodLabel = (earning: Pick<EarningRow, "period_label">): string =>
  paymentPeriodLabel(earning.period_label);

/**
 * Cumulative storage earnings for one booking. The service fee is never part
 * of this: it is paid by the renter on top and retained by the platform.
 * Refund-reduced entitlements are respected.
 */
export const cumulativeHostStoragePence = (earnings: EarningRow[] | null | undefined): number =>
  (earnings ?? []).reduce((total, earning) => total + earning.host_entitlement_pence, 0);

export function earningsByBooking<T extends { booking_id: string }>(
  earnings: T[] | null | undefined,
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const earning of earnings ?? []) {
    (grouped[earning.booking_id] ??= []).push(earning);
  }
  return grouped;
}
