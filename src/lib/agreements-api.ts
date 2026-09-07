/**
 * Data access for the bilateral Storage Agreement.
 *
 * Every call goes through a SECURITY DEFINER routine that works out the
 * signed-in user's party from `auth.uid()`. The browser can never say which
 * party it is, and never accepts on behalf of the other side.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AgreementStateView } from "@/lib/agreements";

export async function getAgreementState(bookingId: string): Promise<AgreementStateView> {
  const { data, error } = await supabase.rpc("get_storage_agreement_state", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
  return data as unknown as AgreementStateView;
}

/** Creates the agreement for this booking if it doesn't exist yet. */
export async function ensureAgreement(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("get_or_create_storage_agreement", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
}

/** Records THIS user's acceptance, against one exact version. */
export async function acceptAgreement(input: {
  bookingId: string;
  agreementVersionId: string;
}): Promise<void> {
  const { error } = await supabase.rpc("accept_storage_agreement", {
    p_booking_id: input.bookingId,
    p_agreement_version_id: input.agreementVersionId,
  });
  if (error) throw error;
}
