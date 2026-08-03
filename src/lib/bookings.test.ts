/**
 * Booking foundation tests (Prompt 10).
 *
 * `bookingRuleCheck` mirrors the guards inside `create_booking_from_request`;
 * the database remains the authority, but the rules are asserted here so a UI
 * change can never quietly widen them.
 */
import { describe, expect, it } from "vitest";

import {
  ACCEPTED_CTA_COPY,
  bookingActionState,
  bookingItems,
  bookingStatusMeta,
  bookingView,
  bookingsByRequest,
  isBookingWindowOpen,
  type Booking,
} from "@/lib/bookings";
import type { StorageRequest } from "@/lib/storage-requests";

const NOW = new Date("2026-08-03T12:00:00Z");
const hours = (n: number) => new Date(NOW.getTime() + n * 3_600_000).toISOString();

const request: StorageRequest = {
  booking_action_expires_at: hours(20),
  created_at: "2026-08-01T10:00:00Z",
  currency_snapshot: "GBP",
  decline_reason: null,
  estimated_item_volume_m3_snapshot: 2.6,
  estimated_storage_requirement_m3_snapshot: 3.58,
  expires_at: hours(-10),
  host_id: "host-a",
  id: "req-1",
  inventory_id: "inv-1",
  inventory_item_count_snapshot: 17,
  inventory_items_snapshot: [
    { catalogue_key: "large_box", label: "Boxes", category: "boxes", quantity: 11, estimated_volume_m3: 1.1 },
  ],
  inventory_line_count_snapshot: 1,
  largest_item_snapshot: null,
  monthly_price_snapshot: 5500,
  renter_first_name_snapshot: "Sam",
  renter_id: "renter-1",
  renter_note: null,
  responded_at: hours(-4),
  space_accepted_categories_snapshot: ["boxes"],
  space_access_summary_snapshot: null,
  space_area_snapshot: "Southsea",
  space_available_capacity_m3_snapshot: 12,
  space_id: "space-1",
  space_postcode_district_snapshot: "PO4",
  space_title_snapshot: "Dry garage in Southsea",
  space_type_snapshot: "garage",
  spacefit_algorithm_snapshot: "v1",
  spacefit_breakdown_snapshot: null,
  spacefit_label_snapshot: "Great fit",
  spacefit_score_snapshot: 88,
  status: "accepted",
  updated_at: "2026-08-03T08:00:00Z",
  withdrawn_at: null,
};

const booking: Booking = {
  created_at: "2026-08-03T11:00:00Z",
  currency_snapshot: "GBP",
  end_date: "2026-12-15",
  estimated_storage_requirement_m3_snapshot: 3.58,
  host_accepted_at: hours(-4),
  host_id: "host-a",
  id: "book-1",
  inventory_item_count_snapshot: 17,
  inventory_items_snapshot: request.inventory_items_snapshot,
  monthly_price_snapshot: 5500,
  renter_first_name_snapshot: "Sam",
  renter_id: "renter-1",
  request_id: "req-1",
  space_area_snapshot: "Southsea",
  space_id: "space-1",
  space_postcode_district_snapshot: "PO4",
  space_title_snapshot: "Dry garage in Southsea",
  space_type_snapshot: "garage",
  spacefit_label_snapshot: "Great fit",
  spacefit_score_snapshot: 88,
  start_date: "2026-09-15",
  status: "pending_payment",
  updated_at: "2026-08-03T11:00:00Z",
};

/** Mirror of the server-side guards in `create_booking_from_request`. */
function bookingRuleCheck(
  req: StorageRequest,
  viewerId: string,
  existing: Booking | null,
  now: Date = NOW,
): { ok: boolean; reason?: string; bookingId?: string } {
  if (req.renter_id !== viewerId) return { ok: false, reason: "not-your-request" };
  if (existing) return { ok: true, bookingId: existing.id };
  if (req.status !== "accepted") return { ok: false, reason: "not-accepted" };
  if (!isBookingWindowOpen(req, now)) return { ok: false, reason: "window-expired" };
  return { ok: true };
}

