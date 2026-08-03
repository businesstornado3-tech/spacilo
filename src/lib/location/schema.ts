/**
 * Location domain types and UK input normalisation.
 *
 * Pure, dependency-light and shared by the browser, the server geocoder and
 * the tests. Nothing here talks to a provider — see provider.server.ts.
 */
import { z } from "zod";

import { formatUkPostcode, isValidUkPostcode } from "@/lib/format";

/** A plain WGS84 point. Host EXACT points never leave the server. */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/** The resolved centre of a renter search. */
export interface SearchCentre extends GeoPoint {
  /** Normalised, display-ready label, e.g. "PO4 8LB" or "Southsea". */
  label: string;
  /** Postcode district where known, e.g. "PO4". */
  district: string | null;
  /** Which lookup produced the point. */
  precision: "postcode" | "district" | "place";
}

export const RADIUS_OPTIONS_MILES = [1, 3, 5, 10, 20] as const;
export const DEFAULT_RADIUS_MILES = 5;
export const MIN_RADIUS_MILES = 0.1;
export const MAX_RADIUS_MILES = 100;

/** Radius is configurable — the option list is a UI convenience, not a limit. */
export function normaliseRadius(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return DEFAULT_RADIUS_MILES;
  return Math.min(Math.max(n, MIN_RADIUS_MILES), MAX_RADIUS_MILES);
}

/** "po4 8lb", "PO48LB", "Po4 8Lb" → "PO4 8LB". Non-postcodes pass through trimmed. */
export function normaliseLocationInput(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (isValidUkPostcode(trimmed)) return formatUkPostcode(trimmed);
  return trimmed;
}

export const isPostcode = (raw: string) => isValidUkPostcode(raw.trim());

/** "PO4 8LB" → "PO4". Returns null when the input isn't a usable postcode. */
export function postcodeDistrict(raw: string): string | null {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  if (compact.length < 5) return null;
  return compact.slice(0, compact.length - 3);
}

/** Outward code only, e.g. "PO4" typed on its own. */
export const isOutcode = (raw: string) => /^[A-Z]{1,2}\d[A-Z\d]?$/i.test(raw.trim());

/** Rough sanity box for the UK and its islands. */
export function isPlausibleUkPoint(point: GeoPoint): boolean {
  return point.lat >= 49 && point.lat <= 61.5 && point.lng >= -9 && point.lng <= 2.2;
}

export const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const searchCentreSchema = geoPointSchema.extend({
  label: z.string().min(1),
  district: z.string().nullable(),
  precision: z.enum(["postcode", "district", "place"]),
});

export const geocodeRequestSchema = z.object({
  /** Free text: a UK postcode, outcode, or place name. */
  query: z.string().min(2).max(120),
});

export type GeocodeRequest = z.infer<typeof geocodeRequestSchema>;
