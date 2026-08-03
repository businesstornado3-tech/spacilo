/**
 * Cancellation, refund and dispute policy tests (Prompt 13).
 *
 * These lock the money-safety rules: what is refunded, what the host keeps,
 * what can never be exceeded, and that every internal identifier used for
 * idempotency is deterministic.
 */
import { describe, expect, it } from "vitest";

import {
  CANCELLATION_POLICY_VERSION,
  cancellationDecision,
  cancellationEligibility,
  hostEntitlementAfterRefund,
  refundIdempotencyKey,
  storageHasStarted,
  validateRefund,
  type CancellationSubject,
} from "@/lib/payments/cancellation";
import { allocateRefund, isFullStorageRefund } from "@/lib/payments/refunds";
import {
  ALL_SUBSCRIBED_EVENT_TYPES,
  isDisputeClosedEvent,
  isDisputeEvent,
  isRefundEvent,
} from "@/lib/payments/webhook-validation";

const NOW = new Date("2026-08-01T10:00:00.000Z");

const paid = (over: Partial<NonNullable<CancellationSubject["paid"]>> = {}) => ({
  storageAmountPence: 10_000,
  serviceFeeAmountPence: 1_200,
  refundedStoragePence: 0,
  refundedServiceFeePence: 0,
  ...over,
});

describe("cancellation policy", () => {
  it("refunds nothing when the booking was never paid", () => {
    const decision = cancellationDecision(
      { status: "pending_payment", startDate: "2026-09-01", paid: null },
      NOW,
    );
    expect(decision.outcome).toBe("cancelled_unpaid");
    expect(decision.refund.totalRefundPence).toBe(0);
    expect(decision.removesHostEntitlement).toBe(true);
  });

  it("refunds storage AND the service fee in full before storage starts", () => {
    const decision = cancellationDecision(
      { status: "confirmed", startDate: "2026-09-01", paid: paid() },
      NOW,
    );
    expect(decision.outcome).toBe("refund_initiated");
    expect(decision.refund).toEqual({
      storageRefundPence: 10_000,
      serviceFeeRefundPence: 1_200,
      totalRefundPence: 11_200,
    });
    expect(decision.resolution).toBe("refund_pending");
  });

  it("never auto-prices a cancellation after storage has started", () => {
    const decision = cancellationDecision(
      { status: "confirmed", startDate: "2026-07-01", paid: paid() },
      NOW,
    );
    expect(decision.outcome).toBe("review_required");
    expect(decision.refund.totalRefundPence).toBe(0);
    expect(decision.removesHostEntitlement).toBe(false);
  });

  it("treats the first day of storage as started", () => {
    expect(storageHasStarted("2026-08-01", NOW)).toBe(true);
    expect(storageHasStarted("2026-08-02", NOW)).toBe(false);
  });

  it("never refunds more than what remains unrefunded", () => {
    const decision = cancellationDecision(
      {
        status: "confirmed",
        startDate: "2026-09-01",
        paid: paid({ refundedStoragePence: 10_000, refundedServiceFeePence: 1_200 }),
      },
      NOW,
    );
    expect(decision.refund.totalRefundPence).toBe(0);
    expect(decision.resolution).toBe("refunded");
  });

  it("stamps the versioned policy on every decision", () => {
    const decision = cancellationDecision(
      { status: "confirmed", startDate: "2026-09-01", paid: paid() },
      NOW,
    );
    expect(decision.policyVersion).toBe(CANCELLATION_POLICY_VERSION);
  });
});

describe("who may cancel", () => {
  const booking = { renter_id: "renter-1", host_id: "host-1", status: "confirmed" };

  it("allows the renter and the host", () => {
    expect(cancellationEligibility(booking, "renter-1")).toMatchObject({
      allowed: true,
      role: "renter",
    });
    expect(cancellationEligibility(booking, "host-1")).toMatchObject({
      allowed: true,
      role: "host",
    });
  });

  it("refuses strangers and signed-out visitors", () => {
    expect(cancellationEligibility(booking, "someone-else")).toMatchObject({
      allowed: false,
      reason: "not_a_party",
    });
    expect(cancellationEligibility(booking, null)).toMatchObject({
      allowed: false,
      reason: "not_authenticated",
    });
  });

  it("refuses a booking that is already cancelled or completed", () => {
    expect(
      cancellationEligibility({ ...booking, status: "cancelled" }, "renter-1").reason,
    ).toBe("already_cancelled");
    expect(
      cancellationEligibility({ ...booking, status: "completed" }, "renter-1").reason,
    ).toBe("completed");
  });
});

