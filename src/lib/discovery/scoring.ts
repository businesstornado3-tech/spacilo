/**
 * Opportunity scoring.
 *
 * Deterministic, traceable, and deliberately free of external search-volume
 * data — none is connected, so none is invented. The score answers one
 * question: "can EarnRoom genuinely help this person, and is a dedicated
 * experience the smallest useful way to do it?"
 */
import type { CapabilityPlan } from "./matching";
import type { IntentReading } from "./intent";

export type SupplyFacts = {
  /** Count of currently published spaces relevant to the reading. Real data only. */
  publishedSpaces: number;
  /** Distinct space types among them — a crude diversity signal. */
  distinctSpaceTypes: number;
};

export const NO_SUPPLY: SupplyFacts = { publishedSpaces: 0, distinctSpaceTypes: 0 };

export type ScoreFactor = { name: string; value: number; weight: number; note: string };

export type OpportunityScore = {
  /** 0..100. */
  total: number;
  factors: readonly ScoreFactor[];
  /** True when a dedicated destination is defensible on usefulness alone. */
  usefulWithoutSupply: boolean;
};

export type ScoreInput = {
  reading: IntentReading;
  plan: CapabilityPlan;
  supply?: SupplyFacts;
  /** True when an existing canonical experience already answers this need. */
  duplicateOfExisting?: boolean;
  /** 0..1 — how complete the factual content behind the destination is. */
  contentCompleteness?: number;
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function scoreOpportunity(input: ScoreInput): OpportunityScore {
  const { reading, plan } = input;
  const supply = input.supply ?? NO_SUPPLY;

  const capabilityRelevance = plan.primary?.relevance ?? 0;
  // Marketplace supply is relevant to renters looking for a place, not hosts
  // acquiring space listings. Host-location intent must not be penalised by a
  // zero renter inventory count.
  const locationRelevant = reading.role === "renter" && reading.location.kind !== "none";

  const factors: ScoreFactor[] = [
    {
      name: "intent_confidence",
      value: reading.confidence,
      weight: 20,
      note: "How much usable evidence the query carried.",
    },
    {
      name: "capability_relevance",
      value: capabilityRelevance,
      weight: 30,
      note: "How well the best EarnRoom capability answers the need.",
    },
    {
      name: "user_utility",
      value: clamp01(plan.journey.length / 3),
      weight: 15,
      note: "Whether there is a real path through the product, not a dead end.",
    },
    {
      name: "content_completeness",
      value: clamp01(input.contentCompleteness ?? 0),
      weight: 10,
      note: "Whether we hold enough factual material to be worth reading.",
    },
    {
      name: "marketplace_supply",
      value: locationRelevant ? clamp01(supply.publishedSpaces / 8) : 0,
      weight: 15,
      note: "Real published spaces only. Zero where none exist.",
    },
    {
      name: "supply_diversity",
      value: locationRelevant ? clamp01(supply.distinctSpaceTypes / 4) : 0,
      weight: 5,
      note: "Diversity of real published space types.",
    },
    {
      name: "uniqueness",
      value: input.duplicateOfExisting ? 0 : 1,
      weight: 5,
      note: "Zero when an existing canonical experience already answers this.",
    },
  ];

  const total = Math.round(
    factors.reduce((sum, f) => sum + clamp01(f.value) * f.weight, 0),
  );

  // A location-free capability answer can be entirely useful with no supply at
  // all — that is the point of the capability-first architecture.
  const usefulWithoutSupply =
    !input.duplicateOfExisting && capabilityRelevance >= 0.4 && reading.confidence >= 0.3;

  return { total, factors, usefulWithoutSupply };
}
