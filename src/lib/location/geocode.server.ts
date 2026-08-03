/**
 * Host address geocoding (server only).
 *
 * The host's exact address and the coordinates derived from it are private:
 * they live on public.spaces behind owner-scoped RLS and are never returned by
 * a public RPC. Only the approximate coordinates derived by the database
 * trigger are ever published.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getGeocodingProvider } from "./provider.server";
import { normaliseLocationInput } from "./schema";

export type GeocodeStatus = "pending" | "ok" | "failed" | "skipped";

export interface GeocodeSpaceResult {
  status: GeocodeStatus;
  /** Renter/host-facing message; never contains the address. */
  message: string;
  geocodedAt: string | null;
}

interface SpaceAddressRow {
  id: string;
  address_line1: string | null;
  town: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  geocode_status: string | null;
}

/**
 * Geocode one space the caller owns. RLS on `spaces` does the ownership check:
 * the supabase client passed in is the caller's own authenticated client.
 */
export async function geocodeSpaceById(
  supabase: SupabaseClient<any, any, any>,
  spaceId: string,
  options: { force?: boolean } = {},
): Promise<GeocodeSpaceResult> {
  const { data, error } = await supabase
    .from("spaces")
    .select("id, address_line1, town, postcode, latitude, longitude, geocode_status")
    .eq("id", spaceId)
    .maybeSingle();

  if (error || !data) {
    return { status: "failed", message: "That space isn't available.", geocodedAt: null };
  }

  const row = data as SpaceAddressRow;
  const postcode = (row.postcode ?? "").trim();

  if (!postcode) {
    return {
      status: "skipped",
      message: "Add a postcode so renters nearby can find your space.",
      geocodedAt: null,
    };
  }

  // Nothing to do: already resolved and the address hasn't changed.
  if (!options.force && row.geocode_status === "ok" && row.latitude !== null && row.longitude !== null) {
    return { status: "ok", message: "Location already resolved.", geocodedAt: null };
  }

  const provider = getGeocodingProvider();
  let point = null;
  try {
    point = await provider.geocode(normaliseLocationInput(postcode));
  } catch {
    point = null;
  }

  if (!point) {
    // Never destroy listing data because a lookup failed.
    await supabase
      .from("spaces")
      .update({
        geocode_status: "failed",
        geocode_error: "Address could not be located",
        geocode_source: provider.name,
      })
      .eq("id", spaceId);
    return {
      status: "failed",
      message:
        "We couldn't pinpoint that postcode. Your listing is safe — check the postcode and try again. Until it's resolved your space won't appear in distance searches.",
      geocodedAt: null,
    };
  }

  const geocodedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("spaces")
    .update({
      latitude: point.lat,
      longitude: point.lng,
      geocode_status: "ok",
      geocode_error: null,
      geocode_source: provider.name,
      geocoded_at: geocodedAt,
    })
    .eq("id", spaceId);

  if (updateError) {
    return { status: "failed", message: "We couldn't save your location. Try again.", geocodedAt: null };
  }

  return { status: "ok", message: "Location resolved.", geocodedAt };
}
