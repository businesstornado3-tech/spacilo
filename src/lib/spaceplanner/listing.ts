/**
 * Turning a real listing into planner geometry.
 *
 * The homepage planner reasons about representative demo spaces. On a listing
 * page it must reason about *this* space, using only what the host published:
 * internal dimensions, the opening, the ceiling, the storage type, plus the
 * access and rule text they wrote themselves. Nothing here estimates a figure
 * the host didn't give us without saying so — where a dimension is missing we
 * derive it cautiously from the ones that exist and mark the result as such.
 */
import type { SpaceKind, StorageSpace } from "./types";
import { USABLE_VOLUME_FACTOR } from "./spaces";

/** The published-listing fields the planner needs. Both RPC shapes satisfy it. */
export interface ListingSpaceSource {
  id?: string | null;
  title?: string | null;
  space_type?: string | null;
  width_m?: number | string | null;
  length_m?: number | string | null;
  height_m?: number | string | null;
  floor_area_m2?: number | string | null;
  total_volume_m3?: number | string | null;
  estimated_available_volume_m3?: number | string | null;
  door_width_cm?: number | string | null;
  door_height_cm?: number | string | null;
  access_type?: string | null;
  access_notes?: string | null;
  restriction_notes?: string | null;
  host_restrictions?: string[] | null;
  stairs_required?: boolean | null;
  ground_floor_access?: boolean | null;
  storage_mode?: string | null;
}

const num = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const SPACE_KINDS: Record<string, SpaceKind> = {
  garage: "garage",
  spare_room: "bedroom",
  loft: "loft",
  shed: "shed",
  basement: "storage_room",
  storage_room: "storage_room",
  outbuilding: "shed",
  commercial: "commercial",
  other: "storage_room",
};

/** Cautious fallbacks when a host published a volume but no dimensions. */
const FALLBACK_HEIGHT_M = 2.3;
const FALLBACK_DOOR_WIDTH_M = 0.8;

export interface ListingSpaceResult {
  space: StorageSpace;
  /** True when width/depth came from a floor area or volume, not a measurement. */
  derivedFootprint: boolean;
  derivedHeight: boolean;
  derivedDoorWidth: boolean;
}

/**
 * Builds the planner's `StorageSpace` from a published listing row.
 *
 * Order of preference for the footprint: published width × length, then floor
 * area (assumed square), then usable volume ÷ height. Returns `null` only when
 * the listing carries no usable size information at all.
 */
export function listingStorageSpace(row: ListingSpaceSource): ListingSpaceResult | null {
  const kind = SPACE_KINDS[row.space_type ?? ""] ?? "storage_room";

  const publishedHeight = num(row.height_m);
  const height = publishedHeight ?? FALLBACK_HEIGHT_M;

  const width = num(row.width_m);
  const depth = num(row.length_m);
  const floorArea = num(row.floor_area_m2);
  const volume = num(row.estimated_available_volume_m3) ?? num(row.total_volume_m3);

  let w = width;
  let d = depth;
  let derivedFootprint = false;

  if (!(w && d)) {
    const area = floorArea ?? (volume === null ? null : volume / USABLE_VOLUME_FACTOR / height);
    if (area === null) return null;
    const side = Math.sqrt(area);
    w = w ?? side;
    d = d ?? area / w;
    derivedFootprint = true;
  }

  const doorWidthCm = num(row.door_width_cm);
  const doorWidth = doorWidthCm === null ? Math.min(w, FALLBACK_DOOR_WIDTH_M) : doorWidthCm / 100;

  const space: StorageSpace = {
    id: row.id ?? "listing",
    name: row.title ?? "This space",
    kind,
    width: round(w),
    depth: round(d),
    height: round(height),
    door: "front",
    doorWidth: round(Math.min(doorWidth, w)),
    blurb: "Planned against the measurements this host published.",
  };

  return {
    space,
    derivedFootprint,
    derivedHeight: publishedHeight === null,
    derivedDoorWidth: doorWidthCm === null,
  };
}

const round = (value: number) => Math.round(value * 100) / 100;

export interface ListingConstraint {
  id: string;
  label: string;
  value: string;
}

/**
 * The host's own access restrictions and rules, shown alongside the plan so a
 * renter sees exactly what the planner was told.
 */
export function listingConstraints(
  row: ListingSpaceSource,
  result: ListingSpaceResult | null,
): ListingConstraint[] {
  const out: ListingConstraint[] = [];
  if (result) {
    out.push({
      id: "dimensions",
      label: "Internal size",
      value: `${result.space.width.toFixed(1)}m × ${result.space.depth.toFixed(1)}m${
        result.derivedFootprint ? " (estimated)" : ""
      }`,
    });
    out.push({
      id: "ceiling",
      label: "Ceiling height",
      value: `${result.space.height.toFixed(2)}m${result.derivedHeight ? " (typical)" : ""}`,
    });
    out.push({
      id: "door",
      label: "Door width",
      value: `${result.space.doorWidth.toFixed(2)}m${result.derivedDoorWidth ? " (typical)" : ""}`,
    });
  }
  if (row.stairs_required) {
    out.push({ id: "stairs", label: "Access", value: "Stairs on the route in" });
  } else if (row.ground_floor_access) {
    out.push({ id: "ground", label: "Access", value: "Ground floor" });
  }
  if (row.storage_mode === "partial") {
    out.push({ id: "mode", label: "Shared space", value: "Part of a larger space" });
  }
  for (const rule of row.host_restrictions ?? []) {
    out.push({ id: `rule-${rule}`, label: "Host rule", value: humanise(rule) });
  }
  return out;
}

function humanise(value: string): string {
  const text = value.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
