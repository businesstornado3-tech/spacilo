/**
 * The commercial rule is the part of this system that must never drift:
 * service fee = max(£5.00, 12% of the storage price), integer pence only.
 */
import { describe, expect, it } from "vitest";

import {
  CURRENT_FEE_RULE,
  SERVICE_FEE_MINIMUM_PENCE,
  SERVICE_FEE_RATE_BPS,
  feeBreakdown,
  serviceFeePence,
} from "@/lib/payments/fees";
import {
  PAYMENT_HOLD_MINUTES,
  availableVolumeM3,
  hasCapacityFor,
  holdExpiryFrom,
  windowsOverlap,
} from "@/lib/payments/capacity";
import { checkoutEligibility, exactAddressReleased } from "@/lib/payments/eligibility";
import { validatePaidEvent } from "@/lib/payments/webhook-validation";

describe("service fee", () => {
  it("uses the £5 minimum below the crossover point", () => {
    expect(serviceFeePence(1000)).toBe(500);
    expect(serviceFeePence(4000)).toBe(500);
  });

  it("crosses over to 12% at £41.67", () => {
    // 12% of £41.66 = 499.92p -> 500p (minimum still wins after rounding)
    expect(serviceFeePence(4166)).toBe(500);
    expect(serviceFeePence(5000)).toBe(600);
  });

  it("rounds to whole pence, never fractions", () => {
    const fee = serviceFeePence(8333);
    expect(Number.isInteger(fee)).toBe(true);
    expect(fee).toBe(1000); // 999.96p rounds to 1000p
  });

  it("worked example: £50 storage → £6 fee → £56 total", () => {
    const b = feeBreakdown(5000);
    expect(b.storageAmountPence).toBe(5000);
    expect(b.serviceFeeAmountPence).toBe(600);
    expect(b.renterTotalAmountPence).toBe(5600);
    expect(b.currency).toBe("GBP");
  });

  it("worked example: £20 storage → £5 minimum fee → £25 total", () => {
    expect(feeBreakdown(2000).renterTotalAmountPence).toBe(2500);
  });

  it("snapshots the rule version used", () => {
    const b = feeBreakdown(5000);
    expect(b.serviceFeeRateBps).toBe(SERVICE_FEE_RATE_BPS);
    expect(b.serviceFeeMinimumPence).toBe(SERVICE_FEE_MINIMUM_PENCE);
    expect(CURRENT_FEE_RULE.version).toBeTruthy();
  });

  it("rejects negative or non-integer storage amounts", () => {
    expect(() => feeBreakdown(-1)).toThrow();
    expect(() => feeBreakdown(10.5)).toThrow();
  });
});

describe("capacity", () => {
  const window = { startDate: "2026-03-01", endDate: "2026-06-01" };

  it("holds last 30 minutes", () => {
    expect(PAYMENT_HOLD_MINUTES).toBe(30);
    const start = new Date("2026-01-01T10:00:00Z");
    expect(holdExpiryFrom(start).toISOString()).toBe("2026-01-01T10:30:00.000Z");
  });

  it("treats touching windows as non-overlapping", () => {
    expect(windowsOverlap(window, { startDate: "2026-06-01", endDate: "2026-09-01" })).toBe(false);
    expect(windowsOverlap(window, { startDate: "2026-05-01", endDate: "2026-09-01" })).toBe(true);
  });

  it("subtracts confirmed bookings and live holds from usable capacity", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    const available = availableVolumeM3({
      usableVolumeM3: 10,
      now,
      ...window,
      confirmed: [{ ...window, volumeM3: 3 }],
      holds: [
        { ...window, volumeM3: 2, expiresAt: "2026-01-01T10:20:00Z" },
        { ...window, volumeM3: 4, expiresAt: "2026-01-01T09:00:00Z" }, // expired, ignored
      ],
    });
    expect(available).toBe(5);
    expect(hasCapacityFor(5, { usableVolumeM3: 10, now, ...window, confirmed: [{ ...window, volumeM3: 3 }], holds: [] })).toBe(true);
  });
});

describe("checkout eligibility", () => {
  const base = {
    bookingStatus: "pending_payment",
    renterId: "renter-1",
    viewerId: "renter-1",
    hasCapacity: true,
    alreadyPaid: false,
  };

  it("allows the renter of an unpaid pending booking", () => {
    expect(checkoutEligibility(base).allowed).toBe(true);
  });

  it("blocks anyone who is not the renter", () => {
    const result = checkoutEligibility({ ...base, viewerId: "someone-else" });
    expect(result).toMatchObject({ allowed: false, reason: "not_renter" });
  });

  it("blocks a booking that is not awaiting payment", () => {
    expect(checkoutEligibility({ ...base, bookingStatus: "cancelled" }).allowed).toBe(false);
  });

  it("blocks a second payment for an already paid booking", () => {
    expect(checkoutEligibility({ ...base, alreadyPaid: true }).allowed).toBe(false);
  });

  it("blocks checkout when capacity has gone", () => {
    expect(checkoutEligibility({ ...base, hasCapacity: false }).allowed).toBe(false);
  });
});

describe("exact address release", () => {
  it("is released only to the renter of a confirmed, paid booking", () => {
    const ok = { bookingStatus: "confirmed", paid: true, renterId: "r", viewerId: "r" };
    expect(exactAddressReleased(ok)).toBe(true);
    expect(exactAddressReleased({ ...ok, paid: false })).toBe(false);
    expect(exactAddressReleased({ ...ok, bookingStatus: "pending_payment" })).toBe(false);
    expect(exactAddressReleased({ ...ok, viewerId: "other" })).toBe(false);
  });
});

describe("webhook validation", () => {
  const expected = {
    paymentId: "p1",
    amountPence: 5600,
    currency: "GBP",
    livemode: false,
    status: "requires_payment" as const,
  };

  it("confirms a matching paid event", () => {
    expect(
      validatePaidEvent(expected, {
        amountPence: 5600,
        currency: "GBP",
        livemode: false,
        paid: true,
      }),
    ).toBe("confirmed");
  });

  it("rejects an amount or currency mismatch", () => {
    expect(
      validatePaidEvent(expected, { amountPence: 100, currency: "GBP", livemode: false, paid: true }),
    ).toBe("amount_mismatch");
    expect(
      validatePaidEvent(expected, { amountPence: 5600, currency: "USD", livemode: false, paid: true }),
    ).toBe("currency_mismatch");
  });

  it("rejects a live event against a test payment", () => {
    expect(
      validatePaidEvent(expected, { amountPence: 5600, currency: "GBP", livemode: true, paid: true }),
    ).toBe("livemode_mismatch");
  });

  it("is idempotent for an already-succeeded payment", () => {
    expect(
      validatePaidEvent(
        { ...expected, status: "succeeded" },
        { amountPence: 5600, currency: "GBP", livemode: false, paid: true },
      ),
    ).toBe("already_processed");
  });
});
