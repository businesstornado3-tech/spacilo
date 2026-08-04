/**
 * Cancellation quote + early termination rules (Prompt 17).
 *
 * These tests pin the boundaries the UI relies on. They deliberately do NOT
 * re-derive refund amounts: the database owns those, and the parser must pass
 * them through untouched.
 */
import { describe, expect, it } from "vitest";

import {
  includesExtension,
  isEarlyTermination,
  parseCancellationQuote,
} from "@/lib/payments/quote";
import {
  cancellationReasonLabel,
  cancellationReasons,
} from "@/lib/payments/cancellation-reasons";
import {
  agreedEarlyTermination,
  canRespond,
  checkProposal,
  openEarlyTermination,
  type ChangeRequestRow,
} from "@/lib/early-termination";

const booking = { status: "active", start_date: "2026-01-10", end_date: "2026-03-10" };

const row = (over: Partial<ChangeRequestRow>): ChangeRequestRow =>
  ({
    id: "c1",
    booking_id: "b1",
    renter_id: "renter",
    host_id: "host",
    requested_by: "renter",
    requested_by_role: "renter",
    kind: "early_termination",
    status: "pending",
    original_end_date: "2026-03-10",
    proposed_end_date: "2026-02-10",
    ...over,
  }) as ChangeRequestRow;

describe("cancellation quote", () => {
  it("passes server amounts through without arithmetic", () => {
    const quote = parseCancellationQuote({
      allowed: true,
      role: "host",
      category: "pre_start",
      total_refund_pence: 12345,
      refundable_storage_pence: 10000,
      refundable_service_fee_pence: 2345,
    });
    expect(quote.allowed).toBe(true);
    expect(quote.role).toBe("host");
    expect(quote.totalRefundPence).toBe(12345);
    expect(quote.refundableStoragePence + quote.refundableServiceFeePence).toBe(12345);
  });

  it("defaults to a disallowed, empty quote", () => {
    const quote = parseCancellationQuote(null);
    expect(quote.allowed).toBe(false);
    expect(quote.totalRefundPence).toBe(0);
  });

  it("detects early termination and extension money", () => {
    const active = parseCancellationQuote({ category: "early_termination" });
    expect(isEarlyTermination(active)).toBe(true);
    expect(includesExtension(active)).toBe(false);
    expect(
      includesExtension(parseCancellationQuote({ extension_storage_paid_pence: 500 })),
    ).toBe(true);
  });
});

describe("cancellation reasons", () => {
  it("gives each audience its own list and reversible labels", () => {
    expect(cancellationReasons("host")).not.toEqual(cancellationReasons("renter"));
    expect(cancellationReasonLabel("space_unavailable")).toBe("Space is no longer available");
    expect(cancellationReasonLabel("not_a_reason")).toBeNull();
    expect(cancellationReasonLabel(null)).toBeNull();
  });
});

describe("early termination proposals", () => {
  it("accepts an earlier date inside the booking window", () => {
    expect(checkProposal(booking, "2026-02-10", null).ok).toBe(true);
  });

  it("rejects dates that are not earlier, or before the start", () => {
    expect(checkProposal(booking, "2026-03-10", null).reason).toBe("not_earlier");
    expect(checkProposal(booking, "2026-01-01", null).reason).toBe("before_start");
    expect(checkProposal(booking, "", null).reason).toBe("missing_date");
  });

  it("rejects proposals on bookings that have not started", () => {
    expect(checkProposal({ ...booking, status: "confirmed" }, "2026-02-10", null).reason).toBe(
      "not_active",
    );
  });

  it("allows only one open request at a time", () => {
    expect(checkProposal(booking, "2026-02-10", row({})).reason).toBe("already_open");
  });
});

describe("early termination responses", () => {
  it("only the other party may answer a pending request", () => {
    const pending = row({});
    expect(canRespond(pending, "host")).toBe(true);
    expect(canRespond(pending, "renter")).toBe(false);
    expect(canRespond(pending, "stranger")).toBe(false);
    expect(canRespond(pending, null)).toBe(false);
    expect(canRespond(row({ status: "applied" }), "host")).toBe(false);
  });

  it("finds the open request and the agreed outcome", () => {
    const rows = [row({ id: "a", status: "declined" }), row({ id: "b" })];
    expect(openEarlyTermination(rows)?.id).toBe("b");
    expect(agreedEarlyTermination(rows)).toBeNull();
    expect(agreedEarlyTermination([...rows, row({ id: "c", status: "applied" })])?.id).toBe("c");
  });

  it("ignores extension rows", () => {
    expect(openEarlyTermination([row({ kind: "extension" })])).toBeNull();
  });
});