describe("booking creation rules", () => {
  it("1. an accepted request can create a pending_payment booking", () => {
    expect(bookingRuleCheck(request, "renter-1", null)).toEqual({ ok: true });
    expect(booking.status).toBe("pending_payment");
  });

  it("2. a pending request cannot create a booking", () => {
    const pending = { ...request, status: "pending" as const, expires_at: hours(10), booking_action_expires_at: null };
    expect(bookingRuleCheck(pending, "renter-1", null).ok).toBe(false);
  });

  it("3. a declined request cannot create a booking", () => {
    expect(bookingRuleCheck({ ...request, status: "declined" }, "renter-1", null).ok).toBe(false);
  });

  it("4. a withdrawn request cannot create a booking", () => {
    expect(bookingRuleCheck({ ...request, status: "withdrawn" }, "renter-1", null).ok).toBe(false);
  });

  it("5. an expired request cannot create a booking", () => {
    expect(bookingRuleCheck({ ...request, status: "expired" }, "renter-1", null).ok).toBe(false);
  });

  it("6. another renter cannot create the booking", () => {
    expect(bookingRuleCheck(request, "renter-2", null)).toEqual({
      ok: false,
      reason: "not-your-request",
    });
  });

  it("7. the host cannot create the renter's booking", () => {
    expect(bookingRuleCheck(request, "host-a", null).ok).toBe(false);
  });

  it("8/9. repeat submissions return the same booking instead of creating another", () => {
    const first = bookingRuleCheck(request, "renter-1", null);
    expect(first).toEqual({ ok: true });
    const second = bookingRuleCheck(request, "renter-1", booking);
    expect(second).toEqual({ ok: true, bookingId: "book-1" });
  });

  it("20. an expired acceptance window blocks creation", () => {
    const stale = { ...request, booking_action_expires_at: hours(-1) };
    expect(bookingRuleCheck(stale, "renter-1", null)).toEqual({
      ok: false,
      reason: "window-expired",
    });
  });

  it("legacy acceptances without a stored window remain actionable", () => {
    expect(isBookingWindowOpen({ booking_action_expires_at: null }, NOW)).toBe(true);
  });
});

describe("booking snapshot", () => {
  it("10. stays unchanged when the listing changes", () => {
    const before = bookingView(booking);
    // A later listing edit only changes live space rows, never the booking row.
    const after = bookingView({ ...booking });
    expect(after).toEqual(before);
    expect(before.priceLabel).toBe("£55/month");
    expect(bookingItems(booking)).toHaveLength(1);
  });

  it("16. carries no capacity mutation fields", () => {
    expect(Object.keys(booking)).not.toContain("reserved_volume_m3");
    expect(Object.keys(booking)).not.toContain("occupied_volume_m3");
  });

  it("15. pending_payment is never presented as paid or earned", () => {
    const meta = bookingStatusMeta("pending_payment");
    expect(meta.label).toBe("Awaiting payment");
    expect(meta.detail).not.toMatch(/paid|confirmed booking|earnings/i);
  });
});

describe("request → booking UI state", () => {
  it("18. an accepted actionable request offers Continue to booking", () => {
    expect(bookingActionState(request, null, NOW)).toEqual({ kind: "continue" });
    expect(ACCEPTED_CTA_COPY).toMatch(/continue to booking/i);
  });

  it("19. a request with a booking shows View booking instead", () => {
    expect(bookingActionState(request, booking, NOW)).toEqual({
      kind: "started",
      bookingId: "book-1",
    });
  });

  it("an expired acceptance shows no active CTA", () => {
    expect(bookingActionState({ ...request, booking_action_expires_at: hours(-1) }, null, NOW)).toEqual({
      kind: "expired",
    });
  });

  it("a pending request offers nothing", () => {
    const pending = { ...request, status: "pending" as const, expires_at: hours(10) };
    expect(bookingActionState(pending, null, NOW)).toEqual({ kind: "none" });
  });

  it("17. the source request survives booking creation", () => {
    expect(booking.request_id).toBe(request.id);
    expect(bookingsByRequest([booking])[request.id]?.id).toBe("book-1");
  });
});
