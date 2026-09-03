/**
 * Phase 8F — frozen commercial policy regression tests.
 * Pure arithmetic and policy checks; no Stripe calls.
 */
import { describe, expect, it } from "vitest";

import {
  HOST_PAYOUT_HOLD_DAYS,
  PLATFORM_BEARER_OF_REFUND_CHARGEBACK_LOSSES,
  PLATFORM_FEE_MINIMUM_PENCE,
  PLATFORM_FEE_PERCENT,
  VAT_ACTIVE,
  VAT_POLICY_STATUS,
  VAT_STANDARD_RATE,
  assessVat,
} from "@/config/commercial";
import { feeBreakdown, serviceFeePence } from "@/lib/payments/fees";
import {
  PAYOUT_RELEASE_DELAY_HOURS,
  payoutEligibleAt,
  transferDecision,
} from "@/lib/payments/payout-policy";
import type { HostPayoutAccount } from "@/lib/payments/payout-policy";

describe("platform fee — max(£5, 12%)", () => {
  it("charges the £5 minimum below the crossover", () => {
    expect(serviceFeePence(2000)).toBe(500);
    expect(serviceFeePence(4000)).toBe(500);
  });

  it("charges 12% above the crossover", () => {
    expect(serviceFeePence(5000)).toBe(600);
    expect(serviceFeePence(10000)).toBe(1200);
    expect(serviceFeePence(100000)).toBe(12000);
  });

  it("holds the minimum exactly at the boundary", () => {
    expect(serviceFeePence(4166)).toBe(500); // 12% = 499.92 -> 500
    expect(serviceFeePence(4167)).toBe(500);
    expect(serviceFeePence(4200)).toBe(504);
  });

  it("rounds to integer pence, half up", () => {
    const fee = serviceFeePence(4208);
    expect(Number.isInteger(fee)).toBe(true);
    expect(fee).toBe(505); // 504.96
  });

  it("keeps the frozen constants", () => {
    expect(PLATFORM_FEE_PERCENT).toBe(12);
    expect(PLATFORM_FEE_MINIMUM_PENCE).toBe(500);
  });
});

describe("host payout hold — 7 calendar days", () => {
  const start = "2026-03-10";
  const eligibleAt = payoutEligibleAt(start).toISOString();

  const account = {
    status: "ready",
    payouts_enabled: true,
  } as unknown as HostPayoutAccount;

  const earning = {
    status: "pending",
    eligible_at: eligibleAt,
    stripe_transfer_id: null,
    host_entitlement_pence: 5000,
    refunded_storage_pence: 0,
    reversed_amount_pence: 0,
    currency: "GBP",
  };

  const decide = (now: string, overrides: Record<string, unknown> = {}, acc = account) =>
    transferDecision({
      earning: { ...earning, ...overrides } as typeof earning,
      bookingStatus: "confirmed",
      paymentStatus: "succeeded",
      account: acc,
      now: new Date(now),
    });

  it("uses 168 hours", () => {
    expect(HOST_PAYOUT_HOLD_DAYS).toBe(7);
    expect(PAYOUT_RELEASE_DELAY_HOURS).toBe(168);
    expect(eligibleAt).toBe("2026-03-17T00:00:00.000Z");
  });

  it("blocks at 6 days", () => {
    expect(decide("2026-03-16T00:00:00.000Z")).toEqual({
      allowed: false,
      reason: "not_eligible_yet",
    });
  });

  it("allows at exactly 7 days and after", () => {
    expect(decide("2026-03-17T00:00:00.000Z").allowed).toBe(true);
    expect(decide("2026-03-18T00:00:00.000Z").allowed).toBe(true);
  });

  it("still blocks on refund, dispute hold and disabled payouts", () => {
    expect(decide("2026-03-18T00:00:00.000Z", { refunded_storage_pence: 100 }).reason).toBe(
      "refunded",
    );
    expect(decide("2026-03-18T00:00:00.000Z", { status: "blocked" }).reason).toBe("blocked");
    expect(
      decide("2026-03-18T00:00:00.000Z", {}, {
        status: "restricted",
        payouts_enabled: false,
      } as unknown as HostPayoutAccount).reason,
    ).toBe("payout_account_not_ready");
  });

  it("stays idempotent for an already-transferred earning", () => {
    expect(decide("2026-03-18T00:00:00.000Z", { stripe_transfer_id: "tr_1" }).reason).toBe(
      "already_transferred",
    );
    expect(decide("2026-03-18T00:00:00.000Z", { status: "transferring" }).reason).toBe("in_flight");
  });
});

describe("refund / chargeback liability", () => {
  it("records the platform as the bearer", () => {
    expect(PLATFORM_BEARER_OF_REFUND_CHARGEBACK_LOSSES).toBe(true);
  });
});

describe("VAT — ready but inactive", () => {
  it("records the rate without activating it", () => {
    expect(VAT_STANDARD_RATE).toBe(20);
    expect(VAT_ACTIVE).toBe(false);
    expect(VAT_POLICY_STATUS).toBe("pending_adviser_confirmation");
  });

  it("adds no VAT amount and no rate to any base", () => {
    for (const base of [0, 5000, 5600, 100000]) {
      expect(assessVat(base)).toEqual({
        active: false,
        ratePercent: null,
        amountPence: 0,
        policyStatus: "pending_adviser_confirmation",
      });
    }
  });

  it("charges £50 storage + £6 fee = £56 total, never £66", () => {
    const breakdown = feeBreakdown(5000);
    expect(breakdown.serviceFeeAmountPence).toBe(600);
    expect(breakdown.renterTotalAmountPence).toBe(5600);
    expect(breakdown.renterTotalAmountPence + assessVat(5600).amountPence).toBe(5600);
    expect(breakdown.currency).toBe("GBP");
  });
});
