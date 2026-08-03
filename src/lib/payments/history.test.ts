/**
 * Payment history must reconcile exactly with the successful payments ledger
 * and must never present a booking's current dates as historical fact.
 */
import { describe, expect, it } from "vitest";

import {
  cumulativeHostStoragePence,
  paidStoragePence,
  paymentHistory,
  paymentKind,
  paymentPeriodLabel,
  storageRefundSummary,
  extensionRefund,
  type PaymentRow,
} from "@/lib/payments/history";

const payment = (over: Partial<PaymentRow> & { id: string }): PaymentRow =>
  ({
    booking_id: "b1",
    change_request_id: null,
    created_at: "2026-01-01T00:00:00Z",
    currency: "gbp",
    period_index: 0,
    period_label: "first_month",
    period_start: null,
    period_end: null,
    renter_total_amount_pence: 0,
    service_fee_amount_pence: 0,
    storage_amount_pence: 0,
    status: "succeeded",
    stripe_payment_intent_id: null,
    succeeded_at: "2026-01-01T00:00:00Z",
    ...over,
  }) as unknown as PaymentRow;

const original = payment({
  id: "p1",
  period_start: "2026-01-01",
  period_end: "2026-02-01",
  storage_amount_pence: 10_000,
  service_fee_amount_pence: 1_200,
  renter_total_amount_pence: 11_200,
});

const extension = payment({
  id: "p2",
  change_request_id: "c1",
  period_index: 1,
  period_label: "extension",
  period_start: "2026-02-01",
  period_end: "2026-03-01",
  storage_amount_pence: 5_000,
  service_fee_amount_pence: 500,
  renter_total_amount_pence: 5_500,
  succeeded_at: "2026-02-01T00:00:00Z",
});

describe("payment history", () => {
  it("lists original then extension with their own immutable periods", () => {
    const { entries } = paymentHistory([extension, original]);
    expect(entries.map((e) => e.id)).toEqual(["p1", "p2"]);
    expect(entries[0]!.label).toBe("Original booking");
    expect(entries[1]!.label).toBe("Extension");
    expect(entries[0]!.periodEnd).toBe("2026-02-01");
    expect(entries[1]!.periodStart).toBe("2026-02-01");
  });

  it("reconciles totals exactly with successful payments", () => {
    const { totals } = paymentHistory([original, extension]);
    expect(totals.storagePence).toBe(15_000);
    expect(totals.serviceFeePence).toBe(1_700);
    expect(totals.totalPence).toBe(16_700);
  });

  it("ignores payments that did not succeed", () => {
    const failed = payment({
      id: "p3",
      status: "failed",
      storage_amount_pence: 9_999,
      renter_total_amount_pence: 9_999,
    });
    const { entries, totals } = paymentHistory([original, failed]);
    expect(entries).toHaveLength(1);
    expect(totals.storagePence).toBe(10_000);
    expect(paidStoragePence([original, failed])).toBe(10_000);
  });

  it("never falls back to the booking's current dates once extended", () => {
    const legacy = payment({ id: "p1", storage_amount_pence: 10_000 });
    const booking = { start_date: "2026-01-01", end_date: "2026-03-01" };
    expect(paymentHistory([legacy], booking).entries[0]!.periodEnd).toBe("2026-03-01");
    expect(paymentHistory([legacy, extension], booking).entries[0]!.periodEnd).toBeNull();
  });

  it("labels kinds from the change request link, not the stored text", () => {
    expect(paymentKind(original)).toBe("original");
    expect(paymentKind(extension)).toBe("extension");
    expect(paymentPeriodLabel("first_month")).toBe("Original booking");
    expect(paymentPeriodLabel(null)).toBe("Storage period");
  });

  it("sums host storage earnings without the service fee", () => {
    expect(
      cumulativeHostStoragePence([
        {
          booking_id: "b1",
          period_label: "first_month",
          period_start: "2026-01-01",
          period_end: "2026-02-01",
          gross_storage_amount_pence: 10_000,
          host_entitlement_pence: 10_000,
        },
        {
          booking_id: "b1",
          period_label: "extension",
          period_start: "2026-02-01",
          period_end: "2026-03-01",
          gross_storage_amount_pence: 5_000,
          host_entitlement_pence: 5_000,
        },
      ]),
    ).toBe(15_000);
  });
});

