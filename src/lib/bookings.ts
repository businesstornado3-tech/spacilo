/**
 * Booking domain helpers (Prompt 10).
 *
 * A booking is created only after a host accepts a storage request and the
 * renter chooses to continue. It is a SNAPSHOT of the accepted request, so
 * later listing edits never rewrite booking history.
 *
 * A `pending_payment` booking is NOT paid, NOT confirmed and does NOT reserve
 * capacity. Payment arrives in a later step.
 */
import type { Tables } from "@/integrations/supabase/types";
import { formatDate, formatPrice } from "@/lib/format";
import { effectiveStatus, formatRequestPeriod, type StorageRequest } from "@/lib/storage-requests";

export type Booking = Tables<"bookings">;
export type BookingStatus = Booking["status"];

/** How long a renter has to continue after the host accepts. */
export const BOOKING_ACTION_WINDOW_HOURS = 24;

type Tone = "neutral" | "warning" | "success" | "destructive" | "info";

export const BOOKING_STATUS_META: Record<string, { label: string; tone: Tone; detail: string }> = {
  pending_payment: {
    label: "Awaiting payment",
    tone: "warning",
    detail:
      "The host accepted your request. Payment is still required before this booking is confirmed.",
  },
  confirmed: { label: "Confirmed", tone: "success", detail: "This booking is confirmed." },
  cancelled: { label: "Cancelled", tone: "neutral", detail: "This booking was cancelled." },
  completed: { label: "Completed", tone: "neutral", detail: "This booking has finished." },
};

export const bookingStatusMeta = (status: string) =>
  BOOKING_STATUS_META[status] ?? { label: status, tone: "neutral" as Tone, detail: "" };

/** Host-facing wording for the same statuses. */
export const HOST_BOOKING_DETAIL: Record<string, string> = {
  pending_payment:
    "The renter has started a booking. Payment isn't available yet, so nothing is confirmed and no action is needed from you.",
  confirmed: "This booking is confirmed.",
  cancelled: "This booking was cancelled.",
  completed: "This booking has finished.",
};

export const hostBookingDetail = (status: string) => HOST_BOOKING_DETAIL[status] ?? "";

/** Payment has not been built yet — say so plainly rather than faking a total. */
export const BOOKING_PAYMENT_NOTE =
  "Payment isn't available yet. Continuing creates a booking that stays awaiting payment until payments are switched on.";

/* ------------------------------------------------ accepted-request window */

export const bookingWindowExpiresAt = (
  request: Pick<StorageRequest, "booking_action_expires_at">,
): Date | null =>
  request.booking_action_expires_at ? new Date(request.booking_action_expires_at) : null;

export function isBookingWindowOpen(
  request: Pick<StorageRequest, "booking_action_expires_at">,
  now: Date = new Date(),
): boolean {
  const expiry = bookingWindowExpiresAt(request);
  if (!expiry) return true; // legacy acceptances with no stored window
  return expiry.getTime() > now.getTime();
}

/** "Continue by 4 August 2026" */
export function bookingWindowLabel(
  request: Pick<StorageRequest, "booking_action_expires_at">,
): string | null {
  const expiry = bookingWindowExpiresAt(request);
  if (!expiry) return null;
  return `Continue by ${formatDate(expiry.toISOString())}`;
}

export type BookingActionState =
  | { kind: "none" }
  | { kind: "continue" }
  | { kind: "expired" }
  | { kind: "started"; bookingId: string };

/**
 * What the renter should see on an accepted request. Mirrors the server-side
 * rules in `create_booking_from_request`; the RPC remains the authority.
 */
export function bookingActionState(
  request: Pick<StorageRequest, "status" | "expires_at" | "booking_action_expires_at">,
  booking: Pick<Booking, "id"> | null | undefined,
  now: Date = new Date(),
): BookingActionState {
  if (booking) return { kind: "started", bookingId: booking.id };
  if (effectiveStatus(request, now) !== "accepted") return { kind: "none" };
  return isBookingWindowOpen(request, now) ? { kind: "continue" } : { kind: "expired" };
}

export const ACCEPTED_CTA_COPY =
  "The host accepted your request. Review the details and continue to booking.";

export const ACCEPTED_EXPIRED_COPY =
  "The window to continue to booking has expired. You can send the host a new request if you still need the space.";

export const BOOKING_STARTED_COPY =
  "You've started a booking from this request. It stays awaiting payment for now.";

/* -------------------------------------------------------------- read model */

export interface BookingView {
  status: BookingStatus;
  statusLabel: string;
  spaceTitle: string;
  spaceType: string | null;
  area: string | null;
  period: string;
  priceLabel: string;
  itemCount: number;
  requirementM3: number;
  spaceFitScore: number | null;
  spaceFitLabel: string | null;
}

export function bookingView(booking: Booking): BookingView {
  return {
    status: booking.status,
    statusLabel: bookingStatusMeta(booking.status).label,
    spaceTitle: booking.space_title_snapshot ?? "Storage space",
    spaceType: booking.space_type_snapshot,
    area: booking.space_area_snapshot ?? booking.space_postcode_district_snapshot,
    period: formatRequestPeriod(booking.start_date, booking.end_date),
    priceLabel:
      booking.monthly_price_snapshot === null
        ? "Price not published"
        : `${formatPrice(booking.monthly_price_snapshot)}/month`,
    itemCount: booking.inventory_item_count_snapshot,
    requirementM3: Number(booking.estimated_storage_requirement_m3_snapshot),
    spaceFitScore: booking.spacefit_score_snapshot,
    spaceFitLabel: booking.spacefit_label_snapshot,
  };
}

export interface BookingSnapshotItem {
  catalogue_key: string | null;
  label: string;
  category: string;
  quantity: number;
  estimated_volume_m3: number | null;
}

export function bookingItems(booking: Pick<Booking, "inventory_items_snapshot">): BookingSnapshotItem[] {
  const raw = booking.inventory_items_snapshot;
  return Array.isArray(raw) ? (raw as unknown as BookingSnapshotItem[]) : [];
}

export const bookingsByRequest = (bookings: Booking[]): Record<string, Booking> =>
  Object.fromEntries(bookings.map((booking) => [booking.request_id, booking]));
