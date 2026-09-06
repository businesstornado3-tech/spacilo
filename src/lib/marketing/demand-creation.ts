/**
 * Demand-creation intelligence.
 *
 * When EarnRoom has no observed demand, marketing does not stop — but it also
 * does not pretend. Everything produced here is labelled
 * `DEMAND_CREATION_OPPORTUNITY`: a real, widely experienced UK storage problem
 * EarnRoom can explain, with no claim that anyone in that place searched for
 * it.
 */
import type { MarketingAudience, MarketingObjective, MarketingOpportunity } from "./types";

export type DemandCreationSeed = {
  id: string;
  /** The situation, described the way a person would live it. */
  situation: string;
  problem: string;
  topic: string;
  audience: MarketingAudience;
  secondaryAudience: MarketingAudience | null;
  objective: MarketingObjective;
  /** Why this problem matters if unresolved. */
  stake: string;
  weight: number;
};

export const DEMAND_CREATION_SEEDS: readonly DemandCreationSeed[] = [
  {
    id: "chain-delay",
    situation: "A family's completion date has moved and the new home is not ready",
    problem: "Your new home isn't ready. Your old home is already packed.",
    topic: "Storage between homes",
    audience: "movers",
    secondaryAudience: "hosts",
    objective: "BOTH_SIDES",
    stake:
      "Furniture, boxes and children's belongings end up in a van, a garage favour, or an expensive last-minute unit.",
    weight: 0.95,
  },
  {
    id: "empty-garage",
    situation: "A homeowner's garage holds a bike, some paint tins and not much else",
    problem: "Is your garage mostly empty?",
    topic: "Unused space that could earn",
    audience: "hosts",
    secondaryAudience: "renters",
    objective: "HOST_ACQUISITION",
    stake: "You already pay for that space every month, and it earns nothing.",
    weight: 0.9,
  },
  {
    id: "shrinking-flat",
    situation: "A flat that fitted two people now holds a bike, a cot and seasonal boxes",
    problem: "Your flat is getting smaller. Your stuff isn't.",
    topic: "Living space lost to storage",
    audience: "renters",
    secondaryAudience: null,
    objective: "RENTER_ACQUISITION",
    stake: "The room you pay the most for ends up storing things you use twice a year.",
    weight: 0.82,
  },
  {
    id: "two-sided",
    situation: "One neighbour needs space; another has a room they never open",
    problem: "Someone near you needs space. Someone near you has it.",
    topic: "Two-sided marketplace",
    audience: "both_sides",
    secondaryAudience: null,
    objective: "MARKETPLACE_LIQUIDITY",
    stake: "Both people lose out simply because they never met.",
    weight: 0.8,
  },
  {
    id: "student-term-end",
    situation: "A student's hall closes for the summer and home is four hours away",
    problem: "Term ends. Where does everything go?",
    topic: "Student storage",
    audience: "students",
    secondaryAudience: "hosts",
    objective: "RENTER_ACQUISITION",
    stake:
      "A car boot cannot hold a year of university, and driving it home twice costs more than storing it.",
    weight: 0.74,
  },
  {
    id: "business-stock",
    situation: "A small business has stock arriving before the unit can take it",
    problem: "Stock has outgrown the space, but a lease is too much.",
    topic: "Flexible business storage",
    audience: "businesses",
    secondaryAudience: "hosts",
    objective: "RENTER_ACQUISITION",
    stake: "Growth stalls when there is nowhere to put the next delivery.",
    weight: 0.66,
  },
  {
    id: "renovation",
    situation: "A kitchen or loft conversion means a room has to be emptied",
    problem: "The builders start Monday. The room has to be empty.",
    topic: "Renovation storage",
    audience: "renovators",
    secondaryAudience: "hosts",
    objective: "DEMAND_CREATION",
    stake: "Furniture ends up stacked in the living room for months.",
    weight: 0.63,
  },
];

export type DemandCreationInput = {
  location?: { slug: string; name: string } | null;
  recentSeedIds?: readonly string[];
};

export function demandCreationOpportunities(
  input: DemandCreationInput = {},
): MarketingOpportunity[] {
  const recent = new Set(input.recentSeedIds ?? []);
  const place = input.location ?? null;

  return DEMAND_CREATION_SEEDS.map((seed) => ({
    key: `create:${seed.id}${place ? `:${place.slug}` : ""}`,
    trigger: "DEMAND_CREATION" as const,
    evidenceClass: "DEMAND_CREATION_OPPORTUNITY" as const,
    title: place ? `${place.name} — ${seed.topic}` : seed.topic,
    problem: seed.problem,
    topic: seed.topic,
    audience: seed.audience,
    secondaryAudience: seed.secondaryAudience,
    objective: seed.objective,
    location: place,
    rationale: `${seed.situation}. No EarnRoom demand signal is claimed for this — it is an awareness and education opportunity.`,
    evidence: [
      {
        statement: `Recognised UK storage situation: ${seed.situation.toLowerCase()}.`,
        source: "seo_catalogue" as const,
        value: null,
      },
      { statement: `If unresolved: ${seed.stake}`, source: "seo_catalogue" as const, value: null },
    ],
    strength: Math.min(1, seed.weight * (recent.has(seed.id) ? 0.45 : 1)),
  })).sort((a, b) => b.strength - a.strength);
}