describe("refund invariants", () => {
  const caps = {
    storageAmountPence: 10_000,
    serviceFeeAmountPence: 1_200,
    alreadyRefundedStoragePence: 0,
    alreadyRefundedServiceFeePence: 0,
  };

  it("accepts a well-formed refund", () => {
    expect(
      validateRefund(
        { storageRefundPence: 5_000, serviceFeeRefundPence: 600, totalRefundPence: 5_600 },
        caps,
      ),
    ).toBeNull();
  });

  it("rejects non-integer pence", () => {
    expect(
      validateRefund(
        { storageRefundPence: 5_000.5, serviceFeeRefundPence: 600, totalRefundPence: 5_600.5 },
        caps,
      ),
    ).toBe("not_integer");
  });

  it("rejects components that do not sum to the total", () => {
    expect(
      validateRefund(
        { storageRefundPence: 5_000, serviceFeeRefundPence: 600, totalRefundPence: 9_999 },
        caps,
      ),
    ).toBe("components_do_not_sum");
  });

  it("rejects cumulative over-refunds", () => {
    expect(
      validateRefund(
        { storageRefundPence: 6_000, serviceFeeRefundPence: 0, totalRefundPence: 6_000 },
        { ...caps, alreadyRefundedStoragePence: 5_000 },
      ),
    ).toBe("exceeds_storage");
  });

  it("rejects negative amounts", () => {
    expect(
      validateRefund(
        { storageRefundPence: -1, serviceFeeRefundPence: 0, totalRefundPence: -1 },
        caps,
      ),
    ).toBe("negative");
  });
});

describe("host entitlement after refunds", () => {
  it("reduces only by the storage portion and never below zero", () => {
    expect(hostEntitlementAfterRefund(10_000, 4_000)).toBe(6_000);
    expect(hostEntitlementAfterRefund(10_000, 25_000)).toBe(0);
  });

  it("takes the service fee from platform revenue, not the host", () => {
    const allocation = allocateRefund(11_200, 10_000, 1_200);
    expect(allocation).toEqual({ refundedStoragePence: 10_000, refundedFeePence: 1_200 });
    expect(hostEntitlementAfterRefund(10_000, allocation.refundedStoragePence)).toBe(0);
    expect(isFullStorageRefund(allocation, 10_000)).toBe(true);
  });

  it("caps an over-large refund at what was actually charged", () => {
    expect(allocateRefund(99_999, 10_000, 1_200)).toEqual({
      refundedStoragePence: 10_000,
      refundedFeePence: 1_200,
    });
  });
});

describe("idempotency keys", () => {
  it("is deterministic per refund record", () => {
    expect(refundIdempotencyKey("abc")).toBe(refundIdempotencyKey("abc"));
    expect(refundIdempotencyKey("abc")).not.toBe(refundIdempotencyKey("abd"));
  });
});

describe("webhook event routing", () => {
  it("recognises refund and dispute events", () => {
    expect(isRefundEvent("charge.refunded")).toBe(true);
    expect(isDisputeEvent("charge.dispute.created")).toBe(true);
    expect(isDisputeEvent("charge.dispute.closed")).toBe(true);
    expect(isDisputeClosedEvent("charge.dispute.closed")).toBe(true);
    expect(isDisputeClosedEvent("charge.dispute.created")).toBe(false);
    expect(isDisputeEvent("checkout.session.completed")).toBe(false);
  });

  it("lists every subscribed event exactly once", () => {
    const unique = new Set<string>(ALL_SUBSCRIBED_EVENT_TYPES);
    expect(unique.size).toBe(ALL_SUBSCRIBED_EVENT_TYPES.length);
    expect(unique.has("charge.refunded")).toBe(true);
    expect(unique.has("charge.dispute.created")).toBe(true);
  });
});
