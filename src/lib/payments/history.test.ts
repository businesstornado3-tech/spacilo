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
