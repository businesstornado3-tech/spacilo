/**
 * Location-aware public discovery.
 *
 * Filtering and distance are computed in the database by
 * public.search_published_spaces so the browser never receives the whole
 * table — or any exact host coordinate.
 */
import { supabase } from "@/integrations/supabase/client";
import type { GeoPoint } from "@/lib/location/schema";

export type SearchSpaceRow = Awaited<ReturnType<typeof searchPublishedSpaces>>[number];

export interface SearchQuery {
  centre: GeoPoint | null;
  radiusMiles: number;
  limit?: number;
}

export async function searchPublishedSpaces({ centre, radiusMiles, limit = 60 }: SearchQuery) {
  const { data, error } = await supabase.rpc("search_published_spaces", {
    ...(centre ? { search_lat: centre.lat, search_lng: centre.lng } : {}),
    radius_miles: radiusMiles,
    limit_count: limit,
  });
  if (error) throw error;
  return data ?? [];
}

/**
 * Defence in depth: the RPC already withholds private data, but any row that
 * reaches the browser is passed through this allowlist before use, so a future
 * projection mistake can never surface an address or an exact coordinate.
 */
export const PUBLIC_SEARCH_FIELDS = [
  "id",
  "title",
  "space_type",
  "description",
  "storage_mode",
  "host_available_percentage",
  "floor_area_m2",
  "total_volume_m3",
  "estimated_available_volume_m3",
  "postcode_district",
  "approximate_area",
  "approx_latitude",
  "approx_longitude",
  "distance_miles",
  "monthly_price_pence",
  "currency",
  "minimum_storage_period_months",
  "access_type",
  "access_frequency",
  "features",
  "accepted_categories",
  "cover_path",
  "published_at",
  "host_display_name",
  "host_phone_verified",
  "host_restrictions",
  "restriction_notes",
  "door_width_cm",
  "door_height_cm",
  "moisture_condition",
  "temperature_condition",
  "ground_floor_access",
  "stairs_required",
  "lift_available",
  "vehicle_access_close",
  "photo_count",
] as const;

export type PublicSearchField = (typeof PUBLIC_SEARCH_FIELDS)[number];

/** Drops anything not on the public allowlist (address, exact lat/lng, host ids…). */
export function toPublicSearchRow<T extends Record<string, unknown>>(
  row: T,
): Pick<T, Extract<keyof T, PublicSearchField>> {
  const out: Record<string, unknown> = {};
  for (const field of PUBLIC_SEARCH_FIELDS) {
    if (field in row) out[field] = row[field];
  }
  return out as Pick<T, Extract<keyof T, PublicSearchField>>;
}
