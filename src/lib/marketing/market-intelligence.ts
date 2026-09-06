/**
 * Market intelligence adapter.
 *
 * This module creates NO new signal. It reads what the existing EarnRoom
 * intelligence already produced — demand geography (`src/lib/admin/geography`)
 * and growth opportunities (`src/lib/growth`) — and expresses it as marketing
 * opportunities carrying their original evidence.
 *
 * Fabricating demand is impossible here by construction: every opportunity
 * below requires a real row with real counts, and the evidence class says
 * exactly what those counts were.
 */
import type { GeographyPlace } from "@/lib/admin/geography";
import type { MarketingAudience, MarketingObjective, MarketingOpportunity } from "./types";

/** Minimal shape read from a persisted growth opportunity row. */
export type GrowthOpportunitySummary = {
  key: string;
  /** Problem in the person's own terms, as the growth engine recorded it. */
  problem: string | null;
  audience: string | null;
  locationSlug: string | null;
  locationName: string | null;
  frequency: number;
  score: number;
};

function audienceFromRole(role: string | null): MarketingAudience {
  switch ((role ?? "").toUpperCase()) {
    case "HOST":
      return "hosts";
    case "STUDENT":
      return "students";
    case "BUSINESS":
      return "businesses";
    case "MOVING_TRANSITION":
    case "PROPERTY_RELATED":
      return "movers";
    default:
      return "renters";
  }
}

/**
 * Demand geography → marketing opportunities.
 *
 * A place with demand and no supply is a SUPPLY_GAP (host acquisition). A place
 * with demand and supply is MARKET_DEMAND (renter acquisition). A place with
 * neither is not invented here — the demand-creation path handles those.
 */
export function geographyOpportunities(places: readonly GeographyPlace[]): MarketingOpportunity[] {
  const out: MarketingOpportunity[] = [];
  const maxDemand = Math.max(1, ...places.map((place) => place.demandEvents));

  for (const place of places) {
    if (place.demandEvents <= 0) continue;
    const scarce = place.supplyState === "NO_SUPPLY" || place.supplyState === "THIN_SUPPLY";
    const strength = Math.min(1, (place.demandEvents / maxDemand) * (scarce ? 1 : 0.8));
    const objective: MarketingObjective = scarce ? "HOST_ACQUISITION" : "RENTER_ACQUISITION";

    out.push({
      key: `market:${scarce ? "supply-gap" : "demand"}:${place.slug}`,
      trigger: scarce ? "SUPPLY_GAP" : "MARKET_DEMAND",
      evidenceClass: "REAL_MARKET_DEMAND",
      title: scarce
        ? `${place.name} — demand with little local supply`
        : `${place.name} — active storage demand`,
      problem: scarce
        ? `People are looking for storage in ${place.name}, but there is little or no space listed for them.`
        : `People are actively looking for storage in ${place.name}.`,
      topic: scarce ? "Local host supply" : "Local storage demand",
      audience: scarce ? "hosts" : "renters",
      secondaryAudience: scarce ? "renters" : "hosts",
      objective,
      location: { slug: place.slug, name: place.name },
      rationale: scarce
        ? `${place.demandEvents} location-intent signals named ${place.name} with ${place.publishedSpaces} published space(s). Hosts are the constraint.`
        : `${place.demandEvents} location-intent signals named ${place.name} against ${place.publishedSpaces} published space(s).`,
      evidence: [
        {
          statement: `${place.demandEvents} location-intent events named ${place.name} in the period.`,
          source: "demand_geography",
          value: place.demandEvents,
        },
        {
          statement: `${place.publishedSpaces} published space(s) in ${place.name} (${place.supplyState.replace(/_/g, " ").toLowerCase()}).`,
          source: "demand_geography",
          value: place.publishedSpaces,
        },
        {
          statement: `Existing geographic opportunity score: ${place.opportunityScore}/100, trend ${place.trend.toLowerCase()}.`,
          source: "demand_geography",
          value: place.opportunityScore,
        },
      ],
      strength,
      // Availability may only be stated where real published supply exists.
      mayClaimAvailability: place.publishedSpaces > 0,
    });
  }

  return out.sort((a, b) => b.strength - a.strength);
}

/** Persisted growth opportunities → marketing opportunities. */
export function growthOpportunityMarketing(
  rows: readonly GrowthOpportunitySummary[],
): MarketingOpportunity[] {
  return rows
    .filter((row) => Boolean(row.problem) && row.frequency > 0)
    .map((row) => {
      const audience = audienceFromRole(row.audience);
      const location =
        row.locationSlug && row.locationName
          ? { slug: row.locationSlug, name: row.locationName }
          : null;
      return {
        key: `market:pain:${row.key}`,
        trigger: "USER_PAIN_POINT" as const,
        evidenceClass: "REAL_MARKET_DEMAND" as const,
        title: location ? `${location.name} — ${row.problem}` : String(row.problem),
        problem: String(row.problem),
        topic: "Observed storage problem",
        audience,
        secondaryAudience: audience === "hosts" ? "renters" : "hosts",
        objective:
          audience === "hosts" ? ("HOST_ACQUISITION" as const) : ("RENTER_ACQUISITION" as const),
        location,
        rationale: `The growth engine recorded this problem ${row.frequency} time(s) with an opportunity score of ${row.score}/100.`,
        evidence: [
          {
            statement: `Growth opportunity ${row.key} observed ${row.frequency} time(s).`,
            source: "growth_opportunity" as const,
            value: row.frequency,
          },
          {
            statement: `Existing opportunity score ${row.score}/100.`,
            source: "growth_opportunity" as const,
            value: row.score,
          },
        ],
        strength: Math.min(1, (row.score / 100) * 0.9 + Math.min(row.frequency, 5) * 0.02),
      };
    })
    .sort((a, b) => b.strength - a.strength);
}
