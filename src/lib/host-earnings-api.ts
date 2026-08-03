/**
 * Client-side reads for the host earnings ledger.
 *
 * RLS restricts both tables to the signed-in host. Nothing here can create or
 * mutate an earning, a status, an amount or a transfer reference — those move
 * only through trusted server-side functions.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type HostPayoutAccountRow = Tables<"host_payout_accounts">;
export type HostEarningRow = Tables<"host_earnings">;

export interface EarningRefundRow {
  id: string;
  status: Tables<"booking_refunds">["status"];
  total_refund_pence: number;
  storage_refund_pence: number;
  completed_at: string | null;
  created_at: string;
}

export interface HostEarningWithBooking extends HostEarningRow {
  bookings: {
    space_title_snapshot: string | null;
    start_date: string;
    end_date: string;
    status: string;
    /** Server-owned refund ledger for the booking — the authority on refunds. */
    booking_refunds: EarningRefundRow[];
  } | null;
}

export async function getHostPayoutAccount(
  hostUserId: string,
): Promise<HostPayoutAccountRow | null> {
  const { data, error } = await supabase
    .from("host_payout_accounts")
    .select("*")
    .eq("host_user_id", hostUserId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function listHostEarnings(hostUserId: string): Promise<HostEarningWithBooking[]> {
  const { data, error } = await supabase
    .from("host_earnings")
    .select("*, bookings(space_title_snapshot, start_date, end_date)")
    .eq("host_user_id", hostUserId)
    .order("eligible_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as HostEarningWithBooking[];
}

/** Short human reference for a booking, e.g. PS-3F2A9C. */
export const bookingReference = (bookingId: string): string =>
  `PS-${bookingId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
