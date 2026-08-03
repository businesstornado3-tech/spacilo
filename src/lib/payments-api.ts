/**
 * Client-side reads for the payment domain.
 *
 * Payments are readable only by their own renter (RLS). Nothing here can
 * create or mutate a payment — that happens server-side only.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Payment = Tables<"payments">;

export interface ExactAddress {
  address_line1: string | null;
  address_line2: string | null;
  town: string | null;
  postcode: string | null;
  access_notes: string | null;
}

export async function listPaymentsForBooking(bookingId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Returns nothing unless the caller is the renter of a confirmed, paid booking. */
export async function getBookingExactAddress(bookingId: string): Promise<ExactAddress | null> {
  const { data, error } = await supabase.rpc("get_booking_exact_address", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
  const rows = (data ?? []) as ExactAddress[];
  return rows[0] ?? null;
}

/** Every payment belonging to the signed-in renter (RLS scopes this). */
export async function listMyPayments(): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
