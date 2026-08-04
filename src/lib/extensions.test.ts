/**
 * Extension presentation rules (Prompt 16).
 *
 * The authoritative behaviour — pricing, availability, payment application —
 * lives in SQL and is covered by manual sandbox testing. These tests pin the
 * client-side rules that could otherwise mislead a user: never showing an
 * extension as confirmed before payment, never implying the host pays the fee,
 * and never allowing a second actionable request.
 */
import { describe, expect, it } from "vitest";

import {
  bookingAcceptsExtensions,
  extensionHostEarningsPence,
  extensionStatusLabel,
  isExtensionConfirmed,
  openExtension,
  type ExtensionRow,
} from "@/lib/extensions";

const row = (over: Partial<ExtensionRow>): ExtensionRow =>
  ({
    id: "ext-1",
    status: "pending",
    additional_storage_amount_pence: 2500,
    additional_service_fee_pence: 500,
    additional_total_pence: 3000,
    ...over,
  }) as ExtensionRow;

describe("extension status labels", () => {
  it("never exposes database or Stripe status names", () => {
    for (const status of ["pending", "accepted_awaiting_payment", "applied", "declined"]) {
      for (const audience of ["renter", "host"] as const) {
        const label = extensionStatusLabel(status, audience);
        expect(label).not.toMatch(/_/);
        expect(label.toLowerCase()).not.toContain("stripe");
      }
    }
  });

  it("tells each side what they are waiting for", () => {
    expect(extensionStatusLabel("pending", "renter")).toBe("Waiting for host");
    expect(extensionStatusLabel("pending", "host")).toBe("Extension requested");
    expect(extensionStatusLabel("accepted_awaiting_payment", "renter")).toBe(
      "Host accepted — payment required",
    );
    expect(extensionStatusLabel("accepted_awaiting_payment", "host")).toBe(
      "Waiting for renter payment",
    );
    expect(extensionStatusLabel("applied", "host")).toBe("Extension confirmed");
  });
});

describe("confirmation only after payment", () => {
  it("treats only an applied extension as confirmed", () => {
    expect(isExtensionConfirmed(row({ status: "pending" }))).toBe(false);
    expect(isExtensionConfirmed(row({ status: "accepted_awaiting_payment" }))).toBe(false);
    expect(isExtensionConfirmed(row({ status: "declined" }))).toBe(false);
    expect(isExtensionConfirmed(row({ status: "applied" }))).toBe(true);
  });
});

describe("host earnings", () => {
  it("is the extra storage only — the service fee is renter-paid on top", () => {
    const extension = row({
      additional_storage_amount_pence: 2500,
      additional_service_fee_pence: 500,
      additional_total_pence: 3000,
    });
    expect(extensionHostEarningsPence(extension)).toBe(2500);
    expect(extensionHostEarningsPence(extension)).not.toBe(2000);
  });
});

describe("one actionable extension at a time", () => {
  it("blocks a new request while one is pending or unpaid", () => {
    expect(openExtension([row({ status: "pending" })])).not.toBeNull();
    expect(openExtension([row({ status: "accepted_awaiting_payment" })])).not.toBeNull();
  });

  it("allows a new request once every earlier one is settled", () => {
    expect(openExtension([row({ status: "applied" }), row({ status: "declined" })])).toBeNull();
  });
});

describe("eligible bookings", () => {
  it("allows confirmed and active bookings only", () => {
    expect(bookingAcceptsExtensions("confirmed")).toBe(true);
    expect(bookingAcceptsExtensions("active")).toBe(true);
    expect(bookingAcceptsExtensions("completed")).toBe(false);
    expect(bookingAcceptsExtensions("cancelled")).toBe(false);
    expect(bookingAcceptsExtensions("pending_payment")).toBe(false);
  });
});
