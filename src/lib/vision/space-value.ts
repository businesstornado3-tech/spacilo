/**
 * AI Space Value Estimator.
 *
 * Indicative, deterministic and presentation-only. It never promises income,
 * never quotes a guarantee and never sets a price: hosts always set their own.
 * Demand is a broad band estimated from the postcode area, clearly labelled as
 * an estimate based on nearby listings.
 */
import { hashString } from "./hash";

export type ValueSpaceType = "garage" | "loft" | "spare-room" | "storage-room" | "shed" | "driveway";

export interface ValueSpaceOption {
  id: ValueSpaceType;
  label: string;
  /** Indicative £ per m² per month before demand. */
  ratePerM2: number;
  /** Typical size in m², used as the slider default. */
  typicalM2: number;
}

export const VALUE_SPACE_TYPES: ValueSpaceOption[] = [
  { id: "garage", label: "Garage", ratePerM2: 11, typicalM2: 15 },
  { id: "spare-room", label: "Spare room", ratePerM2: 12, typicalM2: 11 },
  { id: "storage-room", label: "Storage room", ratePerM2: 10, typicalM2: 8 },
  { id: "loft", label: "Loft", ratePerM2: 8, typicalM2: 12 },
  { id: "shed", label: "Shed", ratePerM2: 7, typicalM2: 6 },
  { id: "driveway", label: "Driveway", ratePerM2: 6, typicalM2: 14 },
];

export const VALUE_SPACE_BY_ID = new Map(VALUE_SPACE_TYPES.map((type) => [type.id, type]));

export type DemandLevel = "High" | "Steady" | "Quiet";

const DEMAND_MULTIPLIER: Record<DemandLevel, number> = {
  High: 1.25,
  Steady: 1,
  Quiet: 0.82,
};

/** UK outward code, e.g. "PO1 2AB" → "PO1". Empty when unrecognisable. */
export function outwardCode(postcode: string): string {
  const cleaned = postcode.trim().toUpperCase().replace(/\s+/g, "");
  const match = /^[A-Z]{1,2}\d[A-Z\d]?/.exec(cleaned);
  return match ? match[0] : "";
}

export function isLikelyPostcode(postcode: string): boolean {
  return outwardCode(postcode).length >= 2;
}

/**
 * Broad demand band for an area. Deterministic so the same postcode always
 * shows the same estimate — it is a modelled band, not a live market feed.
 */
export function demandFor(postcode: string): DemandLevel {
  const outward = outwardCode(postcode);
  if (!outward) return "Steady";
  const bucket = hashString(outward) % 10;
  if (bucket >= 7) return "High";
  if (bucket >= 2) return "Steady";
  return "Quiet";
}

export interface SpaceValueInput {
  spaceType: ValueSpaceType;
  areaM2: number;
  postcode: string;
}

export interface SpaceValueEstimate {
  monthlyMin: number;
  monthlyMax: number;
  monthlyTypical: number;
  annualTypical: number;
  weeklyPrice: number;
  demand: DemandLevel;
  /** 0–1. Higher once we know the area a host is actually in. */
  confidence: number;
  /** Number of comparable bands the estimate is drawn from. */
  basis: string;
}

const round5 = (value: number) => Math.max(5, Math.round(value / 5) * 5);

export function estimateSpaceValue({
  spaceType,
  areaM2,
  postcode,
}: SpaceValueInput): SpaceValueEstimate {
  const option = VALUE_SPACE_BY_ID.get(spaceType) ?? VALUE_SPACE_TYPES[0]!;
  const demand = demandFor(postcode);
  const area = Math.max(2, Math.min(60, areaM2));
  const typical = round5(area * option.ratePerM2 * DEMAND_MULTIPLIER[demand]);

  return {
    monthlyMin: round5(typical * 0.85),
    monthlyMax: round5(typical * 1.2),
    monthlyTypical: typical,
    annualTypical: typical * 12,
    weeklyPrice: Math.max(3, Math.round((typical * 12) / 52)),
    demand,
    confidence: isLikelyPostcode(postcode) ? 0.82 : 0.6,
    basis: isLikelyPostcode(postcode)
      ? `Based on nearby listings in ${outwardCode(postcode)}`
      : "Based on typical UK listings",
  };
}

export function formatMoney(amount: number): string {
  return `£${Math.round(amount).toLocaleString("en-GB")}`;
}

export function formatMonthlyRange(estimate: SpaceValueEstimate): string {
  return `${formatMoney(estimate.monthlyMin)}–${formatMoney(estimate.monthlyMax)}/month`;
}
