/**
 * Booking-aware wording for a storage request (Prompt 10B).
 *
 * Once a booking exists for an accepted request, the request surfaces must
 * stop claiming that "it isn't a booking yet". The truth is derived from the
 * request + its linked booking — no extra lifecycle flag.
 */
import type { Booking } from "@/lib/bookings";
import {
  effectiveStatus,
  requestStatusNote,
  statusMeta,
  type StorageRequest,
} from "@/lib/storage-requests";

type BookingLike = Pick<Booking, "status"> | null | undefined;

const RENTER_BOOKING_DETAIL: Record<string, string> = {
  pending_payment: "A booking has been started from this request and is awaiting payment.",
  confirmed: "A booking has been confirmed from this request.",
  cancelled: "A booking was started from this request and later cancelled.",
  completed: "A booking created from this request has finished.",
};

const HOST_BOOKING_DETAIL_NOTE: Record<string, string> = {
  pending_payment: "The renter has started a booking from this request. It's awaiting payment.",
  confirmed: "A booking created from this request is confirmed.",
  cancelled: "A booking was started from this request and later cancelled.",
  completed: "A booking created from this request has finished.",
};

const bookingSentence = (status: string, audience: "renter" | "host") =>
  (audience === "host" ? HOST_BOOKING_DETAIL_NOTE : RENTER_BOOKING_DETAIL)[status] ?? null;

/** Detail line for the request status (replaces `statusMeta(...).detail`). */
export function requestStatusDetail(
  request: Pick<StorageRequest, "status" | "expires_at">,
  booking: BookingLike,
  audience: "renter" | "host" = "renter",
  now: Date = new Date(),
): string {
  const sentence = booking ? bookingSentence(booking.status, audience) : null;
  if (sentence) return sentence;
  return statusMeta(effectiveStatus(request, now)).detail;
}

/** "Estimates only. …" note, aware of any booking created from the request. */
export function requestNote(
  request: Pick<StorageRequest, "status" | "expires_at">,
  booking: BookingLike,
  audience: "renter" | "host" = "renter",
  now: Date = new Date(),
): string {
  const sentence = booking ? bookingSentence(booking.status, audience) : null;
  if (sentence) return `Estimates only. ${sentence}`;
  return requestStatusNote(request, audience, now);
}
