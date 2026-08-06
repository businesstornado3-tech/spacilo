/**
 * Public host profile + listing availability reads (Prompt 26B).
 *
 * Both RPCs are SECURITY DEFINER projections: they return only the fields the
 * public listing page is allowed to show. Nothing private (surname, contact
 * details, exact address, renter identities) crosses this boundary.
 */
import { supabase } from "@/integrations/supabase/client";
import type { HostProfilePayload } from "@/lib/trust/host-profile";
import type { UnavailableRange } from "@/lib/marketplace/availability";

/** Keyed by listing: the host behind a published space, never an arbitrary user. */
export async function fetchPublicHostProfile(spaceId: string): Promise<HostProfilePayload | null> {
  const { data, error } = await supabase.rpc("get_public_host_profile", { p_space_id: spaceId });
  if (error) throw error;
  return (data ?? null) as HostProfilePayload | null;
}

export async function fetchUnavailableDates(spaceId: string): Promise<UnavailableRange[]> {
  const { data, error } = await supabase.rpc("get_space_unavailable_dates", {
    p_space_id: spaceId,
  });
  if (error) throw error;
  return (data ?? []) as UnavailableRange[];
}
