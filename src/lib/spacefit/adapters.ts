/**
 * Canonical adapters from database rows to the engine's MatchSpace model.
 *
 * Both the matches list (get_published_spaces) and the listing detail page
 * (get_published_space) MUST normalise through here, so the same space always
 * produces the same SpaceFit result no matter which surface renders it.
 *
 * The two RPCs expose photos differently — the list returns `photo_count`,
 * the detail row returns `photo_paths` — so photo presence is derived from
 * whichever field is available rather than read from one field name.
 */
import type { MatchSpace } from "./types";

/** Loose shape covering both published-space RPC row variants. */
export interface PublishedSpaceLike {
  id: string;
  title: string | null;
  space_type: string | null;
  postcode_district: string | null;
  approximate_area: string | null;
  monthly_price_pence: number | null;
  estimated_available_volume_m3: number | string | null;
  total_volume_m3: number | string | null;
  accepted_categories: string[] | null;
  host_restrictions: string[] | null;
  restriction_notes: string | null;
  features: string[] | null;
  access_type: string | null;
  moisture_condition: string | null;
  temperature_condition: string | null;
  door_width_cm: number | null;
  door_height_cm: number | null;
  photo_count?: number | null;
  photo_paths?: string[] | null;
  cover_path?: string | null;
}

const num = (value: number | string | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

/** Photo count, derived from whichever projection the RPC provided. */
function photoCount(row: PublishedSpaceLike): number {
  if (typeof row.photo_count === "number") return row.photo_count;
  if (Array.isArray(row.photo_paths)) return row.photo_paths.length;
  return 0;
}

/** Cover path, derived from whichever projection the RPC provided. */
function coverPath(row: PublishedSpaceLike): string | null {
  if (row.cover_path) return row.cover_path;
  if (Array.isArray(row.photo_paths) && row.photo_paths.length > 0) return row.photo_paths[0] ?? null;
  return null;
}

/** Narrows any published-space row to the public-safe fields the engine consumes. */
export function toMatchSpace(row: PublishedSpaceLike): MatchSpace {
  return {
    id: row.id,
    title: row.title,
    space_type: row.space_type,
    postcode_district: row.postcode_district,
    approximate_area: row.approximate_area,
    monthly_price_pence: row.monthly_price_pence,
    estimated_available_volume_m3: num(row.estimated_available_volume_m3),
    total_volume_m3: num(row.total_volume_m3),
    accepted_categories: row.accepted_categories,
    host_restrictions: row.host_restrictions,
    restriction_notes: row.restriction_notes,
    features: row.features,
    access_type: row.access_type,
    moisture_condition: row.moisture_condition,
    temperature_condition: row.temperature_condition,
    door_width_cm: row.door_width_cm,
    door_height_cm: row.door_height_cm,
    photo_count: photoCount(row),
    cover_path: coverPath(row),
  };
}
