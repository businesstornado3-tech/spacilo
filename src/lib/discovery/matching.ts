/**
 * Intent → capability matching.
 *
 * Every match carries its reasons, so any routing decision can be explained
 * without re-running the engine. Matching is open: a capability added to the
 * registry participates immediately, with no change here.
 */
import { CAPABILITIES, capability, type Capability, type CapabilityId } from "./capabilities";
import type { IntentReading } from "./intent";

export type CapabilityMatch = {
  id: CapabilityId;
  /** 0..1 relevance for this reading. */
  relevance: number;
  reasons: readonly string[];
};

export type CapabilityPlan = {
  primary: CapabilityMatch | null;
  secondary: readonly CapabilityMatch[];
  /** The order a person would naturally use these capabilities. */
  journey: readonly CapabilityId[];
  /** True when no capability is a credible answer to the query. */
  unmatched: boolean;
};

/** Below this, a capability is noise rather than a genuine answer. */
export const RELEVANCE_FLOOR = 0.2;

function scoreCapability(cap: Capability, reading: IntentReading): CapabilityMatch {
  const reasons: string[] = [];
  let score = 0;

  for (const objective of reading.objectives) {
    if (cap.objectives.includes(objective.value)) {
      score += 0.34 * objective.weight;
      reasons.push(`objective:${objective.value}`);
    }
  }

  for (const phrase of cap.signals) {
    if (reading.query.includes(phrase)) {
      score += 0.22;
      reasons.push(`phrase:${phrase}`);
    }
  }

  if (cap.stages.includes(reading.stage)) {
    score += 0.12;
    reasons.push(`stage:${reading.stage}`);
  }

  if (cap.audience === reading.role && reading.role !== "undetermined") {
    score += 0.12;
    reasons.push(`role:${reading.role}`);
  }

  // A named place, postcode district or "near me" only strengthens the
  // capability that can actually use a location.
  if (reading.location.kind !== "none" && cap.id === "location_search") {
    score += 0.3;
    reasons.push(`location:${reading.location.kind}`);
  }

  // Space types and belongings tilt toward the tool that reads them.
  if (reading.spaces.length > 0 && (cap.id === "space_scanner" || cap.id === "spaceplanner")) {
    score += 0.08;
    reasons.push("space_mentioned");
  }
  if (reading.belongings.length > 0 && (cap.id === "item_scanner" || cap.id === "spaceplanner")) {
    score += 0.08;
    reasons.push("belongings_mentioned");
  }

  return {
    id: cap.id,
    relevance: Math.min(1, Math.round(score * 100) / 100),
    reasons: [...new Set(reasons)],
  };
}

/** Orders the whole registry against a reading; nothing is filtered out yet. */
export function rankCapabilities(reading: IntentReading): readonly CapabilityMatch[] {
  return CAPABILITIES.map((cap) => scoreCapability(cap, reading)).sort(
    (a, b) => b.relevance - a.relevance || a.id.localeCompare(b.id),
  );
}

/**
 * Builds the capability plan: one primary, the credible secondaries, and a
 * journey ordered the way a person would actually move through the product
 * (each capability's declared `nextCapabilities` fills the sequence).
 */
export function planCapabilities(reading: IntentReading, maxSecondary = 2): CapabilityPlan {
  const ranked = rankCapabilities(reading).filter((m) => m.relevance >= RELEVANCE_FLOOR);
  const primary = ranked[0] ?? null;
  if (!primary) return { primary: null, secondary: [], journey: [], unmatched: true };

  const secondary = ranked.slice(1, 1 + maxSecondary);

  const journey: CapabilityId[] = [primary.id];
  for (const next of capability(primary.id).nextCapabilities) {
    if (journey.includes(next)) continue;
    // Only continue the journey into a capability the reading supports, or
    // that the primary itself declares as the natural follow-on.
    journey.push(next);
    if (journey.length >= 3) break;
  }
  for (const match of secondary) {
    if (!journey.includes(match.id) && journey.length < 3) journey.push(match.id);
  }

  return { primary, secondary, journey, unmatched: false };
}
