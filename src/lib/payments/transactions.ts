/**
 * Transaction Centre read model (presentation only).
 *
 * PRESENTATION ONLY. Nothing here creates, mutates or decides money. Every
 * figure is derived from the immutable payment ledger rows the server wrote
 * after a verified Stripe webhook. Amounts stay in integer pence until the
 * moment they are formatted.
 */
import type { PaymentRow } from "@/lib/payments/history";
import { paymentKind, paymentKindLabel } from "@/lib/payments/history";

export type TransactionStatus = PaymentRow["status"];

/** Human wording for every payment status the ledger can hold. */
export const TRANSACTION_STATUS_LABEL: Record<string, string> = {
  succeeded: "Paid",
  pending: "Awaiting payment",
  processing: "Processing",
  requires_action: "Action needed",
  failed: "Failed",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  expired: "Expired",
};

export type TransactionTone = "success" | "warning" | "danger" | "neutral";

export const transactionTone = (status: string): TransactionTone => {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "cancelled" || status === "canceled") return "danger";
  if (status === "expired") return "neutral";
  return "warning";
};

export const transactionStatusLabel = (status: string): string =>
  TRANSACTION_STATUS_LABEL[status] ?? "Recorded";

export type RefundStatus = "none" | "partial" | "full";

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  none: "No refund",
  partial: "Partially refunded",
  full: "Fully refunded",
};

/** Short human reference shared with the host earnings view, e.g. SP-3F2A9C. */
export const transactionReference = (paymentId: string): string =>
  `SP-${paymentId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

export interface TransactionView {
  id: string;
  bookingId: string;
  reference: string;
  /** Booking-level reference so a renter can quote either to support. */
  bookingReference: string;
  title: string;
  kindLabel: string;
  status: TransactionStatus;
  statusLabel: string;
  tone: TransactionTone;
  storagePence: number;
  serviceFeePence: number;
  totalPence: number;
  refundedTotalPence: number;
  refundStatus: RefundStatus;
  refundLabel: string;
  netPence: number;
  periodStart: string | null;
  periodEnd: string | null;
  /** succeeded_at when paid, otherwise the row's creation time. */
  occurredAt: string;
  paidAt: string | null;
  providerReference: string | null;
  disputed: boolean;
  /** Only a settled payment can produce a receipt or an invoice. */
  documentsAvailable: boolean;
}

export const bookingRef = (bookingId: string): string =>
  `SP-${bookingId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

const refundStatusFor = (payment: PaymentRow): RefundStatus => {
  const refunded = Math.max(0, payment.refunded_total_pence ?? 0);
  if (refunded <= 0) return "none";
  return refunded >= payment.renter_total_amount_pence ? "full" : "partial";
};

/** One ledger row rendered for the Transaction Centre. */
export function transactionView(
  payment: PaymentRow,
  titles: Record<string, string> = {},
): TransactionView {
  const refunded = Math.max(0, payment.refunded_total_pence ?? 0);
  const refundStatus = refundStatusFor(payment);
  return {
    id: payment.id,
    bookingId: payment.booking_id,
    reference: transactionReference(payment.id),
    bookingReference: bookingRef(payment.booking_id),
    title: titles[payment.booking_id] ?? "Storage booking",
    kindLabel: paymentKindLabel(payment),
    status: payment.status,
    statusLabel: transactionStatusLabel(payment.status),
    tone: transactionTone(payment.status),
    storagePence: payment.storage_amount_pence,
    serviceFeePence: payment.service_fee_amount_pence,
    totalPence: payment.renter_total_amount_pence,
    refundedTotalPence: refunded,
    refundStatus,
    refundLabel: REFUND_STATUS_LABEL[refundStatus],
    netPence: Math.max(0, payment.renter_total_amount_pence - refunded),
    periodStart: payment.period_start,
    periodEnd: payment.period_end,
    occurredAt: payment.succeeded_at ?? payment.created_at,
    paidAt: payment.succeeded_at,
    providerReference: payment.stripe_payment_intent_id,
    disputed: Boolean(payment.disputed),
    documentsAvailable: payment.status === "succeeded",
  };
}

/** Newest first — the order a transaction list is read in. */
export function transactionList(
  payments: PaymentRow[] | null | undefined,
  titles: Record<string, string> = {},
): TransactionView[] {
  return (payments ?? [])
    .map((payment) => transactionView(payment, titles))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

export interface TransactionSummary {
  paidPence: number;
  storagePence: number;
  serviceFeePence: number;
  refundedPence: number;
  netPence: number;
  paidCount: number;
  pendingCount: number;
  failedCount: number;
  refundCount: number;
}

/** Totals across a transaction list. Only settled payments count as money. */
export function transactionSummary(rows: TransactionView[]): TransactionSummary {
  const settled = rows.filter((row) => row.status === "succeeded");
  const paidPence = settled.reduce((total, row) => total + row.totalPence, 0);
  const refundedPence = settled.reduce((total, row) => total + row.refundedTotalPence, 0);
  return {
    paidPence,
    storagePence: settled.reduce((total, row) => total + row.storagePence, 0),
    serviceFeePence: settled.reduce((total, row) => total + row.serviceFeePence, 0),
    refundedPence,
    netPence: Math.max(0, paidPence - refundedPence),
    paidCount: settled.length,
    pendingCount: rows.filter((row) => row.tone === "warning").length,
    failedCount: rows.filter((row) => row.tone === "danger").length,
    refundCount: rows.filter((row) => row.refundStatus !== "none").length,
  };
}

export type TransactionFilter = "all" | "paid" | "pending" | "refunded";

export const TRANSACTION_FILTERS: { value: TransactionFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Awaiting" },
  { value: "refunded", label: "Refunded" },
];

export function filterTransactions(
  rows: TransactionView[],
  filter: TransactionFilter,
): TransactionView[] {
  if (filter === "paid") return rows.filter((row) => row.status === "succeeded");
  if (filter === "pending") return rows.filter((row) => row.tone === "warning");
  if (filter === "refunded") return rows.filter((row) => row.refundStatus !== "none");
  return rows;
}

export interface TimelineEvent {
  id: string;
  label: string;
  at: string;
  detail?: string;
}

/**
 * The audit trail for one payment, built only from timestamps the server
 * recorded. Nothing is inferred that the ledger does not state.
 */
export function transactionTimeline(payment: PaymentRow): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const kind = paymentKind(payment) === "extension" ? "Extension" : "Booking";

  if (payment.checkout_created_at) {
    events.push({
      id: `${payment.id}-checkout`,
      label: `${kind} checkout started`,
      at: payment.checkout_created_at,
    });
  }
  if (payment.succeeded_at) {
    events.push({ id: `${payment.id}-paid`, label: "Payment confirmed", at: payment.succeeded_at });
  }
  if (payment.failed_at) {
    events.push({
      id: `${payment.id}-failed`,
      label: "Payment failed",
      at: payment.failed_at,
      ...(payment.failure_reason ? { detail: payment.failure_reason } : {}),
    });
  }
  if ((payment.refunded_total_pence ?? 0) > 0) {
    events.push({
      id: `${payment.id}-refund`,
      label:
        refundStatusFor(payment) === "full" ? "Refund completed" : "Partial refund completed",
      at: payment.updated_at,
    });
  }

  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
