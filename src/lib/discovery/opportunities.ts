/**
 * Opportunity records.
 *
 * When a real need has no dedicated destination, the engine records the
 * opportunity rather than silently generating a page. Records are the input to
 * a human decision; they never publish anything by themselves.
 */
import type { CapabilityId } from "./capabilities";
import type { IntentReading } from "./intent";
import type { CapabilityPlan } from "./matching";
import type { IndexationDecision } from "./indexation";
import type { OpportunityScore } from "./scoring";

export type OpportunityRecord = {
  /** Stable key derived from the canonical need, so repeats collapse. */
  key: string;
  query: string;
  objectives: readonly string[];
  primaryCapability: CapabilityId | null;
  score: number;
  status: IndexationDecision["status"];
  /** Why this is not already a destination. */
  reasons: readonly string[];
  /** What a human would have to confirm before it could be published. */
  requires: readonly string[];
};

function normaliseKey(reading: IntentReading, plan: CapabilityPlan): string {
  const objective = reading.objectives[0]?.value ?? "unknown";
  const cap = plan.primary?.id ?? "none";
  return `${objective}:${cap}`;
}

export function buildOpportunity(args: {
  reading: IntentReading;
  plan: CapabilityPlan;
  score: OpportunityScore;
  decision: IndexationDecision;
}): OpportunityRecord {
  const { reading, plan, score, decision } = args;

  const requires: string[] = [];
  if (decision.status === "OPPORTUNITY_ONLY") requires.push("dedicated_experience");
  if (decision.status === "NOT_PUBLISHED") requires.push("reviewed_factual_content");
  if (score.total < 45) requires.push("stronger_user_value");
  if (score.factors.some((f) => f.name === "marketplace_supply" && f.value === 0) && reading.location.kind !== "none") {
    requires.push("real_published_supply");
  }

  return {
    key: normaliseKey(reading, plan),
    query: reading.query,
    objectives: reading.objectives.map((o) => o.value),
    primaryCapability: plan.primary?.id ?? null,
    score: score.total,
    status: decision.status,
    reasons: decision.reasons,
    requires,
  };
}

/** Collapses repeated readings of the same need into one ranked list. */
export function mergeOpportunities(records: readonly OpportunityRecord[]): OpportunityRecord[] {
  const byKey = new Map<string, OpportunityRecord>();
  for (const record of records) {
    const existing = byKey.get(record.key);
    if (!existing || record.score > existing.score) byKey.set(record.key, record);
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}
