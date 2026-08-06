/**
 * Factual, plain-language summary chips for a published listing.
 *
 * Every chip is derived from a field the host actually filled in. Nothing is
 * inferred, scored or marketed here: an absent field produces no chip rather
 * than a reassuring default. Shared by the search card and the listing page so
 * the two never disagree.
 */
import { accessTypeLabel, featureLabel, formatM3, formatStay } from "@/lib/spaces";
import type { AccessTypeValue } from "@/lib/spaces";

/** The subset of a published listing row these helpers read. */
export type ListingFactsRow = {
  features?: string[] | null;
  access_type?: string | null;
  ground_floor_access?: boolean | null;
  stairs_required?: boolean | null;
  lift_available?: boolean | null;
  vehicle_access_close?: boolean | null;
  estimated_available_volume_m3?: number | string | null;
  door_width_cm?: number | null;
  door_height_cm?: number | null;
  minimum_storage_period_months?: number | null;
  minimum_stay_days?: number | null;
  host_phone_verified?: boolean | null;
  photo_count?: number | null;
};

/** Security-relevant features the host has confirmed, in a stable order. */
const SECURITY_FEATURES = ["cctv", "alarm", "locked", "secure_door", "gated"] as const;

export function securityChips(row: ListingFactsRow): string[] {
  const features = row.features ?? [];
  return SECURITY_FEATURES.filter((f) => features.includes(f)).map((f) => featureLabel(f));
}

/**
 * Access and accessibility facts. Only positive, host-confirmed statements —
 * we never render "no lift" or similar, which would read as a judgement.
 */
export function accessChips(row: ListingFactsRow): string[] {
  const chips: string[] = [];
  if (row.ground_floor_access) chips.push("Ground floor");
  if (row.lift_available) chips.push("Lift available");
  if (row.vehicle_access_close) chips.push("Vehicle access");
  if (row.stairs_required) chips.push("Stairs involved");
  return chips;
}

/** Door opening, only when the host measured both dimensions. */
export function doorwaySummary(row: ListingFactsRow): string | null {
  const w = row.door_width_cm;
  const h = row.door_height_cm;
  if (!w || !h) return null;
  return `Doorway ${Math.round(w)} × ${Math.round(h)} cm`;
}

/** Minimum commitment, preferring the day-accurate value when present. */
export function minimumStaySummary(row: ListingFactsRow): string | null {
  if (row.minimum_stay_days) return `${formatStay(row.minimum_stay_days)} minimum`;
  const months = row.minimum_storage_period_months;
  if (!months) return null;
  return `${months} month${months === 1 ? "" : "s"} minimum`;
}

/** Estimated usable capacity, phrased as the estimate it is. */
export function capacitySummary(row: ListingFactsRow): string | null {
  const raw = row.estimated_available_volume_m3;
  const value = raw === null || raw === undefined ? null : Number(raw);
  if (value === null || Number.isNaN(value) || value <= 0) return null;
  return `${formatM3(value)} estimated capacity`;
}

/** How a renter gets in, as the host described it. */
export function accessSummary(row: ListingFactsRow): string | null {
  if (!row.access_type) return null;
  return accessTypeLabel(row.access_type as AccessTypeValue);
}

/**
 * The compact chip row used on cards: capacity first, then access, then
 * security. Capped so a card never turns into a wall of tags.
 */
export function cardChips(row: ListingFactsRow, limit = 4): string[] {
  const chips = [
    ...accessChips(row),
    ...securityChips(row),
    ...(minimumStaySummary(row) ? [minimumStaySummary(row)!] : []),
  ];
  return chips.slice(0, limit);
}
