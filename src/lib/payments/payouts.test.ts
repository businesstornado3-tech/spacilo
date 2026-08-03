/**
 * Host payout, earnings and refund-allocation rules (Prompt 12).
 *
 * These are pure functions: the database repeats the same rules, but keeping
 * them testable here means the policy can never drift silently.
 */
import { describe, expect, it } from "vitest";

import {
  PAYOUT_RELEASE_DELAY_HOURS,
  hostEntitlementPence,
  isPayoutReady,
  payoutEligibleAt,
  payoutReadiness,
  summariseEarnings,
  transferDecision,
  transferIdempotencyKey,
  type HostEarning,
  type HostPayoutAccount,
} from "@/lib/payments/payout-policy";
import { allocateRefund, isFullStorageRefund } from "@/lib/payments/refunds";

const readyAccount = {
  status: "ready",
  payouts_enabled: true,
} as unknown as HostPayoutAccount;

const earning = (patch: Partial<HostEarning> = {}) =>
  ({
    status: "eligible",
    eligible_at: "2026-01-01T00:00:00.000Z",
    stripe_transfer_id: null,
    host_entitlement_pence: 12_000,
    refunded_storage_pence: 0,
    reversed_amount_pence: 0,
    currency: "GBP",
    ...patch,
  }) as unknown as HostEarning;

const ctx = (patch: Record<string, unknown> = {}) => ({
  earning: earning((patch["earning"] as Partial<HostEarning>) ?? {}),
  bookingStatus: "confirmed",
  paymentStatus: "succeeded",
  account: readyAccount,
  now: new Date("2026-02-01T00:00:00.000Z"),
  ...patch,
  earningOverride: undefined,
});

describe("payout release timing", () => {
  it("releases 24 hours after the storage start date", () => {
    expect(PAYOUT_RELEASE_DELAY_HOURS).toBe(24);
    expect(payoutEligibleAt("2026-03-10").toISOString()).toBe("2026-03-11T00:00:00.000Z");
  });

  it("rejects an unparseable start date rather than paying early", () => {
    expect(() => payoutEligibleAt("not-a-date")).toThrow();
  });
});

describe("host entitlement", () => {
  it("is the snapshotted storage amount, never the renter total", () => {
    expect(
      hostEntitlementPence({ storage_amount_pence: 12_000, service_fee_amount_pence: 1_440 }),
    ).toBe(12_000);
  });
});

describe("payout readiness", () => {
  it("is only ready when Stripe says payouts and transfers are live", () => {
    expect(
      payoutReadiness({
        payouts_enabled: true,
        details_submitted: true,
        transfers_capability: "active",
        disabled_reason: null,
        currently_due: [],
      }),
    ).toBe("ready");
  });

  it("is never ready just because onboarding was submitted", () => {
    expect(
      payoutReadiness({
        payouts_enabled: false,
        details_submitted: true,
        transfers_capability: "pending",
        disabled_reason: null,
        currently_due: [],
      }),
    ).toBe("pending_verification");
  });

  it("reports restriction and missing requirements distinctly", () => {
    expect(
      payoutReadiness({
        payouts_enabled: false,
        details_submitted: true,
        transfers_capability: null,
        disabled_reason: "requirements.past_due",
        currently_due: ["individual.id_number"],
      }),
    ).toBe("restricted");
    expect(
      payoutReadiness({
        payouts_enabled: false,
        details_submitted: false,
        transfers_capability: null,
        disabled_reason: null,
        currently_due: [],
      }),
    ).toBe("incomplete");
  });

  it("treats a missing account as not started", () => {
    expect(payoutReadiness(null)).toBe("not_started");
    expect(isPayoutReady(null)).toBe(false);
  });
});

