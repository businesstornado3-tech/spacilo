/**
 * SpaceFit V1 configuration. Every weight, band and mapping lives here so the
 * model can evolve without touching rules, scoring or UI.
 */
import type { ItemCategory } from "@/lib/inventory-model";
import type { ComponentKey, SpaceFitLabel } from "./types";

export const SPACEFIT_WEIGHTS: Record<ComponentKey, number> = {
  capacity: 35,
  itemCompatibility: 25,
  conditions: 15,
  access: 10,
  geometry: 10,
  completeness: 5,
};

export const SPACEFIT_TOTAL = Object.values(SPACEFIT_WEIGHTS).reduce((a, b) => a + b, 0);

/* ------------------------------------------------------------- capacity */

export type CapacityBand = "hard_fail" | "very_tight" | "tight" | "good" | "very_good" | "excellent";

export const CAPACITY_BANDS: { min: number; band: CapacityBand; points: number; label: string }[] = [
  { min: 2.5, band: "excellent", points: 35, label: "Generous estimated capacity" },
  { min: 1.5, band: "very_good", points: 35, label: "Comfortable estimated capacity" },
  { min: 1.25, band: "good", points: 29, label: "Good estimated capacity" },
  { min: 1.1, band: "tight", points: 23, label: "Estimated capacity is a little tight" },
  { min: 1.0, band: "very_tight", points: 15, label: "Estimated capacity is very tight" },
];

/* -------------------------------------------------------- item categories */

/**
 * Renter inventory categories mapped onto the host's accepted-item vocabulary.
 * A host accepting any listed token covers that renter category.
 */
export const CATEGORY_ACCEPTANCE_MAP: Record<ItemCategory, string[]> = {
  boxes: ["boxes"],
  bags: ["suitcases", "household"],
  furniture: ["furniture"],
  appliances: ["household"],
  electronics: ["household"],
  bicycles: ["bicycles"],
  sports: ["sports"],
  student: ["student"],
  business: ["business_stock"],
  documents: ["documents"],
  other: ["other", "household"],
};

/** Weight applied when the host simply hasn't said either way. */
export const UNSPECIFIED_CATEGORY_WEIGHT = 0.6;

/* ---------------------------------------------------------- restrictions */

/** Host restrictions that map deterministically onto renter inventory. */
export const RESTRICTION_RULES: {
  restriction: string;
  message: string;
  applies: (categories: ItemCategory[], longestEdgeByCategoryCm: Partial<Record<ItemCategory, number>>) => boolean;
}[] = [
  {
    restriction: "no_business_stock",
    message: "This host doesn't accept business stock.",
    applies: (categories) => categories.includes("business"),
  },
  {
    restriction: "no_large_furniture",
    message: "This host doesn't accept large furniture.",
    applies: (_categories, longest) => (longest.furniture ?? 0) >= LARGE_FURNITURE_EDGE_CM,
  },
];

export const LARGE_FURNITURE_EDGE_CM = 150;

/* ------------------------------------------------------------ conditions */

export const CONDITION_POINTS = {
  dry: 5,
  indoor: 4,
  lockable: 4,
  security: 2,
} as const;

export const SECURITY_FEATURES = ["cctv", "alarm", "gated", "lighting", "smoke_alarm"];

/* --------------------------------------------------------------- access */

export const ACCESS_POINTS: Record<string, number> = {
  anytime: 10,
  independent: 10,
  daytime: 9,
  by_arrangement: 8,
  host_present: 8,
};

export const ACCESS_POINTS_UNKNOWN = 7;

/* -------------------------------------------------------------- geometry */

export const GEOMETRY_POINTS = {
  fits: 10,
  unknown: 6,
} as const;

/* ------------------------------------------------------------- labelling */

export function spaceFitLabel(score: number): SpaceFitLabel {
  if (score >= 90) return "Excellent fit";
  if (score >= 80) return "Great fit";
  if (score >= 70) return "Good fit";
  if (score >= 60) return "Possible fit — check details";
  return "Low-confidence fit — check carefully";
}

export const SPACEFIT_MATCH_DISCLAIMER =
  "SpaceFit is decision support based on estimated figures you and the host have provided. It is not a guarantee that everything will physically fit.";
