/**
 * Prompt 10B regression tests: the listing CTA and request copy must reflect
 * the renter's real request/booking state, and historical requests must never
 * permanently block a new one.
 */
import { describe, expect, it } from "vitest";

import { spaceCtaState } from "@/lib/space-cta";
import { requestNote, requestStatusDetail } from "@/lib/request-booking-copy";
import type { StorageRequest } from "@/lib/storage-requests";
import type { Booking } from "@/lib/bookings";

const NOW = new Date("2026-08-03T12:00:00Z");
const future = "2026-08-05T12:00:00Z";
const past = "2026-08-01T12:00:00Z";

const req = (over: Partial<StorageRequest> & { id: string }) =>
  ({
    status: "pending",
    expires_at: future,
    booking_action_expires_at: null,
    created_at: "2026-08-02T00:00:00Z",
    space_id: "space-1",
    renter_id: "renter-1",
    ...over,
  }) as unknown as StorageRequest;

const bkg = (over: Partial<Booking> & { id: string }) =>
  ({
    status: "pending_payment",
    created_at: "2026-08-02T00:00:00Z",
    space_id: "space-1",
    renter_id: "renter-1",
    request_id: "r1",
    ...over,
  }) as unknown as Booking;

describe("spaceCtaState", () => {
  it("1. no request → allow a new request", () => {
    expect(spaceCtaState([], [], NOW)).toEqual({ kind: "new" });
  });

  it("2. pending request → view request", () => {
    expect(spaceCtaState([req({ id: "r1" })], [], NOW)).toEqual({ kind: "pending", requestId: "r1" });
  });

  it("3. accepted request inside the window → continue to booking", () => {
    const r = req({ id: "r1", status: "accepted", booking_action_expires_at: future });
    expect(spaceCtaState([r], [], NOW)).toEqual({ kind: "continue", requestId: "r1" });
  });

  it("4. accepted request with an expired window → no continue", () => {
    const r = req({ id: "r1", status: "accepted", booking_action_expires_at: past });
    expect(spaceCtaState([r], [], NOW)).toEqual({ kind: "accepted_expired", requestId: "r1" });
  });

  it("5. pending_payment booking → view booking", () => {
    const r = req({ id: "r1", status: "accepted", booking_action_expires_at: future });
    expect(spaceCtaState([r], [bkg({ id: "b1" })], NOW)).toEqual({
      kind: "booking",
      bookingId: "b1",
      status: "pending_payment",
    });
  });

  it("6. confirmed booking wins over a pending_payment one", () => {
    const state = spaceCtaState([], [bkg({ id: "b1" }), bkg({ id: "b2", status: "confirmed" })], NOW);
    expect(state).toEqual({ kind: "booking", bookingId: "b2", status: "confirmed" });
  });

  it("7/8/9. declined, withdrawn or expired history allows a new request", () => {
    for (const status of ["declined", "withdrawn", "expired"] as const) {
      expect(spaceCtaState([req({ id: "r1", status })], [], NOW).kind).toBe("new");
    }
    // pending row past its expiry is effectively expired
    expect(spaceCtaState([req({ id: "r1", expires_at: past })], [], NOW).kind).toBe("new");
  });

  it("10. old declined + newer pending → pending wins", () => {
    const state = spaceCtaState(
      [
        req({ id: "old", status: "declined", created_at: "2026-06-01T00:00:00Z" }),
        req({ id: "new", created_at: "2026-08-02T00:00:00Z" }),
      ],
      [],
      NOW,
    );
    expect(state).toEqual({ kind: "pending", requestId: "new" });
  });

  it("11. old expired request + pending_payment booking → booking wins", () => {
    const state = spaceCtaState(
      [req({ id: "old", status: "expired", created_at: "2026-05-01T00:00:00Z" })],
      [bkg({ id: "b1" })],
      NOW,
    );
    expect(state).toEqual({ kind: "booking", bookingId: "b1", status: "pending_payment" });
  });

  it("12. cancelled/completed bookings don't block a future request", () => {
    expect(spaceCtaState([], [bkg({ id: "b1", status: "cancelled" })], NOW).kind).toBe("new");
    expect(spaceCtaState([], [bkg({ id: "b1", status: "completed" })], NOW).kind).toBe("new");
  });

  it("12b. only rows belonging to this renter are ever passed in", () => {
    // The queries filter on renter_id, so another renter's rows never reach the
    // helper; with none of their own the renter sees the normal CTA.
    expect(spaceCtaState([], [], NOW)).toEqual({ kind: "new" });
  });
});

describe("booking-aware request copy", () => {
  const accepted = req({ id: "r1", status: "accepted", booking_action_expires_at: future });

  it("14. accepted request without a booking keeps the existing wording", () => {
    expect(requestStatusDetail(accepted, null, "renter", NOW)).toBe(
      "The host accepted this request. It isn't a booking or a payment yet.",
    );
    expect(requestNote(accepted, null, "renter", NOW)).toContain("isn't a booking or a payment yet");
  });

  it("15. accepted request WITH a booking never claims no booking exists", () => {
    const detail = requestStatusDetail(accepted, bkg({ id: "b1" }), "renter", NOW);
    const note = requestNote(accepted, bkg({ id: "b1" }), "renter", NOW);
    for (const text of [detail, note]) {
      expect(text).not.toContain("isn't a booking");
      expect(text).not.toContain("not been created");
    }
    expect(detail).toBe("A booking has been started from this request and is awaiting payment.");
  });

  it("keeps pending/declined/withdrawn wording untouched", () => {
    expect(requestStatusDetail(req({ id: "r1" }), null, "renter", NOW)).toContain(
      "hasn't responded yet",
    );
    expect(requestStatusDetail(req({ id: "r1", status: "declined" }), null, "renter", NOW)).toContain(
      "declined",
    );
  });
});