describe("transfer decision", () => {
  it("allows a matured, confirmed, paid earning for a ready host", () => {
    expect(transferDecision(ctx()).allowed).toBe(true);
  });

  it("never pays before the release date", () => {
    expect(
      transferDecision(ctx({ now: new Date("2025-12-31T23:00:00.000Z") })).reason,
    ).toBe("not_eligible_yet");
  });

  it("never pays twice for the same earning", () => {
    expect(transferDecision(ctx({ earning: { stripe_transfer_id: "tr_1" } })).reason).toBe(
      "already_transferred",
    );
    expect(transferDecision(ctx({ earning: { status: "transferring" } })).reason).toBe("in_flight");
  });

  it("never pays an unconfirmed booking or unsucceeded payment", () => {
    expect(transferDecision(ctx({ bookingStatus: "pending_payment" })).reason).toBe(
      "booking_not_confirmed",
    );
    expect(transferDecision(ctx({ paymentStatus: "failed" })).reason).toBe(
      "payment_not_succeeded",
    );
  });

  it("never pays a refunded earning", () => {
    expect(transferDecision(ctx({ earning: { refunded_storage_pence: 100 } })).reason).toBe(
      "refunded",
    );
  });

  it("never pays a host whose Stripe account is not ready", () => {
    expect(transferDecision(ctx({ account: null })).reason).toBe("payout_account_not_ready");
  });

  it("uses a deterministic idempotency key per earning", () => {
    expect(transferIdempotencyKey("abc")).toBe(transferIdempotencyKey("abc"));
    expect(transferIdempotencyKey("abc")).not.toBe(transferIdempotencyKey("def"));
  });
});

describe("earnings summary", () => {
  it("keeps released and unreleased money in separate buckets", () => {
    const now = new Date("2026-02-01T00:00:00.000Z");
    const summary = summariseEarnings(
      [
        // Not yet matured — must not be advertised as ready to release.
        earning({
          status: "pending",
          eligible_at: "2026-03-01T00:00:00.000Z",
          host_entitlement_pence: 1_000,
        }),
        earning({ status: "eligible", host_entitlement_pence: 2_000 }),
        earning({ status: "transferred", host_entitlement_pence: 3_000 }),
        earning({ status: "blocked", host_entitlement_pence: 4_000 }),
      ],
      now,
    );
    expect(summary.pendingPence).toBe(1_000);
    expect(summary.eligiblePence).toBe(2_000);
    expect(summary.transferredPence).toBe(3_000);
    expect(summary.blockedPence).toBe(4_000);
  });

  it("counts a matured pending earning as ready to release", () => {
    const summary = summariseEarnings(
      [earning({ status: "pending", eligible_at: "2026-01-01T00:00:00.000Z" })],
      new Date("2026-02-01T00:00:00.000Z"),
    );
    expect(summary.eligiblePence).toBe(12_000);
    expect(summary.pendingPence).toBe(0);
  });

});

describe("refund allocation", () => {
  it("reduces the host storage entitlement before the service fee", () => {
    expect(allocateRefund(5_000, 12_000, 1_440)).toEqual({
      refundedStoragePence: 5_000,
      refundedFeePence: 0,
    });
  });

  it("spills into the service fee only once storage is exhausted", () => {
    expect(allocateRefund(13_000, 12_000, 1_440)).toEqual({
      refundedStoragePence: 12_000,
      refundedFeePence: 1_000,
    });
  });

  it("never allocates more than was actually charged", () => {
    expect(allocateRefund(99_999, 12_000, 1_440)).toEqual({
      refundedStoragePence: 12_000,
      refundedFeePence: 1_440,
    });
  });

  it("rejects non-integer or negative amounts", () => {
    expect(() => allocateRefund(10.5, 12_000, 1_440)).toThrow();
    expect(() => allocateRefund(-1, 12_000, 1_440)).toThrow();
  });

  it("recognises a full storage refund", () => {
    expect(isFullStorageRefund(allocateRefund(12_000, 12_000, 1_440), 12_000)).toBe(true);
    expect(isFullStorageRefund(allocateRefund(11_999, 12_000, 1_440), 12_000)).toBe(false);
  });
});
