/**
 * Deterministic distance maths.
 *
 * The database does the real filtering (public.haversine_miles + the
 * search_published_spaces RPC); these helpers mirror the same formula for
 * client-side sorting, tests and display. No AI, no randomness.
 */
import type { GeoPoint } from "./schema";

const EARTH_RADIUS_MILES = 3958.7613;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in miles (Haversine). Matches the SQL implementation. */
export function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return round(EARTH_RADIUS_MILES * 2 * Math.asin(Math.sqrt(h)), 3);
}

export function round(value: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

/** Inclusive radius test used by tests and any client-side re-filtering. */
export const withinRadius = (distanceMiles: number | null, radiusMiles: number) =>
  distanceMiles !== null && distanceMiles <= radiusMiles;

/** Nearest first; unknown distances always sort last. */
export function sortByDistance<T extends { distance_miles: number | null }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    if (a.distance_miles === null && b.distance_miles === null) return 0;
    if (a.distance_miles === null) return 1;
    if (b.distance_miles === null) return -1;
    return a.distance_miles - b.distance_miles;
  });
}

/** "1.2 miles away" / "Less than 0.1 miles away". */
export function formatMilesAway(miles: number | null): string | null {
  if (miles === null || !Number.isFinite(miles)) return null;
  if (miles < 0.1) return "Less than 0.1 miles away";
  return `${miles.toFixed(1)} ${miles.toFixed(1) === "1.0" ? "mile" : "miles"} away`;
}

/** "1.2 miles from PO4 8LB" — used for search context on the listing page. */
export function formatMilesFrom(miles: number | null, label: string): string | null {
  if (miles === null || !Number.isFinite(miles)) return null;
  const value = miles < 0.1 ? "Less than 0.1" : miles.toFixed(1);
  return `${value} ${value === "1.0" ? "mile" : "miles"} from ${label}`;
}
