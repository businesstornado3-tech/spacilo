/**
 * Campaign prioritisation.
 *
 * Produces an internal 0..100 priority and, importantly, the human reason the
 * campaign was selected — the founder console shows that reason verbatim.
 */
import type { CoverageRow } from "./coverage";
import { duplicationRisk, geographicBalance, type ContentHistoryEntry } from "./coverage";
import type { LearningInsight } from "./types";
import type { CampaignScore, MarketingOpportunity, MarketingSettings, ScoreFactor } from "./types";

const OBJECTIVE_MIX_KEY: Record<string, string> = {
  RENTER_ACQUISITION: "renter_acquisition",
  HOST_ACQUISITION: "host_acquisition",
  BOTH_SIDES: "marketplace_liquidity",
  BRAND_AWARENESS: "brand_awareness",
  SEO_GROWTH: "seo",
  DEMAND_CREATION: "demand_creation",
  MARKETPLACE_LIQUIDITY: "marketplace_liquidity",
};

const EVIDENCE_WEIGHT: Record<string, number> = {
  REAL_MARKET_DEMAND: 1,
  SEO_OPPORTUNITY: 0.85,
  MARKETING_OPPORTUNITY: 0.7,
  DEMAND_CREATION_OPPORTUNITY: 0.7,
  STRATEGIC_COVERAGE: 0.55,
};

export type ScoringInput = {
  opportunity: MarketingOpportunity;
  history: readonly ContentHistoryEntry[];
  coverage: readonly CoverageRow[];
  insights: readonly LearningInsight[];
  settings: MarketingSettings;
  now: number;
};

function mixWeight(settings: MarketingSettings, opportunity: MarketingOpportunity): number {
  const mix = settings.contentMix as Record<string, number>;
  const objectiveKey = OBJECTIVE_MIX_KEY[opportunity.objective] ?? "brand_awareness";
  const sourceKey =
    opportunity.evidenceClass === "REAL_MARKET_DEMAND"
      ? "market_intelligence"
      : opportunity.evidenceClass === "SEO_OPPORTUNITY"
        ? "seo"
        : "demand_creation";
  const values = Object.values(mix).filter((value) => value > 0);
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 1;
  const objectiveWeight = mix[objectiveKey] ?? average;
  const sourceWeight = mix[sourceKey] ?? average;
  if (average <= 0) return 1;
  return Math.min(1.6, (objectiveWeight + sourceWeight) / 2 / average);
}

function learningWeight(
  insights: readonly LearningInsight[],
  opportunity: MarketingOpportunity,
): { value: number; note: string } {
  const relevant = insights.filter(
    (insight) =>
      (insight.dimension === "topic" && insight.value === opportunity.topic) ||
      (insight.dimension === "audience" && insight.value === opportunity.audience) ||
      (insight.dimension === "location" && insight.value === (opportunity.location?.slug ?? "")),
  );
  if (relevant.length === 0)
    return { value: 1, note: "No performance history for this angle yet." };
  const index = relevant.reduce((sum, insight) => sum + insight.index, 0) / relevant.length;
  return {
    value: 0.7 + index * 0.6,
    note: `Past performance index ${index.toFixed(2)} across ${relevant.reduce((sum, item) => sum + item.samples, 0)} observation(s).`,
  };
}

export function scoreOpportunity(input: ScoringInput): CampaignScore {
  const { opportunity, settings } = input;
  const factors: ScoreFactor[] = [];

  const evidenceWeight = EVIDENCE_WEIGHT[opportunity.evidenceClass] ?? 0.6;
  factors.push({
    name: "Evidence strength",
    value: Number((opportunity.strength * 100).toFixed(1)),
    weight: evidenceWeight,
    note: `${opportunity.evidenceClass.replace(/_/g, " ").toLowerCase()}`,
  });

  const balance = geographicBalance(opportunity, input.coverage, settings.geographicCooldownDays);
  factors.push({
    name: "Geographic balance",
    value: Number((balance.multiplier * 100).toFixed(1)),
    weight: 0.2,
    note: balance.note,
  });

  const mix = mixWeight(settings, opportunity);
  factors.push({
    name: "Content mix",
    value: Number((mix * 100).toFixed(1)),
    weight: 0.15,
    note: `Objective ${opportunity.objective.replace(/_/g, " ").toLowerCase()}`,
  });

  const learning = learningWeight(input.insights, opportunity);
  factors.push({
    name: "Learning",
    value: Number((learning.value * 100).toFixed(1)),
    weight: 0.15,
    note: learning.note,
  });

  const duplication = duplicationRisk(opportunity, input.history, { now: input.now });
  const duplicationPenalty = Number((duplication.risk * 45).toFixed(1));
  factors.push({
    name: "Duplication risk",
    value: duplication.risk * 100,
    weight: -0.45,
    note: duplication.reasons[0] ?? "No close match in recent content.",
  });

  const base = opportunity.strength * 100 * evidenceWeight;
  const priority = Math.max(
    0,
    Math.min(
      100,
      Math.round(base * balance.multiplier * mix * learning.value - duplicationPenalty),
    ),
  );

  const reason = duplication.blocked
    ? `Blocked as a near-duplicate: ${duplication.reasons[0] ?? "matches recent content"}.`
    : `${opportunity.rationale} ${balance.note} ${learning.note}`.replace(/\s+/g, " ").trim();

  return { priority: duplication.blocked ? 0 : priority, factors, duplicationPenalty, reason };
}

export function rankOpportunities(
  opportunities: readonly MarketingOpportunity[],
  shared: Omit<ScoringInput, "opportunity">,
): { opportunity: MarketingOpportunity; score: CampaignScore }[] {
  return opportunities
    .map((opportunity) => ({ opportunity, score: scoreOpportunity({ ...shared, opportunity }) }))
    .sort((a, b) => b.score.priority - a.score.priority);
}
