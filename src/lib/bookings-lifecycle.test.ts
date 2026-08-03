/**
 * Lifecycle states and gates decide what each side can see and do, so they
 * have to agree exactly with the server-side RPCs.
 */
import { describe, expect, it } from "vitest";

import {
  activationGate,
  completionGate,
  consumesCapacity,
  exactAddressVisible,
  groupBookings,
  lifecycleState,
} from "@/lib/bookings-lifecycle";
import type { Booking } from "@/lib/bookings";

const NOW = new Date("2026-08-10T09:00:00Z");

const booking = (overrides: Partial<Booking>): Booking =>
  ({
    id: "b1",
    status: "confirmed",
    start_date: "2026-08-01",
    end_date: "2026-09-01",
    renter_id: "renter",
    host_id: "host",
    ...overrides,
  }) as Booking;

describe("lifecycleState", () => {
  it("separates upcoming from ready-to-start by the start date", () => {
    expect(lifecycleState(booking({ start_date: "2026-08-20" }), NOW)).toBe("upcoming");
    expect(lifecycleState(booking({ start_date: "2026-08-01" }), NOW)).toBe("ready_to_start");
  });

  it("flags an active booking as due once the end date arrives", () => {
    expect(lifecycleState(booking({ status: "active", end_date: "2026-09-01" }), NOW)).toBe(
      "active",
    );
    expect(lifecycleState(booking({ status: "active", end_date: "2026-08-10" }), NOW)).toBe(
      "completion_due",
    );
  });

  it("treats cancelled and completed as terminal", () => {
    expect(lifecycleState(booking({ status: "cancelled" }), NOW)).toBe("cancelled");
    expect(lifecycleState(booking({ status: "completed" }), NOW)).toBe("completed");
  });
});

describe("groupBookings", () => {
  it("puts every booking in exactly one group", () => {
    const list = [
      booking({ id: "a", status: "pending_payment" }),
      booking({ id: "b", start_date: "2026-08-20" }),
      booking({ id: "c", status: "active" }),
      booking({ id: "d", status: "cancelled" }),
      booking({ id: "e", status: "completed" }),
    ];
    const groups = groupBookings(list, NOW);
    const total = Object.values(groups).reduce((n, group) => n + group.length, 0);
    expect(total).toBe(list.length);
    expect(groups.action.map((b) => b.id)).toEqual(["a"]);
    expect(groups.cancelled.map((b) => b.id)).toEqual(["d"]);
  });
});

describe("activationGate", () => {
  const facts = { viewerId: "renter", paid: true, now: NOW };

  it("allows either participant from the start date", () => {
    expect(activationGate({ ...facts, booking: booking({}) }).allowed).toBe(true);
    expect(activationGate({ ...facts, viewerId: "host", booking: booking({}) }).allowed).toBe(true);
  });

  it("refuses a stranger", () => {
    expect(activationGate({ ...facts, viewerId: "someone", booking: booking({}) })).toMatchObject({
      allowed: false,
      reason: "not_a_participant",
    });
  });

  it("refuses before the start date, unpaid, cancelled or financially blocked", () => {
    expect(
      activationGate({ ...facts, booking: booking({ start_date: "2026-08-20" }) }).reason,
    ).toBe("before_start_date");
    expect(activationGate({ ...facts, paid: false, booking: booking({}) }).reason).toBe("not_paid");
    expect(activationGate({ ...facts, booking: booking({ status: "cancelled" }) }).reason).toBe(
      "cancelled",
    );
    expect(
      activationGate({ ...facts, financiallyBlocked: true, booking: booking({}) }).reason,
    ).toBe("financially_blocked");
  });

  it("is idempotent — activating twice is a no-op, not an error", () => {
    expect(activationGate({ ...facts, booking: booking({ status: "active" }) })).toMatchObject({
      allowed: false,
      alreadyDone: true,
    });
  });
});

describe("completionGate", () => {
  it("only completes an active booking from its end date", () => {
    const active = booking({ status: "active", end_date: "2026-08-10" });
    expect(completionGate({ booking: active, viewerId: "host", now: NOW }).allowed).toBe(true);
    expect(
      completionGate({
        booking: booking({ status: "active", end_date: "2026-09-01" }),
        viewerId: "host",
        now: NOW,
      }).reason,
    ).toBe("before_end_date");
    expect(completionGate({ booking: booking({}), viewerId: "host", now: NOW }).reason).toBe(
      "not_active",
    );
  });
});

describe("capacity and privacy", () => {
  it("holds space only while confirmed or active", () => {
    expect(consumesCapacity(booking({ status: "confirmed" }))).toBe(true);
    expect(consumesCapacity(booking({ status: "active" }))).toBe(true);
    expect(consumesCapacity(booking({ status: "pending_payment" }))).toBe(false);
    expect(consumesCapacity(booking({ status: "cancelled" }))).toBe(false);
    expect(consumesCapacity(booking({ status: "completed" }))).toBe(false);
  });

  it("shows the exact address only to the paying renter of a live booking", () => {
    expect(exactAddressVisible(booking({}), "renter", true)).toBe(true);
    expect(exactAddressVisible(booking({ status: "active" }), "renter", true)).toBe(true);
    expect(exactAddressVisible(booking({}), "host", true)).toBe(false);
    expect(exactAddressVisible(booking({}), "renter", false)).toBe(false);
    expect(exactAddressVisible(booking({ status: "cancelled" }), "renter", true)).toBe(false);
    expect(exactAddressVisible(booking({ status: "completed" }), "renter", true)).toBe(false);
  });
});
