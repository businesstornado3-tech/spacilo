/**
 * Indicative host earnings, for presentation only.
 *
 * These are illustrative ranges used on the public homepage so a homeowner can
 * picture the opportunity. They are never quoted as a promise, never stored,
 * and never used in pricing, payouts or any commercial calculation — real
 * pricing is always set by the host on their listing.
 */

export interface EarningsRange {
  /** Whole pounds per month. */
  min: number;
  max: number;
}

export type EarningSpaceKind = "garage" | "spare-room" | "driveway" | "loft";

export interface EarningExample {
  kind: EarningSpaceKind;
  label: string;
  range: EarningsRange;
  blurb: string;
}

/** Typical UK monthly ranges by space type. */
export const EARNING_EXAMPLES: EarningExample[] = [
  {
    kind: "garage",
    label: "Garage",
    range: { min: 80, max: 250 },
    blurb: "Dry, lockable and the most in demand.",
  },
  {
    kind: "spare-room",
    label: "Spare room",
    range: { min: 100, max: 350 },
    blurb: "Indoor, heated, ideal for household goods.",
  },
  {
    kind: "driveway",
    label: "Driveway",
    range: { min: 40, max: 150 },
    blurb: "Suits vehicles, trailers and caravans.",
  },
  {
    kind: "loft",
    label: "Loft",
    range: { min: 70, max: 200 },
    blurb: "Long-stay storage for boxed belongings.",
  },
];

export const EARNING_EXAMPLE_BY_KIND = new Map(EARNING_EXAMPLES.map((e) => [e.kind, e]));

/** Approximate size bands, with the multiplier applied to the base range. */
export const SIZE_BANDS = [
  { id: "small", label: "Small", hint: "up to 8m²", multiplier: 0.75 },
  { id: "medium", label: "Medium", hint: "8–16m²", multiplier: 1 },
  { id: "large", label: "Large", hint: "16m²+", multiplier: 1.3 },
] as const;

export type SizeBandId = (typeof SIZE_BANDS)[number]["id"];

/** Broad demand bands, chosen by the visitor — never inferred from their data. */
export const DEMAND_BANDS = [
  { id: "city", label: "City centre", multiplier: 1.25 },
  { id: "town", label: "Town or suburb", multiplier: 1 },
  { id: "rural", label: "Village or rural", multiplier: 0.8 },
] as const;

export type DemandBandId = (typeof DEMAND_BANDS)[number]["id"];

export interface EarningsEstimateInput {
  kind: EarningSpaceKind;
  size: SizeBandId;
  demand: DemandBandId;
}

const roundTo5 = (value: number) => Math.max(5, Math.round(value / 5) * 5);

/**
 * Deterministic, presentation-only estimate. Same inputs always give the same
 * range, so nothing on screen can drift from what the copy claims.
 */
export function estimateEarnings({ kind, size, demand }: EarningsEstimateInput): EarningsRange {
  const base = EARNING_EXAMPLE_BY_KIND.get(kind)!.range;
  const sizeMultiplier = SIZE_BANDS.find((b) => b.id === size)!.multiplier;
  const demandMultiplier = DEMAND_BANDS.find((b) => b.id === demand)!.multiplier;
  const factor = sizeMultiplier * demandMultiplier;

  return { min: roundTo5(base.min * factor), max: roundTo5(base.max * factor) };
}

export function formatEarningsRange(range: EarningsRange): string {
  return `£${range.min}–£${range.max}/month`;
}
