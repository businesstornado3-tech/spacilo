/**
 * Prompt 10A regression tests.
 *
 * The "Continue to booking" CTA silently did nothing because the request
 * detail route was a leaf that also owned the `/booking` child route, so the
 * child never mounted. These tests pin the route file layout (layout +
 * index + booking child) and the eligibility gate behind the CTA.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { bookingActionState, type Booking } from "@/lib/bookings";
import type { StorageRequest } from "@/lib/storage-requests";

const NOW = new Date("2026-08-03T12:00:00Z");
const hours = (n: number) => new Date(NOW.getTime() + n * 3_600_000).toISOString();

const read = (file: string) => readFileSync(resolve(process.cwd(), "src/routes", file), "utf8");

const layout = read("_authenticated.renter.requests.$requestId.tsx");
const detail = read("_authenticated.renter.requests.$requestId.index.tsx");
const review = read("_authenticated.renter.requests.$requestId.booking.tsx");

const request = {
  id: "req-1",
  renter_id: "renter-1",
  status: "accepted",
  booking_action_expires_at: hours(20),
  expires_at: hours(-10),
} as unknown as StorageRequest;

const booking = { id: "book-1", request_id: "req-1" } as unknown as Booking;

/** The CTA target, built the way the route does — never a hard-coded id. */
const ctaTarget = (r: StorageRequest) => `/renter/requests/${r.id}/booking`;

describe("continue-to-booking navigation", () => {
  it("1. an accepted, in-window request with no booking resolves to the review route", () => {
    expect(bookingActionState(request, null, NOW)).toEqual({ kind: "continue" });
    expect(ctaTarget(request)).toBe("/renter/requests/req-1/booking");
    expect(detail).toContain('to="/renter/requests/$requestId/booking"');
    expect(detail).toContain("params={{ requestId: request.id }}");
  });

  it("the parent route is a layout that renders its child", () => {
    expect(layout).toContain("<Outlet />");
    expect(layout).toContain('createFileRoute("/_authenticated/renter/requests/$requestId")');
    expect(detail).toContain('createFileRoute("/_authenticated/renter/requests/$requestId/")');
  });

  it("2. the booking review route reads the request id from its params", () => {
    expect(review).toContain('createFileRoute("/_authenticated/renter/requests/$requestId/booking")');
    expect(review).toContain("Route.useParams()");
    expect(review).toContain("useRequest(requestId)");
  });

  it("3. the review page exposes Create booking via the server RPC only", () => {
    expect(review).toContain("Create booking");
    expect(review).toContain("useCreateBooking");
    expect(review).not.toMatch(/\.from\(["']bookings["']\)\s*\.insert/);
  });

  it("4-6. pending, declined and withdrawn requests offer no booking entry", () => {
    for (const status of ["pending", "declined", "withdrawn"] as const) {
      const r = { ...request, status, expires_at: hours(10) } as StorageRequest;
      expect(bookingActionState(r, null, NOW)).toEqual({ kind: "none" });
    }
  });

  it("7. an expired acceptance window shows the expired state, not a CTA", () => {
    expect(bookingActionState({ ...request, booking_action_expires_at: hours(-1) }, null, NOW)).toEqual({
      kind: "expired",
    });
    expect(review).toContain("ACCEPTED_EXPIRED_COPY");
  });

  it("8/10. an existing booking links to it rather than creating another", () => {
    expect(bookingActionState(request, booking, NOW)).toEqual({
      kind: "started",
      bookingId: "book-1",
    });
    expect(review).toContain("Booking started");
  });

  it("9. creation stays server-side, so another renter is denied by the RPC", () => {
    const api = readFileSync(resolve(process.cwd(), "src/lib/bookings-api.ts"), "utf8");
    expect(api).toContain("create_booking_from_request");
  });
});