/* --------------------------------------------- refund presentation state */

const refunded = (row: PaymentRow, storage: number, fee: number): PaymentRow =>
  ({
    ...row,
    refunded_storage_pence: storage,
    refunded_service_fee_pence: fee,
    refunded_total_pence: storage + fee,
  }) as PaymentRow;

describe("storage refund presentation", () => {
  it("reports a fully refunded original-only booking as net zero", () => {
    const summary = storageRefundSummary([refunded(original, 10_000, 1_200)]);
    expect(summary).toMatchObject({
      paidStoragePence: 10_000,
      refundedStoragePence: 10_000,
      netStoragePence: 0,
      fullyRefunded: true,
      partiallyRefunded: false,
    });
  });

  it("adds up a fully refunded original plus extension", () => {
    const summary = storageRefundSummary([
      refunded(original, 10_000, 1_200),
      refunded(extension, 5_000, 500),
    ]);
    expect(summary.paidStoragePence).toBe(15_000);
    expect(summary.refundedStoragePence).toBe(15_000);
    expect(summary.netStoragePence).toBe(0);
    expect(summary.fullyRefunded).toBe(true);
  });

  it("handles multiple refunded extensions", () => {
    const second = payment({
      id: "p3",
      change_request_id: "c2",
      period_index: 2,
      period_label: "extension",
      storage_amount_pence: 3_000,
      service_fee_amount_pence: 500,
      renter_total_amount_pence: 3_500,
    });
    const summary = storageRefundSummary([
      refunded(original, 10_000, 1_200),
      refunded(extension, 5_000, 500),
      refunded(second, 3_000, 500),
    ]);
    expect(summary.paidStoragePence).toBe(18_000);
    expect(summary.refundedStoragePence).toBe(18_000);
    expect(summary.netStoragePence).toBe(0);
  });

  it("shows the net remainder for a partial refund", () => {
    const summary = storageRefundSummary([refunded(original, 4_000, 0)]);
    expect(summary).toMatchObject({
      refundedStoragePence: 4_000,
      netStoragePence: 6_000,
      fullyRefunded: false,
      partiallyRefunded: true,
    });
  });

  it("ignores failed and expired attempts", () => {
    const failed = payment({ id: "p9", status: "failed", storage_amount_pence: 9_900 });
    const expired = payment({ id: "p10", status: "expired", storage_amount_pence: 9_900 });
    const summary = storageRefundSummary([refunded(original, 10_000, 1_200), failed, expired]);
    expect(summary.paidStoragePence).toBe(10_000);
    expect(summary.refundedStoragePence).toBe(10_000);
  });

  it("marks refunded entries in the payment history", () => {
    const { entries } = paymentHistory([
      refunded(original, 10_000, 1_200),
      refunded(extension, 2_000, 200),
    ]);
    expect(entries[0]).toMatchObject({ refundedTotalPence: 11_200, fullyRefunded: true });
    expect(entries[1]).toMatchObject({ refundedTotalPence: 2_200, partiallyRefunded: true });
  });

  it("finds the refund belonging to an applied extension", () => {
    expect(extensionRefund([refunded(extension, 5_000, 500)], "c1")).toMatchObject({
      refundedTotalPence: 5_500,
      fullyRefunded: true,
    });
    expect(extensionRefund([extension], "c1")).toBeNull();
    expect(extensionRefund([refunded(extension, 5_000, 500)], "other")).toBeNull();
  });
});
