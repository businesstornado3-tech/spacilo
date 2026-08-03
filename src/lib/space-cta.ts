/**
 * What the signed-in renter should see at the bottom of a public listing.
 *
 * Derived purely from the renter's OWN requests and bookings for that space
 * (RLS already scopes the rows, and the queries filter on renter_id as well).
 * Historical requests — declined, withdrawn, expired — never block a new
 * request; only a live relationship replaces the "Request this space" CTA.
 */
import { isBookingWindowOpen, type Booking } from "@/lib/bookings";
import { effectiveStatus, type StorageRequest } from "@/lib/storage-requests";

export type SpaceCtaState =
  | { kind: "new" }
  | { kind: "pending"; requestId: string }
  | { kind: "continue"; requestId: string }
  | { kind: "accepted_expired"; requestId: string }
  | { kind: "booking"; bookingId: string; status: Booking["status"] };

type RequestLike = Pick<
  StorageRequest,
  "id" | "status" | "expires_at" | "booking_action_expires_at" | "created_at"
>;
type BookingLike = Pick<Booking, "id" | "status" | "created_at">;

const newest = <T extends { created_at: string }>(rows: T[]): T | undefined =>
  [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

/**
 * Priority: confirmed booking → pending_payment booking → accepted request
 * still inside its window → accepted request whose window closed → pending
 * request → otherwise a new request is allowed.
 */
export function spaceCtaState(
  requests: RequestLike[],
  bookings: BookingLike[],
  now: Date = new Date(),
): SpaceCtaState {
  const confirmed = newest(bookings.filter((b) => b.status === "confirmed"));
  if (confirmed) return { kind: "booking", bookingId: confirmed.id, status: confirmed.status };

  const awaiting = newest(bookings.filter((b) => b.status === "pending_payment"));
  if (awaiting) return { kind: "booking", bookingId: awaiting.id, status: awaiting.status };

  const accepted = requests.filter((r) => effectiveStatus(r, now) === "accepted");
  const actionable = newest(accepted.filter((r) => isBookingWindowOpen(r, now)));
  if (actionable) return { kind: "continue", requestId: actionable.id };

  const stale = newest(accepted);
  if (stale) return { kind: "accepted_expired", requestId: stale.id };

  const pending = newest(requests.filter((r) => effectiveStatus(r, now) === "pending"));
  if (pending) return { kind: "pending", requestId: pending.id };

  return { kind: "new" };
}
