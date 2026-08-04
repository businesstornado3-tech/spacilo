/**
 * Data access for bookings.
 *
 * Creation goes exclusively through `create_booking_from_request`, which
 * re-checks ownership, accepted status, the 24-hour acceptance window and the
 * one-booking-per-request rule inside the database. Reads are plain RLS-scoped
 * table calls: a renter only sees their own bookings, a host only sees
 * bookings for their own spaces.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Booking } from "@/lib/bookings";

export async function createBookingFromRequest(requestId: string): Promise<Booking> {
  const { data, error } = await supabase.rpc("create_booking_from_request", {
    p_request_id: requestId,
  });
  if (error) throw error;
  return data as unknown as Booking;
}

export async function listMyBookings(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getBooking(id: string): Promise<Booking | null> {
  const { data, error } = await supabase.from("bookings").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getBookingForRequest(requestId: string): Promise<Booking | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** This renter's own bookings for one space (RLS + explicit renter filter). */
export async function myBookingsForSpace(spaceId: string, renterId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("space_id", spaceId)
    .eq("renter_id", renterId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/* ------------------------------------------------- lifecycle (Prompt 14) */

/**
 * Storage handover. The RPC re-checks ownership, confirmation, payment,
 * financial holds and the start date under a row lock, and is idempotent.
 */
export async function activateBooking(bookingId: string): Promise<Booking> {
  const { data, error } = await supabase.rpc("activate_booking", { p_booking_id: bookingId });
  if (error) throw error;
  return data as unknown as Booking;
}

/** End of storage. Rejected before the end date; idempotent afterwards. */
export async function completeBooking(bookingId: string): Promise<Booking> {
  const { data, error } = await supabase.rpc("complete_booking", { p_booking_id: bookingId });
  if (error) throw error;
  return data as unknown as Booking;
}

export type BookingChangeRequest = Tables<"booking_change_requests">;

/**
 * Ask to extend a booking. Prices the extra days with the booking's own
 * snapshotted rates; never changes the booking or takes a payment.
 */
export async function requestBookingExtension(input: {
  bookingId: string;
  newEndDate: string;
  note?: string;
}): Promise<BookingChangeRequest> {
  const { data, error } = await supabase.rpc("request_booking_extension", {
    p_booking_id: input.bookingId,
    p_new_end_date: input.newEndDate,
    ...(input.note ? { p_note: input.note } : {}),
  });
  if (error) throw error;
  return data as unknown as BookingChangeRequest;
}

/** Host decision on an extension. Accepting does not extend the booking yet. */
export async function respondToBookingExtension(input: {
  changeId: string;
  accept: boolean;
  note?: string;
}): Promise<BookingChangeRequest> {
  const { data, error } = await supabase.rpc("respond_to_booking_extension", {
    p_change_id: input.changeId,
    p_accept: input.accept,
    ...(input.note ? { p_note: input.note } : {}),
  });
  if (error) throw error;
  return data as unknown as BookingChangeRequest;
}

export async function listBookingChangeRequests(
  bookingId: string,
): Promise<BookingChangeRequest[]> {
  const { data, error } = await supabase
    .from("booking_change_requests")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Every open change request across this host's bookings. */
export async function listMyChangeRequests(): Promise<BookingChangeRequest[]> {
  const { data, error } = await supabase
    .from("booking_change_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/* ---------------------------------------- two-party handover (consolidated) */

/**
 * Confirm this side of the storage handover. Storage only becomes active once
 * BOTH the renter and the host have confirmed; the RPC decides which half of
 * the record the caller owns and is idempotent.
 */
export async function confirmBookingHandover(bookingId: string): Promise<Booking> {
  const { data, error } = await supabase.rpc("confirm_booking_handover", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
  return data as unknown as Booking;
}

/** Confirm this side of the collection. Both sides finish the booking. */
export async function confirmBookingCollection(bookingId: string): Promise<Booking> {
  const { data, error } = await supabase.rpc("confirm_booking_collection", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
  return data as unknown as Booking;
}
