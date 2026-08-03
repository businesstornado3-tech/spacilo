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
