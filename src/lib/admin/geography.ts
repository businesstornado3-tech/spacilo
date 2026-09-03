/**
 * Founder console — demand geography (internal only).
 *
 * IMPORTANT HONESTY NOTE, repeated in the UI:
 * EarnRoom does not collect visitor IP geolocation, so this is NOT a map of
 * where visitors are. It is a map of *declared location intent*: places people
 * typed into search, discovery and location pages, plus real marketplace
 * supply and demand for those places. Every figure below is derived from
 * production rows; nothing is modelled, sampled or estimated.
 *
 * Pure module: no database access, no clock, fully testable.
 */
import { placeBySlug } from "@/lib/discovery/locations";
import { pointForSlug, projectPoint } from "./uk-geo";

export type GeographyRow = {
  /** Canonical UK place slug the person named. */
  location_slug: string;
  /** Distinct visitor references that named this place in the period. */
  demand_visitors: number;
  /** Location-intent events (searches, location pages, discovery). */
  demand_events: number;
  /** Storage requests whose space is in this place. */
  storage_requests: number;
  /** Bookings created for spaces in this place. */
  bookings: number;
  /** Published spaces in this place right now. */
  published_spaces: number;
  /** Same demand figure for the immediately preceding equal-length period. */
  previous_demand_events: number;
};

export type SupplyState = "NO_SUPPLY" | "THIN_SUPPLY" | "BALANCED" | "SURPLUS_SUPPLY";

export type GeographyTrend = "RISING" | "STEADY" | "FALLING" | "NEW" | "UNKNOWN";

export type GeographyPlace = {
  slug: string;
  name: string;
  kind: string;
  demandVisitors: number;
  demandEvents: number;
  storageRequests: number;
  bookings: number;
  publishedSpaces: number;
  supplyState: SupplyState;
  /** 0..100. High = real demand, little supply. Never a revenue forecast. */
  opportunityScore: number;
  trend: GeographyTrend;
  /** Percentage change in demand events vs the previous period, or null. */
  trendPercent: number | null;
  /** Plot position, or null when the place has no catalogue coordinate. */
  plot: { x: number; y: number } | null;
  /** Approximate town/city centre coordinate, or null when unknown. */
  point: { lat: number; lng: number } | null;
  /** Campaign priority derived from demand, scarcity and momentum. */
  priority: "HIGH" | "MEDIUM" | "LOW";
};

export function classifySupply(demandEvents: number, publishedSpaces: number): SupplyState {
  if (publishedSpaces === 0) return "NO_SUPPLY";
  if (demandEvents === 0) return publishedSpaces > 0 ? "SURPLUS_SUPPLY" : "NO_SUPPLY";
  const ratio = demandEvents / publishedSpaces;
  if (ratio >= 8) return "THIN_SUPPLY";
  if (ratio <= 1) return "SURPLUS_SUPPLY";
  return "BALANCED";
}

/**
 * Opportunity is demand weighted by scarcity, capped at 100. It is explicitly
 * NOT money: no revenue is projected from an intent signal.
 */
export function geographicOpportunityScore(row: GeographyRow): number {
  const demand = Math.log10(1 + row.demand_events) * 30 + Math.log10(1 + row.demand_visitors) * 20;
  const scarcity = row.published_spaces === 0 ? 30 : Math.max(0, 30 - row.published_spaces * 3);
  const conversion = row.storage_requests > 0 || row.bookings > 0 ? 15 : 0;
  return Math.max(0, Math.min(100, Math.round(demand + scarcity + conversion)));
}

export function demandTrend(row: GeographyRow): { trend: GeographyTrend; percent: number | null } {
  if (row.previous_demand_events === 0) {
    return row.demand_events > 0 ? { trend: "NEW", percent: null } : { trend: "UNKNOWN", percent: null };
  }
  const percent = ((row.demand_events - row.previous_demand_events) / row.previous_demand_events) * 100;
  if (percent >= 20) return { trend: "RISING", percent };
  if (percent <= -20) return { trend: "FALLING", percent };
  return { trend: "STEADY", percent };
}

function priorityFor(score: number, supply: SupplyState, trend: GeographyTrend): GeographyPlace["priority"] {
  if (score >= 65 && (supply === "NO_SUPPLY" || supply === "THIN_SUPPLY")) return "HIGH";
  if (score >= 40 || trend === "RISING" || trend === "NEW") return "MEDIUM";
  return "LOW";
}

export function buildGeography(rows: readonly GeographyRow[]): GeographyPlace[] {
  return rows
    .map((row) => {
      const place = placeBySlug(row.location_slug);
      const score = geographicOpportunityScore(row);
      const supplyState = classifySupply(row.demand_events, row.published_spaces);
      const { trend, percent } = demandTrend(row);
      const point = pointForSlug(row.location_slug);
      return {
        slug: row.location_slug,
        name: place?.name ?? row.location_slug.replaceAll("-", " "),
        kind: place?.kind ?? "unknown",
        demandVisitors: row.demand_visitors,
        demandEvents: row.demand_events,
        storageRequests: row.storage_requests,
        bookings: row.bookings,
        publishedSpaces: row.published_spaces,
        supplyState,
        opportunityScore: score,
        trend,
        trendPercent: percent,
        plot: point ? projectPoint(point) : null,
        priority: priorityFor(score, supplyState, trend),
      } satisfies GeographyPlace;
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.demandEvents - a.demandEvents);
}

export const SUPPLY_STATE_LABEL: Record<SupplyState, string> = {
  NO_SUPPLY: "No supply",
  THIN_SUPPLY: "Demand outstrips supply",
  BALANCED: "Roughly balanced",
  SURPLUS_SUPPLY: "Supply ahead of demand",
};

export const GEOGRAPHY_LIMITATIONS = [
  "This is declared location intent, not visitor location. EarnRoom stores no IP geolocation.",
  "A place appears only when someone named it in a search, discovery answer or location page.",
  "Bubble size is demand signal volume for the selected period — never a count of people.",
  "No supply in a place is a real opportunity, not an error, and never a claim of availability.",
];
