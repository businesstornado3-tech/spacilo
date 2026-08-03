/**
 * The commercial rule is the part of this system that must never drift:
 * service fee = max(£5.00, 12% of the storage price), integer pence only.
 */
import { describe, expect, it } from "vitest";

import {
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
  });

  it("rejects negative or non-integer storage amounts", () => {
    expect(() => feeBreakdown(-1)).toThrow();
    expect(() => feeBreakdown(10.5)).toThrow();
  });
});

describe("capacity", () => {
  const window = { start: "2026-03-01", end: "2026-06-01" };
  const now = new Date("2026-01-01T10:00:00Z");

  it("holds last 30 minutes", () => {
    expect(PAYMENT_HOLD_MINUTES).toBe(30);
    expect(holdExpiryFrom(now).toISOString()).toBe("2026-01-01T10:30:00.000Z");
  });

  it("treats touching windows as non-overlapping", () => {
    expect(windowsOverlap(window, { start: "2026-06-01", end: "2026-09-01" })).toBe(false);
    expect(windowsOverlap(window, { start: "2026-05-01", end: "2026-09-01" })).toBe(true);
  });

  it("subtracts confirmed bookings and live holds from usable capacity", () => {
    const available = availableVolumeM3({
      usableVolumeM3: 10,
      now,
      window,
      confirmed: [{ ...window, volumeM3: 3 }],
      holds: [
        { ...window, volumeM3: 2, expiresAt: "2026-01-01T10:20:00Z" },
        { ...window, volumeM3: 4, expiresAt: "2026-01-01T09:00:00Z" }, // expired, ignored
        { ...window, volumeM3: 4, expiresAt: "2026-01-01T10:20:00Z", releasedAt: "2026-01-01T10:05:00Z" },
      ],
    });
    expect(available).toBe(5);
  });

  it("never reduces physical capacity for non-overlapping dates", () => {
    expect(
      availableVolumeM3({
        usableVolumeM3: 10,
        now,
        window,
        confirmed: [{ start: "2026-06-01", end: "2026-09-01", volumeM3: 8 }],
        holds: [],
      }),
    ).toBe(10);
  });

  it("blocks a request larger than what is left", () => {
    const input = {
      usableVolumeM3: 10,
      now,
      window,
      confirmed: [{ ...window, volumeM3: 8 }],
      holds: [],
    };
    expect(hasCapacityFor(2, input)).toBe(true);
    expect(hasCapacityFor(2.5, input)).toBe(false);
  });
});

describe("checkout eligibility", () => {
  const booking = {
    id: "b1",
    renterId: "renter-1",
    status: "pending_payment" as const,
    storageAmountPence: 5000,
  };

  it("allows the renter of an unpaid pending booking", () => {
    expect(checkoutEligibility(booking, "renter-1").allowed).toBe(true);
  });

  it("blocks a signed-out caller", () => {
    expect(checkoutEligibility(booking, null)).toMatchObject({ reason: "not_authenticated" });
  });

  it("blocks anyone who is not the renter", () => {
    expect(checkoutEligibility(booking, "someone-else")).toMatchObject({ reason: "not_the_renter" });
  });

  it("blocks a booking that is not awaiting payment", () => {
    expect(checkoutEligibility({ ...booking, status: "confirmed" }, "renter-1")).toMatchObject({
      reason: "not_awaiting_payment",
    });
  });

  it("blocks a booking with no agreed price", () => {
    expect(checkoutEligibility({ ...booking, storageAmountPence: null }, "renter-1")).toMatchObject({
      reason: "no_agreed_price",
    });
  });
});

describe("exact address release", () => {
  const confirmed = { status: "confirmed" as const, renter_id: "r" };

  it("is released only to the renter of a confirmed, paid booking", () => {
    expect(exactAddressReleased(confirmed, "r", true)).toBe(true);
    expect(exactAddressReleased(confirmed, "r", false)).toBe(false);
    expect(exactAddressReleased({ ...confirmed, status: "pending_payment" }, "r", true)).toBe(false);
    expect(exactAddressReleased(confirmed, "other", true)).toBe(false);
    expect(exactAddressReleased(confirmed, null, true)).toBe(false);
  });
});

describe("webhook validation", () => {
  const expected = {
    id: "p1",
    renterTotalAmountPence: 5600,
    currency: "GBP",
    livemode: false,
    status: "requires_payment",
  };
  const paid = { amountPence: 5600, currency: "GBP", livemode: false, paid: true };

  it("confirms a matching paid event", () => {
    expect(validatePaidEvent(expected, paid)).toBe("confirmed");
  });

  it("rejects an amount or currency mismatch", () => {
    expect(validatePaidEvent(expected, { ...paid, amountPence: 100 })).toBe("amount_mismatch");
    expect(validatePaidEvent(expected, { ...paid, currency: "USD" })).toBe("currency_mismatch");
  });

  it("rejects a live event against a test payment", () => {
    expect(validatePaidEvent(expected, { ...paid, livemode: true })).toBe("livemode_mismatch");
  });

  it("never confirms an unpaid session", () => {
    expect(validatePaidEvent(expected, { ...paid, paid: false })).toBe("not_paid");
  });

  it("is idempotent for an already-succeeded payment", () => {
    expect(validatePaidEvent({ ...expected, status: "succeeded" }, paid)).toBe("already_succeeded");
  });

  it("reports a missing payment record rather than guessing", () => {
    expect(validatePaidEvent(null, paid)).toBe("payment_not_found");
  });
});
