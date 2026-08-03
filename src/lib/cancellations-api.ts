/**
 * Client-side reads for cancellations, refunds and host liabilities.
 *
 * RLS restricts each row to the booking's renter/host (or the host the
 * adjustment belongs to). Nothing here can create or mutate a financial
 * record — that happens only through server-authorised paths.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type BookingCancellationRow = Tables<"booking_cancellations">;
export type BookingRefundRow = Tables<"booking_refunds">;
export type HostBalanceAdjustmentRow = Tables<"host_balance_adjustments">;

export async function getBookingCancellation(
  bookingId: string,
): Promise<BookingCancellationRow | null> {
  const { data, error } = await supabase
    .from("booking_cancellations")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** All cancellations visible to the signed-in user (RLS: renter or host). */
export async function listMyBookingCancellations(): Promise<BookingCancellationRow[]> {
  const { data, error } = await supabase
    .from("booking_cancellations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listBookingRefunds(bookingId: string): Promise<BookingRefundRow[]> {
  const { data, error } = await supabase
    .from("booking_refunds")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listHostBalanceAdjustments(
  hostUserId: string,
): Promise<HostBalanceAdjustmentRow[]> {
  const { data, error } = await supabase
    .from("host_balance_adjustments")
    .select("*")
    .eq("host_user_id", hostUserId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Totals actually settled with Stripe, in integer pence. */
export function settledRefundTotals(refunds: BookingRefundRow[]) {
  return refunds
    .filter((r) => r.status === "succeeded")
    .reduce(
      (acc, r) => ({
        storagePence: acc.storagePence + r.storage_refund_pence,
        serviceFeePence: acc.serviceFeePence + r.service_fee_refund_pence,
        totalPence: acc.totalPence + r.total_refund_pence,
      }),
      { storagePence: 0, serviceFeePence: 0, totalPence: 0 },
    );
}

export const hasPendingRefund = (refunds: BookingRefundRow[]): boolean =>
  refunds.some((r) => r.status === "pending");
