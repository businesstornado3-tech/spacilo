/**
 * Early termination reads/writes (Prompt 17).
 *
 * Both RPCs authenticate the caller, lock the booking and validate the dates
 * server-side. The browser cannot set a booking's end date directly, and only
 * the party who did not ask may answer a request.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ChangeRequestRow } from "@/lib/early-termination";

export async function requestEarlyTermination(input: {
  bookingId: string;
  proposedEndDate: string;
  reasonCategory?: string;
  reasonDetails?: string;
}): Promise<ChangeRequestRow> {
  const { data, error } = await supabase.rpc("request_early_termination", {
    p_booking_id: input.bookingId,
    p_proposed_end_date: input.proposedEndDate,
    ...(input.reasonCategory ? { p_reason_category: input.reasonCategory } : {}),
    ...(input.reasonDetails ? { p_reason: input.reasonDetails } : {}),
  });
  if (error) throw error;
  return data as unknown as ChangeRequestRow;
}

export async function respondToEarlyTermination(input: {
  changeId: string;
  accept: boolean;
  note?: string;
}): Promise<ChangeRequestRow> {
  const { data, error } = await supabase.rpc("respond_to_early_termination", {
    p_change_id: input.changeId,
    p_accept: input.accept,
    ...(input.note ? { p_note: input.note } : {}),
  });
  if (error) throw error;
  return data as unknown as ChangeRequestRow;
}
